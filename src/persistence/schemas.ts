/**
 * Persisted data schemas + documented defaults (docs/areas/09-state-and-persistence.md §5).
 * `HighscoreEntry` is the reconciled superset of areas 08 & 09 (`shiftSeconds` + optional
 * `notable`), kept here as the single source of truth so the Highscores area imports it rather
 * than redeclaring it. `dateISO` is supplied by the caller at save time — never read from a clock
 * in logic (docs/architecture.md §3).
 */

export interface HighscoreEntry {
  name: string; // 3-char initials by default; Highscores area may widen
  score: number;
  shiftSeconds: number;
  dronesDowned: number;
  dateISO: string;
  notable?: string;
}

export interface Settings {
  masterVolume: number; // 0..1
  musicVolume: number; // 0..1
  sfxVolume: number; // 0..1
  muted: boolean;
  bindings: Record<string, string>; // action -> key/code
  accessibility: {
    highContrast: boolean;
    reducedFlash: boolean;
    reducedMotion: boolean; // added for the Art area (overlay/animation gating)
    largeHud: boolean;
    pauseWhilePanelOpen: boolean; // HUD area: freeze the sim while the resident panel is open (10 §3.5)
  };
}

export interface RunSummary {
  score: number;
  shiftSeconds: number;
  dronesDowned: number;
  cause: string;
}

export interface MetaStats {
  bestShiftSeconds: number;
  lifetimeDronesDowned: number;
  lifetimeRuns: number;
  lastRun: RunSummary | null;
  introSeen: boolean;
}

export const HIGHSCORES_MAX = 10;
export const MAX_NAME_LEN = 12;

export const DEFAULT_SETTINGS: Settings = {
  masterVolume: 0.8,
  musicVolume: 0.6,
  sfxVolume: 0.8,
  muted: false,
  bindings: { rotateLeft: 'KeyA', rotateRight: 'KeyD', fire: 'Space', residentPanel: 'KeyE' },
  accessibility: {
    highContrast: false,
    reducedFlash: false,
    reducedMotion: false,
    largeHud: false,
    pauseWhilePanelOpen: false,
  },
};

export const DEFAULT_META: MetaStats = {
  bestShiftSeconds: 0,
  lifetimeDronesDowned: 0,
  lifetimeRuns: 0,
  lastRun: null,
  introSeen: false,
};

// Storage keys (all under the `orpd:` namespace, applied by the storage wrapper).
export const KEY_HIGHSCORES = 'highscores';
export const KEY_SETTINGS = 'settings';
export const KEY_META = 'meta';
