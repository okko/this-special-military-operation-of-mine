import { describe, it, expect } from 'vitest';
import { createIncidentsState, updateIncidents, tryResolve, DEFAULT_FLAGS } from './incidents';
import { createTestContext } from '../test-support/context';
import type { IncidentsState, IncidentFlags } from '../state/game-state';
import type { IncidentDef, SchedulerTunables } from '../content/incidents';
import type { SystemContext } from '../core/system-context';

type Ctx = ReturnType<typeof createTestContext>;

function inc(over: Partial<IncidentDef> & { id: string }): IncidentDef {
  return {
    name: 'An Incident',
    flavor: 'Something grimly cheerful.',
    category: 'combat',
    exclusive: false,
    minDifficulty: 0,
    weight: () => 1,
    telegraphSeconds: 2,
    durationSeconds: 5,
    cooldownSeconds: 0,
    apply: (f) => {
      f.spawnRateMultiplier *= 2;
    },
    ...over,
  };
}

const FAST_SCHEDULER: SchedulerTunables = {
  baseInterval: 30,
  minInterval: 8,
  rate: 0.15,
  postIncidentCooldown: 0,
  gracePeriod: 0,
  maxConcurrent: 2,
};

function customCtx(catalog: IncidentDef[], scheduler: SchedulerTunables, seed = 0xabcdef): Ctx {
  return createTestContext({ seed, content: { incidents: { catalog, scheduler } } });
}

/** Run the scheduler and collect the sequence of started incident ids. */
function runStarts(ctx: Ctx, D: number, seconds: number, dt = 0.5): string[] {
  const s = createIncidentsState(ctx.content);
  const starts: string[] = [];
  const off = ctx.events.on('incidentStart', (p) => starts.push(p.id));
  for (let elapsed = 0; elapsed < seconds; elapsed += dt) updateIncidents(s, dt, ctx, D);
  off();
  return starts;
}

function forceActive(s: IncidentsState, id: string, ctx: SystemContext): void {
  const def = ctx.content.incidents.catalog.find((d) => d.id === id);
  if (!def) throw new Error(`no such incident ${id}`);
  s.active.push({
    id,
    phase: 'active',
    phaseRemaining: Number.isFinite(def.durationSeconds) ? def.durationSeconds : 9999,
    resolvable: def.resolution !== undefined,
  });
  s.nextIn = 9999; // keep the scheduler from rolling while we inspect flags
}

describe('incidents: scheduler', () => {
  it('1. frequency scales with D and is clamped at minInterval', () => {
    const cat = [inc({ id: 'x', telegraphSeconds: 2, durationSeconds: 0.5, category: 'combat' })];
    const low = runStarts(customCtx(cat, FAST_SCHEDULER), 0, 300).length;
    const high = runStarts(customCtx(cat, FAST_SCHEDULER), 20, 300).length;
    expect(high).toBeGreaterThan(low);
    // Beyond the floor, more difficulty cannot raise frequency further (mean clamped to minInterval).
    expect(runStarts(customCtx(cat, FAST_SCHEDULER), 1e6, 300)).toEqual(
      runStarts(customCtx(cat, FAST_SCHEDULER), 1e9, 300),
    );
  });

  it('2. determinism: same seed + same D history ⇒ identical id sequence', () => {
    const a = runStarts(createTestContext({ seed: 42 }), 5, 400);
    const b = runStarts(createTestContext({ seed: 42 }), 5, 400);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0);
  });

  it('3. no incident starts before the grace period', () => {
    const cat = [inc({ id: 'x' })];
    const sched: SchedulerTunables = { ...FAST_SCHEDULER, gracePeriod: 20 };
    expect(runStarts(customCtx(cat, sched), 5, 19)).toEqual([]);
    expect(runStarts(customCtx(cat, sched), 5, 40).length).toBeGreaterThan(0);
  });

  it('4. global + per-incident cooldowns enforce spacing', () => {
    const ctx = customCtx([inc({ id: 'x', durationSeconds: 1, cooldownSeconds: 50 })], {
      ...FAST_SCHEDULER,
      postIncidentCooldown: 10,
      gracePeriod: 0,
    });
    const s = createIncidentsState(ctx.content);
    s.nextIn = 0;
    updateIncidents(s, 0.001, ctx, 0); // starts x (telegraph)
    expect(s.active).toHaveLength(1);
    // Drive it through telegraph(2)+active(1) to its end.
    for (let i = 0; i < 8; i++) updateIncidents(s, 0.5, ctx, 0);
    expect(s.globalCooldown).toBeGreaterThan(0); // post-incident cooldown engaged
    expect(s.cooldowns.x).toBeGreaterThan(0); // per-incident cooldown engaged
    // Force a roll while cooled down → nothing starts.
    s.nextIn = 0;
    updateIncidents(s, 0.001, ctx, 0);
    expect(s.active).toHaveLength(0);
  });

  it('5. an incident with minDifficulty > D never rolls', () => {
    const cat = [inc({ id: 'hard', minDifficulty: 5 })];
    expect(runStarts(customCtx(cat, FAST_SCHEDULER), 2, 400)).toEqual([]);
  });

  it('starts the first eligible incident when all weights are zero', () => {
    const starts = runStarts(customCtx([inc({ id: 'z', weight: () => 0 })], FAST_SCHEDULER), 0, 100);
    expect(starts.length).toBeGreaterThan(0);
    expect(starts.every((id) => id === 'z')).toBe(true);
  });
});

describe('incidents: lifecycle', () => {
  it('6. telegraph → active → cleanup; flags apply only during the active phase', () => {
    const ctx = customCtx([inc({ id: 'x', telegraphSeconds: 2, durationSeconds: 3 })], {
      ...FAST_SCHEDULER,
      gracePeriod: 0,
    });
    const s = createIncidentsState(ctx.content);
    s.nextIn = 0;
    updateIncidents(s, 0.001, ctx, 0); // start (telegraph)
    expect(s.active[0]?.phase).toBe('telegraph');
    expect(s.flags.spawnRateMultiplier).toBe(1); // not applied during telegraph
    s.nextIn = 9999;
    updateIncidents(s, 2, ctx, 0); // telegraph elapses → active
    expect(s.active[0]?.phase).toBe('active');
    expect(s.flags.spawnRateMultiplier).toBe(2); // applied during active
    updateIncidents(s, 3, ctx, 0); // active elapses → ends
    expect(s.active).toHaveLength(0);
    expect(s.flags).toEqual(DEFAULT_FLAGS); // cleared after cleanup
  });

  it('13. propaganda locks input only for its short duration, then clears', () => {
    const ctx = createTestContext();
    const s = createIncidentsState(ctx.content);
    forceActive(s, 'propaganda', ctx);
    updateIncidents(s, 0, ctx, 5);
    expect(s.flags.inputLocked).toBe(true);
    updateIncidents(s, 3, ctx, 5); // propaganda duration is 3s
    expect(s.active).toHaveLength(0);
    expect(s.flags.inputLocked).toBe(false);
  });
});

describe('incidents: flags & composition', () => {
  it('7. every catalog incident contributes flags via apply (inspection is the no-flag exception)', () => {
    const ctx = createTestContext();
    for (const def of ctx.content.incidents.catalog) {
      const flags: IncidentFlags = { ...DEFAULT_FLAGS };
      def.apply(flags);
      const changed = JSON.stringify(flags) !== JSON.stringify(DEFAULT_FLAGS);
      expect(changed).toBe(def.id !== 'inspection');
    }
  });

  it('7. a real incident sets exactly its flag while active and clears it after', () => {
    const ctx = createTestContext();
    const s = createIncidentsState(ctx.content);
    forceActive(s, 'pipe_failure', ctx);
    updateIncidents(s, 0, ctx, 5);
    expect(s.flags.toiletBlocked).toBe(true);
    updateIncidents(s, 999, ctx, 5);
    expect(s.flags.toiletBlocked).toBe(false);
  });

  it('12. overlapping multipliers multiply and blackout composes by max', () => {
    const ctx = createTestContext();
    const s = createIncidentsState(ctx.content);
    forceActive(s, 'blackout', ctx); // sleepGainMultiplier *= 1.5, blackout = max(.,0.7)
    forceActive(s, 'resident_party', ctx); // sleepGainMultiplier *= 1.8 (different category)
    updateIncidents(s, 0, ctx, 5);
    expect(s.flags.sleepGainMultiplier).toBeCloseTo(1.5 * 1.8, 5);
    expect(s.flags.blackout).toBe(0.7);
  });

  it('12. same-category overlap is rejected and MAX_CONCURRENT is respected', () => {
    const cat = [
      inc({ id: 'a', category: 'combat', durationSeconds: 999, weight: () => 1 }),
      inc({ id: 'b', category: 'combat', durationSeconds: 999, weight: () => 1 }),
      inc({ id: 'c', category: 'power', durationSeconds: 999, weight: () => 1 }),
      inc({ id: 'd', category: 'service', durationSeconds: 999, weight: () => 1 }),
    ];
    const ctx = customCtx(cat, { ...FAST_SCHEDULER, gracePeriod: 0, maxConcurrent: 2 });
    const s = createIncidentsState(ctx.content);
    for (let i = 0; i < 200; i++) {
      s.nextIn = 0; // force a roll every tick
      updateIncidents(s, 0.1, ctx, 0);
    }
    expect(s.active.length).toBeLessThanOrEqual(2); // cap respected
    const cats = s.active.map((a) => cat.find((d) => d.id === a.id)?.category);
    expect(new Set(cats).size).toBe(cats.length); // no two of the same category
  });

  it('12. an exclusive incident blocks any other from starting', () => {
    const cat = [
      inc({ id: 'boss', category: 'combat', exclusive: true, durationSeconds: 999, weight: () => 1 }),
      inc({ id: 'other', category: 'power', durationSeconds: 999, weight: () => 1 }),
    ];
    const ctx = customCtx(cat, { ...FAST_SCHEDULER, gracePeriod: 0, maxConcurrent: 3 });
    const s = createIncidentsState(ctx.content);
    s.active.push({ id: 'boss', phase: 'active', phaseRemaining: 999, resolvable: false });
    for (let i = 0; i < 50; i++) {
      s.nextIn = 0;
      updateIncidents(s, 0.1, ctx, 0);
    }
    expect(s.active.every((a) => a.id === 'boss')).toBe(true);
  });
});

describe('incidents: resolution & penalties', () => {
  it('9. a timed incident ends with survived:true; an unpaid crisis ends survived:false', () => {
    const ctx = createTestContext();
    const ends: { id: string; survived: boolean }[] = [];
    ctx.events.on('incidentEnd', (p) => ends.push(p));
    const s = createIncidentsState(ctx.content);
    forceActive(s, 'swarm', ctx);
    updateIncidents(s, 999, ctx, 5); // times out
    expect(ends).toContainEqual({ id: 'swarm', survived: true });

    forceActive(s, 'inspection', ctx);
    updateIncidents(s, 999, ctx, 5); // expires unresolved
    expect(ends).toContainEqual({ id: 'inspection', survived: false });
  });

  it('10. tryResolve ends a resolvable incident early and clears its flag; false otherwise', () => {
    const ctx = createTestContext();
    const s = createIncidentsState(ctx.content);
    forceActive(s, 'gun_jam', ctx);
    updateIncidents(s, 0, ctx, 5);
    expect(s.flags.gunJammed).toBe(true);
    expect(tryResolve(s, 'gun_jam', ctx)).toBe(true);
    expect(s.active).toHaveLength(0);
    expect(s.flags.gunJammed).toBe(false);

    forceActive(s, 'pipe_failure', ctx); // not resolvable
    expect(tryResolve(s, 'pipe_failure', ctx)).toBe(false);
    expect(tryResolve(s, 'not_active', ctx)).toBe(false);
  });

  it('10. resolving one incident leaves a co-active incident’s flags intact', () => {
    const ctx = createTestContext();
    const s = createIncidentsState(ctx.content);
    forceActive(s, 'gun_jam', ctx);
    forceActive(s, 'pipe_failure', ctx);
    updateIncidents(s, 0, ctx, 5);
    expect(s.flags.gunJammed).toBe(true);
    expect(s.flags.toiletBlocked).toBe(true);
    tryResolve(s, 'gun_jam', ctx);
    expect(s.flags.gunJammed).toBe(false);
    expect(s.flags.toiletBlocked).toBe(true); // pipe failure still active
  });

  it('11. crisisOnExpiry fires its penalty once on expiry; resolving first fires none', () => {
    const ctx = createTestContext();
    let penalties = 0;
    ctx.events.on('incidentPenalty', () => penalties++);

    const lapsed = createIncidentsState(ctx.content);
    forceActive(lapsed, 'inspection', ctx);
    updateIncidents(lapsed, 999, ctx, 5);
    expect(penalties).toBe(1);

    const paid = createIncidentsState(ctx.content);
    forceActive(paid, 'inspection', ctx);
    expect(tryResolve(paid, 'inspection', ctx)).toBe(true);
    expect(penalties).toBe(1); // unchanged — paid before expiry
  });
});

describe('incidents: state', () => {
  it('createIncidentsState starts clear with nextIn at the grace period', () => {
    const ctx = createTestContext();
    const s = createIncidentsState(ctx.content);
    expect(s.active).toEqual([]);
    expect(s.flags).toEqual(DEFAULT_FLAGS);
    expect(s.nextIn).toBe(ctx.content.incidents.scheduler.gracePeriod);
  });

  it('DEFAULT_FLAGS is frozen so a tick can never mutate the baseline', () => {
    expect(Object.isFrozen(DEFAULT_FLAGS)).toBe(true);
  });
});
