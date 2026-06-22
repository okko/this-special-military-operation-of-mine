/**
 * Test-only `Renderer` that records every draw call (clear/fillRect/drawSprite/text) for assertions.
 * Used by the HUD unit tests (docs/areas/10-hud-ui.md §8 — "a mock 2D renderer capturing draw calls").
 * Lives in test-support (excluded from coverage). Backing dimensions match the real 384×216 surface.
 */
import { INTERNAL_WIDTH, INTERNAL_HEIGHT } from '../render/scaler';
import type { Renderer, DrawOpts, TextOpts } from '../render/renderer';
import type { SpriteId } from '../content/sprite-ids';
import type { PaletteKey } from '../render/palette';
import type { Vec2 } from '../core/math';

export interface RectCall {
  x: number;
  y: number;
  w: number;
  h: number;
  color: PaletteKey;
}
export interface SpriteCall {
  id: SpriteId;
  pos: Vec2;
  opts?: DrawOpts;
}
export interface TextCall {
  str: string;
  x: number;
  y: number;
  opts?: TextOpts;
}

export interface RecordingRenderer extends Renderer {
  clears: PaletteKey[];
  rects: RectCall[];
  sprites: SpriteCall[];
  texts: TextCall[];
  /** Clear all recorded calls (call between frames). */
  reset(): void;
  rectsOfColor(color: PaletteKey): RectCall[];
  spritesOf(id: SpriteId): SpriteCall[];
  textsContaining(substr: string): TextCall[];
}

export function createRecordingRenderer(): RecordingRenderer {
  const clears: PaletteKey[] = [];
  const rects: RectCall[] = [];
  const sprites: SpriteCall[] = [];
  const texts: TextCall[] = [];

  return {
    width: INTERNAL_WIDTH,
    height: INTERNAL_HEIGHT,
    alpha: 0,
    clears,
    rects,
    sprites,
    texts,
    clear(color: PaletteKey = 'ink'): void {
      clears.push(color);
    },
    fillRect(x, y, w, h, color): void {
      rects.push({ x, y, w, h, color });
    },
    drawSprite(id, pos, opts): void {
      sprites.push(opts ? { id, pos, opts } : { id, pos });
    },
    text(str, x, y, opts): void {
      texts.push(opts ? { str, x, y, opts } : { str, x, y });
    },
    reset(): void {
      clears.length = 0;
      rects.length = 0;
      sprites.length = 0;
      texts.length = 0;
    },
    rectsOfColor(color): RectCall[] {
      return rects.filter((r) => r.color === color);
    },
    spritesOf(id): SpriteCall[] {
      return sprites.filter((s) => s.id === id);
    },
    textsContaining(substr): TextCall[] {
      return texts.filter((t) => t.str.includes(substr));
    },
  };
}
