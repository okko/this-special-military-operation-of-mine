import { describe, it, expect } from 'vitest';
import { createStorage, createMemoryBackend } from './storage';
import { createSettingsRepo } from './settings-repo';
import { DEFAULT_SETTINGS } from './schemas';

describe('SettingsRepo', () => {
  it('returns defaults when nothing is stored', () => {
    const repo = createSettingsRepo(createStorage(createMemoryBackend()));
    expect(repo.get()).toEqual(DEFAULT_SETTINGS);
  });

  it('patch merges and persists; a fresh repo reads the patched values', () => {
    const backend = createMemoryBackend();
    const repo = createSettingsRepo(createStorage(backend));
    repo.patch({ muted: true, masterVolume: 0.1 });

    const reloaded = createSettingsRepo(createStorage(backend));
    expect(reloaded.get().muted).toBe(true);
    expect(reloaded.get().masterVolume).toBe(0.1);
    expect(reloaded.get().musicVolume).toBe(DEFAULT_SETTINGS.musicVolume); // untouched
  });

  it('merges nested bindings and accessibility rather than replacing wholesale', () => {
    const repo = createSettingsRepo(createStorage(createMemoryBackend()));
    repo.patch({ bindings: { fire: 'KeyF' } });
    const s = repo.patch({ accessibility: { ...DEFAULT_SETTINGS.accessibility, reducedFlash: true } });
    expect(s.bindings.fire).toBe('KeyF');
    expect(s.bindings.rotateLeft).toBe(DEFAULT_SETTINGS.bindings.rotateLeft); // preserved
    expect(s.accessibility.reducedFlash).toBe(true);
  });

  it('reset restores defaults', () => {
    const repo = createSettingsRepo(createStorage(createMemoryBackend()));
    repo.patch({ muted: true });
    expect(repo.reset()).toEqual(DEFAULT_SETTINGS);
    expect(repo.get().muted).toBe(false);
  });

  it('coerces corrupt stored data back onto defaults', () => {
    const backend = createMemoryBackend();
    backend.setItem(
      'orpd:settings',
      JSON.stringify({ version: 1, data: { masterVolume: 'loud', accessibility: 5, bindings: { fire: 9 } } }),
    );
    const repo = createSettingsRepo(createStorage(backend));
    const s = repo.get();
    expect(s.masterVolume).toBe(DEFAULT_SETTINGS.masterVolume); // bad number ignored
    expect(s.accessibility).toEqual(DEFAULT_SETTINGS.accessibility); // bad object ignored
    expect(s.bindings.fire).toBe(DEFAULT_SETTINGS.bindings.fire); // non-string binding ignored
  });
});
