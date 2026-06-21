/**
 * The shared GameState skeleton (docs/architecture.md §4). LEAD-OWNED: each gameplay area refines
 * ONLY its own slice; the foreign slices below are placeholder empty types (`Record<string,
 * never>`) tagged with the area that will refine them, so this skeleton compiles and is importable
 * before those areas exist. `time`, `player`, `rng`, and `flags` are owned here.
 */
import type { RngState } from '../core/rng';

export type MetersState = Record<string, never>; // refined by area 02 (Meters)
export type CombatState = Record<string, never>; // refined by area 01 (Gameplay Engine)
export type ScoringState = Record<string, never>; // refined by area 04 (Scoring)
export type EconomyState = Record<string, never>; // refined by area 03 (Economy & Residents)
export type IncidentsState = Record<string, never>; // refined by area 05 (Random Incidents)

export interface GameState {
  time: { shiftSeconds: number; phase: 'day' | 'night'; difficulty: number };
  player: { rubles: number; debt: number; reputation: number };
  meters: MetersState;
  combat: CombatState;
  scoring: ScoringState;
  economy: EconomyState;
  incidents: IncidentsState;
  rng: RngState;
  flags: Record<string, boolean>;
}
