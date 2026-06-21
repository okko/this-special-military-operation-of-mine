import { describe, it, expect, vi } from 'vitest';
import { createEventBus } from '../core/events';
import { wireGameOver } from './gameover-wiring';
import type { SceneManager } from '../state/scene-manager';
import type { MetaStatsRepo } from './meta-stats-repo';
import type { MetaStats, RunSummary } from './schemas';

describe('wireGameOver', () => {
  it('records the run and transitions to GameOver when the gameOver event fires', () => {
    const events = createEventBus();
    const recorded: RunSummary[] = [];
    const metaRepo: MetaStatsRepo = {
      get: () => ({}) as MetaStats,
      recordRun: (s) => {
        recorded.push(s);
        return {} as MetaStats;
      },
      markIntroSeen: () => {},
    };
    const transition = vi.fn();
    const manager = { transition } as unknown as SceneManager;

    wireGameOver(events, manager, metaRepo);
    events.emit('gameOver', { score: 4200, cause: 'compound-crisis', shiftSeconds: 188, dronesDowned: 73 });

    expect(recorded).toEqual([
      { score: 4200, shiftSeconds: 188, dronesDowned: 73, cause: 'compound-crisis' },
    ]);
    expect(transition).toHaveBeenCalledWith('GameOver', { score: 4200, cause: 'compound-crisis' });
  });

  it('unsubscribes via the returned function', () => {
    const events = createEventBus();
    const transition = vi.fn();
    const metaRepo: MetaStatsRepo = {
      get: () => ({}) as MetaStats,
      recordRun: () => ({}) as MetaStats,
      markIntroSeen: () => {},
    };
    const off = wireGameOver(events, { transition } as unknown as SceneManager, metaRepo);
    off();
    events.emit('gameOver', { score: 1, cause: 'x', shiftSeconds: 1, dronesDowned: 1 });
    expect(transition).not.toHaveBeenCalled();
  });
});
