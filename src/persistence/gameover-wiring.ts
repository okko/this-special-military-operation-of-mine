/**
 * Glue between the `gameOver` event and persistence + scene routing
 * (docs/areas/09-state-and-persistence.md §3.3, §7). On game over it records the run into
 * MetaStats and transitions to the GameOver scene (which later decides HighscoreEntry vs
 * Highscores via the HighscoresRepo). The emit comes from the Gameplay Engine (area 01) in a
 * later phase; here it is wired and unit-tested against a fake bus. Returns an unsubscribe fn.
 */
import type { EventBus } from '../core/events';
import type { SceneManager } from '../state/scene-manager';
import type { MetaStatsRepo } from './meta-stats-repo';

export function wireGameOver(
  events: EventBus,
  manager: SceneManager,
  metaRepo: MetaStatsRepo,
): () => void {
  return events.on('gameOver', (p) => {
    metaRepo.recordRun({
      score: p.score,
      shiftSeconds: p.shiftSeconds,
      dronesDowned: p.dronesDowned,
      cause: p.cause,
    });
    manager.transition('GameOver', { score: p.score, cause: p.cause });
  });
}
