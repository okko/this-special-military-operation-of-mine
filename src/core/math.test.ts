import { describe, it, expect } from 'vitest';
import { v2, clamp, lerp, approach, type Vec2 } from './math';

describe('clamp', () => {
  it('clamps below, within, and above the range', () => {
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(15, 0, 10)).toBe(10);
  });
});

describe('lerp', () => {
  it('interpolates linearly', () => {
    expect(lerp(0, 10, 0)).toBe(0);
    expect(lerp(0, 10, 1)).toBe(10);
    expect(lerp(0, 10, 0.5)).toBe(5);
  });
});

describe('approach', () => {
  it('snaps to target when within maxDelta', () => {
    expect(approach(0, 1, 5)).toBe(1);
    expect(approach(10, 8, 5)).toBe(8);
  });
  it('moves by at most maxDelta toward the target, both directions', () => {
    expect(approach(0, 10, 3)).toBe(3);
    expect(approach(10, 0, 3)).toBe(7);
  });
  it('does not overshoot at the exact boundary', () => {
    expect(approach(0, 3, 3)).toBe(3);
  });
});

describe('v2', () => {
  const a: Vec2 = { x: 3, y: 4 };
  const b: Vec2 = { x: 1, y: 2 };

  it('add/sub/scale produce new vectors and do not mutate inputs', () => {
    expect(v2.add(a, b)).toEqual({ x: 4, y: 6 });
    expect(v2.sub(a, b)).toEqual({ x: 2, y: 2 });
    expect(v2.scale(a, 2)).toEqual({ x: 6, y: 8 });
    // inputs untouched
    expect(a).toEqual({ x: 3, y: 4 });
    expect(b).toEqual({ x: 1, y: 2 });
  });

  it('len and dist', () => {
    expect(v2.len(a)).toBe(5);
    expect(v2.dist(a, { x: 0, y: 0 })).toBe(5);
  });

  it('dot product', () => {
    expect(v2.dot(a, b)).toBe(3 * 1 + 4 * 2);
  });

  it('norm yields a unit vector', () => {
    const n = v2.norm(a);
    expect(v2.len(n)).toBeCloseTo(1, 10);
  });

  it('norm of the zero vector is the zero vector (no NaN)', () => {
    expect(v2.norm({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
  });

  it('angle and rotate are consistent', () => {
    expect(v2.angle({ x: 1, y: 0 })).toBeCloseTo(0, 10);
    expect(v2.angle({ x: 0, y: 1 })).toBeCloseTo(Math.PI / 2, 10);
    const r = v2.rotate({ x: 1, y: 0 }, Math.PI / 2);
    expect(r.x).toBeCloseTo(0, 10);
    expect(r.y).toBeCloseTo(1, 10);
  });

  it('vector lerp interpolates each component', () => {
    expect(v2.lerp(a, b, 0)).toEqual(a);
    expect(v2.lerp(a, b, 1)).toEqual(b);
    expect(v2.lerp({ x: 0, y: 0 }, { x: 10, y: 20 }, 0.5)).toEqual({ x: 5, y: 10 });
  });
});
