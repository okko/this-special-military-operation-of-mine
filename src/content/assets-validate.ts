/**
 * Runtime validation for the asset manifest (docs/areas/11-art-visual-style.md §8.1–§8.2).
 * Checks types, non-negative coords, frames ≥ 1, fps > 0, a positive-int version, and that every
 * sprite rect — including each computed animation-frame rect — lies within the atlas bounds.
 * Throws ContentValidationError with a path so failures are loud and locatable.
 */
import { ContentValidationError } from './content-error';
import type { AssetManifest, SpriteAnim, SpriteDef, FontDescriptor, Rect } from './assets';

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}
function isPositiveInt(v: unknown): boolean {
  return isFiniteNumber(v) && Number.isInteger(v) && v > 0;
}

function numField(obj: Record<string, unknown>, key: string, path: string, min: number): number {
  const v = obj[key];
  if (!isFiniteNumber(v)) throw new ContentValidationError(`${key} must be a number`, path);
  if (v < min) throw new ContentValidationError(`${key} must be ≥ ${min}`, path);
  return v;
}

function ensureWithin(r: Rect, atlasW: number, atlasH: number, path: string): void {
  if (r.x < 0 || r.y < 0 || r.x + r.w > atlasW || r.y + r.h > atlasH) {
    throw new ContentValidationError(
      `rect [${r.x},${r.y},${r.w},${r.h}] exceeds atlas ${atlasW}×${atlasH}`,
      path,
    );
  }
}

function validateFont(raw: unknown, path: string): FontDescriptor {
  if (!isObject(raw)) throw new ContentValidationError('expected an object', path);
  return {
    glyphW: numField(raw, 'glyphW', path, 1),
    glyphH: numField(raw, 'glyphH', path, 1),
    firstCharCode: numField(raw, 'firstCharCode', path, 0),
  };
}

function validateAnim(raw: unknown, path: string): SpriteAnim {
  if (!isObject(raw)) throw new ContentValidationError('expected an object', path);
  const frames = numField(raw, 'frames', path, 1);
  if (!Number.isInteger(frames)) throw new ContentValidationError('frames must be an integer', path);
  const fps = numField(raw, 'fps', path, Number.EPSILON);
  if (raw.layout !== 'horizontal' && raw.layout !== 'rects') {
    throw new ContentValidationError("layout must be 'horizontal' or 'rects'", path);
  }
  const anim: SpriteAnim = { frames, fps, layout: raw.layout };
  if (raw.rects !== undefined) {
    if (!Array.isArray(raw.rects)) throw new ContentValidationError('rects must be an array', path);
    anim.rects = raw.rects.map((r, i) => {
      if (!isObject(r)) throw new ContentValidationError('rect must be an object', `${path}.rects[${i}]`);
      const rp = `${path}.rects[${i}]`;
      return {
        x: numField(r, 'x', rp, 0),
        y: numField(r, 'y', rp, 0),
        w: numField(r, 'w', rp, 1),
        h: numField(r, 'h', rp, 1),
      };
    });
  }
  return anim;
}

function validateSpriteDef(raw: unknown, path: string, atlasW: number, atlasH: number): SpriteDef {
  if (!isObject(raw)) throw new ContentValidationError('expected an object', path);
  const x = numField(raw, 'x', path, 0);
  const y = numField(raw, 'y', path, 0);
  const w = numField(raw, 'w', path, 1);
  const h = numField(raw, 'h', path, 1);

  const def: SpriteDef = { x, y, w, h };

  if (raw.pivot !== undefined) {
    const p = raw.pivot;
    if (!Array.isArray(p) || p.length !== 2 || !isFiniteNumber(p[0]) || !isFiniteNumber(p[1])) {
      throw new ContentValidationError('pivot must be [number, number]', path);
    }
    def.pivot = [p[0], p[1]];
  }
  if (raw.glyph !== undefined) {
    if (typeof raw.glyph !== 'string') throw new ContentValidationError('glyph must be a string', path);
    def.glyph = raw.glyph;
  }
  if (raw.anim !== undefined) def.anim = validateAnim(raw.anim, `${path}.anim`);
  if (raw.font !== undefined) def.font = validateFont(raw.font, `${path}.font`);

  // Atlas-bounds: the static rect, or every animation-frame rect.
  if (def.anim?.layout === 'rects' && def.anim.rects) {
    for (const r of def.anim.rects) ensureWithin(r, atlasW, atlasH, path);
  } else {
    const frames = def.anim?.frames ?? 1;
    for (let i = 0; i < frames; i++) {
      ensureWithin({ x: x + i * w, y, w, h }, atlasW, atlasH, path);
    }
  }
  return def;
}

export function validateAssetManifest(raw: unknown): AssetManifest {
  const path = 'assets.manifest';
  if (!isObject(raw)) throw new ContentValidationError('expected an object', path);
  if (!isPositiveInt(raw.version)) {
    throw new ContentValidationError('version must be a positive integer', `${path}.version`);
  }
  if (!isObject(raw.atlas)) throw new ContentValidationError('expected an object', `${path}.atlas`);
  const atlas = raw.atlas;
  if (typeof atlas.image !== 'string' || atlas.image.length === 0) {
    throw new ContentValidationError('image must be a non-empty string', `${path}.atlas.image`);
  }
  const width = numField(atlas, 'width', `${path}.atlas`, 1);
  const height = numField(atlas, 'height', `${path}.atlas`, 1);
  if (!Number.isInteger(width) || !Number.isInteger(height)) {
    throw new ContentValidationError('atlas width/height must be integers', `${path}.atlas`);
  }
  if (!isObject(raw.sprites)) throw new ContentValidationError('expected an object', `${path}.sprites`);

  const sprites: Record<string, SpriteDef> = {};
  for (const [id, defRaw] of Object.entries(raw.sprites)) {
    sprites[id] = validateSpriteDef(defRaw, `${path}.sprites.${id}`, width, height);
  }

  return { version: raw.version as number, atlas: { image: atlas.image, width, height }, sprites };
}
