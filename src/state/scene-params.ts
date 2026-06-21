/**
 * Typed transition parameters (docs/areas/09-state-and-persistence.md §3.1.7). Makes
 * `transition`/`enter` type-safe per destination rather than `unknown`. A new shared contract:
 * scene-owning areas (Gameplay, Highscores, GameOver routing) agree on these payloads. The
 * `runSummary` carry-through resolves the GameOver → HighscoreEntry data flow.
 */
import type { SceneId } from './scene';
import type { RunSummary } from '../persistence/schemas';

export interface SceneParams {
  Boot: void;
  MainMenu: void;
  Playing: void;
  Paused: void;
  GameOver: { score: number; cause: string };
  HighscoreEntry: { score: number; rank: number; runSummary: RunSummary };
  Highscores: { highlightRank?: number };
  Settings: void;
}

export type ParamsFor<S extends SceneId> = SceneParams[S];
