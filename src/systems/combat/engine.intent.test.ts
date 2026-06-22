import { describe, it, expect } from 'vitest';
import { createEngine } from './engine';
import { setJam } from './combat';
import { createTestContext } from '../../test-support/context';
import { makeTestGameState } from '../../test-support/game-state';

/**
 * The Engine's resident-panel intent consumer (docs/areas/10-hud-ui.md §3.5 / 01 integration): the HUD
 * emits `residentIntent`; the Engine applies it through the Economy flows + relief bridge, and enacts
 * the gun-jam fix for the 'gun'-tagged service / relief-less favor that Economy can't enact itself.
 */
describe('engine — residentIntent consumer', () => {
  it('applies a bought service: deducts rubles and relieves the meter', () => {
    const ctx = createTestContext();
    const gs = makeTestGameState(ctx.content);
    createEngine(gs, ctx);
    gs.economy.rubles = 10;
    gs.meters.values.hunger = 80;

    ctx.events.emit('residentIntent', { kind: 'buyService', residentId: 'babushka', serviceId: 'stew' });

    expect(gs.economy.rubles).toBe(6); // stew costs 4
    expect(gs.meters.values.hunger).toBeLessThan(80); // stew relieves hunger
  });

  it('clears the gun jam when a gun-tagged service is bought', () => {
    const ctx = createTestContext();
    const gs = makeTestGameState(ctx.content);
    createEngine(gs, ctx);
    gs.economy.rubles = 10;
    setJam(gs.combat, true);
    expect(gs.combat.gun.jammed).toBe(true);

    ctx.events.emit('residentIntent', { kind: 'buyService', residentId: 'mechanic', serviceId: 'clearjam' });

    expect(gs.combat.gun.jammed).toBe(false);
    expect(gs.economy.rubles).toBe(6); // clearjam costs 4
  });

  it('applies a begged favor while broke and takes on its debt consequence', () => {
    const ctx = createTestContext();
    const gs = makeTestGameState(ctx.content);
    createEngine(gs, ctx);
    gs.economy.rubles = 0; // broke → favors offerable
    setJam(gs.combat, true);

    ctx.events.emit('residentIntent', { kind: 'begFavor', residentId: 'mechanic', favorId: 'jamiou' });

    expect(gs.combat.gun.jammed).toBe(false); // relief-less favor → Engine clears the jam on credit
    expect(gs.economy.debt).toBe(6); // jamiou's debt consequence
  });

  it('ignores an invalid intent and a closePanel intent', () => {
    const ctx = createTestContext();
    const gs = makeTestGameState(ctx.content);
    createEngine(gs, ctx);
    gs.economy.rubles = 5;

    ctx.events.emit('residentIntent', { kind: 'buyService', residentId: 'nobody', serviceId: 'nope' });
    ctx.events.emit('residentIntent', { kind: 'closePanel' });

    expect(gs.economy.rubles).toBe(5); // unchanged
  });

  it('stops consuming intents after dispose()', () => {
    const ctx = createTestContext();
    const gs = makeTestGameState(ctx.content);
    const engine = createEngine(gs, ctx);
    gs.economy.rubles = 10;
    engine.dispose();

    ctx.events.emit('residentIntent', { kind: 'buyService', residentId: 'babushka', serviceId: 'stew' });

    expect(gs.economy.rubles).toBe(10); // unsubscribed
  });
});
