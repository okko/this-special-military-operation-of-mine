/**
 * Clock / time injection (docs/areas/00-core-platform.md §3.4). Accumulates elapsed shift time
 * from injected `dt` values. It reads NO real clock — only main.ts's loop driver reads
 * `performance.now()`; everything downstream advances time by feeding `dt` here.
 */

export interface Clock {
  shiftSeconds: number;
  advance(dt: number): void;
}

export function createClock(): Clock {
  return {
    shiftSeconds: 0,
    advance(dt: number): void {
      this.shiftSeconds += dt;
    },
  };
}
