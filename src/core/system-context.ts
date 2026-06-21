/**
 * The injected capabilities every system receives (docs/architecture.md §4). Keeping these on a
 * single context object — rather than importing singletons — is what makes systems pure and
 * testable. Note it carries NO persistence types: repos are injected into scene factories via
 * closures (a deliberate decision to keep this Core type free of the persistence layer).
 */
import type { Rng } from './rng';
import type { EventBus } from './events';
import type { Content } from '../content/loader';

export interface SystemContext {
  rng: Rng;
  events: EventBus;
  content: Content;
}
