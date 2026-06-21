/**
 * Lifetime meta-stats repository (docs/areas/09-state-and-persistence.md §4). Written on game over
 * (`recordRun`) and on intro completion (`markIntroSeen`); read at Boot/MainMenu. Reads coerce
 * onto defaults so corrupt data never crashes.
 */
import type { Storage } from './storage';
import { DEFAULT_META, KEY_META, type MetaStats, type RunSummary } from './schemas';

function coerceRun(raw: unknown): RunSummary | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (
    typeof r.score !== 'number' ||
    typeof r.shiftSeconds !== 'number' ||
    typeof r.dronesDowned !== 'number' ||
    typeof r.cause !== 'string'
  ) {
    return null;
  }
  return { score: r.score, shiftSeconds: r.shiftSeconds, dronesDowned: r.dronesDowned, cause: r.cause };
}

function coerce(raw: unknown): MetaStats {
  const base = DEFAULT_META;
  const r = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const num = (v: unknown, d: number): number =>
    typeof v === 'number' && Number.isFinite(v) ? v : d;
  return {
    bestShiftSeconds: num(r.bestShiftSeconds, base.bestShiftSeconds),
    lifetimeDronesDowned: num(r.lifetimeDronesDowned, base.lifetimeDronesDowned),
    lifetimeRuns: num(r.lifetimeRuns, base.lifetimeRuns),
    lastRun: coerceRun(r.lastRun),
    introSeen: typeof r.introSeen === 'boolean' ? r.introSeen : base.introSeen,
  };
}

export interface MetaStatsRepo {
  get(): MetaStats;
  recordRun(summary: RunSummary): MetaStats;
  markIntroSeen(): void;
}

export function createMetaStatsRepo(storage: Storage): MetaStatsRepo {
  function get(): MetaStats {
    return coerce(storage.get<unknown>(KEY_META, null));
  }
  return {
    get,
    recordRun(summary: RunSummary): MetaStats {
      const prev = get();
      const next: MetaStats = {
        bestShiftSeconds: Math.max(prev.bestShiftSeconds, summary.shiftSeconds),
        lifetimeDronesDowned: prev.lifetimeDronesDowned + summary.dronesDowned,
        lifetimeRuns: prev.lifetimeRuns + 1,
        lastRun: summary,
        introSeen: prev.introSeen,
      };
      storage.set(KEY_META, next);
      return next;
    },
    markIntroSeen(): void {
      const prev = get();
      if (prev.introSeen) return; // idempotent: no redundant write
      storage.set(KEY_META, { ...prev, introSeen: true });
    },
  };
}
