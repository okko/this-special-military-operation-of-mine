import { describe, it, expect } from 'vitest';
import { createStorage, createMemoryBackend } from './storage';
import { createMetaStatsRepo } from './meta-stats-repo';
import { DEFAULT_META, type RunSummary } from './schemas';

function run(over: Partial<RunSummary> = {}): RunSummary {
  return { score: 1000, shiftSeconds: 90, dronesDowned: 30, cause: 'post', ...over };
}

describe('MetaStatsRepo', () => {
  it('returns defaults when nothing is stored', () => {
    const repo = createMetaStatsRepo(createStorage(createMemoryBackend()));
    expect(repo.get()).toEqual(DEFAULT_META);
  });

  it('recordRun increments lifetime counters and stores the last run', () => {
    const repo = createMetaStatsRepo(createStorage(createMemoryBackend()));
    repo.recordRun(run({ shiftSeconds: 50, dronesDowned: 5 }));
    const after = repo.recordRun(run({ shiftSeconds: 80, dronesDowned: 7, cause: 'crisis' }));
    expect(after.lifetimeRuns).toBe(2);
    expect(after.lifetimeDronesDowned).toBe(12);
    expect(after.lastRun).toEqual(run({ shiftSeconds: 80, dronesDowned: 7, cause: 'crisis' }));
  });

  it('bestShiftSeconds only improves, never regresses', () => {
    const repo = createMetaStatsRepo(createStorage(createMemoryBackend()));
    expect(repo.recordRun(run({ shiftSeconds: 120 })).bestShiftSeconds).toBe(120);
    expect(repo.recordRun(run({ shiftSeconds: 60 })).bestShiftSeconds).toBe(120); // not regressed
    expect(repo.recordRun(run({ shiftSeconds: 200 })).bestShiftSeconds).toBe(200); // improved
  });

  it('markIntroSeen is idempotent', () => {
    const backend = createMemoryBackend();
    const repo = createMetaStatsRepo(createStorage(backend));
    repo.markIntroSeen();
    expect(repo.get().introSeen).toBe(true);
    repo.markIntroSeen(); // no-op the second time
    expect(repo.get().introSeen).toBe(true);
  });

  it('coerces corrupt persisted data onto defaults', () => {
    const backend = createMemoryBackend();
    backend.setItem(
      'orpd:meta',
      JSON.stringify({ version: 1, data: { lifetimeRuns: 'lots', lastRun: { score: 'x' } } }),
    );
    const repo = createMetaStatsRepo(createStorage(backend));
    expect(repo.get().lifetimeRuns).toBe(0); // bad number → default
    expect(repo.get().lastRun).toBeNull(); // malformed run → null
  });

  it('persists across repo instances over the same backend', () => {
    const backend = createMemoryBackend();
    createMetaStatsRepo(createStorage(backend)).recordRun(run());
    expect(createMetaStatsRepo(createStorage(backend)).get().lifetimeRuns).toBe(1);
  });
});
