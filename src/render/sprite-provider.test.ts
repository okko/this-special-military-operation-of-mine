import { describe, it, expect } from 'vitest';
import { SPRITE_IDS } from '../content/sprite-ids';
import { createPlaceholderProvider, createManifestProvider, measureText } from './sprite-provider';
import { validateAssetManifest } from '../content/assets-validate';
import manifestJson from '../content/assets.manifest.json';

const placeholder = createPlaceholderProvider();
const manifest = validateAssetManifest(manifestJson);
const atlas = createManifestProvider(manifest, placeholder);

describe('PlaceholderProvider', () => {
  it('covers 100% of registered SpriteIds and never throws', () => {
    for (const id of SPRITE_IDS) {
      expect(placeholder.has(id), `has(${id})`).toBe(true);
      expect(() => placeholder.resolve(id)).not.toThrow();
      const r = placeholder.resolve(id);
      expect(r.rect.w).toBeGreaterThan(0);
      expect(r.rect.h).toBeGreaterThan(0);
    }
  });

  it('covers sampled portrait.* ids at portrait size', () => {
    for (const id of ['portrait.dmitri', 'portrait.chef', 'portrait.babushka'] as const) {
      expect(placeholder.has(id)).toBe(true);
      expect(placeholder.resolve(id).rect).toEqual({ x: 0, y: 0, w: 64, h: 64 });
    }
  });

  it('returns an emoji glyph for the need icons (the poo icon reads as 💩)', () => {
    expect(placeholder.resolve('icon.poo')).toMatchObject({ source: 'glyph', glyph: '💩' });
    expect(placeholder.resolve('icon.sleep').glyph).toBe('😴');
  });

  it('returns a placeholder (non-glyph) for non-icon sprites', () => {
    expect(placeholder.resolve('drone.scout').source).toBe('placeholder');
  });
});

describe('pivot defaults', () => {
  it('defaults to center-bottom for ground sprites', () => {
    expect(placeholder.resolve('soldier.idle').pivot).toEqual([16, 40]); // 32×40
  });

  it('uses center for drones / fx / pickups / decoys', () => {
    expect(placeholder.resolve('drone.scout').pivot).toEqual([8, 8]); // 16×16
    expect(placeholder.resolve('fx.explosion').pivot).toEqual([16, 16]); // 32×32
    expect(placeholder.resolve('pickup.ruble').pivot).toEqual([4, 4]); // 8×8
    expect(placeholder.resolve('decoy.bird').pivot).toEqual([8, 6]); // 16×12
  });

  it('honors an explicit manifest pivot', () => {
    expect(atlas.resolve('gun.base').pivot).toEqual([4, 8]);
  });
});

describe('ManifestProvider', () => {
  it('resolves atlas rects for ids present in the manifest', () => {
    const r = atlas.resolve('gun.base');
    expect(r.source).toBe('atlas');
    expect(r.rect).toEqual({ x: 96, y: 0, w: 28, h: 16 });
  });

  it('advances horizontal animation frames', () => {
    expect(atlas.resolve('drone.scout', 2).rect).toEqual({ x: 32, y: 48, w: 16, h: 16 });
  });

  it('defaults to frame 0 when no frame is given', () => {
    expect(atlas.resolve('drone.scout').rect).toEqual({ x: 0, y: 48, w: 16, h: 16 });
  });

  it('delegates ids missing from the manifest to the placeholder', () => {
    const r = atlas.resolve('drone.boss'); // not in the Phase-1 manifest
    expect(r.source).toBe('placeholder');
    expect(r.rect).toEqual({ x: 0, y: 0, w: 48, h: 48 });
  });

  it('reports has() true for both manifest ids and placeholder-covered ids', () => {
    expect(atlas.has('gun.base')).toBe(true);
    expect(atlas.has('drone.boss')).toBe(true);
  });

  it('resolves rects-layout animation frames', () => {
    const m = validateAssetManifest({
      version: 1,
      atlas: { image: 'a.png', width: 64, height: 64 },
      sprites: {
        'fx.spark': {
          x: 0,
          y: 0,
          w: 8,
          h: 8,
          anim: {
            frames: 2,
            fps: 10,
            layout: 'rects',
            rects: [
              { x: 0, y: 0, w: 8, h: 8 },
              { x: 16, y: 16, w: 8, h: 8 },
            ],
          },
        },
      },
    });
    const p = createManifestProvider(m, placeholder);
    expect(p.resolve('fx.spark', 1).rect).toEqual({ x: 16, y: 16, w: 8, h: 8 });
  });
});

describe('measureText', () => {
  it('returns length × glyph width (monospace)', () => {
    expect(measureText({ glyphW: 8 }, 'SCORE')).toBe(40);
    expect(measureText({ glyphW: 5 }, '')).toBe(0);
  });
});
