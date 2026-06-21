/**
 * Test-only `SystemContext` factory: a seeded RNG, a fresh event bus, and validated test content.
 * Convenience for the pure-system unit tests; the returned `ctx.events` can be subscribed to for
 * event assertions.
 */
import { createRng } from '../core/rng';
import { createEventBus } from '../core/events';
import { createTestContent } from './content';
import type { SystemContext } from '../core/system-context';
import type { Content } from '../content/loader';

export function createTestContext(opts: { seed?: number; content?: Partial<Content> } = {}): SystemContext {
  return {
    rng: createRng(opts.seed ?? 0x12345),
    events: createEventBus(),
    content: createTestContent(opts.content),
  };
}
