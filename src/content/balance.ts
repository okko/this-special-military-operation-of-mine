/**
 * Combat balance table (docs/areas/01-gameplay-engine.md §5/§3.6). DATA, not logic: every spawn,
 * gun, scaling, projectile, and difficulty-ramp constant lives here so `src/systems/combat/*` stays
 * pure and tuning never touches code. The scaling FUNCTIONS (effectiveSpawnInterval, hpScale, …) live
 * in the combat modules and read these coefficients. Validated by `validateCombatBalance`, exposed
 * as `content.combat`. Coordinates are in the fixed 384×216 backing buffer (docs/compatibility.md §2).
 */
import type { Vec2 } from '../core/math';

export interface CombatBalance {
  arena: { width: number; height: number };
  /** Where drones home to (the post). Reaching within `escapeRadius` is an escape. */
  postTarget: Vec2;
  escapeRadius: number;
  postIntegrityMax: number;

  gun: {
    pivot: Vec2;
    turnRate: number; // rad/s the barrel slews toward the effective aim
    fireRate: number; // shots/s while firing
    heatPerShot: number; // 0..100 added per shot
    coolRate: number; // heat/s shed while not firing
    cooloffResume: number; // overheat clears once heat falls below this
    jamClearPerInput: number; // jamClearProgress gained per clear input
    jamClearThreshold: number; // jamClearProgress needed to clear a jam
  };

  aim: {
    swayFrequencyHz: number; // reticle drift speed
    drunkFrequencyHz: number; // slower vodka lurch
    swayRadPerUnit: number; // radians per unit of MeterEffects.aimSway (0..2)
    drunkWobbleRad: number; // lurch amplitude (radians) while drunk
  };

  projectile: {
    speed: number; // px/s
    ttl: number; // seconds before despawn
    radius: number; // collision radius
    cap: number; // max simultaneous projectiles (older ones culled)
    hitscan: boolean; // accessibility/perf fallback; default false (projectiles)
  };

  spawn: {
    baseInterval: number; // seconds between spawns at D=0
    minInterval: number; // floor on the interval at/above dSoftcap
    dSoftcap: number; // D at which the interval reaches minInterval
    jitter: number; // ± fraction of the interval drawn from rng
    baseConcurrent: number; // concurrent-drone cap at D=0
    concurrentPerD: number; // extra cap per unit D
    maxConcurrent: number; // hard cap regardless of D
  };

  scaling: { speedPerD: number; hpPerD: number };

  difficulty: { rampSeconds: number; maxD: number; dayLengthSeconds: number };

  /** The damageable Moscow skyline the drones dive at (arena-space). The soldier's foreground tower
   *  is a view-only cut-away and is NOT listed here (never a drone target). `targetInset` lifts the
   *  drones' aim point just below each roof so a leaked drone reads as crashing into the upper floors. */
  skyline: {
    groundY: number;
    targetInset: number;
    buildings: { id: number; x: number; width: number; height: number; stories: number }[];
  };

  /** Wave cadence (drones arrive in spaced waves; ≥`lullSeconds` between them, siren `sirenLeadSeconds`
   *  before each). `firstLullSeconds` is the short pre-first-wave breather. Wave N launches
   *  `min(maxWaveSize, baseWaveSize + (N-1)*waveSizePerWave)` drones at `spawnInterval` (±`spawnJitter`). */
  waves: {
    firstLullSeconds: number;
    lullSeconds: number;
    sirenLeadSeconds: number;
    baseWaveSize: number;
    waveSizePerWave: number;
    maxWaveSize: number;
    spawnInterval: number;
    spawnJitter: number;
  };

  /** Skyline reparations (§request). Passive regrow only ticks during the lull; a paid resident
   *  "patch-up" service applies the paid amounts immediately. `slabsPerDamage` maps a leaked drone's
   *  escapeDamage to sheared slabs. */
  repair: {
    passiveIntegrityPerSec: number;
    passiveSlabPerSec: number;
    paidIntegrity: number;
    paidSlabs: number;
    slabsPerDamage: number;
  };
}

export const combatBalance: CombatBalance = {
  arena: { width: 384, height: 216 },
  postTarget: { x: 192, y: 196 },
  escapeRadius: 14,
  postIntegrityMax: 100,

  gun: {
    pivot: { x: 192, y: 196 },
    turnRate: 8,
    fireRate: 10,
    heatPerShot: 4,
    coolRate: 32,
    cooloffResume: 40,
    jamClearPerInput: 25,
    jamClearThreshold: 100,
  },

  aim: { swayFrequencyHz: 0.7, drunkFrequencyHz: 0.4, swayRadPerUnit: 0.12, drunkWobbleRad: 0.18 },

  projectile: { speed: 420, ttl: 1.5, radius: 3.5, cap: 64, hitscan: false },

  spawn: {
    baseInterval: 1.6,
    minInterval: 0.45,
    dSoftcap: 10,
    jitter: 0.25,
    baseConcurrent: 4,
    concurrentPerD: 1,
    maxConcurrent: 18,
  },

  scaling: { speedPerD: 0.08, hpPerD: 0.12 },

  difficulty: { rampSeconds: 120, maxD: 12, dayLengthSeconds: 90 },

  // Background Moscow skyline (drones' targets), flanking and set behind the soldier's central tower
  // (x≈192). Heights/stories vary so the cut-away damage reads at a glance.
  skyline: {
    groundY: 210,
    targetInset: 6,
    buildings: [
      { id: 1, x: 30, width: 36, height: 110, stories: 18 },
      { id: 2, x: 76, width: 30, height: 134, stories: 22 },
      { id: 3, x: 118, width: 34, height: 96, stories: 16 },
      { id: 4, x: 158, width: 26, height: 152, stories: 25 },
      { id: 5, x: 226, width: 26, height: 146, stories: 24 },
      { id: 6, x: 266, width: 34, height: 104, stories: 17 },
      { id: 7, x: 308, width: 30, height: 130, stories: 21 },
      { id: 8, x: 352, width: 36, height: 114, stories: 19 },
    ],
  },

  // Drones come in waves with ≥2 min between them (time to visit residents); a siren wails 10s ahead.
  waves: {
    firstLullSeconds: 3,
    lullSeconds: 120,
    sirenLeadSeconds: 10,
    baseWaveSize: 6,
    waveSizePerWave: 2,
    maxWaveSize: 28,
    spawnInterval: 0.7,
    spawnJitter: 0.3,
  },

  repair: {
    passiveIntegrityPerSec: 0.4, // ~48 restored over a 120s lull — recovers most, never fully
    passiveSlabPerSec: 0.05,
    paidIntegrity: 25,
    paidSlabs: 5,
    slabsPerDamage: 1 / 8,
  },
};
