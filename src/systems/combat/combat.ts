/**
 * Combat update (docs/areas/01-gameplay-engine.md §3.2-§3.8). Orchestrates the gun, spawn director,
 * drone sim, and swept collision over `CombatState`, and emits the cross-area events Scoring/Economy/
 * Audio react to. Pure over the injected `dt`/`ctx`; all randomness via `ctx.rng`. Rubles are NOT
 * granted here — the engine's kind-aware income handler banks them off `droneDestroyed` (the spec's
 * `player.rubles += 1` predates the immutable economy slice).
 */
import type { SystemContext } from '../../core/system-context';
import type { CombatBalance } from '../../content/balance';
import type { BuildingState, CombatState, IncidentFlags, Drone, SkylineState } from '../../state/game-state';
import type { AimModifier, PlayerIntent } from './types';
import { updateGun } from './gun';
import { stepWaves } from './director';
import { materialize, advanceDrone, reachedTarget, offArena } from './drone';
import { sweptHit } from './collision';

export { setJam, clearJam } from './gun';

/** Fresh skyline from the balance layout: every tower at full height, undamaged. */
export function createSkylineState(balance: CombatBalance): SkylineState {
  return {
    groundY: balance.skyline.groundY,
    buildings: balance.skyline.buildings.map((b) => ({
      id: b.id,
      x: b.x,
      width: b.width,
      height: b.height,
      stories: b.stories,
      cut: 0,
      damage: 0,
    })),
  };
}

/** Everything the combat tick needs from the rest of GameState, assembled by the engine each tick. */
export interface CombatTickInput {
  D: number; // time.difficulty
  aimMod: AimModifier; // derived from MeterEffects
  flags: IncidentFlags; // incidents.flags (read, never written here)
  intent: PlayerIntent; // buffered player input
  tSeconds: number; // run-elapsed (shiftSeconds), drives deterministic aim sway
  score: number; // current scoring.score, for the gameOver payload
}

/** Fresh combat slice. `swayPhase` is seeded later by the engine from `ctx.rng` at run start. */
export function createCombatState(content: SystemContext['content']): CombatState {
  const B = content.combat;
  const up = -Math.PI / 2; // barrel starts pointing at the sky
  return {
    drones: [],
    projectiles: [],
    gun: {
      pivot: { ...B.gun.pivot },
      angle: up,
      heat: 0,
      overheated: false,
      jammed: false,
      jamClearProgress: 0,
      fireCooldown: 0,
      firing: false,
      swayPhase: 0,
      recentShotRate: 0,
    },
    aim: { desiredAngle: up, effectiveAngle: up },
    postIntegrity: B.postIntegrityMax,
    skyline: createSkylineState(B),
    waves: { index: 0, phase: 'lull', timer: B.waves.firstLullSeconds, toSpawn: 0, spawnTimer: 0 },
    director: { timer: 0, override: null },
    nextDroneId: 1,
    nextProjectileId: 1,
    dronesDowned: 0,
    gameOverEmitted: false,
  };
}

/** Apply a leaked drone's hit to a tower: cut slabs off the top, accrue render-only damage. */
function cutBuilding(b: BuildingState, escapeDamage: number, balance: CombatBalance): void {
  b.damage += escapeDamage;
  b.cut = Math.min(b.stories, b.cut + escapeDamage * balance.repair.slabsPerDamage);
}

/** Between-wave passive repair: nudge the shared integrity back up and regrow sheared slabs (silent —
 *  the Render layer animates from the changing `cut`). Only ticks during the lull. */
function repairPassive(combat: CombatState, dt: number, balance: CombatBalance): void {
  combat.postIntegrity = Math.min(balance.postIntegrityMax, combat.postIntegrity + balance.repair.passiveIntegrityPerSec * dt);
  const slab = balance.repair.passiveSlabPerSec * dt;
  for (const b of combat.skyline.buildings) {
    if (b.cut > 0) b.cut = Math.max(0, b.cut - slab);
    if (b.damage > 0) b.damage = Math.max(0, b.damage - slab / Math.max(balance.repair.slabsPerDamage, 1e-6));
  }
}

/**
 * Paid resident "patch-up" (the 'repair'-tagged service): immediately restore integrity and revert
 * slabs, worst-damaged towers first. Emits `buildingRepaired` per tower touched (Render FX). Returns
 * true if anything was repaired. Called by the engine when the player buys a repair service.
 */
export function repairSkyline(combat: CombatState, balance: CombatBalance, emit: (id: number, cut: number) => void): boolean {
  const before = combat.postIntegrity;
  combat.postIntegrity = Math.min(balance.postIntegrityMax, combat.postIntegrity + balance.repair.paidIntegrity);
  let slabsLeft = balance.repair.paidSlabs;
  const damaged = combat.skyline.buildings.filter((b) => b.cut > 0).sort((a, b) => b.cut - a.cut);
  for (const b of damaged) {
    if (slabsLeft <= 0) break;
    const take = Math.min(b.cut, slabsLeft);
    b.cut -= take;
    b.damage = Math.max(0, b.damage - take / Math.max(balance.repair.slabsPerDamage, 1e-6));
    slabsLeft -= take;
    emit(b.id, b.cut);
  }
  return combat.postIntegrity > before || slabsLeft < balance.repair.paidSlabs;
}

/** Incident hook (major drone attack): set/clear the forced-wave override (docs §3.2/§4). */
export function applySpawnOverride(
  combat: CombatState,
  override: { spawnMultiplier: number; queuedBoss: boolean } | null,
): void {
  combat.director.override = override;
}

export function updateCombat(combat: CombatState, dt: number, ctx: SystemContext, input: CombatTickInput): void {
  if (combat.gameOverEmitted) return; // post destroyed: the run is over, stop simulating

  const B = ctx.content.combat;
  const { D, aimMod, flags, intent, tSeconds } = input;

  // 1. Gun: aim, fire, heat/overheat/jam. Spawns projectiles + emits shotFired.
  updateGun(combat, dt, ctx, aimMod, flags, intent, tSeconds);

  // 2. Wave director → phase transitions (siren/start/clear) + materialize this wave's drones.
  const wave = stepWaves(combat, dt, D, ctx.rng, ctx.content, flags);
  if (wave.siren) ctx.events.emit('airRaidSiren', wave.siren);
  if (wave.started) ctx.events.emit('waveStarted', {});
  if (wave.cleared) ctx.events.emit('waveCleared', wave.cleared);
  for (const cmd of wave.commands) {
    const def = ctx.content.drones.find((d) => d.kind === cmd.kind);
    if (!def) continue;
    const drone = materialize(combat.nextDroneId++, def, cmd.origin, cmd.target, D, ctx.rng, B);
    drone.targetBuildingId = cmd.targetBuildingId;
    if (cmd.colorTag !== undefined) drone.colorTag = cmd.colorTag;
    combat.drones.push(drone);
    ctx.events.emit('droneSpawned', { id: drone.id, kind: drone.kind });
  }

  // 3. Advance projectiles (record prev for the swept test) and drones.
  for (const p of combat.projectiles) {
    p.prev = { ...p.pos };
    p.pos = { x: p.pos.x + p.vel.x * dt, y: p.pos.y + p.vel.y * dt };
    p.ttl -= dt;
  }
  for (const d of combat.drones) advanceDrone(d, dt, B);

  // 4. Collision: each projectile hits the first drone its swept segment crosses.
  const deadProjectiles = new Set<number>();
  const destroyed = new Set<number>();
  for (const p of combat.projectiles) {
    for (const d of combat.drones) {
      if (destroyed.has(d.id)) continue;
      if (sweptHit(p.prev, p.pos, d.pos, d.radius, p.radius)) {
        deadProjectiles.add(p.id);
        d.hp -= 1;
        if (d.hp <= 0) {
          destroyed.add(d.id);
          ctx.events.emit('droneDestroyed', {
            id: d.id,
            kind: d.kind,
            byPlayer: true,
            pos: { ...d.pos },
            ...(d.colorTag !== undefined ? { colorTag: d.colorTag } : {}),
          });
          combat.dronesDowned += 1;
        }
        break; // one projectile, one hit
      }
    }
  }

  // 5. Cull spent projectiles (hit, expired, or off-arena).
  combat.projectiles = combat.projectiles.filter(
    (p) => !deadProjectiles.has(p.id) && p.ttl > 0 && !offArena(p.pos, B),
  );

  // 6. Resolve survivors: destroyed → gone; escapes cut the target tower + drop shared integrity;
  //    wandered decoys cull.
  const survivors: Drone[] = [];
  for (const d of combat.drones) {
    if (destroyed.has(d.id)) continue;
    if (reachedTarget(d, B)) {
      const building = combat.skyline.buildings.find((b) => b.id === d.targetBuildingId);
      if (building) {
        cutBuilding(building, d.escapeDamage, B);
        ctx.events.emit('buildingDamaged', { buildingId: building.id, cut: building.cut, damage: building.damage });
      }
      ctx.events.emit('droneEscaped', {
        id: d.id,
        damage: d.escapeDamage,
        ...(d.targetBuildingId !== undefined ? { buildingId: d.targetBuildingId } : {}),
      });
      combat.postIntegrity = Math.max(0, combat.postIntegrity - d.escapeDamage);
      continue;
    }
    if (d.movement.kind === 'wander' && offArena(d.pos, B)) continue; // decoy flew off, harmless
    survivors.push(d);
  }
  combat.drones = survivors;

  // 6b. Between-wave passive skyline repair (only during the quiet lull).
  if (combat.waves.phase === 'lull') repairPassive(combat, dt, B);

  // 7. Gun-side loss condition: Post Integrity 0 ends the run exactly once.
  if (combat.postIntegrity <= 0 && !combat.gameOverEmitted) {
    combat.gameOverEmitted = true;
    ctx.events.emit('gameOver', {
      score: input.score,
      cause: 'post-destroyed',
      shiftSeconds: input.tSeconds,
      dronesDowned: combat.dronesDowned,
    });
  }
}
