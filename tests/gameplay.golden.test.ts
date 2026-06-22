/**
 * Gameplay determinism golden (docs/testing.md). A fixed seed + scripted input run through the real
 * engine must reproduce the same end-state every time, and a different seed must diverge. The
 * committed `GOLDEN` summary is the drift guard: any change to spawn/aim/fire/collision/scoring math
 * shifts it, forcing a deliberate update + review. (Distinct from tests/determinism.golden.test.ts,
 * whose header reserves the full-GameState hash; this is the engine-output golden it anticipated.)
 *
 * Never auto-regenerate: if this fails, understand why the simulation changed before touching GOLDEN.
 */
import { describe, it, expect } from 'vitest';
import { createTestContext } from '../src/test-support/context';
import { createGameState } from '../src/state/create-game-state';
import { createEngine } from '../src/systems/combat/engine';
import type { PlayerIntent } from '../src/systems/combat/types';

const SEED = 0xc0ffee;
const TICKS = 600; // 10 seconds at the fixed 60 Hz timestep
const DT = 1 / 60;

interface Summary {
  shiftSeconds: number;
  difficulty: number;
  postIntegrity: number;
  dronesDowned: number;
  score: number;
  rubles: number;
  drones: number;
  projectiles: number;
  rngSeed: number;
}

/** A deterministic input script: sweep the reticle across the sky and fire in bursts. */
function scriptedIntent(i: number): PlayerIntent {
  return {
    aimTarget: { x: 60 + ((i * 3) % 264), y: 40 + ((i * 2) % 80) },
    rotateDir: 0,
    fireHeld: i % 4 !== 0,
  };
}

function run(seed: number): Summary {
  const ctx = createTestContext({ seed });
  const gs = createGameState(ctx.content, seed);
  const engine = createEngine(gs, ctx);
  for (let i = 0; i < TICKS; i++) engine.step(DT, scriptedIntent(i));
  return {
    shiftSeconds: Math.round(gs.time.shiftSeconds * 1000) / 1000,
    difficulty: Math.round(gs.time.difficulty * 1000) / 1000,
    postIntegrity: Math.round(gs.combat.postIntegrity * 1000) / 1000,
    dronesDowned: gs.combat.dronesDowned,
    score: gs.scoring.score,
    rubles: gs.economy.rubles,
    drones: gs.combat.drones.length,
    projectiles: gs.combat.projectiles.length,
    rngSeed: ctx.rng.getState().seed,
  };
}

// Regenerated for the wave-director rework + hittability balance pass (§request): drones now arrive in
// waves and dive at skyline towers; projectiles are larger/faster and early drones slower so the gun
// can actually defend. With the generic sweep-and-fire script the first wave now yields one kill before
// the rest leak, and the lull's passive repair leaves the shared integrity fractional. The rng seed is
// unchanged (the wave roll consumes the same rng) — only the sim outcome moved. Updated deliberately.
const GOLDEN: Summary = {
  shiftSeconds: 10,
  difficulty: 1,
  postIntegrity: 60.493,
  dronesDowned: 1,
  score: 149,
  rubles: 1,
  drones: 0,
  projectiles: 5,
  rngSeed: 3356074071,
};

describe('gameplay determinism golden', () => {
  it('is identical across two runs of the same seed + script', () => {
    expect(run(SEED)).toEqual(run(SEED));
  });

  it('diverges for a different seed', () => {
    expect(run(SEED)).not.toEqual(run(SEED + 1));
  });

  it('matches the committed golden summary (drift guard)', () => {
    expect(run(SEED)).toEqual(GOLDEN);
  });
});
