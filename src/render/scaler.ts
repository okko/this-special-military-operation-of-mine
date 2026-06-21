/**
 * Internal-resolution scaler (docs/areas/00-core-platform.md §3.8, docs/compatibility.md §2-§3).
 * The backing buffer is ALWAYS 384×216 — never a device-pixel canvas (a mobile memory/fill-rate
 * trap). It is CSS-scaled by the largest integer that fits the viewport (letterboxed); high-DPI
 * crispness comes from `image-rendering`, not a bigger buffer.
 *
 * The pure `computeScale` holds all the math (unit-testable without a DOM); `createScaler` applies
 * it to a canvas and toggles the "rotate to landscape" overlay on a portrait viewport.
 */
import type { Vec2 } from '../core/math';

export const INTERNAL_WIDTH = 384;
export const INTERNAL_HEIGHT = 216;

export interface ScaleResult {
  scale: number;
  offsetX: number;
  offsetY: number;
  portrait: boolean;
}

export function computeScale(viewportW: number, viewportH: number): ScaleResult {
  const scale = Math.max(
    1,
    Math.floor(Math.min(viewportW / INTERNAL_WIDTH, viewportH / INTERNAL_HEIGHT)),
  );
  const offsetX = Math.floor((viewportW - INTERNAL_WIDTH * scale) / 2);
  const offsetY = Math.floor((viewportH - INTERNAL_HEIGHT * scale) / 2);
  // The game is 16:9 landscape; a taller-than-wide viewport surfaces the rotate prompt.
  const portrait = viewportW < viewportH;
  return { scale, offsetX, offsetY, portrait };
}

export interface Scaler {
  readonly width: typeof INTERNAL_WIDTH;
  readonly height: typeof INTERNAL_HEIGHT;
  readonly scale: number;
  resize(viewportW: number, viewportH: number): void;
  /** Canvas-relative pixel (clientX - rect.left) → internal world coordinate. */
  screenToWorld(sx: number, sy: number): Vec2;
  worldToScreen(w: Vec2): Vec2;
}

export function createScaler(canvas: HTMLCanvasElement, rotateOverlay?: HTMLElement): Scaler {
  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;

  // Lock the backing buffer to the internal resolution and disable smoothing.
  canvas.width = INTERNAL_WIDTH;
  canvas.height = INTERNAL_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (ctx) ctx.imageSmoothingEnabled = false;

  return {
    width: INTERNAL_WIDTH,
    height: INTERNAL_HEIGHT,
    get scale(): number {
      return scale;
    },
    resize(viewportW: number, viewportH: number): void {
      const r = computeScale(viewportW, viewportH);
      scale = r.scale;
      offsetX = r.offsetX;
      offsetY = r.offsetY;
      canvas.style.width = `${INTERNAL_WIDTH * scale}px`;
      canvas.style.height = `${INTERNAL_HEIGHT * scale}px`;
      if (rotateOverlay) rotateOverlay.dataset.visible = r.portrait ? 'true' : 'false';
    },
    screenToWorld(sx: number, sy: number): Vec2 {
      return { x: (sx - offsetX) / scale, y: (sy - offsetY) / scale };
    },
    worldToScreen(w: Vec2): Vec2 {
      return { x: w.x * scale + offsetX, y: w.y * scale + offsetY };
    },
  };
}
