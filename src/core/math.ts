/**
 * Core 2D math (docs/areas/00-core-platform.md §3.7). Immutable-friendly: every `v2` op
 * returns a NEW Vec2 and never mutates its inputs. No dependencies, no side effects.
 */

export interface Vec2 {
  x: number;
  y: number;
}

export function clamp(x: number, lo: number, hi: number): number {
  if (x < lo) return lo;
  if (x > hi) return hi;
  return x;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Move `value` toward `target` by at most `maxDelta`, never overshooting. */
export function approach(value: number, target: number, maxDelta: number): number {
  const delta = target - value;
  if (Math.abs(delta) <= maxDelta) return target;
  return value + Math.sign(delta) * maxDelta;
}

export const v2 = {
  add: (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y }),
  sub: (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y }),
  scale: (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s }),
  len: (a: Vec2): number => Math.hypot(a.x, a.y),
  /** Unit vector; the zero vector normalizes to the zero vector (no divide-by-zero). */
  norm: (a: Vec2): Vec2 => {
    const l = Math.hypot(a.x, a.y);
    if (l === 0) return { x: 0, y: 0 };
    return { x: a.x / l, y: a.y / l };
  },
  dot: (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y,
  /** Angle of the vector in radians, measured from +x. */
  angle: (a: Vec2): number => Math.atan2(a.y, a.x),
  rotate: (a: Vec2, radians: number): Vec2 => {
    const c = Math.cos(radians);
    const s = Math.sin(radians);
    return { x: a.x * c - a.y * s, y: a.x * s + a.y * c };
  },
  lerp: (a: Vec2, b: Vec2, t: number): Vec2 => ({
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  }),
  dist: (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y),
} as const;
