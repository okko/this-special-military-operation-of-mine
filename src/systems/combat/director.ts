/**
 * Wave director (docs/areas/01-gameplay-engine.md §3.2, §request). Deterministic and data-driven:
 * drones arrive in spaced WAVES — a long lull (≥2 min, for visiting residents), a 10s air-raid siren,
 * then a burst whose size grows with the wave index. Difficulty `D` still scales each drone's stats and
 * the eligible-kind table; all randomness via the injected seeded `rng`. `stepWaves` is the pure step
 * the tests use: a given `(seed, D, dt sequence)` yields an identical result stream. Incident flags and
 * the forced-wave override scale the wave size and queue the boss. Each drone targets a skyline tower.
 */
import { lerp, clamp } from '../../core/math';
import type { Vec2 } from '../../core/math';
import type { Rng } from '../../core/rng';
import type { BuildingState, CombatState, IncidentFlags } from '../../state/game-state';
import type { DroneDef } from '../../content/drones';
import type { CombatBalance } from '../../content/balance';
import type { Content } from '../../content/loader';
import type { SpawnCommand } from './types';

const BOSS_KIND = 'boss';

/** Mean seconds between spawns: shrinks from `baseInterval` to `minInterval` as D → dSoftcap (§3.2). */
export function effectiveSpawnInterval(D: number, balance: CombatBalance): number {
  const t = clamp(D / balance.spawn.dSoftcap, 0, 1);
  return lerp(balance.spawn.baseInterval, balance.spawn.minInterval, t);
}

/** Max simultaneous drones, rising with D up to the hard cap (§3.2/§3.6). */
export function concurrentCap(D: number, balance: CombatBalance): number {
  const cap = Math.floor(balance.spawn.baseConcurrent + balance.spawn.concurrentPerD * D);
  return Math.min(balance.spawn.maxConcurrent, Math.max(balance.spawn.baseConcurrent, cap));
}

/** Drone kinds eligible at difficulty D: unlocked + positively weighted, plus decoys when active. */
export function candidateDefs(D: number, drones: DroneDef[], flags: IncidentFlags): DroneDef[] {
  const out = drones.filter((d) => d.kind !== BOSS_KIND && d.unlockD <= D && d.weightAtD(D) > 0);
  if (flags.decoysActive) {
    const decoy = drones.find((d) => d.kind === 'decoy_bird');
    if (decoy) out.push(decoy);
  }
  return out;
}

/** Weighted kind pick using the seeded rng; decoys get a fixed weight so a flock actually appears. */
function pickKind(rng: Rng, cands: DroneDef[], D: number, flags: IncidentFlags): DroneDef {
  const first = cands[0];
  if (first === undefined) throw new Error('pickKind: no candidates');
  const weightOf = (d: DroneDef): number => (d.kind === 'decoy_bird' && flags.decoysActive ? 2 : d.weightAtD(D));
  let total = 0;
  for (const c of cands) total += weightOf(c);
  if (total <= 0) return first;
  let r = rng.next() * total;
  for (const c of cands) {
    r -= weightOf(c);
    if (r < 0) return c;
  }
  return first;
}

/** A point just offscreen on the top or upper-side skyline edges (§3.2 "from any direction"). */
export function pickSpawnOrigin(rng: Rng, balance: CombatBalance): Vec2 {
  const w = balance.arena.width;
  const h = balance.arena.height;
  const edge = rng.int(0, 3); // 0 = top, 1 = left, 2 = right
  if (edge === 0) return { x: rng.range(0, w), y: -8 };
  if (edge === 1) return { x: -8, y: rng.range(0, h * 0.6) };
  return { x: w + 8, y: rng.range(0, h * 0.6) };
}

/** Drones launched by wave `index` (1-based): grows linearly, capped. */
export function waveSize(index: number, balance: CombatBalance): number {
  const w = balance.waves;
  return Math.min(w.maxWaveSize, w.baseWaveSize + Math.max(0, index - 1) * w.waveSizePerWave);
}

/** A uniformly-chosen skyline tower (the drone's target). */
function pickTargetBuilding(rng: Rng, buildings: readonly BuildingState[]): BuildingState {
  const b = buildings[rng.int(0, buildings.length)] ?? buildings[0];
  if (b === undefined) throw new Error('pickTargetBuilding: skyline has no buildings');
  return b;
}

/** Phase transitions the wave director surfaces for combat.ts to turn into events. */
export interface WaveStepResult {
  commands: SpawnCommand[];
  siren: { waveIndex: number; secondsUntil: number } | null;
  started: { waveIndex: number } | null;
  cleared: { waveIndex: number } | null;
}

function spawnCommand(rng: Rng, kind: string, combat: CombatState, balance: CombatBalance): SpawnCommand {
  const b = pickTargetBuilding(rng, combat.skyline.buildings);
  const inset = balance.skyline.targetInset;
  return {
    kind,
    origin: pickSpawnOrigin(rng, balance),
    target: { x: b.x, y: combat.skyline.groundY - b.height + inset },
    targetBuildingId: b.id,
  };
}

/**
 * One wave step. Runs the lull → siren → active state machine, emitting spawn commands during the
 * active burst (under the concurrent cap) and surfacing the phase-transition signals (siren / wave
 * started / wave cleared) for combat.ts to broadcast. A forced/incident boss is launched once during
 * the siren or active phases (never during the quiet lull). Pure over the seeded `rng`.
 */
export function stepWaves(
  combat: CombatState,
  dt: number,
  D: number,
  rng: Rng,
  content: Content,
  flags: IncidentFlags,
): WaveStepResult {
  const balance = content.combat;
  const w = combat.waves;
  const cap = concurrentCap(D, balance);
  const result: WaveStepResult = { commands: [], siren: null, started: null, cleared: null };

  // Incident/forced boss: launched once when wanted, none alive, slot free. A forced "major drone
  // attack" interrupts the lull (a surprise raid), so it is NOT gated on the wave phase.
  const bossWanted = (combat.director.override?.queuedBoss ?? false) || flags.bossActive;
  const bossAlive = combat.drones.some((d) => d.kind === BOSS_KIND);
  if (bossWanted && !bossAlive && combat.drones.length < cap) {
    result.commands.push(spawnCommand(rng, BOSS_KIND, combat, balance));
    if (combat.director.override) combat.director.override.queuedBoss = false;
  }

  switch (w.phase) {
    case 'lull': {
      w.timer -= dt;
      if (w.timer <= balance.waves.sirenLeadSeconds) {
        w.phase = 'siren';
        result.siren = { waveIndex: w.index + 1, secondsUntil: Math.max(0, w.timer) };
      }
      break;
    }
    case 'siren': {
      w.timer -= dt;
      if (w.timer <= 0) {
        w.index += 1;
        w.phase = 'active';
        const mul = (combat.director.override?.spawnMultiplier ?? 1) * Math.max(flags.spawnRateMultiplier, 0.0001);
        w.toSpawn = Math.max(1, Math.round(waveSize(w.index, balance) * mul));
        w.spawnTimer = 0;
        result.started = { waveIndex: w.index };
      }
      break;
    }
    case 'active': {
      if (w.toSpawn > 0) {
        w.spawnTimer -= dt;
        while (w.spawnTimer <= 0 && w.toSpawn > 0 && combat.drones.length + result.commands.length < cap) {
          const cands = candidateDefs(D, content.drones, flags);
          if (cands.length === 0) {
            w.toSpawn = 0; // nothing eligible (shouldn't happen — scout is always unlocked); don't stall
            break;
          }
          const def = pickKind(rng, cands, D, flags);
          result.commands.push(spawnCommand(rng, def.kind, combat, balance));
          w.toSpawn -= 1;
          const jitter = 1 + rng.range(-balance.waves.spawnJitter, balance.waves.spawnJitter);
          w.spawnTimer += Math.max(0.05, balance.waves.spawnInterval * jitter);
        }
      }
      // Wave done once everything is launched and the sky is clear → the lull (repairs) begins.
      if (w.toSpawn <= 0 && combat.drones.length === 0 && result.commands.length === 0) {
        w.phase = 'lull';
        w.timer = balance.waves.lullSeconds;
        result.cleared = { waveIndex: w.index };
      }
      break;
    }
  }
  return result;
}
