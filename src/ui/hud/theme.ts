/**
 * HUD presentation constants (docs/areas/10-hud-ui.md §5). Positions/sizes for the fixed 384×216
 * surface, the fixed meter display order + indicator map, animation durations, and the interactive
 * hit-areas (intercom button, panel, close) — all kept at or above the minimum tap size and inside a
 * safe-area inset margin (`compatibility.md §3/§9`). Colors are referenced from the Art palette
 * (`render/palette.ts`), never redefined here. Both the HUD and its tests import these.
 */
import { INTERNAL_WIDTH, INTERNAL_HEIGHT } from '../../render/scaler';
import type { MeterKey } from '../../types/meter-key';
import type { SpriteId } from '../../content/sprite-ids';
import type { PaletteKey } from '../../render/palette';

export const W = INTERNAL_WIDTH; // 384
export const H = INTERNAL_HEIGHT; // 216

/** Safe-area inset margin (internal px) + minimum interactive tap size (≥48 CSS px at scale ≥ 3). */
export const INSET = 4;
export const MIN_TAP = 16;

/** Fixed display order (§3.2): 😴 Sleep, 🍞 Hunger, 💧 Thirst, 🚬 Vice, 💩 Poo (NOT the METER_KEYS order). */
export const METER_DISPLAY_ORDER: readonly MeterKey[] = ['sleep', 'hunger', 'thirst', 'vice', 'poo'];

/** Indicator map (§3.2/§5): each meter → its pixel-art icon. The poo entry reads as 💩. */
export const METER_ICON: Record<MeterKey, SpriteId> = {
  sleep: 'icon.sleep',
  hunger: 'icon.hunger',
  thirst: 'icon.thirst',
  vice: 'icon.vice',
  poo: 'icon.poo',
};

// Meter widgets — top-left column.
export const METERS_X = INSET;
export const METERS_Y = INSET;
export const METER_ROW_H = 9;
export const METER_ICON_SIZE = 8;
export const METER_BAR_X = METERS_X + METER_ICON_SIZE + 2;
export const METER_BAR_W = 40;
export const METER_BAR_H = 6;

export function meterRowY(index: number): number {
  return METERS_Y + index * METER_ROW_H;
}

// Score + combo — top-right.
export const SCORE_X = W - INSET;
export const SCORE_Y = INSET;
export const COMBO_Y = SCORE_Y + 10;
export const CALLOUT_Y = COMBO_Y + 10;

// Rubles + debt — bottom-left.
export const RUBLE_ICON_X = INSET;
export const RUBLE_TEXT_X = INSET + 10;
export const RUBLE_Y = H - 20;
export const DEBT_Y = H - 11;
export const RUBLE_FLOAT_X = INSET + 28;

// Post integrity — bottom-right.
export const POST_W = 60;
export const POST_H = 4;
export const POST_X = W - INSET - POST_W;
export const POST_Y = H - 8;

// Incident banner — top-center.
export const BANNER_Y = INSET;
export const BANNER_H = 14;
export const BANNER_CX = Math.floor(W / 2);

// Confirmation toast — bottom-center.
export const TOAST_Y = H - 36;
export const TOAST_CX = Math.floor(W / 2);

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// On-screen intercom button (touch) — left edge, clear of the meter column and ruble readout.
export const INTERCOM_BTN: Rect = { x: INSET, y: 100, w: MIN_TAP, h: MIN_TAP };

// Resident panel — right ~55%, leaving the left sky visible to bail out fast (§3.5).
export const PANEL_X = 170;
export const PANEL_W = W - PANEL_X;
export const PANEL_PAD = 6;
export const PANEL_LIST_Y = 20;
export const PANEL_ROW_H = 11;
export const RESIDENT_COL_X = PANEL_X + PANEL_PAD;
export const RESIDENT_COL_W = 78;
export const OPTION_COL_X = PANEL_X + 90;
export const OPTION_COL_W = PANEL_W - 90 - PANEL_PAD;
export const CLOSE_BTN: Rect = { x: PANEL_X + PANEL_W - PANEL_PAD - 14, y: PANEL_PAD, w: 14, h: 14 };

/** Animation durations (seconds). */
export const RUBLE_POP_S = 0.8;
export const SCORE_POP_S = 0.4;
export const CALLOUT_S = 1.0;
export const COMBO_PULSE_S = 0.3;
export const COMBO_RESET_S = 0.4;
export const POST_SHAKE_S = 0.3;
export const BANNER_SLIDE_S = 0.4;
export const TOAST_S = 2.0;
export const CRISIS_FLASH_HZ = 4; // pulses/sec when reduced-flash is OFF

// Palette references (no hex here).
export const COL_GOOD: PaletteKey = 'meterGood';
export const COL_WARN: PaletteKey = 'meterWarn';
export const COL_CRIT: PaletteKey = 'meterCrit';
export const COL_GOLD: PaletteKey = 'rubleGold';
export const COL_TEXT: PaletteKey = 'cream';
export const COL_PANEL: PaletteKey = 'panel';
export const COL_PANEL_LITE: PaletteKey = 'panelLite';
export const COL_BANNER: PaletteKey = 'accentPink';
export const COL_DISABLED: PaletteKey = 'concreteDk';
export const COL_FRAME: PaletteKey = 'gunmetalDk';

/** Short call-out text for a `scoreChanged` reason (§3.4). Empty → no call-out (ordinary score). */
export function callOutFor(reason: string): string {
  switch (reason) {
    case 'jackpot':
      return 'JACKPOT!';
    case 'skillshot':
      return 'SKILL SHOT!';
    case 'tidy':
      return 'TIDY!';
    case 'incident-survived':
      return 'SURVIVED!';
    default:
      return '';
  }
}

/** Whether (x, y) — an internal-resolution point — is inside a rect (touch hit-test). */
export function hit(rect: Rect, x: number, y: number): boolean {
  return x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h;
}
