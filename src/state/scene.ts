/**
 * The Scene contract every scene implements (docs/areas/09-state-and-persistence.md §4). This is
 * the reconciled, canonical form: parameterized `enter(params, ctx)` (typed transition params) and
 * `render(r)` with NO alpha argument — the interpolation factor is read from `Renderer.alpha`.
 */
import type { SystemContext } from '../core/system-context';
import type { InputEvent } from '../input/input';
import type { Renderer } from '../render/renderer';

export type SceneId =
  | 'Boot'
  | 'MainMenu'
  | 'Playing'
  | 'Paused'
  | 'GameOver'
  | 'HighscoreEntry'
  | 'Highscores'
  | 'Settings';

export interface Scene<P = void> {
  /** Called once when the scene becomes active or is pushed as an overlay. */
  enter(params: P, ctx: SystemContext): void;
  /** Fixed-timestep logic tick. NOT called while this scene is frozen beneath an overlay. */
  update(dt: number, ctx: SystemContext): void;
  /** Interpolated draw; read `r.alpha` for tweening. May be called while frozen (drawn behind
   *  an overlay). */
  render(r: Renderer): void;
  onInput(e: InputEvent): void;
  exit(): void;
}
