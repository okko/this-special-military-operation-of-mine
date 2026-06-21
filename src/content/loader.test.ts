import { describe, it, expect } from 'vitest';
import { loadContent } from './loader';
import { ContentValidationError } from './content-error';
import manifestJson from './assets.manifest.json';

describe('loadContent', () => {
  it('loads and validates the real content into the typed Content aggregate', () => {
    const content = loadContent({ manifest: manifestJson });
    expect(content.manifest.atlas.width).toBe(512);
    expect(Object.keys(content.manifest.sprites).length).toBeGreaterThan(0);
  });

  it('fails loudly on a non-object root', () => {
    expect(() => loadContent(null)).toThrow(ContentValidationError);
    expect(() => loadContent(42)).toThrow(/expected an object/);
  });

  it('fails loudly when a table is malformed (out-of-range rect)', () => {
    expect(() =>
      loadContent({
        manifest: {
          version: 1,
          atlas: { image: 'a.png', width: 16, height: 16 },
          sprites: { 'gun.base': { x: 0, y: 0, w: 28, h: 16 } },
        },
      }),
    ).toThrow(ContentValidationError);
  });
});
