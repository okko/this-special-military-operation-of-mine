import { describe, it, expect, vi } from 'vitest';
import { createStorage, createMemoryBackend, type StorageBackend } from './storage';

describe('createStorage (in-memory backend)', () => {
  it('round-trips set → get', () => {
    const s = createStorage(createMemoryBackend());
    s.set('thing', { a: 1, b: 'x' });
    expect(s.get('thing', { a: 0, b: '' })).toEqual({ a: 1, b: 'x' });
  });

  it('returns the fallback for a missing key', () => {
    expect(createStorage(createMemoryBackend()).get('nope', 42)).toBe(42);
  });

  it('returns the fallback for corrupt JSON', () => {
    const backend = createMemoryBackend();
    backend.setItem('orpd:bad', '{not json');
    expect(createStorage(backend).get('bad', 'default')).toBe('default');
  });

  it('returns the fallback for a non-envelope value', () => {
    const backend = createMemoryBackend();
    backend.setItem('orpd:weird', JSON.stringify([1, 2, 3]));
    expect(createStorage(backend).get('weird', 'd')).toBe('d');
  });

  it('returns the fallback when the envelope has no numeric version', () => {
    const backend = createMemoryBackend();
    backend.setItem('orpd:v', JSON.stringify({ data: { x: 1 } }));
    expect(createStorage(backend).get('v', { x: 0 })).toEqual({ x: 0 });
  });

  it('tolerates a newer schema version (returns defaults, no crash)', () => {
    const backend = createMemoryBackend();
    backend.setItem('orpd:future', JSON.stringify({ version: 999, data: { x: 1 } }));
    expect(createStorage(backend, { version: 1 }).get('future', { x: 0 })).toEqual({ x: 0 });
  });

  it('remove deletes a key', () => {
    const backend = createMemoryBackend();
    const s = createStorage(backend);
    s.set('k', 1);
    s.remove('k');
    expect(s.get('k', -1)).toBe(-1);
  });
});

describe('migrations chain', () => {
  it('runs the chain in order and re-saves at the current version', () => {
    const backend = createMemoryBackend();
    backend.setItem('orpd:save', JSON.stringify({ version: 1, data: { n: 1 } }));
    const migrate = vi.fn((d: unknown) => ({ n: (d as { n: number }).n + 41 }));
    const s = createStorage(backend, { version: 2, migrations: [migrate] });

    expect(s.get('save', { n: 0 })).toEqual({ n: 42 });
    expect(migrate).toHaveBeenCalledOnce();
    expect(JSON.parse(backend.getItem('orpd:save') ?? '')).toEqual({ version: 2, data: { n: 42 } });
  });

  it('returns defaults when a required migration is missing', () => {
    const backend = createMemoryBackend();
    backend.setItem('orpd:save', JSON.stringify({ version: 1, data: { n: 1 } }));
    const s = createStorage(backend, { version: 3, migrations: [] });
    expect(s.get('save', { n: 0 })).toEqual({ n: 0 });
  });
});

describe('write-time fallback (iOS Private Mode)', () => {
  it('falls back to in-memory when the FIRST setItem throws after a clean construction', () => {
    let throwOnSet = false;
    const inner = createMemoryBackend();
    const backend: StorageBackend = {
      getItem: (k) => inner.getItem(k), // construction-time reads succeed
      setItem: (k, v) => {
        if (throwOnSet) throw new Error('QuotaExceededError');
        inner.setItem(k, v);
      },
      removeItem: (k) => inner.removeItem(k),
    };
    const s = createStorage(backend); // clean construction — no probe write
    throwOnSet = true; // now the first real write throws

    expect(() => s.set('k', { v: 1 })).not.toThrow();
    expect(s.get('k', { v: 0 })).toEqual({ v: 1 }); // served from the in-memory fallback
    s.set('k', { v: 2 });
    expect(s.get('k', { v: 0 })).toEqual({ v: 2 });
  });

  it('falls back (and never throws) when getItem throws', () => {
    const backend: StorageBackend = {
      getItem: () => {
        throw new Error('boom');
      },
      setItem: () => {},
      removeItem: () => {},
    };
    const s = createStorage(backend);
    expect(s.get('k', 'fb')).toBe('fb');
    s.set('k', 'hello');
    expect(s.get('k', 'fb')).toBe('hello'); // now from the in-memory fallback
  });

  it('does not throw when remove fails', () => {
    const backend: StorageBackend = {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {
        throw new Error('boom');
      },
    };
    expect(() => createStorage(backend).remove('k')).not.toThrow();
  });
});
