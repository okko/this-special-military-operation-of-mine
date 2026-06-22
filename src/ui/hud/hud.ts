/**
 * The in-game HUD overlay (docs/areas/10-hud-ui.md). A pure presentation + intent layer: it READS
 * `GameState` each frame for the resting display (meters/score/combo/rubles/debt/post integrity),
 * uses the event bus ONLY to trigger animations, and emits `ResidentIntent`s from the resident panel.
 * It mutates no gameplay state. Composed and driven by the `Playing` scene; rendered over the world at
 * 384×216. `createHud` returns the §4 `Hud` plus `dispose()` (unsubscribe on scene exit) and
 * `snapshot()` (animation/panel state the unit tests assert against alongside captured draw calls).
 */
import type { SystemContext } from '../../core/system-context';
import type { GameState } from '../../state/game-state';
import type { Renderer } from '../../render/renderer';
import type { InputEvent } from '../../input/input';
import type { MeterKey } from '../../types/meter-key';
import type { PaletteKey } from '../../render/palette';
import type { Vec2 } from '../../core/math';
import { drawIcon } from './icons';
import * as T from './theme';
import type { Hud, HudEconomy, SettingsView, ResidentMenuModel, MenuOption } from './types';

export interface HudSnapshot {
  panelOpen: boolean;
  selectedResident: number;
  selectedIndex: number;
  rublePop: { active: boolean; delta: number };
  scorePop: boolean;
  callOut: string | null;
  comboPulse: boolean;
  comboResetFlash: boolean;
  postShake: boolean;
  crisisFlash: { active: boolean; meters: MeterKey[]; reduced: boolean };
  bannerText: string | null;
  toastText: string | null;
}

export interface HudImpl extends Hud {
  snapshot(): HudSnapshot;
  dispose(): void;
}

interface FlatOption {
  residentId: string;
  residentIndex: number;
  kind: 'service' | 'favor';
  option: MenuOption;
}

const NAV_UP = new Set(['ArrowUp', 'KeyW']);
const NAV_DOWN = new Set(['ArrowDown', 'KeyS']);
const CONFIRM = new Set(['Enter', 'NumpadEnter', 'Space']);

export function createHud(ctx: SystemContext, settings: SettingsView, economy: HudEconomy): HudImpl {
  const content = ctx.content;
  const maxIntegrity = content.combat.postIntegrityMax;

  // Panel state.
  let open = false;
  let model: ResidentMenuModel = { residents: [] };
  let flat: FlatOption[] = [];
  let sel = 0;
  let panelDirty = false;

  // Touch hit-testing: last pointer world position (tracked from aim/pointer events).
  let lastAim: Vec2 | null = null;

  // Animation timers (seconds remaining).
  let rublePopTimer = 0;
  let rublePopDelta = 0;
  let scorePopTimer = 0;
  let callOutTimer = 0;
  let callOutText = '';
  let comboPulseTimer = 0;
  let comboResetTimer = 0;
  let lastMultiplier = 1;
  let postShakeTimer = 0;
  let bannerText: string | null = null;
  let toastTimer = 0;
  let toastText = '';
  let flashClock = 0;
  const crisisMeters = new Set<MeterKey>();

  // ---- Event subscriptions (animation triggers only) -------------------------------------
  const unsubs: Array<() => void> = [
    ctx.events.on('rublesChanged', (p) => {
      rublePopTimer = T.RUBLE_POP_S;
      rublePopDelta = p.delta;
      panelDirty = true;
    }),
    ctx.events.on('scoreChanged', (p) => {
      scorePopTimer = T.SCORE_POP_S;
      const co = T.callOutFor(p.reason);
      if (co) {
        callOutText = co;
        callOutTimer = T.CALLOUT_S;
      }
    }),
    ctx.events.on('comboChanged', (p) => {
      if (p.multiplier === 1 && lastMultiplier > 1) comboResetTimer = T.COMBO_RESET_S;
      else if (p.multiplier > lastMultiplier) comboPulseTimer = T.COMBO_PULSE_S;
      lastMultiplier = p.multiplier;
    }),
    ctx.events.on('meterCrisis', (p) => {
      if (p.entered) crisisMeters.add(p.meter);
      else crisisMeters.delete(p.meter);
    }),
    ctx.events.on('droneEscaped', () => {
      postShakeTimer = T.POST_SHAKE_S;
    }),
    ctx.events.on('incidentStart', (p) => {
      bannerText = content.incidents.catalog.find((i) => i.id === p.id)?.name ?? p.id;
      panelDirty = true;
    }),
    ctx.events.on('incidentEnd', () => {
      bannerText = null;
      panelDirty = true;
    }),
    ctx.events.on('serviceBought', (p) => {
      toastText = `${residentName(p.residentId)}: ${serviceLabel(p.residentId, p.service)}`;
      toastTimer = T.TOAST_S;
      panelDirty = true;
    }),
    ctx.events.on('favorBegged', (p) => {
      toastText = `${residentName(p.residentId)} obliges (${p.consequence})`;
      toastTimer = T.TOAST_S;
      panelDirty = true;
    }),
  ];

  function residentName(id: string): string {
    return content.economy.roster.find((r) => r.id === id)?.name ?? id;
  }
  function serviceLabel(residentId: string, serviceId: string): string {
    const res = content.economy.roster.find((r) => r.id === residentId);
    return res?.services.find((s) => s.id === serviceId)?.label ?? serviceId;
  }

  // ---- Panel model + navigation ----------------------------------------------------------

  function refreshPanel(state: GameState): void {
    model = economy.getAvailableInteractions(state);
    flat = [];
    model.residents.forEach((res, ri) => {
      for (const svc of res.services) flat.push({ residentId: res.residentId, residentIndex: ri, kind: 'service', option: svc });
      for (const fav of res.favors) flat.push({ residentId: res.residentId, residentIndex: ri, kind: 'favor', option: fav });
    });
    sel = Math.max(0, Math.min(sel, flat.length - 1));
    panelDirty = false;
  }

  function openPanel(state: GameState): void {
    open = true;
    sel = 0;
    refreshPanel(state);
  }
  function closePanel(): void {
    open = false;
    ctx.events.emit('residentIntent', { kind: 'closePanel' });
  }
  function togglePanel(state: GameState): void {
    if (open) closePanel();
    else openPanel(state);
  }

  function confirmSelection(): void {
    const f = flat[sel];
    if (!f || f.option.disabledReason) return; // greyed entries are non-selectable
    if (f.kind === 'service') {
      ctx.events.emit('residentIntent', { kind: 'buyService', residentId: f.residentId, serviceId: f.option.id });
    } else {
      ctx.events.emit('residentIntent', { kind: 'begFavor', residentId: f.residentId, favorId: f.option.id });
    }
  }

  /** The option rows for the currently-selected resident, with their flat indices + draw y. */
  function currentRows(): Array<{ flatIndex: number; kind: 'service' | 'favor'; option: MenuOption; y: number }> {
    const ri = flat[sel]?.residentIndex ?? 0;
    const rows: Array<{ flatIndex: number; kind: 'service' | 'favor'; option: MenuOption; y: number }> = [];
    let k = 0;
    flat.forEach((f, idx) => {
      if (f.residentIndex !== ri) return;
      rows.push({ flatIndex: idx, kind: f.kind, option: f.option, y: T.PANEL_LIST_Y + k * T.PANEL_ROW_H });
      k += 1;
    });
    return rows;
  }

  // ---- Input -----------------------------------------------------------------------------

  function onInput(e: InputEvent, state: GameState): boolean {
    switch (e.type) {
      case 'aim':
        lastAim = e.world;
        return open && e.world.x >= T.PANEL_X; // don't aim the gun into the open panel
      case 'pointer':
        if (e.down) lastAim = e.world;
        return false;
      case 'fireDown':
        return handleTap(state);
      case 'fireUp':
        return false;
      case 'key':
        return handleKey(e.code, e.down, state);
    }
  }

  function handleKey(code: string, down: boolean, state: GameState): boolean {
    if (code === settings.residentPanelKey) {
      if (down) togglePanel(state);
      return true; // always consume the panel key so it never leaks to the gun
    }
    if (!open) return false; // closed: everything else passes through to the gun
    if (code === 'Escape') {
      if (down) closePanel();
      return true;
    }
    if (NAV_UP.has(code)) {
      if (down) sel = Math.max(0, sel - 1);
      return true;
    }
    if (NAV_DOWN.has(code)) {
      if (down) sel = Math.min(flat.length - 1, sel + 1);
      return true;
    }
    if (CONFIRM.has(code)) {
      if (down) confirmSelection();
      return true;
    }
    return false; // unhandled keys (e.g. A/D) still steer the gun while the panel is open
  }

  function handleTap(state: GameState): boolean {
    const p = lastAim;
    if (!p) return false;
    if (!open) {
      if (T.hit(T.INTERCOM_BTN, p.x, p.y)) {
        togglePanel(state);
        return true;
      }
      return false;
    }
    // Panel open:
    if (T.hit(T.CLOSE_BTN, p.x, p.y)) {
      closePanel();
      return true;
    }
    if (T.hit(T.INTERCOM_BTN, p.x, p.y)) {
      togglePanel(state);
      return true;
    }
    for (const row of currentRows()) {
      const rect: T.Rect = { x: T.OPTION_COL_X, y: row.y, w: T.OPTION_COL_W, h: T.PANEL_ROW_H };
      if (T.hit(rect, p.x, p.y)) {
        sel = row.flatIndex;
        confirmSelection();
        return true;
      }
    }
    model.residents.forEach((_res, j) => {
      const rect: T.Rect = { x: T.RESIDENT_COL_X, y: T.PANEL_LIST_Y + j * T.PANEL_ROW_H, w: T.RESIDENT_COL_W, h: T.PANEL_ROW_H };
      if (T.hit(rect, p.x, p.y)) {
        const idx = flat.findIndex((f) => f.residentIndex === j);
        if (idx >= 0) sel = idx;
      }
    });
    return p.x >= T.PANEL_X; // taps inside the panel are consumed; sky taps fall through to the gun
  }

  // ---- Update ----------------------------------------------------------------------------

  function update(dt: number, state: GameState): void {
    flashClock += dt;
    const dec = (t: number): number => Math.max(0, t - dt);
    rublePopTimer = dec(rublePopTimer);
    scorePopTimer = dec(scorePopTimer);
    callOutTimer = dec(callOutTimer);
    comboPulseTimer = dec(comboPulseTimer);
    comboResetTimer = dec(comboResetTimer);
    postShakeTimer = dec(postShakeTimer);
    toastTimer = dec(toastTimer);
    if (open && panelDirty) refreshPanel(state);
  }

  // ---- Render ----------------------------------------------------------------------------

  function txt(r: Renderer, s: string, x: number, y: number, color: PaletteKey, align: 'left' | 'center' | 'right' = 'left'): void {
    r.text(s, x, y, { color, align });
  }

  function renderMeters(r: Renderer, state: GameState): void {
    T.METER_DISPLAY_ORDER.forEach((key, i) => {
      const y = T.meterRowY(i);
      drawIcon(r, T.METER_ICON[key], T.METERS_X, y);
      r.fillRect(T.METER_BAR_X - 1, y - 1, T.METER_BAR_W + 2, T.METER_BAR_H + 2, T.COL_FRAME);
      r.fillRect(T.METER_BAR_X, y, T.METER_BAR_W, T.METER_BAR_H, 'shadow');
      const value = state.meters.values[key];
      const warn = content.meters.warn[key];
      const inCrisis = state.meters.inCrisis[key];
      const color = inCrisis ? T.COL_CRIT : value >= warn ? T.COL_WARN : T.COL_GOOD;
      const fillW = Math.round(T.METER_BAR_W * Math.max(0, Math.min(1, value / 100)));
      if (fillW > 0) r.fillRect(T.METER_BAR_X, y, fillW, T.METER_BAR_H, color);
    });
    // Active-debuff context: a tiny marker so the player can read why aiming feels off (§3.2).
    if (state.meters.drunkTimer > 0) r.fillRect(T.METER_BAR_X + T.METER_BAR_W + 2, T.meterRowY(3), 2, T.METER_BAR_H, T.COL_WARN);
  }

  function formatScore(n: number): string {
    return Math.max(0, Math.floor(n)).toString().padStart(8, '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function renderScore(r: Renderer, state: GameState): void {
    r.text(formatScore(state.scoring.score), T.SCORE_X, T.SCORE_Y, { color: T.COL_GOLD, align: 'right', font: 'font.display' });
    const comboColor = comboResetTimer > 0 ? T.COL_CRIT : comboPulseTimer > 0 ? T.COL_GOLD : T.COL_TEXT;
    txt(r, `×${state.scoring.multiplier}`, T.SCORE_X, T.COMBO_Y, comboColor, 'right');
    if (callOutTimer > 0) txt(r, callOutText, T.SCORE_X, T.CALLOUT_Y, T.COL_GOLD, 'right');
  }

  function renderRubles(r: Renderer, state: GameState): void {
    drawIcon(r, 'icon.ruble', T.RUBLE_ICON_X, T.RUBLE_Y);
    txt(r, `₽ ${state.economy.rubles}`, T.RUBLE_TEXT_X, T.RUBLE_Y, T.COL_GOLD);
    if (rublePopTimer > 0) {
      const rise = Math.round((1 - rublePopTimer / T.RUBLE_POP_S) * 8);
      const sign = rublePopDelta >= 0 ? '+' : '';
      txt(r, `${sign}${rublePopDelta}`, T.RUBLE_FLOAT_X, T.RUBLE_Y - rise, rublePopDelta >= 0 ? T.COL_GOOD : T.COL_CRIT);
    }
    if (state.economy.debt > 0) txt(r, `DEBT ₽-${state.economy.debt}`, T.RUBLE_ICON_X, T.DEBT_Y, T.COL_CRIT);
  }

  function renderPost(r: Renderer, state: GameState): void {
    const frac = Math.max(0, Math.min(1, state.combat.postIntegrity / maxIntegrity));
    const dx = postShakeTimer > 0 ? Math.round(Math.sin(flashClock * 60) * 2) : 0;
    const color = frac > 0.5 ? T.COL_GOOD : frac > 0.25 ? T.COL_WARN : T.COL_CRIT;
    txt(r, 'POST', T.POST_X - 2, T.POST_Y - 1, T.COL_TEXT, 'right');
    r.fillRect(T.POST_X + dx, T.POST_Y, T.POST_W, T.POST_H, T.COL_CRIT);
    r.fillRect(T.POST_X + dx, T.POST_Y, Math.round(T.POST_W * frac), T.POST_H, color);
  }

  function renderBanner(r: Renderer): void {
    if (!bannerText) return;
    const w = Math.max(60, bannerText.length * 8 + 12);
    r.fillRect(T.BANNER_CX - w / 2, T.BANNER_Y, w, T.BANNER_H, T.COL_BANNER);
    txt(r, bannerText, T.BANNER_CX, T.BANNER_Y + 3, T.COL_TEXT, 'center');
  }

  function renderFlashers(r: Renderer): void {
    if (crisisMeters.size === 0) return;
    // Reduced-flash: a steady high-contrast border (no strobing). Otherwise pulse a few Hz.
    const lit = settings.reducedFlash || Math.sin(flashClock * 2 * Math.PI * T.CRISIS_FLASH_HZ) > 0;
    if (!lit) return;
    r.fillRect(0, 0, T.W, 2, T.COL_CRIT);
    r.fillRect(0, T.H - 2, T.W, 2, T.COL_CRIT);
    r.fillRect(0, 0, 2, T.H, T.COL_CRIT);
    r.fillRect(T.W - 2, 0, 2, T.H, T.COL_CRIT);
  }

  function renderToast(r: Renderer): void {
    if (toastTimer <= 0) return;
    const w = Math.max(80, toastText.length * 8 + 12);
    r.fillRect(T.TOAST_CX - w / 2, T.TOAST_Y, w, 12, T.COL_PANEL);
    txt(r, toastText, T.TOAST_CX, T.TOAST_Y + 2, T.COL_TEXT, 'center');
  }

  function renderPanel(r: Renderer): void {
    if (!open) return;
    r.fillRect(T.PANEL_X, 0, T.PANEL_W, T.H, T.COL_PANEL);
    txt(r, 'INTERCOM', T.PANEL_X + T.PANEL_PAD, T.PANEL_PAD, T.COL_TEXT);
    r.fillRect(T.CLOSE_BTN.x, T.CLOSE_BTN.y, T.CLOSE_BTN.w, T.CLOSE_BTN.h, T.COL_CRIT);
    txt(r, 'X', T.CLOSE_BTN.x + 4, T.CLOSE_BTN.y + 3, T.COL_TEXT);

    const ri = flat[sel]?.residentIndex ?? 0;
    model.residents.forEach((res, j) => {
      const y = T.PANEL_LIST_Y + j * T.PANEL_ROW_H;
      if (j === ri) r.fillRect(T.RESIDENT_COL_X - 2, y - 1, T.RESIDENT_COL_W + 2, T.PANEL_ROW_H, T.COL_PANEL_LITE);
      txt(r, `${res.name}`, T.RESIDENT_COL_X, y, T.COL_TEXT);
      txt(r, `${res.reputation}`, T.RESIDENT_COL_X + T.RESIDENT_COL_W - 14, y, T.COL_GOLD, 'right');
    });

    for (const row of currentRows()) {
      const o = row.option;
      const greyed = o.disabledReason !== undefined;
      const selected = row.flatIndex === sel;
      if (selected) r.fillRect(T.OPTION_COL_X - 2, row.y - 1, T.OPTION_COL_W + 2, T.PANEL_ROW_H, T.COL_PANEL_LITE);
      const color = greyed ? T.COL_DISABLED : row.kind === 'service' ? T.COL_TEXT : T.COL_GOLD;
      const price = o.costRubles !== undefined ? ` ₽${o.costRubles}` : '';
      const tail = greyed ? ` (${o.disabledReason})` : o.consequencePreview ? ` [${o.consequencePreview}]` : '';
      txt(r, `${row.kind === 'favor' ? 'BEG ' : ''}${o.label}${price}${tail}`, T.OPTION_COL_X, row.y, color);
    }
  }

  function render(r: Renderer, state: GameState): void {
    renderMeters(r, state);
    renderScore(r, state);
    renderRubles(r, state);
    renderPost(r, state);
    renderBanner(r);
    renderFlashers(r);
    renderToast(r);
    // On-screen intercom button (touch) — always visible so the panel is reachable without a keyboard.
    r.fillRect(T.INTERCOM_BTN.x, T.INTERCOM_BTN.y, T.INTERCOM_BTN.w, T.INTERCOM_BTN.h, T.COL_PANEL_LITE);
    renderPanel(r);
  }

  return {
    update,
    render,
    onInput,
    isPanelOpen: () => open,
    wantsPause: () => open && settings.pauseWhilePanelOpen,
    snapshot: (): HudSnapshot => ({
      panelOpen: open,
      selectedResident: flat[sel]?.residentIndex ?? 0,
      selectedIndex: sel,
      rublePop: { active: rublePopTimer > 0, delta: rublePopDelta },
      scorePop: scorePopTimer > 0,
      callOut: callOutTimer > 0 ? callOutText : null,
      comboPulse: comboPulseTimer > 0,
      comboResetFlash: comboResetTimer > 0,
      postShake: postShakeTimer > 0,
      crisisFlash: { active: crisisMeters.size > 0, meters: [...crisisMeters], reduced: settings.reducedFlash },
      bannerText,
      toastText: toastTimer > 0 ? toastText : null,
    }),
    dispose: () => {
      for (const off of unsubs) off();
      unsubs.length = 0;
    },
  };
}
