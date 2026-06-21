import { describe, it, expect } from 'vitest';
import manifestJson from './assets.manifest.json';
import { validateAssetManifest } from './assets-validate';
import { ContentValidationError } from './content-error';
import { isKnownSpriteId } from './sprite-ids';

describe('assets.manifest.json', () => {
  const manifest = validateAssetManifest(manifestJson);

  it('validates against the manifest schema', () => {
    expect(() => validateAssetManifest(manifestJson)).not.toThrow();
  });

  it('declares a sane atlas (validation already enforced rect bounds)', () => {
    expect(manifest.atlas.width).toBeGreaterThan(0);
    expect(manifest.atlas.height).toBeGreaterThan(0);
  });

  it('has no orphan entries — every key is a known SpriteId or a portrait.*', () => {
    for (const id of Object.keys(manifest.sprites)) {
      expect(isKnownSpriteId(id) || id.startsWith('portrait.'), `orphan key: ${id}`).toBe(true);
    }
  });

  it('font sprites carry a valid font descriptor', () => {
    for (const id of ['font.display', 'font.hud'] as const) {
      const def = manifest.sprites[id];
      expect(def?.font?.glyphW).toBeGreaterThan(0);
      expect(def?.font?.glyphH).toBeGreaterThan(0);
      expect(def?.font?.firstCharCode).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('validateAssetManifest accepts well-formed variants', () => {
  it('accepts a rects-layout animation within bounds', () => {
    const ok = {
      version: 2,
      atlas: { image: 'a.png', width: 64, height: 64 },
      sprites: {
        'fx.spark': {
          x: 0,
          y: 0,
          w: 8,
          h: 8,
          anim: {
            frames: 2,
            fps: 12,
            layout: 'rects',
            rects: [
              { x: 0, y: 0, w: 8, h: 8 },
              { x: 8, y: 0, w: 8, h: 8 },
            ],
          },
        },
      },
    };
    const m = validateAssetManifest(ok);
    expect(m.sprites['fx.spark']?.anim?.layout).toBe('rects');
  });
});

describe('validateAssetManifest rejects malformed data (loud failure)', () => {
  const base = { version: 1, atlas: { image: 'a.png', width: 64, height: 64 }, sprites: {} };
  const sprite = (def: unknown) => ({ ...base, sprites: { 'gun.base': def } });

  const cases: ReadonlyArray<[string, unknown, RegExp]> = [
    ['a non-object root', null, /expected an object/],
    ['a non-positive version', { ...base, version: 0 }, /version/],
    ['a fractional version', { ...base, version: 1.5 }, /version/],
    ['a non-object atlas', { ...base, atlas: 5 }, /atlas/],
    ['an empty atlas image', { ...base, atlas: { image: '', width: 8, height: 8 } }, /image/],
    ['a fractional atlas size', { ...base, atlas: { image: 'a', width: 8.5, height: 8 } }, /integer/],
    ['a non-object sprites map', { ...base, sprites: 5 }, /sprites/],
    ['a non-object sprite def', sprite(5), /expected an object/],
    ['a negative coordinate', sprite({ x: -1, y: 0, w: 8, h: 8 }), /x must be/],
    ['a zero width', sprite({ x: 0, y: 0, w: 0, h: 8 }), /w must be/],
    ['a malformed pivot', sprite({ x: 0, y: 0, w: 8, h: 8, pivot: [1] }), /pivot/],
    ['a non-string glyph', sprite({ x: 0, y: 0, w: 8, h: 8, glyph: 5 }), /glyph/],
    ['a rect outside the atlas', sprite({ x: 60, y: 0, w: 28, h: 16 }), /exceeds atlas/],
    [
      'frames < 1',
      sprite({ x: 0, y: 0, w: 8, h: 8, anim: { frames: 0, fps: 10, layout: 'horizontal' } }),
      /frames/,
    ],
    [
      'fps <= 0',
      sprite({ x: 0, y: 0, w: 8, h: 8, anim: { frames: 2, fps: 0, layout: 'horizontal' } }),
      /fps/,
    ],
    [
      'an unknown layout',
      sprite({ x: 0, y: 0, w: 8, h: 8, anim: { frames: 2, fps: 10, layout: 'diagonal' } }),
      /layout/,
    ],
    [
      'non-array rects',
      sprite({ x: 0, y: 0, w: 8, h: 8, anim: { frames: 1, fps: 10, layout: 'rects', rects: 5 } }),
      /rects/,
    ],
    [
      'a non-object rect',
      sprite({ x: 0, y: 0, w: 8, h: 8, anim: { frames: 1, fps: 10, layout: 'rects', rects: [5] } }),
      /rect/,
    ],
    ['a non-object font', sprite({ x: 0, y: 0, w: 8, h: 8, font: 5 }), /font/],
    [
      'a zero glyph width',
      sprite({ x: 0, y: 0, w: 8, h: 8, font: { glyphW: 0, glyphH: 8, firstCharCode: 32 } }),
      /glyphW/,
    ],
  ];

  for (const [desc, input, pattern] of cases) {
    it(`rejects ${desc}`, () => {
      expect(() => validateAssetManifest(input)).toThrow(pattern);
      expect(() => validateAssetManifest(input)).toThrow(ContentValidationError);
    });
  }
});
