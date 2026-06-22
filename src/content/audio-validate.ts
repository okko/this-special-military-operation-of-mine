/**
 * Runtime validator for the audio content tables (docs/areas/06-audio.md §5). Confirms every SfxId
 * has a well-formed slot, music scenes carry ascending intensity thresholds matching their layers,
 * and ducking presets are sane. Throws `ContentValidationError` (loud boot failure, never silent).
 */
import { ContentValidationError } from './content-error';
import { asObject, asArray, num, str, bool, oneOf } from './validate-helpers';
import { SFX_IDS, type Channel, type ToneOpts } from '../audio/backend';
import type { AudioContent, SfxDef, MusicLayer, MusicSceneDef } from './audio';

const CHANNELS: readonly Channel[] = ['music', 'sfx'];
const OSC_TYPES: readonly OscillatorType[] = ['sine', 'square', 'sawtooth', 'triangle', 'custom'];

function tone(raw: unknown, path: string, channel: Channel): ToneOpts {
  const o = asObject(raw, path);
  const t: ToneOpts = {
    channel: oneOf(o.channel, CHANNELS, `${path}.channel`),
    freq: num(o, 'freq', path, { min: 1 }),
    durationMs: num(o, 'durationMs', path, { min: 1 }),
    gain: num(o, 'gain', path, { min: 0, max: 1 }),
  };
  if (o.type !== undefined) t.type = oneOf(o.type, OSC_TYPES, `${path}.type`);
  if (t.channel !== channel) {
    throw new ContentValidationError(`fallbackTone.channel must be '${channel}'`, `${path}.channel`);
  }
  return t;
}

function sfxDef(raw: unknown, path: string): SfxDef {
  const o = asObject(raw, path);
  const def: SfxDef = {
    src: str(o, 'src', path),
    gain: num(o, 'gain', path, { min: 0, max: 1 }),
    maxVoices: num(o, 'maxVoices', path, { min: 1, int: true }),
    fallbackTone: tone(o.fallbackTone, `${path}.fallbackTone`, 'sfx'),
  };
  if (o.rateLimitMs !== undefined) def.rateLimitMs = num(o, 'rateLimitMs', path, { min: 0 });
  return def;
}

function musicScene(raw: unknown, path: string): MusicSceneDef {
  const o = asObject(raw, path);
  const scene = oneOf(o.scene, ['Playing', 'MainMenu'] as const, `${path}.scene`);
  const layersRaw = asArray(o.layers, `${path}.layers`);
  if (layersRaw.length === 0) throw new ContentValidationError('layers must be non-empty', `${path}.layers`);
  const layers: MusicLayer[] = layersRaw.map((l, i) => {
    const lo = asObject(l, `${path}.layers[${i}]`);
    return {
      id: str(lo, 'id', `${path}.layers[${i}]`),
      src: str(lo, 'src', `${path}.layers[${i}]`),
      fallbackTone: tone(lo.fallbackTone, `${path}.layers[${i}].fallbackTone`, 'music'),
    };
  });
  const thresholds = asArray(o.intensityThresholds, `${path}.intensityThresholds`).map((v, i) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      throw new ContentValidationError('threshold must be a number', `${path}.intensityThresholds[${i}]`);
    }
    return v;
  });
  if (thresholds.length !== layers.length) {
    throw new ContentValidationError('intensityThresholds must match layers length', `${path}.intensityThresholds`);
  }
  let prevThreshold = -Infinity;
  for (const t of thresholds) {
    if (t < prevThreshold) {
      throw new ContentValidationError('intensityThresholds must be ascending', `${path}.intensityThresholds`);
    }
    prevThreshold = t;
  }
  return { scene, layers, intensityThresholds: thresholds };
}

export function validateAudioContent(raw: unknown): AudioContent {
  const path = 'content.audio';
  const root = asObject(raw, path);

  const sfxRaw = asObject(root.sfx, `${path}.sfx`);
  const sfx = {} as AudioContent['sfx'];
  for (const id of SFX_IDS) {
    if (!(id in sfxRaw)) throw new ContentValidationError(`missing sfx '${id}'`, `${path}.sfx`);
    sfx[id] = sfxDef(sfxRaw[id], `${path}.sfx.${id}`);
  }

  const musicRaw = asArray(root.music, `${path}.music`);
  if (musicRaw.length === 0) throw new ContentValidationError('music must be non-empty', `${path}.music`);
  const music = musicRaw.map((m, i) => musicScene(m, `${path}.music[${i}]`));

  const duckRaw = asObject(root.ducking, `${path}.ducking`);
  const duck = (key: 'dialog' | 'incident'): { amount: number; ms: number } => {
    const d = asObject(duckRaw[key], `${path}.ducking.${key}`);
    return {
      amount: num(d, 'amount', `${path}.ducking.${key}`, { min: 0, max: 1 }),
      ms: num(d, 'ms', `${path}.ducking.${key}`, { min: 0 }),
    };
  };

  return {
    sfx,
    music,
    ducking: { dialog: duck('dialog'), incident: duck('incident') },
    usePlaceholders: bool(root, 'usePlaceholders', path),
  };
}
