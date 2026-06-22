import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createAudioEngine, type AudioEngineImpl } from './engine';
import { createFakeAudioBackend, type FakeAudioBackend, type AudioSettings } from './backend';
import { createEventBus, type EventBus } from '../core/events';
import { createTestContent } from '../test-support/content';
import { makeTestGameState } from '../test-support/game-state';
import type { GameState } from '../state/game-state';

const SETTINGS: AudioSettings = { master: 0.8, music: 0.6, sfx: 0.8, muted: false };

interface Harness {
  engine: AudioEngineImpl;
  backend: FakeAudioBackend;
  bus: EventBus;
  gs: GameState;
}

/** Engine wired to a fake backend + bus, in the `Playing` scene and unlocked unless `lockedSuspended`. */
function setup(opts: { settings?: AudioSettings; lockedSuspended?: boolean } = {}): Harness {
  const content = createTestContent();
  const engine = createAudioEngine(content.audio);
  const backend = createFakeAudioBackend();
  const bus = createEventBus();
  engine.init(backend, opts.settings ?? SETTINGS);
  engine.bind(bus);
  engine.setScene('Playing');
  if (!opts.lockedSuspended) backend.setState('running');
  return { engine, backend, bus, gs: makeTestGameState(content) };
}

describe('AudioEngine — event → SFX mapping (§8.1)', () => {
  it('maps each gameplay event to exactly the documented SFX id(s)', () => {
    const { engine, backend, bus, gs } = setup();
    const gap = (): void => engine.update(gs, 0.2); // clear per-slot rate limits between triggers

    bus.emit('shotFired', { from: { x: 0, y: 0 }, angle: 0 });
    expect(backend.playsTagged('gunFire')).toHaveLength(1);

    bus.emit('droneDestroyed', { id: 1, kind: 'scout', byPlayer: true, pos: { x: 1, y: 1 } });
    expect(backend.playsTagged('droneExplode')).toHaveLength(1);
    expect(backend.playsTagged('kaching')).toHaveLength(1); // explosion + cash register

    bus.emit('droneEscaped', { id: 2, damage: 10 });
    expect(backend.playsTagged('meterWarn')).toHaveLength(1);

    gap();
    bus.emit('meterCrisis', { meter: 'poo', entered: true });
    expect(backend.playsTagged('meterWarn')).toHaveLength(2);
    bus.emit('meterCrisis', { meter: 'poo', entered: false }); // leaving crisis is silent
    expect(backend.playsTagged('meterWarn')).toHaveLength(2);

    bus.emit('scoreChanged', { delta: 5000, total: 5000, reason: 'jackpot' });
    expect(backend.playsTagged('jackpot')).toHaveLength(1);
    bus.emit('scoreChanged', { delta: 100, total: 5100, reason: 'drone' }); // ordinary score = no sfx
    expect(backend.playsTagged('jackpot')).toHaveLength(1);

    bus.emit('comboChanged', { multiplier: 2 });
    expect(backend.playsTagged('comboUp')).toHaveLength(1);

    bus.emit('incidentStart', { id: 'swarm' });
    expect(backend.playsTagged('incidentAlarm')).toHaveLength(1);

    bus.emit('gameOver', { score: 1, cause: 'post', shiftSeconds: 10, dronesDowned: 1 });
    expect(backend.playsTagged('gameOver')).toHaveLength(1);
  });

  it('plays rubleTick on a non-kill ruble change but suppresses it on the kill frame', () => {
    const a = setup();
    a.bus.emit('rublesChanged', { delta: 1, total: 1 });
    expect(a.backend.playsTagged('rubleTick')).toHaveLength(1);

    const b = setup();
    b.bus.emit('droneDestroyed', { id: 1, kind: 'scout', byPlayer: true, pos: { x: 0, y: 0 } });
    b.bus.emit('rublesChanged', { delta: 1, total: 1 }); // kaching already played this frame
    expect(b.backend.playsTagged('kaching')).toHaveLength(1);
    expect(b.backend.playsTagged('rubleTick')).toHaveLength(0);
  });

  it('does not play SFX for a drone the player did not destroy', () => {
    const { backend, bus } = setup();
    bus.emit('droneDestroyed', { id: 1, kind: 'scout', byPlayer: false, pos: { x: 0, y: 0 } });
    expect(backend.playsTagged('droneExplode')).toHaveLength(0);
    expect(backend.playsTagged('kaching')).toHaveLength(0);
  });

  it('only plays comboUp when the multiplier rises (not on reset)', () => {
    const { backend, bus } = setup();
    bus.emit('comboChanged', { multiplier: 3 });
    bus.emit('comboChanged', { multiplier: 1 }); // reset → no ascending sfx
    expect(backend.playsTagged('comboUp')).toHaveLength(1);
  });
});

describe('AudioEngine — no real AudioContext (§8.2)', () => {
  const realAudio = (globalThis as { AudioContext?: unknown }).AudioContext;
  const realWebkit = (globalThis as { webkitAudioContext?: unknown }).webkitAudioContext;
  let ctorCalls = 0;

  beforeEach(() => {
    ctorCalls = 0;
    class GuardCtx {
      constructor() {
        ctorCalls += 1;
      }
    }
    (globalThis as { AudioContext?: unknown }).AudioContext = GuardCtx;
    (globalThis as { webkitAudioContext?: unknown }).webkitAudioContext = GuardCtx;
  });
  afterEach(() => {
    (globalThis as { AudioContext?: unknown }).AudioContext = realAudio;
    (globalThis as { webkitAudioContext?: unknown }).webkitAudioContext = realWebkit;
  });

  it('never constructs the global AudioContext across a full engine flow', async () => {
    const { engine, bus, gs } = setup();
    await engine.unlock();
    bus.emit('shotFired', { from: { x: 0, y: 0 }, angle: 0 });
    engine.update(gs, 1 / 60);
    engine.duck(0.5, 100);
    engine.unduck(100);
    expect(ctorCalls).toBe(0);
  });
});

describe('AudioEngine — mixer (§8.3 / §8.4 / §8.5 / §8.8)', () => {
  it('sets per-channel gains and reports effective gain = master * channel (§8.3)', () => {
    const { engine } = setup({ settings: { master: 0.5, music: 0.4, sfx: 0.6, muted: false } });
    const m = engine.mixerLevels();
    expect(m.master).toBeCloseTo(0.5);
    expect(m.music).toBeCloseTo(0.4);
    expect(m.sfx).toBeCloseTo(0.6);
    expect(m.effectiveSfx).toBeCloseTo(0.3);
    expect(m.effectiveMusic).toBeCloseTo(0.2);
  });

  it('mute forces master gain to 0 and unmute restores it (§8.4)', () => {
    const { engine } = setup();
    engine.applySettings({ master: 0.8, music: 0.6, sfx: 0.8, muted: true });
    expect(engine.mixerLevels().master).toBe(0);
    expect(engine.mixerLevels().effectiveSfx).toBe(0);
    engine.applySettings({ master: 0.8, music: 0.6, sfx: 0.8, muted: false });
    expect(engine.mixerLevels().master).toBeCloseTo(0.8);
  });

  it('applies live settings mid-playback without stopping active voices (§8.5)', () => {
    const { engine } = setup();
    const voice = engine.playSfx('gunFire');
    expect(voice?.active).toBe(true);
    engine.applySettings({ master: 0.8, music: 0.6, sfx: 0.2, muted: false });
    expect(engine.mixerLevels().sfx).toBeCloseTo(0.2);
    expect(voice?.active).toBe(true); // not restarted
  });

  it('ducks and unducks the music channel by the configured amount (§8.8)', () => {
    const { engine } = setup();
    expect(engine.mixerLevels().music).toBeCloseTo(0.6);
    engine.duck(0.5, 120);
    expect(engine.mixerLevels().music).toBeCloseTo(0.3);
    engine.unduck(120);
    expect(engine.mixerLevels().music).toBeCloseTo(0.6);
  });
});

describe('AudioEngine — music director (§8.6 / §8.7)', () => {
  it('raises and lowers intensity as difficulty crosses thresholds (§8.6)', () => {
    const { engine, gs } = setup();
    // Playing thresholds are [0,3,6,9]; base layer is always on at D ≥ 0.
    expect(engine.intensity()).toBe(1);

    gs.time.difficulty = 3;
    engine.update(gs, 1 / 60);
    expect(engine.intensity()).toBe(2);

    gs.time.difficulty = 9;
    engine.update(gs, 1 / 60);
    expect(engine.intensity()).toBe(4);
    expect(engine.activeMusicLayers()).toEqual(['base', 'drums', 'lead', 'frenzy']);

    gs.time.difficulty = 2;
    engine.update(gs, 1 / 60);
    expect(engine.intensity()).toBe(1); // crossing back down restores the lower set
  });

  it('pushes intensity to full on incidentStart and restores it on incidentEnd (§8.7)', () => {
    const { engine, bus } = setup();
    expect(engine.intensity()).toBe(1);
    bus.emit('incidentStart', { id: 'swarm' });
    expect(engine.intensity()).toBe(4); // all stems in
    bus.emit('incidentEnd', { id: 'swarm', survived: true });
    expect(engine.intensity()).toBe(1);
  });
});

describe('AudioEngine — unlock & resilience (§8.9 / §8.10 / §8.11 / §8.12)', () => {
  it('no-ops plays while suspended and proceeds after unlock (§8.9)', async () => {
    const h = setup({ lockedSuspended: true });
    expect(h.backend.state).toBe('suspended');
    expect(h.engine.playSfx('gunFire')).toBeNull();
    h.bus.emit('shotFired', { from: { x: 0, y: 0 }, angle: 0 });
    expect(h.backend.plays).toHaveLength(0);

    await h.engine.unlock();
    expect(h.backend.state).toBe('running');
    expect(h.engine.playSfx('gunFire')).not.toBeNull();
  });

  it('rate-limits rapid identical SFX (§8.10)', () => {
    const { engine, gs } = setup();
    expect(engine.playSfx('gunFire')).not.toBeNull();
    expect(engine.playSfx('gunFire')).toBeNull(); // within rateLimitMs (55ms), same engine clock
    engine.update(gs, 0.06); // advance the engine clock 60ms
    expect(engine.playSfx('gunFire')).not.toBeNull();
  });

  it('voice-caps simultaneous SFX at maxVoices (§8.10)', () => {
    const { engine, backend, gs } = setup();
    // gunFire maxVoices = 4. Space plays past the rate-limit so only the voice cap can stop them.
    for (let i = 0; i < 8; i++) {
      engine.playSfx('gunFire');
      engine.update(gs, 0.06);
    }
    expect(backend.activeVoices('gunFire').length).toBeLessThanOrEqual(4);
    expect(backend.activeVoices('gunFire')).toHaveLength(4);
  });

  it('uses the synthesized placeholder tone when no real asset exists (§8.11)', () => {
    const { engine, backend } = setup();
    engine.playSfx('gunFire');
    expect(backend.plays[0]?.kind).toBe('tone');
    expect(backend.plays[0]?.freq).toBeGreaterThan(0);
  });

  it('quiesces while hidden and resumes on returning to foreground (§8.12)', async () => {
    const { engine, backend } = setup();
    await engine.unlock();
    const resumesAfterUnlock = backend.resumeCalls;

    engine.onVisibilityChange(true); // backgrounded
    expect(engine.playSfx('gunFire')).toBeNull();

    engine.onVisibilityChange(false); // foreground again
    expect(backend.resumeCalls).toBeGreaterThan(resumesAfterUnlock);
    expect(engine.playSfx('gunFire')).not.toBeNull();
  });
});

describe('AudioEngine — graceful degradation (§3.8)', () => {
  it('never throws when the backend misbehaves; logs once', () => {
    const content = createTestContent();
    const engine = createAudioEngine(content.audio);
    const backend = createFakeAudioBackend();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    backend.setState('running');
    backend.playTone = () => {
      throw new Error('boom');
    };
    engine.init(backend, SETTINGS);
    expect(() => engine.playSfx('gunFire')).not.toThrow();
    expect(() => engine.playSfx('gunFire')).not.toThrow();
    expect(spy).toHaveBeenCalledTimes(1); // logged once, not per failure
    spy.mockRestore();
  });
});
