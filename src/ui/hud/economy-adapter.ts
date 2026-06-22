/**
 * HUD ↔ Economy adapter (docs/areas/10-hud-ui.md §3.5/§4). Wraps the Economy area's flat
 * `getAvailableInteractions` selector into the grouped, read-only `ResidentMenuModel` the panel
 * consumes. Pure: it computes no economy rules of its own — it groups what the selector returns,
 * attaches each resident's name/floor/reputation, and renders favor consequences + disabled reasons
 * as short human-readable strings. The HUD lists exactly these entries and applies no economy logic.
 */
import { getAvailableInteractions } from '../../systems/economy';
import type { EconomyError } from '../../systems/economy';
import type { Content } from '../../content/loader';
import type { GameState } from '../../state/game-state';
import type { Consequence } from '../../content/residents';
import type { HudEconomy, ResidentMenuEntry, ResidentMenuModel, MenuOption } from './types';

function describeConsequence(c: Consequence): string {
  switch (c.kind) {
    case 'debt':
      return `Owe ₽${c.amount} later`;
    case 'chore':
      return `A ${c.durationSeconds}s chore`;
    case 'reputation':
      return `Costs ${c.amount} reputation`;
    case 'degraded':
      return 'Weaker than paying';
  }
}

function reasonText(reason: EconomyError | undefined): string | undefined {
  switch (reason) {
    case 'INSUFFICIENT_FUNDS':
      return 'Too pricey';
    case 'SERVICE_DISABLED':
      return 'Unavailable now';
    case 'NOT_BROKE':
      return 'Only when broke';
    case 'FAVOR_REFUSED':
      return 'They refuse';
    default:
      return undefined;
  }
}

export function createHudEconomy(content: Content): HudEconomy {
  return {
    getAvailableInteractions(state: GameState): ResidentMenuModel {
      const options = getAvailableInteractions(state.economy, content);
      const byId = new Map<string, ResidentMenuEntry>();
      const start = content.economy.tunables.startingRelationship;

      const residents: ResidentMenuEntry[] = content.economy.roster.map((res) => {
        const entry: ResidentMenuEntry = {
          residentId: res.id,
          name: res.name,
          floor: res.floor,
          reputation: Math.round(state.economy.relationships[res.id] ?? start),
          services: [],
          favors: [],
        };
        byId.set(res.id, entry);
        return entry;
      });

      for (const opt of options) {
        const entry = byId.get(opt.residentId);
        if (!entry) continue;
        const disabledReason = opt.offerable ? undefined : reasonText(opt.reason);
        const mo: MenuOption = { id: opt.id, label: opt.label };
        if (disabledReason) mo.disabledReason = disabledReason;
        if (opt.kind === 'service') {
          if (opt.effectivePrice !== null) mo.costRubles = opt.effectivePrice;
          mo.affordable = opt.affordable;
          entry.services.push(mo);
        } else {
          const favor = content.economy.roster
            .find((r) => r.id === opt.residentId)
            ?.favors.find((f) => f.id === opt.id);
          if (favor) mo.consequencePreview = describeConsequence(favor.consequence);
          entry.favors.push(mo);
        }
      }
      return { residents };
    },
  };
}
