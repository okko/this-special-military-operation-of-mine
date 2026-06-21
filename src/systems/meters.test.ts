import { describe, it, expect } from 'vitest';
import {
  createMetersState,
  update,
  computeEffects,
  applyRelief,
  applyRawRelief,
  isCrisis,
  getAllMetersGreen,
  METER_INDICATORS,
} from './meters';
import type { MetersRead } from './meters';
import { createTestContext } from '../test-support/context';
import type { MetersState } from '../state/game-state';
import type { GameEvents } from '../core/events';

const READ: MetersRead = {
  phase: 'day',
  difficulty: 0,
  recentShotRate: 0,
  sleepGainMultiplier: 1,
  shiftSeconds: 0,
  score: 0,
  dronesDowned: 0,
};

function read(over: Partial<MetersRead> = {}): MetersRead {
  return { ...READ, ...over };
}

/** A fresh meters state with chosen starting values. */
function withValues(vals: Partial<MetersState['values']>): MetersState {
  const m = createMetersState();
  Object.assign(m.values, vals);
  return m;
}

function captureCrises(ctx: ReturnType<typeof createTestContext>): GameEvents['meterCrisis'][] {
  const seen: GameEvents['meterCrisis'][] = [];
  ctx.events.on('meterCrisis', (p) => seen.push(p));
  return seen;
}

describe('meters: drain model', () => {
  it('1. baseline: meters without phase modifiers rise at baseRate*elapsed (diff=1)', () => {
    const ctx = createTestContext();
    const m = createMetersState();
    for (let i = 0; i < 10; i++) update(m, 1, ctx, read());
    expect(m.values.poo).toBeCloseTo(3.0, 5); // 0.30 * 10
    expect(m.values.hunger).toBeCloseTo(5.5, 5); // 0.55 * 10
    expect(m.values.vice).toBeCloseTo(4.0, 5); // 0.40 * 10
    expect(m.values.sleep).toBeCloseTo(4.5, 5); // 0.45 * 10 (day: no night mult)
  });

  it('2. night: sleep rises 1.8x faster than day', () => {
    const ctx = createTestContext();
    const day = createMetersState();
    const night = createMetersState();
    for (let i = 0; i < 10; i++) {
      update(day, 1, ctx, read({ phase: 'day' }));
      update(night, 1, ctx, read({ phase: 'night' }));
    }
    expect(night.values.sleep / day.values.sleep).toBeCloseTo(1.8, 5);
  });

  it('3. thirst: faster during day, faster under fire, and they compose', () => {
    const ctx = createTestContext();
    const night = createMetersState();
    const day = createMetersState();
    const dayFire = createMetersState();
    for (let i = 0; i < 5; i++) {
      update(night, 1, ctx, read({ phase: 'night', recentShotRate: 0 }));
      update(day, 1, ctx, read({ phase: 'day', recentShotRate: 0 }));
      update(dayFire, 1, ctx, read({ phase: 'day', recentShotRate: 1 }));
    }
    expect(day.values.thirst).toBeGreaterThan(night.values.thirst);
    expect(dayFire.values.thirst).toBeGreaterThan(day.values.thirst);
    // day = 0.5*1.4 = 0.7/s; dayFire = 0.5*1.4 + 0.6 = 1.3/s.
    expect(dayFire.values.thirst).toBeCloseTo(6.5, 5);
  });

  it('4. difficulty creep scales all rates by 1 + 0.04*difficulty', () => {
    const ctx = createTestContext();
    const easy = createMetersState();
    const hard = createMetersState();
    for (let i = 0; i < 10; i++) {
      update(easy, 1, ctx, read({ difficulty: 0 }));
      update(hard, 1, ctx, read({ difficulty: 10 }));
    }
    expect(hard.values.poo / easy.values.poo).toBeCloseTo(1.4, 5); // 1 + 0.04*10
  });

  it('vice crisis and incident sleepGainMultiplier both accelerate sleep gain', () => {
    const ctx = createTestContext();
    const base = createMetersState();
    const viceCrisis = withValues({ vice: 100 });
    viceCrisis.inCrisis.vice = true; // jitter keys on the crisis flag, not the raw value
    const incident = createMetersState();
    update(base, 1, ctx, read());
    update(viceCrisis, 1, ctx, read());
    update(incident, 1, ctx, read({ sleepGainMultiplier: 2 }));
    expect(viceCrisis.values.sleep).toBeGreaterThan(base.values.sleep); // 1.5x jitter
    expect(incident.values.sleep).toBeCloseTo(base.values.sleep * 2, 5);
  });
});

describe('meters: relief', () => {
  it('5. poo kick: food adds a one-shot bump; degraded food adds a larger one', () => {
    const ctx = createTestContext();
    const fresh = withValues({ hunger: 50, poo: 0 });
    applyRelief(fresh, 'food', ctx, { quality: 1 });
    expect(fresh.values.poo).toBeCloseTo(12, 5);

    const degraded = withValues({ hunger: 50, poo: 0 });
    applyRelief(degraded, 'food', ctx, { quality: 0.5 });
    expect(degraded.values.poo).toBeCloseTo(12 + 18 * 0.5, 5); // 21
  });

  it('11. each relief kind reduces the right meter by table*quality, never below 0', () => {
    const ctx = createTestContext();
    const water = withValues({ thirst: 80 });
    applyRelief(water, 'water', ctx, { quality: 0.5 });
    expect(water.values.thirst).toBeCloseTo(80 - 35, 5);

    const cig = withValues({ vice: 50 });
    applyRelief(cig, 'cigarette', ctx);
    expect(cig.values.vice).toBeCloseTo(15, 5);

    const toilet = withValues({ poo: 95 });
    applyRelief(toilet, 'toilet', ctx);
    expect(toilet.values.poo).toBeCloseTo(0, 5);

    const nap = withValues({ sleep: 50 });
    applyRelief(nap, 'nap', ctx); // 50 - 85 clamps to 0
    expect(nap.values.sleep).toBe(0);
  });

  it('12. vodka: large vice cut + sleep cut + drunk debuff until the timer expires', () => {
    const ctx = createTestContext();
    const balance = ctx.content.meters;
    const m = withValues({ vice: 90, sleep: 50 });
    applyRelief(m, 'vodka', ctx, { quality: 1 });
    expect(m.values.vice).toBeCloseTo(10, 5);
    expect(m.values.sleep).toBeCloseTo(30, 5);
    expect(m.drunkTimer).toBeGreaterThan(0);
    const drunkEff = computeEffects(m, balance);
    expect(drunkEff.drunk).toBe(true);
    expect(drunkEff.aimSway).toBeGreaterThanOrEqual(0.8);
    expect(drunkEff.aimDriftBias).toBeCloseTo(0.5, 5);
    update(m, 19, ctx, read()); // drunkTimer 18 -> 0
    expect(computeEffects(m, balance).drunk).toBe(false);
  });

  it('13. cigarette: small vice cut, no drunk, no sleep change', () => {
    const ctx = createTestContext();
    const m = withValues({ vice: 50, sleep: 40 });
    applyRelief(m, 'cigarette', ctx);
    expect(m.values.vice).toBeCloseTo(15, 5);
    expect(m.values.sleep).toBe(40);
    expect(m.drunkTimer).toBe(0);
    expect(computeEffects(m, ctx.content.meters).drunk).toBe(false);
  });

  it('14. coffee: temporarily reduces sleep gain, then returns to normal', () => {
    const ctx = createTestContext();
    const active = withValues({ sleep: 50 });
    applyRelief(active, 'coffee', ctx);
    expect(active.coffeeTimer).toBeGreaterThan(0);
    update(active, 1, ctx, read());
    expect(active.values.sleep).toBeLessThan(50); // net negative gain while coffee active

    const expired = withValues({ sleep: 50 });
    expired.coffeeTimer = 0;
    update(expired, 1, ctx, read());
    expect(expired.values.sleep).toBeCloseTo(50.45, 5); // normal +0.45
  });

  it('15. toilet is blocked during a pipe failure, otherwise relieves poo', () => {
    const ctx = createTestContext();
    const blocked = withValues({ poo: 95 });
    const res = applyRelief(blocked, 'toilet', ctx, { pipeFailure: true });
    expect(res).toEqual({ applied: false, reason: 'pipe_failure' });
    expect(blocked.values.poo).toBe(95);

    const ok = withValues({ poo: 95 });
    expect(applyRelief(ok, 'toilet', ctx, { pipeFailure: false }).applied).toBe(true);
    expect(ok.values.poo).toBeCloseTo(0, 5);
  });

  it('applyRawRelief lowers a meter; a negative amount raises it (degraded side effect)', () => {
    const ctx = createTestContext();
    const m = withValues({ thirst: 40, poo: 10 });
    applyRawRelief(m, 'thirst', 25, ctx);
    expect(m.values.thirst).toBeCloseTo(15, 5);
    applyRawRelief(m, 'poo', -8, ctx); // negative => raise poo
    expect(m.values.poo).toBeCloseTo(18, 5);
  });
});

describe('meters: crisis lifecycle', () => {
  it('7. crossing 100 emits meterCrisis{entered:true} exactly once', () => {
    const ctx = createTestContext();
    const seen = captureCrises(ctx);
    const m = withValues({ hunger: 100 });
    update(m, 1, ctx, read());
    update(m, 1, ctx, read());
    update(m, 1, ctx, read());
    const enters = seen.filter((e) => e.meter === 'hunger' && e.entered);
    expect(enters).toHaveLength(1);
    expect(isCrisis(m, 'hunger')).toBe(true);
  });

  it('8. hysteresis: relief to [92,100) stays in crisis; below 92 leaves once', () => {
    const ctx = createTestContext();
    const m = withValues({ hunger: 100 });
    update(m, 1, ctx, read()); // enters crisis
    const seen = captureCrises(ctx);
    applyRawRelief(m, 'hunger', 5, ctx); // 100 -> 95, still crisis
    expect(seen.filter((e) => !e.entered)).toHaveLength(0);
    expect(isCrisis(m, 'hunger')).toBe(true);
    applyRawRelief(m, 'hunger', 5, ctx); // 95 -> 90, leaves
    const leaves = seen.filter((e) => e.meter === 'hunger' && !e.entered);
    expect(leaves).toHaveLength(1);
    expect(isCrisis(m, 'hunger')).toBe(false);
  });

  it('16. poo accident: poo-crisis entry fires pooAccident + applies move/turn debuff', () => {
    const ctx = createTestContext();
    let accidents = 0;
    ctx.events.on('pooAccident', () => accidents++);
    const m = withValues({ poo: 100 });
    update(m, 1, ctx, read());
    expect(accidents).toBe(1);
    const eff = computeEffects(m, ctx.content.meters);
    expect(eff.moveSlow).toBeGreaterThan(0);
    expect(eff.turnSlow).toBeGreaterThan(0);
  });
});

describe('meters: game over', () => {
  it('9. single meter pinned in crisis for graceSeconds emits collapse:<meter> once', () => {
    const ctx = createTestContext();
    const overs: GameEvents['gameOver'][] = [];
    ctx.events.on('gameOver', (p) => overs.push(p));
    const m = withValues({ hunger: 100 });
    for (let i = 0; i < 13; i++) {
      update(m, 1, ctx, read({ score: 1234, shiftSeconds: 99, dronesDowned: 7 }));
    }
    expect(overs).toHaveLength(1);
    expect(overs[0]).toEqual({ score: 1234, cause: 'collapse:hunger', shiftSeconds: 99, dronesDowned: 7 });
  });

  it('10. two meters in crisis for compoundGrace emits compound:a+b (sorted)', () => {
    const ctx = createTestContext();
    const overs: GameEvents['gameOver'][] = [];
    ctx.events.on('gameOver', (p) => overs.push(p));
    const m = withValues({ thirst: 100, hunger: 100 });
    update(m, 1, ctx, read());
    update(m, 1, ctx, read());
    update(m, 1, ctx, read());
    expect(overs).toHaveLength(0); // under compoundGrace (4s)
    update(m, 1, ctx, read()); // crosses 4s
    expect(overs).toHaveLength(1);
    expect(overs[0]?.cause).toBe('compound:hunger+thirst');
  });

  it('a single short crisis under grace does not end the run', () => {
    const ctx = createTestContext();
    const overs: GameEvents['gameOver'][] = [];
    ctx.events.on('gameOver', (p) => overs.push(p));
    const m = withValues({ hunger: 100 });
    for (let i = 0; i < 5; i++) update(m, 1, ctx, read()); // 5s < grace 12
    expect(overs).toHaveLength(0);
  });
});

describe('meters: computeEffects', () => {
  it('6. zero below warn; scales linearly at warn / midpoint / 100', () => {
    const ctx = createTestContext();
    const balance = ctx.content.meters;
    expect(computeEffects(createMetersState(), balance)).toMatchObject({
      aimSway: 0,
      visionDim: 0,
      microSleepChancePerSec: 0,
      drunk: false,
    });
    expect(computeEffects(withValues({ sleep: 70 }), balance).aimSway).toBeCloseTo(0, 5); // at warn
    const mid = computeEffects(withValues({ sleep: 85 }), balance); // s = 0.5
    expect(mid.aimSway).toBeCloseTo(0.15, 5);
    expect(mid.visionDim).toBeCloseTo(0.2, 5);
    expect(mid.microSleepChancePerSec).toBeCloseTo(0.1, 5);
    const full = computeEffects(withValues({ sleep: 100 }), balance); // s = 1
    expect(full.aimSway).toBeCloseTo(0.3, 5);
    expect(full.visionDim).toBeCloseTo(0.4, 5);
  });

  it('17. effects from multiple meters aggregate and stay clamped', () => {
    const ctx = createTestContext();
    const m = withValues({ sleep: 100, poo: 100, hunger: 100, thirst: 100, vice: 100 });
    m.drunkTimer = 5;
    const eff = computeEffects(m, ctx.content.meters);
    // aimSway sums sleep .3 + hunger .4 + vice .5 + drunk .8 = 2.0, clamped at 2.
    expect(eff.aimSway).toBe(2);
    expect(eff.visionDim).toBeCloseTo(0.4, 5);
    expect(eff.visionBlur).toBeCloseTo(0.6, 5);
    expect(eff.interactSlow).toBeCloseTo(0.5, 5);
    expect(eff.moveSlow).toBeCloseTo(0.5, 5);
    expect(eff.drunk).toBe(true);
  });
});

describe('meters: helpers', () => {
  it('createMetersState starts everything at zero/false', () => {
    const m = createMetersState();
    expect(m.values).toEqual({ sleep: 0, poo: 0, hunger: 0, thirst: 0, vice: 0 });
    expect(m.compoundTimer).toBe(0);
    expect(Object.values(m.inCrisis).every((v) => v === false)).toBe(true);
  });

  it('getAllMetersGreen reflects whether every meter is below warn', () => {
    const ctx = createTestContext();
    expect(getAllMetersGreen(createMetersState(), ctx.content.meters)).toBe(true);
    expect(getAllMetersGreen(withValues({ vice: 66 }), ctx.content.meters)).toBe(false); // warn 65
  });

  it('exposes the poo indicator as 💩', () => {
    expect(METER_INDICATORS.poo).toBe('💩');
  });
});
