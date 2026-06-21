/**
 * Fixed-timestep accumulator (docs/areas/00-core-platform.md §3.2). This is the PURE core of
 * the game loop, extracted from main.ts so it is deterministic and unit-testable without
 * requestAnimationFrame or the real clock. main.ts reads `performance.now()` and feeds the
 * frame delta here; logic only ever sees a constant FIXED_DT.
 */

export const FIXED_DT = 1 / 60;
/** Clamp a single frame so a long tab stall can't trigger a spiral of death. */
export const MAX_FRAME = 0.25;

export interface LoopStep {
  /** Leftover accumulator to carry into the next frame. */
  accumulator: number;
  /** Interpolation factor in [0, 1) for the renderer. */
  alpha: number;
  /** Number of fixed `tick`s performed this frame. */
  steps: number;
}

/**
 * Advance the accumulator by one display frame, running zero or more fixed `tick`s.
 * `frameDt` is clamped to `maxFrame` BEFORE accumulating, so a huge delta runs a bounded
 * number of steps rather than blocking.
 */
export function stepLoop(
  accumulator: number,
  frameDt: number,
  tick: (dt: number) => void,
  fixedDt: number = FIXED_DT,
  maxFrame: number = MAX_FRAME,
): LoopStep {
  let acc = accumulator + Math.min(frameDt, maxFrame);
  let steps = 0;
  while (acc >= fixedDt) {
    tick(fixedDt);
    acc -= fixedDt;
    steps++;
  }
  return { accumulator: acc, alpha: acc / fixedDt, steps };
}
