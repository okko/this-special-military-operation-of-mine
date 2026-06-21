/**
 * The single source of truth for every sprite id (docs/areas/11-art-visual-style.md §4).
 * Every area imports `SpriteId` from here instead of hard-coding string ids — the usage scan
 * (sprite-id-usage.test.ts) enforces it. `portrait.<id>` ids are registered dynamically from
 * the resident roster (Economy area), so they are admitted via the template-literal arm.
 */
export const SPRITE_IDS = [
  'soldier.idle',
  'soldier.fire',
  'soldier.tired',
  'soldier.crisis',
  'gun.base',
  'gun.flash',
  'drone.scout',
  'drone.bomber',
  'drone.swarm',
  'drone.armored',
  'drone.special',
  'drone.boss',
  'decoy.bird',
  'fx.tracer',
  'fx.explosion',
  'fx.spark',
  'fx.drip',
  'pickup.ruble',
  'ui.panel',
  'ui.panel.corner',
  'ui.meter.frame',
  'ui.meter.fill',
  'ui.btn',
  'ui.btn.hover',
  'ui.btn.press',
  'icon.sleep',
  'icon.poo',
  'icon.hunger',
  'icon.thirst',
  'icon.vice',
  'icon.ruble',
  'bg.sun',
  'bg.moon',
  'font.display',
  'font.hud',
] as const;

export type SpriteId = (typeof SPRITE_IDS)[number] | `portrait.${string}`;

/** Narrowing guard for the fixed (non-portrait) id set. */
export function isKnownSpriteId(id: string): id is (typeof SPRITE_IDS)[number] {
  return (SPRITE_IDS as readonly string[]).includes(id);
}
