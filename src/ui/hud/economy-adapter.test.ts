import { describe, it, expect } from 'vitest';
import { createHudEconomy } from './economy-adapter';
import { createTestContent } from '../../test-support/content';
import { makeTestGameState } from '../../test-support/game-state';
import type { GameState } from '../../state/game-state';
import type { ResidentMenuEntry } from './types';

const content = createTestContent();
const hudEconomy = createHudEconomy(content);

function entry(state: GameState, id: string): ResidentMenuEntry {
  const e = hudEconomy.getAvailableInteractions(state).residents.find((r) => r.residentId === id);
  if (!e) throw new Error(`no entry for ${id}`);
  return e;
}

describe('createHudEconomy adapter (§8.11 model derivation)', () => {
  it('groups the flat selector output per resident with name/floor/reputation', () => {
    const gs = makeTestGameState(content);
    gs.economy.relationships['babushka'] = 42;
    const e = entry(gs, 'babushka');
    expect(e.name).toBe('Galina Petrovna');
    expect(e.floor).toBe(3);
    expect(e.reputation).toBe(42);
    expect(e.services.map((s) => s.id)).toEqual(['stew', 'tea']);
  });

  it('marks services affordable / too-pricey from the ruble balance and applies the price multiplier', () => {
    // An unaffordable service is still offerable (listed with affordable:false) — only tag-disabled
    // services / refused favors carry a disabledReason and get greyed (§3.5).
    const broke = makeTestGameState(content);
    broke.economy.rubles = 0;
    const stewBroke = entry(broke, 'babushka').services.find((s) => s.id === 'stew');
    expect(stewBroke).toMatchObject({ costRubles: 4, affordable: false });
    expect(stewBroke?.disabledReason).toBeUndefined();

    const rich = makeTestGameState(content);
    rich.economy.rubles = 100;
    rich.economy.priceMultiplier = 2;
    const stewRich = entry(rich, 'babushka').services.find((s) => s.id === 'stew');
    expect(stewRich).toMatchObject({ costRubles: 8, affordable: true });
    expect(stewRich?.disabledReason).toBeUndefined();
  });

  it('offers favors only while broke and previews their consequence', () => {
    const broke = makeTestGameState(content);
    broke.economy.rubles = 0;
    const leftoversBroke = entry(broke, 'babushka').favors.find((f) => f.id === 'leftovers');
    expect(leftoversBroke?.disabledReason).toBeUndefined();
    expect(leftoversBroke?.consequencePreview).toBe('Weaker than paying'); // degraded consequence

    const rich = makeTestGameState(content);
    rich.economy.rubles = 50;
    const leftoversRich = entry(rich, 'babushka').favors.find((f) => f.id === 'leftovers');
    expect(leftoversRich?.disabledReason).toBe('Only when broke');
  });

  it('greys a service whose tag an incident has disabled', () => {
    const gs = makeTestGameState(content);
    gs.economy.rubles = 100;
    gs.economy.disabledServiceTags = ['toilet'];
    const toilet = entry(gs, 'plumber').services.find((s) => s.id === 'toilet');
    expect(toilet?.disabledReason).toBe('Unavailable now');
  });
});
