import { describe, it, expect } from 'vitest';
import { createRng } from '../../core/rng';
import { createTestContent } from '../../test-support/content';
import { combatBalance } from '../../content/balance';
import { DEFAULT_FLAGS } from '../incidents';
import type { IncidentFlags } from '../../state/game-state';
import { createCombatState } from './combat';
import { stepWaves, waveSize, effectiveSpawnInterval, concurrentCap, candidateDefs } from './director';
import type { SpawnCommand } from './types';

function flags(over: Partial<IncidentFlags> = {}): IncidentFlags {
  return { ...DEFAULT_FLAGS, ...over };
}

interface WaveLog {
  sirens: { waveIndex: number; secondsUntil: number }[];
  starts: { waveIndex: number }[];
  clears: { waveIndex: number }[];
  commands: SpawnCommand[];
}

/**
 * Drive the pure wave step over a dt sequence. Drones are never materialized into `combat.drones`, so
 * each wave "clears" as soon as its burst is fully launched — letting one run cover several waves.
 */
function runWaves(seed: number, D: number, seconds: number, over: Partial<IncidentFlags> = {}, dt = 0.1): WaveLog {
  const content = createTestContent();
  const rng = createRng(seed);
  const combat = createCombatState(content);
  const f = flags(over);
  const log: WaveLog = { sirens: [], starts: [], clears: [], commands: [] };
  for (let t = 0; t < seconds; t += dt) {
    const r = stepWaves(combat, dt, D, rng, content, f);
    if (r.siren) log.sirens.push(r.siren);
    if (r.started) log.starts.push(r.started);
    if (r.cleared) log.clears.push(r.cleared);
    log.commands.push(...r.commands);
  }
  return log;
}

describe('director: scaling helpers (§8.2)', () => {
  it('effectiveSpawnInterval shrinks from base toward min as D rises', () => {
    expect(effectiveSpawnInterval(0, combatBalance)).toBe(combatBalance.spawn.baseInterval);
    expect(effectiveSpawnInterval(combatBalance.spawn.dSoftcap, combatBalance)).toBeCloseTo(combatBalance.spawn.minInterval, 9);
    expect(effectiveSpawnInterval(5, combatBalance)).toBeLessThan(combatBalance.spawn.baseInterval);
  });

  it('concurrentCap rises with D up to the hard cap', () => {
    expect(concurrentCap(12, combatBalance)).toBeGreaterThan(concurrentCap(0, combatBalance));
    expect(concurrentCap(9999, combatBalance)).toBe(combatBalance.spawn.maxConcurrent);
  });

  it('candidateDefs unlocks harder kinds with D and admits decoys only when active', () => {
    const content = createTestContent();
    const low = candidateDefs(0, content.drones, flags()).map((d) => d.kind);
    const high = candidateDefs(12, content.drones, flags()).map((d) => d.kind);
    expect(low).not.toContain('kamikaze');
    expect(high).toContain('kamikaze');
    expect(low).not.toContain('decoy_bird');
    expect(candidateDefs(0, content.drones, flags({ decoysActive: true })).map((d) => d.kind)).toContain('decoy_bird');
  });

  it('waveSize grows linearly with the wave index, clamped to the max', () => {
    expect(waveSize(1, combatBalance)).toBe(combatBalance.waves.baseWaveSize);
    expect(waveSize(2, combatBalance)).toBe(combatBalance.waves.baseWaveSize + combatBalance.waves.waveSizePerWave);
    expect(waveSize(9999, combatBalance)).toBe(combatBalance.waves.maxWaveSize);
  });
});

describe('director: wave cadence (§request)', () => {
  it('determinism: same seed + D + dt sequence ⇒ identical wave log', () => {
    expect(runWaves(42, 5, 300)).toEqual(runWaves(42, 5, 300));
  });

  it('different seeds produce different command streams', () => {
    expect(runWaves(1, 5, 60).commands).not.toEqual(runWaves(2, 5, 60).commands);
  });

  it('a siren precedes every wave; the first wave launches after the short opening lull', () => {
    const log = runWaves(7, 4, 300);
    expect(log.starts.length).toBeGreaterThanOrEqual(2);
    expect(log.sirens.length).toBe(log.starts.length); // one siren per wave
    expect(log.starts[0]?.waveIndex).toBe(1);
    expect(log.starts[1]?.waveIndex).toBe(2);
    // The siren ahead of a full-length lull fires ~sirenLeadSeconds early (wave 2+).
    expect(log.sirens[1]?.secondsUntil ?? 0).toBeGreaterThan(combatBalance.waves.sirenLeadSeconds - 1);
  });

  it('later waves launch more drones than earlier ones', () => {
    const content = createTestContent();
    const rng = createRng(7);
    const combat = createCombatState(content);
    const f = flags();
    const perWave = new Map<number, number>();
    let current = 0;
    for (let t = 0; t < 320; t += 0.1) {
      const r = stepWaves(combat, 0.1, 4, rng, content, f);
      if (r.started) current = r.started.waveIndex;
      if (r.commands.length) perWave.set(current, (perWave.get(current) ?? 0) + r.commands.length);
    }
    expect(perWave.get(1)).toBe(waveSize(1, content.combat));
    expect(perWave.get(2) ?? 0).toBeGreaterThan(perWave.get(1) ?? 0);
  });

  it('every spawned drone targets a real skyline building', () => {
    const content = createTestContent();
    const ids = new Set(content.combat.skyline.buildings.map((b) => b.id));
    for (const cmd of runWaves(11, 6, 200).commands) expect(ids.has(cmd.targetBuildingId)).toBe(true);
  });

  it('an incident spawn-rate multiplier enlarges the wave', () => {
    const normal = runWaves(9, 4, 40).commands.length;
    const swarmed = runWaves(9, 4, 40, { spawnRateMultiplier: 3 }).commands.length;
    expect(swarmed).toBeGreaterThan(normal);
  });
});
