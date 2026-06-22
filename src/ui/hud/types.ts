/**
 * HUD public contract (docs/areas/10-hud-ui.md §4). The HUD is an overlay component composed by the
 * `Playing` scene: it READS `GameState` and emits player intents, but never mutates gameplay state.
 * `SettingsView` is the accessibility/keybind projection the HUD reads (sourced from the Settings repo
 * by the host). `ResidentMenuModel` is the read-only view the Economy area supplies for the panel.
 */
import type { GameState } from '../../state/game-state';
import type { Renderer } from '../../render/renderer';
import type { InputEvent } from '../../input/input';

export interface SettingsView {
  reducedFlash: boolean;
  largeHudText: boolean;
  pauseWhilePanelOpen: boolean;
  residentPanelKey: string; // default 'KeyE'
}

export interface Hud {
  /** Advance HUD animations; reads (never mutates) state. */
  update(dt: number, state: GameState): void;
  /** Draw the overlay above the world. */
  render(r: Renderer, state: GameState): void;
  /** Returns true if the event was consumed by the panel; false → passes to the gun. */
  onInput(e: InputEvent, state: GameState): boolean;
  isPanelOpen(): boolean;
  /** True only when the panel is open AND pauseWhilePanelOpen is set. */
  wantsPause(): boolean;
}

/** Read-only menu view the HUD consumes from the Economy area (Economy computes it). */
export interface ResidentMenuModel {
  residents: ResidentMenuEntry[];
}

export interface ResidentMenuEntry {
  residentId: string;
  name: string;
  floor: number;
  reputation: number;
  services: MenuOption[]; // BUY — already filtered to currently available
  favors: MenuOption[]; // BEG — present (typically) only when broke
}

export interface MenuOption {
  id: string;
  label: string;
  costRubles?: number; // services only
  affordable?: boolean; // services only
  consequencePreview?: string; // favors only
  disabledReason?: string; // if set, render greyed; selection blocked
}

/** The economy selector the HUD depends on (the host supplies an adapter over the Economy area). */
export interface HudEconomy {
  getAvailableInteractions(state: GameState): ResidentMenuModel;
}
