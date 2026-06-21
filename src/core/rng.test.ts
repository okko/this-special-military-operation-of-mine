import { describe, it, expect } from 'vitest';
import { createRng } from './rng';

describe('createRng', () => {
  it('produces an identical sequence for the same seed', () => {
    const a = createRng(12345);
    const b = createRng(12345);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const a = createRng(1);
    const b = createRng(2);
    expect(a.next()).not.toBe(b.next());
  });

  it('emits floats in [0, 1)', () => {
    const r = createRng(99);
    for (let i = 0; i < 1000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('getState/setState round-trips to reproduce the exact continuation', () => {
    const r = createRng(7);
    r.next();
    r.next();
    const saved = r.getState();
    const continuation = [r.next(), r.next(), r.next()];
    r.setState(saved);
    expect([r.next(), r.next(), r.next()]).toEqual(continuation);
  });

  it('two instances restored to the same state stay in lockstep', () => {
    const a = createRng(42);
    a.next();
    const b = createRng(0);
    b.setState(a.getState());
    expect(b.next()).toBe(a.next());
    expect(b.next()).toBe(a.next());
  });

  describe('int', () => {
    it('stays within [min, max)', () => {
      const r = createRng(3);
      for (let i = 0; i < 1000; i++) {
        const v = r.int(5, 10);
        expect(v).toBeGreaterThanOrEqual(5);
        expect(v).toBeLessThan(10);
        expect(Number.isInteger(v)).toBe(true);
      }
    });

    it('eventually covers the whole range', () => {
      const r = createRng(123);
      const seen = new Set<number>();
      for (let i = 0; i < 1000; i++) seen.add(r.int(0, 4));
      expect([...seen].sort()).toEqual([0, 1, 2, 3]);
    });
  });

  describe('range', () => {
    it('stays within [min, max)', () => {
      const r = createRng(8);
      for (let i = 0; i < 1000; i++) {
        const v = r.range(-2, 2);
        expect(v).toBeGreaterThanOrEqual(-2);
        expect(v).toBeLessThan(2);
      }
    });
  });

  describe('pick', () => {
    it('returns one of the items', () => {
      const r = createRng(55);
      const items = ['a', 'b', 'c'] as const;
      for (let i = 0; i < 100; i++) {
        expect(items).toContain(r.pick(items));
      }
    });

    it('eventually picks every item', () => {
      const r = createRng(56);
      const items = ['a', 'b', 'c'] as const;
      const seen = new Set<string>();
      for (let i = 0; i < 200; i++) seen.add(r.pick(items));
      expect(seen.size).toBe(3);
    });

    it('throws on an empty array', () => {
      const r = createRng(1);
      expect(() => r.pick([])).toThrow(/empty/);
    });
  });

  describe('chance', () => {
    it('is always false at p=0 and always true at p=1', () => {
      const r = createRng(2);
      for (let i = 0; i < 100; i++) {
        expect(r.chance(0)).toBe(false);
        expect(r.chance(1)).toBe(true);
      }
    });

    it('roughly matches the probability over many trials', () => {
      const r = createRng(77);
      let hits = 0;
      const n = 10000;
      for (let i = 0; i < n; i++) if (r.chance(0.3)) hits++;
      expect(hits / n).toBeGreaterThan(0.27);
      expect(hits / n).toBeLessThan(0.33);
    });
  });
});
