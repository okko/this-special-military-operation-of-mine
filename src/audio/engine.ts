/**
 * Audio engine façade (docs/areas/06-audio.md §3/§4). Owns the mixer gain graph (master/music/sfx),
 * the SFX bank (event-bus → one-shot, rate-limited + voice-capped), and the music director (layered
 * intensity by difficulty `D` + incidents, ducking). All Web Audio access is delegated to the
 * injected `AudioBackend`, so the whole engine is testable against `FakeAudioBackend` with no real
 * `AudioContext`. Nothing here ever throws into the game loop (§3.8): failures are caught + logged once.
 *
 * `createAudioEngine` returns the doc's `AudioEngine` plus a few honest inspection/control methods
 * (`mixerLevels`, `intensity`, `setScene`, `onVisibilityChange`) the host + tests use — these are not
 * part of the cross-area `AudioEngine` contract other code depends on.
 */
import type { GameState } from '../state/game-state';
import type { EventBus, GameEvents, Handler } from '../core/events';
import type { AudioContent, MusicSceneDef } from '../content/audio';
import type { AudioBackend, AudioSettings, GainHandle, SfxId, VoiceHandle } from './backend';

export interface AudioEngine {
  init(backend: AudioBackend, settings: AudioSettings): void;
  unlock(): Promise<void>;
  bind(events: EventBus): void;
  setIntensity(level: number): void;
  duck(amount: number, ms: number): void;
  unduck(ms: number): void;
  applySettings(s: AudioSettings): void;
  playSfx(id: SfxId): VoiceHandle | null;
  update(state: GameState, dt: number): void;
  dispose(): void;
}

export interface MixerLevels {
  master: number;
  music: number;
  sfx: number;
  effectiveMusic: number;
  effectiveSfx: number;
}

/** The doc contract + host/test-only inspection & control surface. */
export interface AudioEngineImpl extends AudioEngine {
  mixerLevels(): MixerLevels;
  intensity(): number;
  activeMusicLayers(): string[];
  scene(): 'Playing' | 'MainMenu';
  setScene(scene: 'Playing' | 'MainMenu'): void;
  /** Host wires this to `visibilitychange`/`pagehide`: hidden quiesces, visible resumes (§3.2a). */
  onVisibilityChange(hidden: boolean): void;
}

const MUTED_SETTINGS: AudioSettings = { master: 0, music: 0, sfx: 0, muted: true };

export function createAudioEngine(audio: AudioContent): AudioEngineImpl {
  let backend: AudioBackend | null = null;
  let settings: AudioSettings = MUTED_SETTINGS;

  // Mixer graph (built in init).
  let masterGain: GainHandle | null = null;
  let musicGain: GainHandle | null = null;
  let sfxGain: GainHandle | null = null;

  // Music director state.
  let currentScene: 'Playing' | 'MainMenu' = 'MainMenu';
  let sceneDef: MusicSceneDef | null = null;
  let layerGains: GainHandle[] = [];
  let currentIntensity = 0;
  let lastDifficulty = 0;
  let activeIncidents = 0;
  let duckFactor = 1; // 1 = no duck; (1 - amount) while ducked
  let musicStopped = false; // latched on gameOver until the next scene set

  // SFX bank state.
  const lastPlayedAt = new Map<SfxId, number>(); // seconds, for rate-limit
  const voices = new Map<SfxId, VoiceHandle[]>(); // for voice-cap
  let clockSec = 0;
  let frameId = 0;
  let kachingFrame = -1; // frame a kaching played (suppresses the kill's ruble tick)
  let lastMultiplier = 1;
  let backgrounded = false;

  // Event subscriptions (for dispose).
  let unsubs: Array<() => void> = [];
  let errorLogged = false;

  function safe(fn: () => void): void {
    try {
      fn();
    } catch (err) {
      if (!errorLogged) {
        errorLogged = true;
        console.error('[audio] suppressed error (audio never blocks gameplay)', err);
      }
    }
  }

  function running(): boolean {
    return backend !== null && backend.state === 'running' && !backgrounded;
  }

  // ---- Mixer ------------------------------------------------------------------------------

  function applySettings(s: AudioSettings): void {
    settings = s;
    if (!masterGain || !musicGain || !sfxGain) return;
    masterGain.gain = s.muted ? 0 : s.master;
    musicGain.gain = s.music * duckFactor;
    sfxGain.gain = s.sfx;
  }

  function mixerLevels(): MixerLevels {
    const master = masterGain?.gain ?? 0;
    const music = musicGain?.gain ?? 0;
    const sfx = sfxGain?.gain ?? 0;
    return { master, music, sfx, effectiveMusic: master * music, effectiveSfx: master * sfx };
  }

  // ---- Music director ---------------------------------------------------------------------

  function setScene(scene: 'Playing' | 'MainMenu'): void {
    currentScene = scene;
    sceneDef = audio.music.find((m) => m.scene === scene) ?? null;
    musicStopped = false;
    layerGains = [];
    if (!backend || !musicGain || !sceneDef) return;
    for (let i = 0; i < sceneDef.layers.length; i++) {
      const g = backend.createGain();
      g.gain = 0;
      g.connect(musicGain);
      layerGains.push(g);
    }
    recomputeIntensity();
  }

  /** Difficulty → intensity tier: number of thresholds the current `D` has reached (≥ 1 if base is 0). */
  function intensityFromDifficulty(): number {
    if (!sceneDef) return 0;
    let level = 0;
    for (const t of sceneDef.intensityThresholds) {
      if (lastDifficulty >= t) level += 1;
    }
    return level;
  }

  function applyIntensity(level: number): void {
    if (!sceneDef) return;
    const clamped = Math.max(0, Math.min(level, sceneDef.layers.length));
    currentIntensity = clamped;
    layerGains.forEach((g, i) => {
      g.gain = !musicStopped && i < clamped ? 1 : 0;
    });
  }

  function recomputeIntensity(): void {
    const base = intensityFromDifficulty();
    // A major incident pushes every stem in (alarm at full intensity), restored on incidentEnd.
    const level = activeIncidents > 0 && sceneDef ? sceneDef.layers.length : base;
    applyIntensity(level);
  }

  function setIntensity(level: number): void {
    applyIntensity(level);
  }

  // `duck(amount, ms)` / `unduck(ms)` per the contract; the `ms` ramp arg is omitted here (direct gain
  // set — a timed crossfade is future polish, and the fake/tests assert the target level), which still
  // satisfies the interface since a narrower function signature is assignable.
  function duck(amount: number): void {
    duckFactor = Math.max(0, 1 - amount);
    if (musicGain) musicGain.gain = settings.music * duckFactor;
  }

  function unduck(): void {
    duckFactor = 1;
    if (musicGain) musicGain.gain = settings.music * duckFactor;
  }

  // ---- SFX bank ---------------------------------------------------------------------------

  function playSfx(id: SfxId): VoiceHandle | null {
    if (!backend || !running()) return null;
    const b = backend;
    let result: VoiceHandle | null = null;
    safe(() => {
      const def = audio.sfx[id];
      // Rate-limit: drop a re-trigger that arrives within the slot's minimum gap (machine-gun guard).
      if (def.rateLimitMs !== undefined) {
        const last = lastPlayedAt.get(id);
        if (last !== undefined && clockSec - last < def.rateLimitMs / 1000) return;
      }
      // Voice-cap: prune finished voices, then drop if the slot is already full (anti-clipping).
      const live = (voices.get(id) ?? []).filter((v) => v.active);
      if (live.length >= def.maxVoices) {
        voices.set(id, live);
        return;
      }
      const tone = def.fallbackTone;
      // Placeholder mode (until real assets land): synthesize a blip. Real assets would playBuffer here.
      const voice = b.playTone({
        channel: 'sfx',
        freq: tone.freq,
        durationMs: tone.durationMs,
        ...(tone.type ? { type: tone.type } : {}),
        gain: def.gain,
        ...(sfxGain ? { out: sfxGain } : {}),
        tag: id,
      });
      live.push(voice);
      voices.set(id, live);
      lastPlayedAt.set(id, clockSec);
      result = voice;
    });
    return result;
  }

  // ---- Event → SFX wiring -----------------------------------------------------------------

  function bind(events: EventBus): void {
    function on<K extends keyof GameEvents>(k: K, h: Handler<GameEvents[K]>): void {
      unsubs.push(events.on(k, h));
    }

    on('shotFired', () => {
      playSfx('gunFire');
    });
    on('droneDestroyed', (p) => {
      if (!p.byPlayer) return;
      playSfx('droneExplode');
      if (playSfx('kaching')) kachingFrame = frameId; // cash register; suppresses this frame's rubleTick
    });
    on('droneEscaped', () => {
      playSfx('meterWarn');
    });
    on('rublesChanged', () => {
      if (kachingFrame === frameId) return; // the kill's ruble already played a kaching this frame
      playSfx('rubleTick');
    });
    on('meterCrisis', (p) => {
      if (p.entered) playSfx('meterWarn');
    });
    on('scoreChanged', (p) => {
      if (p.reason === 'jackpot') playSfx('jackpot');
    });
    on('comboChanged', (p) => {
      if (p.multiplier > lastMultiplier) playSfx('comboUp');
      lastMultiplier = p.multiplier;
    });
    on('incidentStart', () => {
      playSfx('incidentAlarm');
      activeIncidents += 1;
      recomputeIntensity();
    });
    on('incidentEnd', () => {
      activeIncidents = Math.max(0, activeIncidents - 1);
      recomputeIntensity();
    });
    on('gameOver', () => {
      playSfx('gameOver');
      musicStopped = true;
      applyIntensity(0); // fade the bed out under the stinger
    });
  }

  // ---- Lifecycle --------------------------------------------------------------------------

  function init(b: AudioBackend, s: AudioSettings): void {
    backend = b;
    masterGain = b.createGain();
    musicGain = b.createGain();
    sfxGain = b.createGain();
    musicGain.connect(masterGain);
    sfxGain.connect(masterGain);
    masterGain.connect(b.destination);
    applySettings(s);
    setScene(currentScene);
  }

  async function unlock(): Promise<void> {
    if (!backend) return;
    try {
      await backend.resume();
    } catch {
      /* never throw into the gesture handler (§3.8) */
    }
  }

  function update(state: GameState, dt: number): void {
    clockSec += dt;
    frameId += 1;
    const d = state.time.difficulty;
    if (d !== lastDifficulty) {
      lastDifficulty = d;
      recomputeIntensity(); // debounced to threshold crossings inside intensityFromDifficulty
    }
  }

  function onVisibilityChange(hidden: boolean): void {
    if (hidden) {
      backgrounded = true; // quiesce: subsequent plays no-op until we return (§3.2a)
      return;
    }
    backgrounded = false;
    safe(() => {
      void backend?.resume(); // never leave audio stuck silent after backgrounding
    });
  }

  function dispose(): void {
    for (const off of unsubs) off();
    unsubs = [];
    for (const list of voices.values()) for (const v of list) safe(() => v.stop());
    voices.clear();
  }

  return {
    init,
    unlock,
    bind,
    setIntensity,
    duck,
    unduck,
    applySettings,
    playSfx,
    update,
    dispose,
    mixerLevels,
    intensity: () => currentIntensity,
    activeMusicLayers: () =>
      sceneDef ? sceneDef.layers.filter((_, i) => (layerGains[i]?.gain ?? 0) > 0).map((l) => l.id) : [],
    scene: () => currentScene,
    setScene,
    onVisibilityChange,
  };
}
