import { describe, it, expect } from 'vitest';
import { validateIncidentCatalog, validateSchedulerTunables } from './incidents-validate';
import { INCIDENTS, schedulerTunables } from './incidents';
import type { IncidentDef } from './incidents';

function inc(over: Partial<IncidentDef> & { id: string }): IncidentDef {
  return {
    name: 'N',
    flavor: 'F',
    category: 'combat',
    exclusive: false,
    minDifficulty: 0,
    weight: () => 1,
    telegraphSeconds: 2,
    durationSeconds: 5,
    cooldownSeconds: 10,
    apply: () => undefined,
    ...over,
  };
}

/** A full valid catalog of 12 (the validator requires ≥ 12). */
function twelve(): IncidentDef[] {
  return Array.from({ length: 12 }, (_, i) => inc({ id: `i${i}` }));
}

describe('validateIncidentCatalog', () => {
  it('accepts the shipped catalog', () => {
    expect(validateIncidentCatalog(INCIDENTS)).toBe(INCIDENTS);
  });

  it('rejects a catalog with fewer than 12 incidents', () => {
    expect(() => validateIncidentCatalog([inc({ id: 'x' })])).toThrow(/at least 12/);
  });

  it('rejects duplicate ids', () => {
    const cat = twelve();
    cat[1] = inc({ id: 'i0' });
    expect(() => validateIncidentCatalog(cat)).toThrow(/duplicate incident id/);
  });

  it('rejects an unknown category', () => {
    const cat: unknown[] = twelve();
    cat[0] = { ...inc({ id: 'i0' }), category: 'weather' };
    expect(() => validateIncidentCatalog(cat)).toThrow(/category/);
  });

  it('rejects a telegraph under 2 seconds', () => {
    const cat = twelve();
    cat[0] = inc({ id: 'i0', telegraphSeconds: 1 });
    expect(() => validateIncidentCatalog(cat)).toThrow(/telegraphSeconds/);
  });

  it('rejects a non-positive duration', () => {
    const cat = twelve();
    cat[0] = inc({ id: 'i0', durationSeconds: 0 });
    expect(() => validateIncidentCatalog(cat)).toThrow(/durationSeconds/);
  });

  it('rejects a negative weight', () => {
    const cat = twelve();
    cat[0] = inc({ id: 'i0', weight: () => -1 });
    expect(() => validateIncidentCatalog(cat)).toThrow(/weight\(0\)/);
  });

  it('rejects an invalid resolution kind', () => {
    const cat: unknown[] = twelve();
    cat[0] = { ...inc({ id: 'i0' }), resolution: { kind: 'bribe' } };
    expect(() => validateIncidentCatalog(cat)).toThrow(/resolution.kind/);
  });
});

describe('validateSchedulerTunables', () => {
  it('accepts the shipped tunables', () => {
    expect(validateSchedulerTunables(schedulerTunables)).toBe(schedulerTunables);
  });

  it('rejects minInterval greater than baseInterval', () => {
    expect(() => validateSchedulerTunables({ ...schedulerTunables, minInterval: 99 })).toThrow(
      /minInterval must be ≤ baseInterval/,
    );
  });

  it('rejects a maxConcurrent below 1', () => {
    expect(() => validateSchedulerTunables({ ...schedulerTunables, maxConcurrent: 0 })).toThrow(/maxConcurrent/);
  });
});
