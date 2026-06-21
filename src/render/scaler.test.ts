// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { computeScale, createScaler, INTERNAL_WIDTH, INTERNAL_HEIGHT } from './scaler';

describe('computeScale', () => {
  it('selects scale 1 at exactly the internal resolution', () => {
    expect(computeScale(INTERNAL_WIDTH, INTERNAL_HEIGHT)).toMatchObject({
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      portrait: false,
    });
  });

  it('selects the largest integer scale that fits, letterboxing the remainder', () => {
    expect(computeScale(768, 432)).toMatchObject({ scale: 2, offsetX: 0, offsetY: 0 });
    // 800×500: limited by width (800/384≈2.08) → scale 2; centered letterbox.
    expect(computeScale(800, 500)).toMatchObject({ scale: 2, offsetX: 16, offsetY: 34 });
  });

  it('never drops below scale 1 even on a tiny viewport', () => {
    expect(computeScale(100, 100).scale).toBe(1);
  });

  it('flags a portrait viewport (taller than wide)', () => {
    expect(computeScale(216, 384).portrait).toBe(true);
    expect(computeScale(384, 216).portrait).toBe(false);
  });
});

describe('createScaler', () => {
  let canvas: HTMLCanvasElement;
  let overlay: HTMLElement;

  beforeEach(() => {
    canvas = document.createElement('canvas');
    overlay = document.createElement('div');
  });

  it('locks the backing buffer to 384×216 and CSS-scales it', () => {
    const scaler = createScaler(canvas, overlay);
    scaler.resize(800, 500);
    expect(canvas.width).toBe(384); // backing buffer untouched
    expect(canvas.height).toBe(216);
    expect(canvas.style.width).toBe(`${384 * 2}px`); // CSS scaled by integer factor
    expect(canvas.style.height).toBe(`${216 * 2}px`);
    expect(scaler.scale).toBe(2);
  });

  it('screenToWorld ∘ worldToScreen is identity (within rounding)', () => {
    const scaler = createScaler(canvas, overlay);
    scaler.resize(800, 500); // scale 2, offset (16, 34)
    const world = { x: 123, y: 45 };
    const screen = scaler.worldToScreen(world);
    expect(scaler.screenToWorld(screen.x, screen.y)).toEqual(world);
  });

  it('maps screen coordinates through the letterbox offset', () => {
    const scaler = createScaler(canvas, overlay);
    scaler.resize(800, 500); // scale 2, offset (16, 34)
    expect(scaler.screenToWorld(16, 34)).toEqual({ x: 0, y: 0 }); // top-left of the play area
    expect(scaler.screenToWorld(16 + 20, 34 + 10)).toEqual({ x: 10, y: 5 });
  });

  it('toggles the rotate overlay on a portrait viewport', () => {
    const scaler = createScaler(canvas, overlay);
    scaler.resize(384, 216);
    expect(overlay.dataset.visible).toBe('false');
    scaler.resize(216, 384);
    expect(overlay.dataset.visible).toBe('true');
  });

  it('works without a rotate overlay', () => {
    const scaler = createScaler(canvas);
    expect(() => scaler.resize(384, 216)).not.toThrow();
  });
});
