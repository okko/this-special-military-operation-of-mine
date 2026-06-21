import { describe, it, expect, vi } from 'vitest';
import { stepLoop, FIXED_DT, MAX_FRAME } from './loop';

describe('stepLoop', () => {
  it('runs the correct integer number of fixed steps for a whole-multiple frame', () => {
    const tick = vi.fn();
    const { steps, accumulator } = stepLoop(0, FIXED_DT * 3, tick);
    expect(steps).toBe(3);
    expect(tick).toHaveBeenCalledTimes(3);
    expect(tick).toHaveBeenCalledWith(FIXED_DT);
    expect(accumulator).toBeCloseTo(0, 10);
  });

  it('accumulates a sub-FIXED_DT frame without stepping', () => {
    const tick = vi.fn();
    const { steps, accumulator } = stepLoop(0, FIXED_DT / 2, tick);
    expect(steps).toBe(0);
    expect(tick).not.toHaveBeenCalled();
    expect(accumulator).toBeCloseTo(FIXED_DT / 2, 10);
  });

  it('carries the accumulator across frames until it crosses FIXED_DT', () => {
    const tick = vi.fn();
    const first = stepLoop(0, FIXED_DT * 0.6, tick);
    expect(first.steps).toBe(0);
    const second = stepLoop(first.accumulator, FIXED_DT * 0.6, tick);
    expect(second.steps).toBe(1);
  });

  it('clamps a frame above MAX_FRAME (no spiral of death)', () => {
    const tick = vi.fn();
    // A 10s stall would be 600 steps unclamped; clamp caps it at MAX_FRAME worth.
    const { steps } = stepLoop(0, 10, tick);
    expect(steps).toBe(Math.floor(MAX_FRAME / FIXED_DT));
  });

  it('always reports alpha in [0, 1)', () => {
    for (const frame of [0, FIXED_DT / 3, FIXED_DT, FIXED_DT * 2.5, 10]) {
      const { alpha } = stepLoop(0, frame, () => {});
      expect(alpha).toBeGreaterThanOrEqual(0);
      expect(alpha).toBeLessThan(1);
    }
  });

  it('honors custom fixedDt and maxFrame', () => {
    const tick = vi.fn();
    const { steps } = stepLoop(0, 1, tick, 0.1, 0.5);
    expect(steps).toBe(5); // clamp 1→0.5, then 0.5 / 0.1 = 5 steps
  });
});
