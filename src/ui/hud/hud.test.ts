import { describe, it, expect } from 'vitest';
import { createHud, type HudImpl } from './hud';
import { createRecordingRenderer, type RecordingRenderer } from '../../test-support/recording-renderer';
import { createTestContext } from '../../test-support/context';
import { makeTestGameState } from '../../test-support/game-state';
import * as T from './theme';
import type { SettingsView, ResidentMenuModel, HudEconomy } from './types';
import type { GameState } from '../../state/game-state';
import type { MeterKey } from '../../types/meter-key';
import type { ResidentIntent } from '../../core/events';

const DEFAULT_SETTINGS: SettingsView = {
  reducedFlash: false,
  largeHudText: false,
  pauseWhilePanelOpen: false,
  residentPanelKey: 'KeyE',
};

function model(): ResidentMenuModel {
  return {
    residents: [
      {
        residentId: 'galina',
        name: 'Galina',
        floor: 3,
        reputation: 60,
        services: [{ id: 'stew', label: 'Stew', costRubles: 4, affordable: true }],
        favors: [],
      },
      {
        residentId: 'plumber',
        name: 'Sergei',
        floor: 7,
        reputation: 20,
        services: [{ id: 'toilet', label: 'Toilet', costRubles: 3, affordable: false, disabledReason: 'Too pricey' }],
        favors: [{ id: 'bucket', label: 'Bucket', consequencePreview: 'Costs 10 reputation' }],
      },
    ],
  };
}

interface Harness {
  hud: HudImpl;
  r: RecordingRenderer;
  gs: GameState;
  intents: ResidentIntent[];
  emit: ReturnType<typeof createTestContext>['events']['emit'];
}

function setup(opts: { settings?: Partial<SettingsView>; economy?: HudEconomy } = {}): Harness {
  const ctx = createTestContext();
  const intents: ResidentIntent[] = [];
  ctx.events.on('residentIntent', (i) => intents.push(i));
  const economy: HudEconomy = opts.economy ?? { getAvailableInteractions: () => model() };
  const hud = createHud(ctx, { ...DEFAULT_SETTINGS, ...opts.settings }, economy);
  return { hud, r: createRecordingRenderer(), gs: makeTestGameState(ctx.content), intents, emit: ctx.events.emit };
}

function meterFill(r: RecordingRenderer, key: MeterKey): { w: number; color: string } | undefined {
  const i = T.METER_DISPLAY_ORDER.indexOf(key);
  const y = T.meterRowY(i);
  return r.rects.find((rc) => rc.x === T.METER_BAR_X && rc.y === y && rc.color !== 'shadow');
}

describe('HUD — meters (§8.1 / §8.2 / §8.3)', () => {
  it('fills each bar proportionally to the meter value (§8.1)', () => {
    const { hud, r, gs } = setup();
    gs.meters.values.sleep = 0;
    gs.meters.values.hunger = 50;
    gs.meters.values.thirst = 100;
    hud.render(r, gs);
    expect(meterFill(r, 'sleep')).toBeUndefined(); // 0% → no fill
    expect(meterFill(r, 'hunger')?.w).toBe(Math.round(T.METER_BAR_W * 0.5));
    expect(meterFill(r, 'thirst')?.w).toBe(T.METER_BAR_W); // 100%
  });

  it('colors the fill green / amber / red by meter state (§8.2)', () => {
    const { hud, r, gs } = setup();
    gs.meters.values.hunger = 50; // < warn(70) → green
    gs.meters.values.sleep = 80; // warn(70) ≤ value, not crisis → amber
    gs.meters.values.poo = 90;
    gs.meters.inCrisis.poo = true; // crisis → red regardless of value
    hud.render(r, gs);
    expect(meterFill(r, 'hunger')?.color).toBe('meterGood');
    expect(meterFill(r, 'sleep')?.color).toBe('meterWarn');
    expect(meterFill(r, 'poo')?.color).toBe('meterCrit');
  });

  it('maps exactly the five meter indicators and renders the poo icon as 💩 (§8.3)', () => {
    expect(Object.keys(T.METER_ICON).sort()).toEqual(['hunger', 'poo', 'sleep', 'thirst', 'vice']);
    expect(T.METER_ICON.poo).toBe('icon.poo');

    const { hud, r, gs } = setup();
    hud.render(r, gs);
    const pooY = T.meterRowY(T.METER_DISPLAY_ORDER.indexOf('poo'));
    const inMeterIconCol = (rc: { x: number }): boolean => rc.x >= T.METERS_X && rc.x < T.METERS_X + 8;
    const pooEyes = r.rects.filter((rc) => rc.color === 'ink' && inMeterIconCol(rc) && rc.y >= pooY && rc.y < pooY + 8);
    expect(pooEyes.length).toBeGreaterThan(0); // the poo icon is the only meter icon with ink eyes
    // No other meter icon (rows above poo) uses ink — uniquely identifies the poo glyph.
    const inkOtherMeters = r.rects.filter((rc) => rc.color === 'ink' && inMeterIconCol(rc) && rc.y >= T.METERS_Y && rc.y < pooY);
    expect(inkOtherMeters).toHaveLength(0);
  });
});

describe('HUD — rubles & debt (§8.4 / §8.5)', () => {
  it('shows the ruble count and pops on a positive change, flashes on a negative one (§8.4)', () => {
    const { hud, r, gs, emit } = setup();
    gs.economy.rubles = 42;
    hud.render(r, gs);
    expect(r.textsContaining('₽ 42').length).toBeGreaterThan(0);

    gs.economy.rubles = 43;
    emit('rublesChanged', { delta: 1, total: 43 });
    r.reset();
    hud.render(r, gs);
    expect(hud.snapshot().rublePop).toEqual({ active: true, delta: 1 });
    expect(r.textsContaining('+1').length).toBeGreaterThan(0);

    emit('rublesChanged', { delta: -5, total: 38 });
    r.reset();
    hud.render(r, gs);
    expect(hud.snapshot().rublePop.delta).toBe(-5);
    expect(r.textsContaining('-5').length).toBeGreaterThan(0);
  });

  it('hides the debt indicator at zero and shows it when in debt (§8.5)', () => {
    const { hud, r, gs } = setup();
    gs.economy.debt = 0;
    hud.render(r, gs);
    expect(r.textsContaining('DEBT')).toHaveLength(0);

    gs.economy.debt = 13;
    r.reset();
    hud.render(r, gs);
    expect(r.textsContaining('DEBT ₽-13').length).toBeGreaterThan(0);
  });
});

describe('HUD — score & combo (§8.6 / §8.7)', () => {
  it('shows the zero-padded score and a reason call-out on scoreChanged (§8.6)', () => {
    const { hud, r, gs, emit } = setup();
    gs.scoring.score = 1234560;
    hud.render(r, gs);
    expect(r.textsContaining('01,234,560').length).toBeGreaterThan(0);

    emit('scoreChanged', { delta: 5000, total: 1239560, reason: 'jackpot' });
    expect(hud.snapshot().callOut).toBe('JACKPOT!');
    r.reset();
    hud.render(r, gs);
    expect(r.textsContaining('JACKPOT!').length).toBeGreaterThan(0);

    emit('scoreChanged', { delta: 500, total: 1240060, reason: 'skillshot' });
    expect(hud.snapshot().callOut).toBe('SKILL SHOT!');
  });

  it('reflects the multiplier, pulses on growth, and down-flashes on reset (§8.7)', () => {
    const { hud, r, gs, emit } = setup();
    gs.scoring.multiplier = 3;
    hud.render(r, gs);
    expect(r.textsContaining('×3').length).toBeGreaterThan(0);

    emit('comboChanged', { multiplier: 4 });
    expect(hud.snapshot().comboPulse).toBe(true);

    emit('comboChanged', { multiplier: 1 });
    expect(hud.snapshot().comboResetFlash).toBe(true);
  });
});

describe('HUD — post integrity (§8.8)', () => {
  function postFill(r: RecordingRenderer, width: number): { color: string } | undefined {
    return r.rects.find((rc) => rc.y === T.POST_Y && rc.w === width);
  }

  it('reflects postIntegrity, shifts color as it falls, and shakes on droneEscaped (§8.8)', () => {
    const { hud, r, gs, emit } = setup();
    gs.combat.postIntegrity = 73;
    hud.render(r, gs);
    expect(postFill(r, Math.round(T.POST_W * 0.73))?.color).toBe('meterGood');

    gs.combat.postIntegrity = 40;
    r.reset();
    hud.render(r, gs);
    expect(postFill(r, Math.round(T.POST_W * 0.4))?.color).toBe('meterWarn');

    gs.combat.postIntegrity = 20;
    r.reset();
    hud.render(r, gs);
    expect(postFill(r, Math.round(T.POST_W * 0.2))?.color).toBe('meterCrit');

    emit('droneEscaped', { id: 1, damage: 10 });
    expect(hud.snapshot().postShake).toBe(true);
  });
});

describe('HUD — crisis flashers (§8.9)', () => {
  function hasEdge(r: RecordingRenderer): boolean {
    return r.rects.some((rc) => rc.color === 'meterCrit' && rc.w === T.W && rc.h === 2);
  }

  it('flashes on crisis, uses a steady highlight under reduced-flash, and clears on exit (§8.9)', () => {
    const reduced = setup({ settings: { reducedFlash: true } });
    reduced.emit('meterCrisis', { meter: 'poo', entered: true });
    expect(reduced.hud.snapshot().crisisFlash).toMatchObject({ active: true, meters: ['poo'], reduced: true });
    reduced.hud.update(0.2, reduced.gs); // a phase where a strobe would be OFF
    reduced.hud.render(reduced.r, reduced.gs);
    expect(hasEdge(reduced.r)).toBe(true); // steady highlight, no strobe

    const strobe = setup({ settings: { reducedFlash: false } });
    strobe.emit('meterCrisis', { meter: 'poo', entered: true });
    strobe.hud.update(0.2, strobe.gs); // off-phase of the pulse
    strobe.hud.render(strobe.r, strobe.gs);
    expect(hasEdge(strobe.r)).toBe(false);

    strobe.emit('meterCrisis', { meter: 'poo', entered: false });
    expect(strobe.hud.snapshot().crisisFlash.active).toBe(false);
    strobe.r.reset();
    strobe.hud.render(strobe.r, strobe.gs);
    expect(hasEdge(strobe.r)).toBe(false);
  });
});

describe('HUD — incident banner (§8.10)', () => {
  it('is hidden until incidentStart, shows the incident name, and hides after incidentEnd (§8.10)', () => {
    const { hud, r, gs, emit } = setup();
    hud.render(r, gs);
    expect(r.rectsOfColor('accentPink')).toHaveLength(0);

    emit('incidentStart', { id: 'pipe_failure' });
    expect(hud.snapshot().bannerText).toBe('Spa Day Downstairs!'); // catalog name for pipe_failure
    r.reset();
    hud.render(r, gs);
    expect(r.textsContaining('Spa Day Downstairs!').length).toBeGreaterThan(0);
    expect(r.rectsOfColor('accentPink').length).toBeGreaterThan(0);

    emit('incidentEnd', { id: 'pipe_failure', survived: true });
    expect(hud.snapshot().bannerText).toBeNull();
    r.reset();
    hud.render(r, gs);
    expect(r.rectsOfColor('accentPink')).toHaveLength(0);
  });
});

describe('HUD — resident panel (§8.11 / §8.12 / §8.13 / §8.14)', () => {
  const key = (code: string, down = true): { type: 'key'; code: string; down: boolean } => ({ type: 'key', code, down });

  it('lists exactly the available options and greys disabled ones (§8.11)', () => {
    const { hud, r, gs } = setup();
    hud.onInput(key('KeyE'), gs); // open
    hud.render(r, gs);
    // Selected resident = Galina (one service "Stew ₽4"); no fabricated rows.
    expect(r.textsContaining('Stew').length).toBe(1);
    expect(r.textsContaining('₽4').length).toBe(1);

    // Navigate to Sergei's greyed toilet service.
    hud.onInput(key('ArrowDown'), gs);
    r.reset();
    hud.render(r, gs);
    const toilet = r.textsContaining('Toilet')[0];
    expect(toilet?.opts?.color).toBe('concreteDk'); // greyed
    expect(r.textsContaining('(Too pricey)').length).toBe(1);
  });

  it('emits the exact intent on confirm and on close (§8.12)', () => {
    const { hud, gs, intents } = setup();
    hud.onInput(key('KeyE'), gs); // open, sel = Galina/stew
    hud.onInput(key('Enter'), gs);
    expect(intents.at(-1)).toEqual({ kind: 'buyService', residentId: 'galina', serviceId: 'stew' });

    hud.onInput(key('ArrowDown'), gs); // → Sergei/toilet (greyed, non-selectable)
    hud.onInput(key('Enter'), gs);
    expect(intents.at(-1)).toEqual({ kind: 'buyService', residentId: 'galina', serviceId: 'stew' }); // unchanged

    hud.onInput(key('ArrowDown'), gs); // → Sergei/bucket favor
    hud.onInput(key('Enter'), gs);
    expect(intents.at(-1)).toEqual({ kind: 'begFavor', residentId: 'plumber', favorId: 'bucket' });

    hud.onInput(key('Escape'), gs);
    expect(intents.at(-1)).toEqual({ kind: 'closePanel' });
    expect(hud.isPanelOpen()).toBe(false);
  });

  it('routes input: opens on the bound key, consumes nav while open, passes through when closed (§8.13)', () => {
    const { hud, gs } = setup();
    expect(hud.onInput(key('Space'), gs)).toBe(false); // closed → passes to the gun
    expect(hud.onInput(key('KeyE'), gs)).toBe(true); // bound key opens
    expect(hud.isPanelOpen()).toBe(true);

    const before = hud.snapshot().selectedIndex;
    expect(hud.onInput(key('ArrowDown'), gs)).toBe(true); // consumed
    expect(hud.snapshot().selectedIndex).toBe(before + 1);
    expect(hud.onInput(key('Enter'), gs)).toBe(true);

    hud.onInput(key('KeyE'), gs); // toggle closed
    expect(hud.isPanelOpen()).toBe(false);
    expect(hud.onInput(key('Space'), gs)).toBe(false);
  });

  it('opens/closes via the on-screen intercom button within tap-size and safe-area insets (§8.13 touch)', () => {
    const { hud, gs } = setup();
    expect(T.INTERCOM_BTN.w).toBeGreaterThanOrEqual(T.MIN_TAP);
    expect(T.INTERCOM_BTN.h).toBeGreaterThanOrEqual(T.MIN_TAP);
    expect(T.INTERCOM_BTN.x).toBeGreaterThanOrEqual(T.INSET);
    expect(T.INTERCOM_BTN.y).toBeGreaterThanOrEqual(T.INSET);

    const cx = T.INTERCOM_BTN.x + T.INTERCOM_BTN.w / 2;
    const cy = T.INTERCOM_BTN.y + T.INTERCOM_BTN.h / 2;
    hud.onInput({ type: 'aim', world: { x: cx, y: cy } }, gs);
    expect(hud.onInput({ type: 'fireDown' }, gs)).toBe(true);
    expect(hud.isPanelOpen()).toBe(true);
  });

  it('requests a pause only when the accessibility setting is on (§8.14)', () => {
    const live = setup();
    live.hud.onInput(key('KeyE'), live.gs);
    expect(live.hud.wantsPause()).toBe(false);

    const paused = setup({ settings: { pauseWhilePanelOpen: true } });
    paused.hud.onInput(key('KeyE'), paused.gs);
    expect(paused.hud.wantsPause()).toBe(true);
  });
});

describe('HUD — confirmation toast (§8.15)', () => {
  it('shows a toast on serviceBought / favorBegged then dismisses it (§8.15)', () => {
    const { hud, r, gs, emit } = setup();
    emit('serviceBought', { residentId: 'babushka', service: 'stew', cost: 4 });
    expect(hud.snapshot().toastText).toContain('Galina Petrovna'); // babushka's roster name
    r.reset();
    hud.render(r, gs);
    expect(r.textsContaining('Galina Petrovna').length).toBeGreaterThan(0);

    hud.update(T.TOAST_S + 0.1, gs);
    expect(hud.snapshot().toastText).toBeNull();

    emit('favorBegged', { residentId: 'veteran', favor: 'flask', consequence: 'degraded' });
    expect(hud.snapshot().toastText).toContain('Old Dmitri');
  });
});

describe('HUD — lifecycle', () => {
  it('dispose() unsubscribes so events no longer drive animations', () => {
    const { hud, emit } = setup();
    hud.dispose();
    emit('incidentStart', { id: 'pipe_failure' });
    expect(hud.snapshot().bannerText).toBeNull();
  });
});
