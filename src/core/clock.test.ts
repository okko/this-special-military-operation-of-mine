import { describe, it, expect } from 'vitest';
import { createClock } from './clock';

describe('createClock', () => {
  it('starts at zero', () => {
    expect(createClock().shiftSeconds).toBe(0);
  });

  it('accumulates injected dt', () => {
    const c = createClock();
    c.advance(1 / 60);
    c.advance(1 / 60);
    expect(c.shiftSeconds).toBeCloseTo(2 / 60, 10);
  });

  it('is independent per instance', () => {
    const a = createClock();
    const b = createClock();
    a.advance(5);
    expect(a.shiftSeconds).toBe(5);
    expect(b.shiftSeconds).toBe(0);
  });
});
