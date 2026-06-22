// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { ART } from './index';
import { PALETTE, type PaletteKey } from '../palette';
import { SPRITE_IDS } from '../../content/sprite-ids';
import { createPlaceholderProvider } from '../sprite-provider';

describe('art data validity', () => {
  it('every art entry is internally consistent (rectangular, legend-complete, valid palette keys)', () => {
    for (const [id, entry] of Object.entries(ART)) {
      if (!entry) continue;
      const grids = entry.kind === 'font' ? entry.glyphs : entry.frames;
      const [w, h] = entry.kind === 'font' ? [entry.glyphW, entry.glyphH] : [entry.w, entry.h];
      expect(grids.length, `${id} has frames`).toBeGreaterThan(0);
      for (const grid of grids) {
        expect(grid.rows.length, `${id} grid height`).toBe(h);
        for (const row of grid.rows) {
          expect(row.length, `${id} grid width`).toBe(w); // rectangular + matches declared size
          for (const ch of row) {
            if (ch === ' ') continue;
            const key = grid.legend[ch];
            expect(key, `${id} legend has '${ch}'`).toBeDefined();
            expect(key as PaletteKey in PALETTE, `${id} '${ch}' → valid PaletteKey`).toBe(true);
          }
        }
      }
    }
  });

  it('the meter/ruble icons are authored at 8×8 (matches the live HUD + §8.16 snapshot)', () => {
    for (const id of ['icon.sleep', 'icon.hunger', 'icon.thirst', 'icon.vice', 'icon.poo', 'icon.ruble'] as const) {
      const entry = ART[id];
      expect(entry, `${id} present`).toBeDefined();
      if (entry && entry.kind === 'sprite') {
        expect([entry.w, entry.h]).toEqual([8, 8]);
      }
    }
  });

  it('no sprite id is unrenderable — the placeholder covers everything not yet in ART', () => {
    const placeholder = createPlaceholderProvider();
    for (const id of SPRITE_IDS) {
      expect(id in ART || placeholder.has(id)).toBe(true);
      expect(() => placeholder.resolve(id)).not.toThrow();
    }
  });
});
