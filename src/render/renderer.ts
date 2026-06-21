/**
 * The drawing surface handed to every Scene.render (Core/Render-owned contract). It is referenced
 * by both the Core loop and the State area's `Scene`, but was defined in neither doc — introduced
 * here so scenes can compile. Minimal for Phase 1; the concrete canvas implementation wraps the
 * 384×216 backing buffer and a SpriteProvider.
 *
 * `alpha` (the fixed-timestep interpolation factor) is a READONLY FIELD here, not a `render()`
 * parameter — that is what lets `Scene.render(r)` and the loop's "render with alpha" coexist:
 * main.ts sets `renderer.alpha` before calling `manager.render(renderer)`.
 */
import type { SpriteId } from '../content/sprite-ids';
import type { PaletteKey } from './palette';
import type { Vec2 } from '../core/math';

export interface DrawOpts {
  /** Animation frame index. */
  frame?: number;
  /** Rotation in radians about the sprite's pivot. */
  rotation?: number;
  /** Opacity 0..1. */
  alpha?: number;
  /** Tint for tintable sprites (drone.special, meter fill). */
  tint?: PaletteKey;
  flipX?: boolean;
}

export interface TextOpts {
  font?: SpriteId; // 'font.display' | 'font.hud'
  color?: PaletteKey;
  align?: 'left' | 'center' | 'right';
}

export interface Renderer {
  readonly width: 384;
  readonly height: 216;
  /** Interpolation factor in [0, 1) between the last two fixed-update ticks. */
  readonly alpha: number;
  clear(color?: PaletteKey): void;
  drawSprite(id: SpriteId, pos: Vec2, opts?: DrawOpts): void;
  fillRect(x: number, y: number, w: number, h: number, color: PaletteKey): void;
  text(str: string, x: number, y: number, opts?: TextOpts): void;
}
