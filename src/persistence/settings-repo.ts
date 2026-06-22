/**
 * Settings repository (docs/areas/09-state-and-persistence.md §4). Reads tolerate any shape by
 * coercing onto the documented defaults (corrupt/partial data never crashes). Writes are
 * immediate (debouncing is a caller concern). `patch` accepts a top-level Partial<Settings>;
 * nested `bindings`/`accessibility` are merged.
 */
import type { Storage } from './storage';
import { DEFAULT_SETTINGS, KEY_SETTINGS, type Settings } from './schemas';

function num(v: unknown, d: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : d;
}
function bool(v: unknown, d: boolean): boolean {
  return typeof v === 'boolean' ? v : d;
}

function coerce(raw: unknown): Settings {
  const base = DEFAULT_SETTINGS;
  const r = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const acc =
    typeof r.accessibility === 'object' && r.accessibility !== null
      ? (r.accessibility as Record<string, unknown>)
      : {};
  const bindings: Record<string, string> = { ...base.bindings };
  if (typeof r.bindings === 'object' && r.bindings !== null) {
    for (const [k, v] of Object.entries(r.bindings)) {
      if (typeof v === 'string') bindings[k] = v;
    }
  }
  return {
    masterVolume: num(r.masterVolume, base.masterVolume),
    musicVolume: num(r.musicVolume, base.musicVolume),
    sfxVolume: num(r.sfxVolume, base.sfxVolume),
    muted: bool(r.muted, base.muted),
    bindings,
    accessibility: {
      highContrast: bool(acc.highContrast, base.accessibility.highContrast),
      reducedFlash: bool(acc.reducedFlash, base.accessibility.reducedFlash),
      reducedMotion: bool(acc.reducedMotion, base.accessibility.reducedMotion),
      largeHud: bool(acc.largeHud, base.accessibility.largeHud),
      pauseWhilePanelOpen: bool(acc.pauseWhilePanelOpen, base.accessibility.pauseWhilePanelOpen),
    },
  };
}

export interface SettingsRepo {
  get(): Settings;
  patch(partial: Partial<Settings>): Settings;
  reset(): Settings;
}

export function createSettingsRepo(storage: Storage): SettingsRepo {
  function get(): Settings {
    return coerce(storage.get<unknown>(KEY_SETTINGS, null));
  }
  return {
    get,
    patch(partial: Partial<Settings>): Settings {
      const current = get();
      const next: Settings = {
        ...current,
        ...partial,
        bindings: { ...current.bindings, ...(partial.bindings ?? {}) },
        accessibility: { ...current.accessibility, ...(partial.accessibility ?? {}) },
      };
      storage.set(KEY_SETTINGS, next);
      return next;
    },
    reset(): Settings {
      const fresh = coerce(null);
      storage.set(KEY_SETTINGS, fresh);
      return fresh;
    },
  };
}
