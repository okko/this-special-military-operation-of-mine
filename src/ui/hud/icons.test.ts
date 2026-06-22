import { describe, it, expect } from 'vitest';
import { drawIcon, hasIcon } from './icons';
import { createRecordingRenderer } from '../../test-support/recording-renderer';
import { METER_ICON } from './theme';

describe('procedural HUD icons (§8.16 basis)', () => {
  it('provides a glyph for every meter indicator and the ruble coin, but not arbitrary sprites', () => {
    for (const id of Object.values(METER_ICON)) expect(hasIcon(id)).toBe(true);
    expect(hasIcon('icon.ruble')).toBe(true);
    expect(hasIcon('ui.panel')).toBe(false);
  });

  it('draws each icon as deterministic fillRect pixels (no OS emoji glyph)', () => {
    const r = createRecordingRenderer();
    drawIcon(r, 'icon.poo', 0, 0);
    expect(r.rects.length).toBeGreaterThan(0);
    expect(r.sprites).toHaveLength(0); // never a drawSprite/emoji fallback
    expect(r.rects.some((rc) => rc.color === 'ink')).toBe(true); // poo's eyes
    expect(r.rects.some((rc) => rc.color === 'skinDk')).toBe(true); // poo's body
  });

  it('renders the five meter icons as visually distinct pixel rows', () => {
    const signature = (id: string): string => {
      const r = createRecordingRenderer();
      drawIcon(r, id as Parameters<typeof drawIcon>[1], 0, 0);
      return r.rects.map((rc) => `${rc.x},${rc.y},${rc.color}`).sort().join('|');
    };
    const sigs = Object.values(METER_ICON).map(signature);
    expect(new Set(sigs).size).toBe(sigs.length); // all five distinct
  });
});
