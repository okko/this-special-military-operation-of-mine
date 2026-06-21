import { describe, it, expect, vi } from 'vitest';
import { createBootScene } from './boot-scene';
import type { SceneManager } from './scene-manager';
import type { MetaStatsRepo } from '../persistence/meta-stats-repo';
import type { MetaStats } from '../persistence/schemas';
import type { SystemContext } from '../core/system-context';

describe('createBootScene', () => {
  it('marks the intro seen and transitions to MainMenu on enter', () => {
    const markIntroSeen = vi.fn();
    const transition = vi.fn();
    const meta: MetaStatsRepo = {
      get: () => ({}) as MetaStats,
      recordRun: () => ({}) as MetaStats,
      markIntroSeen,
    };
    const manager = { transition } as unknown as SceneManager;

    const scene = createBootScene(manager, meta);
    scene.enter(undefined, {} as SystemContext);

    expect(markIntroSeen).toHaveBeenCalledOnce();
    expect(transition).toHaveBeenCalledWith('MainMenu');
  });
});
