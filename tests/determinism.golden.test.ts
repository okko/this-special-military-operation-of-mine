import { describe, it, expect } from 'vitest';
import { createRng } from '../src/core/rng';
import { createEventBus } from '../src/core/events';
import { createRegistry } from '../src/core/registry';
import { createClock } from '../src/core/clock';

/**
 * Determinism golden (docs/testing.md §6). "Same seed + same inputs ⇒ identical run" is the
 * project's central testability claim; this guards it. In Phase 1 there is no real GameState yet,
 * so the scripted run exercises the deterministic SUBSTRATE Core owns — seeded RNG, the ECS
 * registry (Map iteration order), the synchronous event bus, and the injected clock — and hashes
 * the result. The full GameState golden lands once the Gameplay Engine (area 01) produces state.
 *
 * If an intended change moves the golden, update GOLDEN deliberately after reviewing the diff —
 * never auto-regenerate in CI.
 */

const GOLDEN = 'e797bfa8';

function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

const KINDS = ['scout', 'bomber', 'swarm', 'armored'] as const;

interface Pos {
  x: number;
  y: number;
}

function scriptedRun(): string {
  const rng = createRng(0x00c0ffee);
  const events = createEventBus();
  const registry = createRegistry();
  const clock = createClock();

  const log: string[] = [];
  let rubles = 0;
  events.on('droneDestroyed', (p) => log.push(`d:${p.id}:${p.kind}:${p.pos.x.toFixed(3)},${p.pos.y.toFixed(3)}`));
  events.on('rublesChanged', (p) => log.push(`r:${p.total}`));

  for (let tick = 0; tick < 600; tick++) {
    clock.advance(1 / 60);

    if (rng.chance(0.5)) {
      const id = registry.create();
      const kind = rng.pick(KINDS);
      registry.add<Pos>(id, 'pos', { x: rng.range(0, 384), y: rng.range(0, 216) });
      registry.add<string>(id, 'kind', kind);
      events.emit('droneSpawned', { id, kind });
    }

    const live = registry.with('pos', 'kind');
    if (live.length > 0 && rng.chance(0.4)) {
      const id = live[rng.int(0, live.length)];
      if (id !== undefined) {
        const pos = registry.get<Pos>(id, 'pos') ?? { x: 0, y: 0 };
        const kind = registry.get<string>(id, 'kind') ?? '?';
        registry.destroy(id);
        rubles += 1;
        events.emit('droneDestroyed', { id, kind, byPlayer: true, pos });
        events.emit('rublesChanged', { delta: 1, total: rubles });
      }
    }
  }

  return fnv1a(
    JSON.stringify({
      rng: rng.getState(),
      shiftSeconds: clock.shiftSeconds.toFixed(6),
      liveCount: registry.all().length,
      rubles,
      log,
    }),
  );
}

describe('determinism golden', () => {
  it('is reproducible across repeated runs (same seed ⇒ identical)', () => {
    expect(scriptedRun()).toBe(scriptedRun());
  });

  it('hashes to the committed golden value', () => {
    expect(scriptedRun()).toBe(GOLDEN);
  });
});
