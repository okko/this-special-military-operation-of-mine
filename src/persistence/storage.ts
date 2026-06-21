/**
 * Versioned, migration-aware localStorage wrapper (docs/areas/09-state-and-persistence.md §3.2).
 * Every value is namespaced under `orpd:` and wrapped in a `{ version, data }` envelope. Corrupt,
 * missing, or unavailable storage NEVER throws — it resolves to the caller's fallback.
 *
 * The load-bearing iOS detail (docs/compatibility.md §6): Safari Private Mode throws
 * QuotaExceededError on the FIRST setItem, not at construction. A construction-time probe is
 * therefore insufficient — we catch at WRITE time and transparently swap the live backend to an
 * in-memory one so the game keeps running (data just doesn't persist).
 */

export interface StorageBackend {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface Storage {
  get<T>(key: string, fallback: T): T;
  set<T>(key: string, value: T): void;
  remove(key: string): void;
}

export const SCHEMA_VERSION = 1;
export type Migration = (data: unknown) => unknown;
/** Index i migrates v(i+1) → v(i+2). Empty in Phase 1; the chain engine is exercised by tests. */
export const MIGRATIONS: Migration[] = [];

const NS = 'orpd:';

export function createMemoryBackend(): StorageBackend {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v);
    },
    removeItem: (k) => {
      map.delete(k);
    },
  };
}

function detectBackend(): StorageBackend {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    // Accessing localStorage can itself throw in some sandboxed contexts.
  }
  return createMemoryBackend();
}

export interface CreateStorageOptions {
  version?: number;
  migrations?: Migration[];
}

export function createStorage(backend?: StorageBackend, opts?: CreateStorageOptions): Storage {
  const version = opts?.version ?? SCHEMA_VERSION;
  const migrations = opts?.migrations ?? MIGRATIONS;
  let active: StorageBackend = backend ?? detectBackend();

  // Swap the live backend to a fresh in-memory one. Called only from a real backend's thrown
  // call; once swapped, the in-memory backend never throws, so this runs at most once per store.
  function fallbackToMemory(): void {
    active = createMemoryBackend();
  }

  function get<T>(key: string, fallback: T): T {
    let raw: string | null;
    try {
      raw = active.getItem(NS + key);
    } catch {
      fallbackToMemory();
      return fallback;
    }
    if (raw === null) return fallback;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return fallback;
    }
    if (typeof parsed !== 'object' || parsed === null) return fallback;

    const env = parsed as Record<string, unknown>;
    if (typeof env.version !== 'number') return fallback;
    if (env.version > version) return fallback; // newer than we understand → defaults

    let data: unknown = env.data;
    let v = env.version;
    while (v < version) {
      const migrate = migrations[v - 1];
      if (migrate === undefined) return fallback; // missing migration → defaults (defensive)
      data = migrate(data);
      v += 1;
    }
    if (v !== env.version) {
      // Persist the upgraded blob so the migration runs only once.
      try {
        active.setItem(NS + key, JSON.stringify({ version: v, data }));
      } catch {
        fallbackToMemory();
      }
    }
    return data as T;
  }

  function set<T>(key: string, value: T): void {
    const payload = JSON.stringify({ version, data: value });
    try {
      active.setItem(NS + key, payload);
    } catch {
      // First-write failure (iOS Private Mode): swap to memory and replay, swallowing the error.
      fallbackToMemory();
      try {
        active.setItem(NS + key, payload);
      } catch {
        // Memory backend cannot throw; ignore to guarantee no exception escapes.
      }
    }
  }

  function remove(key: string): void {
    try {
      active.removeItem(NS + key);
    } catch {
      fallbackToMemory();
    }
  }

  return { get, set, remove };
}
