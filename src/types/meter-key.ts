/**
 * The five need meters (docs/game-design.md §5). Defined here as a cross-cutting shared type
 * so `core/events` can reference it without depending on the Meters area (avoids a cycle).
 * The Meters area (02) refines the meter *behavior*; this union is the canonical key set.
 */
export type MeterKey = 'sleep' | 'poo' | 'hunger' | 'thirst' | 'vice';

export const METER_KEYS: readonly MeterKey[] = ['sleep', 'poo', 'hunger', 'thirst', 'vice'];
