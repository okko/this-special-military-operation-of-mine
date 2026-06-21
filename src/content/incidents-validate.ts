/**
 * Validators for the incident catalog + scheduler tunables (docs/areas/05-random-incidents.md §5).
 * Confirms unique ids, a sane category, non-negative minDifficulty, telegraph ≥ 2s (fair warning),
 * positive cooldowns, finite non-negative weights, and that `apply`/`weight` are functions. Throws
 * `ContentValidationError`. (Catalog entries hold functions, so the values pass through unchanged.)
 */
import { ContentValidationError } from './content-error';
import { asArray, asObject, num, str, isFiniteNumber, oneOf } from './validate-helpers';
import type { IncidentDef, SchedulerTunables } from './incidents';
import type { IncidentCategory } from '../state/game-state';

const CATEGORIES: readonly IncidentCategory[] = [
  'plumbing',
  'combat',
  'power',
  'service',
  'social',
  'authority',
  'nature',
];

export function validateIncidentCatalog(raw: unknown): IncidentDef[] {
  const catalog = asArray(raw, 'content.incidents');
  if (catalog.length < 12) {
    throw new ContentValidationError('catalog must have at least 12 incidents', 'content.incidents');
  }
  const seen = new Set<string>();
  catalog.forEach((defRaw, i) => {
    const path = `content.incidents[${i}]`;
    const def = asObject(defRaw, path);
    const id = str(def, 'id', path);
    if (seen.has(id)) throw new ContentValidationError(`duplicate incident id "${id}"`, path);
    seen.add(id);
    str(def, 'name', path);
    str(def, 'flavor', path);
    oneOf(def.category, CATEGORIES, `${path}.category`);
    if (typeof def.exclusive !== 'boolean') throw new ContentValidationError('exclusive must be a boolean', path);
    num(def, 'minDifficulty', path, { min: 0 });
    num(def, 'telegraphSeconds', path, { min: 2 }); // fair-warning minimum (§3.4)
    num(def, 'cooldownSeconds', path, { min: 0 });
    if (typeof def.durationSeconds !== 'number' || def.durationSeconds <= 0) {
      throw new ContentValidationError('durationSeconds must be a positive number (Infinity allowed)', path);
    }
    if (typeof def.weight !== 'function') throw new ContentValidationError('weight must be a function', path);
    const w = (def.weight as (D: number) => number)(0);
    if (!isFiniteNumber(w) || w < 0) throw new ContentValidationError('weight(0) must be a number ≥ 0', path);
    if (typeof def.apply !== 'function') throw new ContentValidationError('apply must be a function', path);
    if (def.resolution !== undefined) {
      const r = asObject(def.resolution, `${path}.resolution`);
      oneOf(r.kind, ['kill', 'clear', 'pay'] as const, `${path}.resolution.kind`);
    }
    if (def.crisisOnExpiry !== undefined && typeof def.crisisOnExpiry !== 'function') {
      throw new ContentValidationError('crisisOnExpiry must be a function', path);
    }
  });
  return raw as IncidentDef[];
}

export function validateSchedulerTunables(raw: unknown): SchedulerTunables {
  const path = 'content.incidents.scheduler';
  const t = asObject(raw, path);
  const minInterval = num(t, 'minInterval', path, { min: 0.001 });
  const baseInterval = num(t, 'baseInterval', path, { min: 0.001 });
  if (minInterval > baseInterval) {
    throw new ContentValidationError('minInterval must be ≤ baseInterval', path);
  }
  num(t, 'rate', path, { min: 0 });
  num(t, 'postIncidentCooldown', path, { min: 0 });
  num(t, 'gracePeriod', path, { min: 0 });
  num(t, 'maxConcurrent', path, { int: true, min: 1 });
  return raw as SchedulerTunables;
}
