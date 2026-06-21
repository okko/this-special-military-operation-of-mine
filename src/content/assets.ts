/**
 * Asset-manifest types (docs/areas/11-art-visual-style.md §4). The manifest maps sprite ids to
 * atlas coordinates/frames; Core/Render consumes it to build the real sprite provider, and the
 * placeholder provider covers any id the manifest omits.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SpriteAnim {
  frames: number;
  fps: number;
  layout: 'horizontal' | 'rects';
  rects?: Rect[];
}

export interface FontDescriptor {
  glyphW: number;
  glyphH: number;
  firstCharCode: number;
}

export interface SpriteDef {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Defaults to center-bottom [w, h] (drones/fx/pickups use center) — see sprite-provider. */
  pivot?: [number, number];
  /** Emoji/text fallback used by the placeholder provider (e.g. '💩' for icon.poo). */
  glyph?: string;
  anim?: SpriteAnim;
  font?: FontDescriptor;
}

export interface AssetManifest {
  version: number;
  atlas: { image: string; width: number; height: number };
  sprites: Record<string, SpriteDef>;
}
