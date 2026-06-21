/**
 * Concrete Canvas 2D renderer (Core/Render). Wraps the 384×216 backing context and resolves
 * sprites through a SpriteProvider. In Phase 1 it draws placeholder shapes / emoji glyphs; real
 * atlas blitting slots in once final art lands (no contract change). The fixed-timestep
 * interpolation factor is carried via `setAlpha` → the readonly `alpha` field scenes read.
 */
import type { Renderer, DrawOpts, TextOpts } from './renderer';
import { PALETTE, type PaletteKey } from './palette';
import type { SpriteProvider } from './sprite-provider';
import type { SpriteId } from '../content/sprite-ids';
import type { Vec2 } from '../core/math';
import { INTERNAL_WIDTH, INTERNAL_HEIGHT } from './scaler';

const HUD_GLYPH = 8; // px per glyph for the placeholder monospace text

export interface CanvasRenderer extends Renderer {
  setAlpha(a: number): void;
}

export function createCanvasRenderer(
  ctx: CanvasRenderingContext2D,
  sprites: SpriteProvider,
): CanvasRenderer {
  let alpha = 0;
  ctx.imageSmoothingEnabled = false;

  return {
    width: INTERNAL_WIDTH,
    height: INTERNAL_HEIGHT,
    get alpha(): number {
      return alpha;
    },
    setAlpha(a: number): void {
      alpha = a;
    },
    clear(color: PaletteKey = 'ink'): void {
      ctx.fillStyle = PALETTE[color];
      ctx.fillRect(0, 0, INTERNAL_WIDTH, INTERNAL_HEIGHT);
    },
    fillRect(x: number, y: number, w: number, h: number, color: PaletteKey): void {
      ctx.fillStyle = PALETTE[color];
      ctx.fillRect(x, y, w, h);
    },
    drawSprite(id: SpriteId, pos: Vec2, opts?: DrawOpts): void {
      const r = sprites.resolve(id, opts?.frame);
      const [px, py] = r.pivot;
      const x = pos.x - px;
      const y = pos.y - py;
      if (r.source === 'glyph' && r.glyph !== undefined) {
        ctx.font = `${r.rect.h}px sans-serif`;
        ctx.textBaseline = 'top';
        ctx.fillText(r.glyph, x, y);
        return;
      }
      ctx.fillStyle = PALETTE[opts?.tint ?? 'panelLite'];
      ctx.fillRect(x, y, r.rect.w, r.rect.h);
    },
    text(str: string, x: number, y: number, opts?: TextOpts): void {
      ctx.fillStyle = PALETTE[opts?.color ?? 'cream'];
      ctx.font = `${HUD_GLYPH}px monospace`;
      ctx.textBaseline = 'top';
      const width = str.length * HUD_GLYPH;
      const dx = opts?.align === 'center' ? x - width / 2 : opts?.align === 'right' ? x - width : x;
      ctx.fillText(str, dx, y);
    },
  };
}
