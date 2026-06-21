/**
 * ECS-lite entity/component store (docs/areas/00-core-platform.md §3.6). Numeric entity ids
 * plus a typed component map per component key. Chosen over a class hierarchy for cheap
 * iteration and trivial serialization. Gameplay-agnostic; used by the Gameplay Engine for
 * drones/projectiles/pickups.
 */

export type EntityId = number;

export interface Registry {
  create(): EntityId;
  destroy(id: EntityId): void;
  add<C>(id: EntityId, key: string, c: C): void;
  get<C>(id: EntityId, key: string): C | undefined;
  remove(id: EntityId, key: string): void;
  /** Entities that are live AND carry every named component, in creation order. */
  with(...keys: string[]): EntityId[];
  /** All live entities, in creation order. */
  all(): EntityId[];
}

export function createRegistry(): Registry {
  let nextId = 1;
  // Insertion order = creation order, which keeps iteration deterministic.
  const live = new Set<EntityId>();
  const components = new Map<string, Map<EntityId, unknown>>();

  const store = (key: string): Map<EntityId, unknown> => {
    let m = components.get(key);
    if (!m) {
      m = new Map<EntityId, unknown>();
      components.set(key, m);
    }
    return m;
  };

  return {
    create(): EntityId {
      const id = nextId++;
      live.add(id);
      return id;
    },

    destroy(id: EntityId): void {
      live.delete(id);
      for (const m of components.values()) m.delete(id);
    },

    add<C>(id: EntityId, key: string, c: C): void {
      store(key).set(id, c);
    },

    get<C>(id: EntityId, key: string): C | undefined {
      // Cast required only because Map values are `unknown`; callers own the key→type mapping.
      return components.get(key)?.get(id) as C | undefined;
    },

    remove(id: EntityId, key: string): void {
      components.get(key)?.delete(id);
    },

    with(...keys: string[]): EntityId[] {
      const result: EntityId[] = [];
      for (const id of live) {
        if (keys.every((k) => components.get(k)?.has(id) ?? false)) result.push(id);
      }
      return result;
    },

    all(): EntityId[] {
      return [...live];
    },
  };
}
