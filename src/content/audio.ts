/**
 * Audio content tables (docs/areas/06-audio.md §5). DATA, not logic: every SFX slot, music layer,
 * intensity threshold, and ducking preset lives here so `src/audio/*` stays pure and tuning never
 * touches code. Validated by `validateAudioContent`, exposed as `content.audio`.
 *
 * No real assets ship yet, so `usePlaceholders` is true and every slot carries a `fallbackTone`
 * (synthesized blip) — dependent areas hear *something* and tests stay deterministic (§3.7).
 */
import { SFX_IDS, type SfxId, type ToneOpts } from '../audio/backend';

export interface SfxDef {
  src: string; // asset path (unused while usePlaceholders is on)
  gain: number; // 0..1, per-voice gain
  maxVoices: number; // simultaneous-voice cap (anti-clipping)
  rateLimitMs?: number; // minimum gap between triggers (machine-gun guard)
  fallbackTone: ToneOpts; // synthesized stand-in (channel 'sfx')
}

export interface MusicLayer {
  id: string; // 'base' | 'drums' | 'lead' | 'frenzy' (additive stems)
  src: string;
  fallbackTone: ToneOpts; // channel 'music'
}

export interface MusicSceneDef {
  scene: 'Playing' | 'MainMenu';
  layers: MusicLayer[];
  /** Difficulty `D` at which each layer fades in; ascending, same length as `layers`. */
  intensityThresholds: number[];
}

export interface DuckPreset {
  amount: number; // 0..1 fraction the music gain is reduced by
  ms: number; // ramp time
}

export interface AudioContent {
  sfx: Record<SfxId, SfxDef>;
  music: MusicSceneDef[];
  ducking: { dialog: DuckPreset; incident: DuckPreset };
  usePlaceholders: boolean;
}

const sfxTone = (freq: number, durationMs: number, type: OscillatorType, gain: number): ToneOpts => ({
  channel: 'sfx',
  freq,
  durationMs,
  type,
  gain,
});

const musicTone = (freq: number): ToneOpts => ({
  channel: 'music',
  freq,
  durationMs: 1000,
  type: 'triangle',
  gain: 0.18,
});

export const audioContent: AudioContent = {
  sfx: {
    gunFire: { src: 'sfx/gun-fire.ogg', gain: 0.22, maxVoices: 4, rateLimitMs: 55, fallbackTone: sfxTone(220, 55, 'square', 0.22) },
    droneExplode: { src: 'sfx/drone-explode.ogg', gain: 0.4, maxVoices: 6, fallbackTone: sfxTone(110, 220, 'sawtooth', 0.4) },
    kaching: { src: 'sfx/kaching.ogg', gain: 0.4, maxVoices: 4, fallbackTone: sfxTone(880, 140, 'triangle', 0.4) },
    rubleTick: { src: 'sfx/ruble-tick.ogg', gain: 0.2, maxVoices: 4, rateLimitMs: 40, fallbackTone: sfxTone(1320, 50, 'square', 0.2) },
    meterWarn: { src: 'sfx/meter-warn.ogg', gain: 0.35, maxVoices: 3, rateLimitMs: 120, fallbackTone: sfxTone(160, 260, 'sawtooth', 0.35) },
    jackpot: { src: 'sfx/jackpot.ogg', gain: 0.5, maxVoices: 2, fallbackTone: sfxTone(1047, 400, 'square', 0.5) },
    comboUp: { src: 'sfx/combo-up.ogg', gain: 0.35, maxVoices: 4, fallbackTone: sfxTone(660, 120, 'triangle', 0.35) },
    incidentAlarm: { src: 'sfx/incident-alarm.ogg', gain: 0.45, maxVoices: 2, fallbackTone: sfxTone(330, 500, 'square', 0.45) },
    airRaidSiren: { src: 'sfx/air-raid-siren.ogg', gain: 0.5, maxVoices: 1, rateLimitMs: 4000, fallbackTone: sfxTone(440, 1400, 'sawtooth', 0.5) },
    gameOver: { src: 'sfx/game-over.ogg', gain: 0.5, maxVoices: 1, fallbackTone: sfxTone(130, 900, 'sawtooth', 0.5) },
    uiSelect: { src: 'sfx/ui-select.ogg', gain: 0.25, maxVoices: 3, rateLimitMs: 40, fallbackTone: sfxTone(520, 40, 'square', 0.25) },
    uiConfirm: { src: 'sfx/ui-confirm.ogg', gain: 0.3, maxVoices: 3, fallbackTone: sfxTone(700, 90, 'triangle', 0.3) },
  },
  music: [
    {
      scene: 'Playing',
      layers: [
        { id: 'base', src: 'music/play-base.ogg', fallbackTone: musicTone(196) },
        { id: 'drums', src: 'music/play-drums.ogg', fallbackTone: musicTone(98) },
        { id: 'lead', src: 'music/play-lead.ogg', fallbackTone: musicTone(392) },
        { id: 'frenzy', src: 'music/play-frenzy.ogg', fallbackTone: musicTone(587) },
      ],
      // D ramps 0→12 (content.combat.difficulty.maxD). Base is always on; each stem fades in higher.
      intensityThresholds: [0, 3, 6, 9],
    },
    {
      scene: 'MainMenu',
      layers: [{ id: 'base', src: 'music/menu-base.ogg', fallbackTone: musicTone(262) }],
      intensityThresholds: [0],
    },
  ],
  ducking: {
    dialog: { amount: 0.5, ms: 120 },
    incident: { amount: 0.35, ms: 200 },
  },
  usePlaceholders: true,
};

export const SFX_ID_LIST: readonly SfxId[] = SFX_IDS;
