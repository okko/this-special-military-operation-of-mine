/**
 * Seedable PRNG (docs/areas/00-core-platform.md §3.3). Algorithm: mulberry32 — 32-bit, fast,
 * single-integer state, so a whole run's randomness serializes to one number. `Math.random()`
 * is banned in logic (non-reproducible, unseedable); this is the only randomness source.
 */

export interface RngState {
  seed: number;
}

export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [minInclusive, maxExclusive). */
  int(minInclusive: number, maxExclusive: number): number;
  /** Uniform float in [min, max). */
  range(min: number, max: number): number;
  /** A uniformly chosen element. Throws on an empty array. */
  pick<T>(items: readonly T[]): T;
  /** True with probability p. */
  chance(p: number): boolean;
  /** Capture the current state (the continuation point, not the original seed). */
  getState(): RngState;
  /** Restore a previously captured state so the sequence continues identically. */
  setState(s: RngState): void;
}

export function createRng(seed: number): Rng {
  // Kept in the signed 32-bit domain via `| 0`; emitted as unsigned via `>>> 0`.
  let s = seed | 0;

  const next = (): number => {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    int: (minInclusive, maxExclusive) =>
      minInclusive + Math.floor(next() * (maxExclusive - minInclusive)),
    range: (min, max) => min + next() * (max - min),
    pick: <T>(items: readonly T[]): T => {
      if (items.length === 0) throw new Error('rng.pick: cannot pick from an empty array');
      const idx = Math.floor(next() * items.length);
      // Safe: idx ∈ [0, length). The cast is needed only because noUncheckedIndexedAccess
      // widens indexed access to `T | undefined`.
      return items[idx] as T;
    },
    chance: (p) => next() < p,
    getState: () => ({ seed: s >>> 0 }),
    setState: (state) => {
      s = state.seed | 0;
    },
  };
}
