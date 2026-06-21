/**
 * Random-incident system (docs/areas/05-random-incidents.md). A seeded scheduler injects time-boxed
 * incidents whose frequency scales with difficulty `D`; each runs a telegraph → active → end
 * lifecycle and contributes to a recomputed-each-tick `IncidentFlags` that other areas READ. This
 * module only mutates its own slice and emits incidentStart / incidentEnd / incidentPenalty — it
 * never imports Meters/Economy/Engine. Deterministic: all randomness uses the injected `ctx.rng`.
 */
import { clamp } from '../core/math';
import type { Rng } from '../core/rng';
import type { SystemContext } from '../core/system-context';
import type { IncidentsState, IncidentFlags, ActiveIncident } from '../state/game-state';
import type { Content } from '../content/loader';
import type { IncidentDef, SchedulerTunables } from '../content/incidents';

/** Frozen all-clear baseline; `updateIncidents` recomputes `flags` from a fresh copy each tick. */
export const DEFAULT_FLAGS: Readonly<IncidentFlags> = Object.freeze({
  toiletBlocked: false,
  spawnRateMultiplier: 1,
  bossActive: false,
  gunJammed: false,
  blackout: 0,
  sleepGainMultiplier: 1,
  servicePriceMultiplier: 1,
  servicesDisabled: false,
  inputLocked: false,
  decoysActive: false,
});

export function createIncidentsState(content: Content): IncidentsState {
  return {
    active: [],
    nextIn: content.incidents.scheduler.gracePeriod, // opening incident-free window (§3.1)
    cooldowns: {},
    globalCooldown: 0,
    flags: { ...DEFAULT_FLAGS },
  };
}

/** Exponential jitter (mean `mean`); deterministic via the seeded rng. `1 - next()` avoids log(0). */
function expInterval(rng: Rng, mean: number): number {
  return -mean * Math.log(1 - rng.next());
}

function meanInterval(D: number, t: SchedulerTunables): number {
  return clamp(t.baseInterval / (1 + D * t.rate), t.minInterval, t.baseInterval);
}

function defById(catalog: IncidentDef[], id: string): IncidentDef | undefined {
  return catalog.find((d) => d.id === id);
}

export function updateIncidents(s: IncidentsState, dt: number, ctx: SystemContext, D: number): void {
  const t = ctx.content.incidents.scheduler;
  const catalog = ctx.content.incidents.catalog;

  // 1. Cooldowns tick down.
  s.globalCooldown = Math.max(0, s.globalCooldown - dt);
  for (const id of Object.keys(s.cooldowns)) {
    s.cooldowns[id] = Math.max(0, (s.cooldowns[id] ?? 0) - dt);
  }

  // 2. Lifecycle: advance each active incident; finalize those whose active phase has expired.
  const survivors: ActiveIncident[] = [];
  for (const ai of s.active) {
    const def = defById(catalog, ai.id);
    if (!def) continue; // unknown id — drop it
    ai.phaseRemaining -= dt;
    if (ai.phase === 'telegraph') {
      if (ai.phaseRemaining <= 0) {
        ai.phase = 'active';
        ai.phaseRemaining = def.durationSeconds;
      }
      survivors.push(ai);
    } else if (ai.phase === 'active' && ai.phaseRemaining <= 0) {
      finalizeEnd(s, def, ctx, t, !def.crisisOnExpiry, true); // timed expiry
    } else {
      survivors.push(ai);
    }
  }
  s.active = survivors;

  // 3. Scheduler roll.
  s.nextIn -= dt;
  if (s.nextIn <= 0) {
    tryStart(s, ctx, D, t, catalog);
    s.nextIn = expInterval(ctx.rng, meanInterval(D, t));
  }

  // 4. Recompute flags from the frozen baseline + every ACTIVE-phase incident's contribution.
  const flags: IncidentFlags = { ...DEFAULT_FLAGS };
  for (const ai of s.active) {
    if (ai.phase === 'active') defById(catalog, ai.id)?.apply(flags);
  }
  s.flags = flags;
}

function finalizeEnd(
  s: IncidentsState,
  def: IncidentDef,
  ctx: SystemContext,
  t: SchedulerTunables,
  survived: boolean,
  viaExpiry: boolean,
): void {
  if (viaExpiry && def.crisisOnExpiry) def.crisisOnExpiry(ctx);
  ctx.events.emit('incidentEnd', { id: def.id, survived });
  s.cooldowns[def.id] = def.cooldownSeconds;
  s.globalCooldown = t.postIncidentCooldown;
}

function tryStart(
  s: IncidentsState,
  ctx: SystemContext,
  D: number,
  t: SchedulerTunables,
  catalog: IncidentDef[],
): void {
  if (s.globalCooldown > 0 || s.active.length >= t.maxConcurrent) return;
  if (s.active.some((ai) => defById(catalog, ai.id)?.exclusive)) return; // an exclusive incident blocks all
  const activeCategories = new Set(s.active.map((ai) => defById(catalog, ai.id)?.category));

  const eligible = catalog.filter(
    (def) =>
      def.minDifficulty <= D &&
      (s.cooldowns[def.id] ?? 0) <= 0 &&
      !(def.exclusive && s.active.length > 0) &&
      !activeCategories.has(def.category),
  );
  const first = eligible[0];
  if (!first) return;

  const weights = eligible.map((d) => Math.max(0, d.weight(D)));
  const total = weights.reduce((a, b) => a + b, 0);
  let picked = first;
  if (total > 0) {
    let r = ctx.rng.next() * total;
    for (let i = 0; i < eligible.length; i++) {
      r -= weights[i] ?? 0;
      if (r < 0) {
        picked = eligible[i] ?? first;
        break;
      }
    }
  }

  s.active.push({
    id: picked.id,
    phase: 'telegraph',
    phaseRemaining: picked.telegraphSeconds,
    resolvable: picked.resolution !== undefined,
  });
  ctx.events.emit('incidentStart', { id: picked.id }); // flags NOT applied yet (fair warning)
}

/** Player resolution (§3.2): end a resolvable active incident early. Returns false otherwise. */
export function tryResolve(s: IncidentsState, id: string, ctx: SystemContext): boolean {
  const t = ctx.content.incidents.scheduler;
  const catalog = ctx.content.incidents.catalog;
  const idx = s.active.findIndex((ai) => ai.id === id && ai.resolvable);
  if (idx === -1) return false;
  const def = defById(catalog, id);
  if (!def) return false;
  s.active.splice(idx, 1);
  finalizeEnd(s, def, ctx, t, true, false); // resolved cleanly — survived, no crisisOnExpiry

  // Recompute flags now that it is gone, so the cleared flag is visible immediately.
  const flags: IncidentFlags = { ...DEFAULT_FLAGS };
  for (const ai of s.active) {
    if (ai.phase === 'active') defById(catalog, ai.id)?.apply(flags);
  }
  s.flags = flags;
  return true;
}
