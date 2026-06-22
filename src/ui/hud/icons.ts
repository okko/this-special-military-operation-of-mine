/**
 * Procedural pixel-art HUD icons (docs/areas/10-hud-ui.md §3.2/§5/§10). The five meter indicators and
 * the ruble coin are drawn as deterministic 8×8 bitmaps via `fillRect` — NOT OS emoji glyphs, which
 * differ per engine and would break the per-engine icon-row snapshot (§8.16). The poo icon is designed
 * to read as 💩 (a brown pile with two dark eyes). When the Art atlas lands these become atlas sprites
 * behind the same `METER_ICON` ids — no HUD contract change. Each glyph is keyed by its `SpriteId`.
 */
import type { Renderer } from '../../render/renderer';
import type { SpriteId } from '../../content/sprite-ids';
import type { PaletteKey } from '../../render/palette';

interface IconGlyph {
  rows: string[]; // 8 strings of 8 chars; ' ' = transparent
  legend: Record<string, PaletteKey>;
}

// Shared legend chars: b=blue n=brown(crust/pile) t=tan(bread) c=cream r=red s=smoke k=ink(eyes) g=gold
const ICONS: Partial<Record<SpriteId, IconGlyph>> = {
  // 😴 — a bold blue "Z".
  'icon.sleep': {
    rows: ['bbbbbb  ', '    bb  ', '   bb   ', '  bb    ', ' bb     ', 'bbbbbb  ', '        ', '        '],
    legend: { b: 'panelLite' },
  },
  // 🍞 — a bread loaf (brown crust over a tan body).
  'icon.hunger': {
    rows: ['  nnnn  ', ' ntttn  ', 'ntttttn ', 'ntttttn ', 'ntttttn ', 'ntttttn ', ' nnnnnn ', '        '],
    legend: { n: 'skinDk', t: 'skin' },
  },
  // 💧 — a blue droplet.
  'icon.thirst': {
    rows: ['   b    ', '   b    ', '  bbb   ', '  bbb   ', ' bbbbb  ', ' bbbbb  ', '  bbb   ', '        '],
    legend: { b: 'panelLite' },
  },
  // 🚬 — a cigarette (cream stick, red ember, rising smoke).
  'icon.vice': {
    rows: ['     s  ', '    s   ', '     s  ', 'cccccr  ', 'cccccr  ', '        ', '        ', '        '],
    legend: { c: 'cream', r: 'meterCrit', s: 'smoke' },
  },
  // 💩 — a brown pile with two dark eyes (the only icon using ink, for unambiguous identification).
  'icon.poo': {
    rows: ['   nn   ', '  nnnn  ', '  nnnn  ', ' nnnnnn ', ' nknkn  ', 'nnnnnnnn', 'nnnnnnnn', '        '],
    legend: { n: 'skinDk', k: 'ink' },
  },
  // ₽ — a gold coin.
  'icon.ruble': {
    rows: ['  gggg  ', ' gggggg ', 'ggkkkgg ', 'ggkggkg ', 'ggkkkgg ', 'ggkgggg ', ' gggggg ', '  gggg  '],
    legend: { g: 'rubleGold', k: 'ink' },
  },
};

/** Draw an 8×8 procedural icon at (x, y) at the given integer scale (1 px per cell by default). */
export function drawIcon(r: Renderer, id: SpriteId, x: number, y: number, scale = 1): void {
  const glyph = ICONS[id];
  if (!glyph) return;
  glyph.rows.forEach((row, ry) => {
    for (let cx = 0; cx < row.length; cx++) {
      const ch = row[cx];
      const color = ch ? glyph.legend[ch] : undefined;
      if (color) r.fillRect(x + cx * scale, y + ry * scale, scale, scale, color);
    }
  });
}

/** Whether a procedural glyph exists for an id (used by tests / the snapshot fixture). */
export function hasIcon(id: SpriteId): boolean {
  return id in ICONS;
}
