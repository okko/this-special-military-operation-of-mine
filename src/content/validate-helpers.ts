/**
 * Small shared primitives for the Phase-2 content validators (meters/residents/scoring/incidents).
 * Each throws `ContentValidationError` with a locating `path` so malformed balance/roster data fails
 * loudly at boot (docs/areas/00-core-platform.md §3.11), never silently.
 */
import { ContentValidationError } from './content-error';

export function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

export function asObject(v: unknown, path: string): Record<string, unknown> {
  if (!isObject(v)) throw new ContentValidationError('expected an object', path);
  return v;
}

export function asArray(v: unknown, path: string): unknown[] {
  if (!Array.isArray(v)) throw new ContentValidationError('expected an array', path);
  return v;
}

export interface NumOpts {
  min?: number;
  max?: number;
  int?: boolean;
}

/** A finite number at `obj[key]`, optionally bounded / integer. */
export function num(obj: Record<string, unknown>, key: string, path: string, opts: NumOpts = {}): number {
  const v = obj[key];
  if (!isFiniteNumber(v)) throw new ContentValidationError(`${key} must be a number`, path);
  if (opts.int && !Number.isInteger(v)) throw new ContentValidationError(`${key} must be an integer`, path);
  if (opts.min !== undefined && v < opts.min) {
    throw new ContentValidationError(`${key} must be ≥ ${opts.min}`, path);
  }
  if (opts.max !== undefined && v > opts.max) {
    throw new ContentValidationError(`${key} must be ≤ ${opts.max}`, path);
  }
  return v;
}

/** A non-empty string at `obj[key]`. */
export function str(obj: Record<string, unknown>, key: string, path: string): string {
  const v = obj[key];
  if (typeof v !== 'string' || v.length === 0) {
    throw new ContentValidationError(`${key} must be a non-empty string`, path);
  }
  return v;
}

export function bool(obj: Record<string, unknown>, key: string, path: string): boolean {
  const v = obj[key];
  if (typeof v !== 'boolean') throw new ContentValidationError(`${key} must be a boolean`, path);
  return v;
}

/** Assert `value` is one of `allowed`. */
export function oneOf<T extends string>(value: unknown, allowed: readonly T[], path: string): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new ContentValidationError(`must be one of ${allowed.join(', ')}`, path);
  }
  return value as T;
}
