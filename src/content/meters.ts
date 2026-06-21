/**
 * Meters balance table (docs/areas/02-meters-and-status.md §5). DATA, not logic: every drain rate,
 * threshold, modifier, debuff coefficient, and relief magnitude lives here so the Meters system
 * (`src/systems/meters.ts`) stays pure and tuning never touches code. Validated at boot by
 * `validateMeterBalance` and exposed as `content.meters`.
 */
import type { MeterKey } from '../types/meter-key';

export interface MeterRates {
  sleep: number;
  poo: number;
  hunger: number;
  thirst: number;
  vice: number;
  /** pts/s subtracted from sleep gain while coffee is active (§3.2). */
  coffeeSleepRelief: number;
}

/** Per-tick gain modifiers (§3.2). */
export interface MeterModifiers {
  nightSleepMul: number; // sleep ×= this at night
  dayThirstMul: number; // thirst ×= this during day
  viceJitterSleepMul: number; // sleep ×= this while vice is in crisis (jitter)
  fireThirstCoeff: number; // thirst += coeff * recentShotRate
  thirstGainMul: number; // while thirst > warn, sleep & hunger gain ×= 1 + mul*severity
}

/** Debuff coefficients applied above each meter's warn threshold (§3.3). */
export interface MeterEffectCoeffs {
  sleepMicroSleep: number;
  sleepVisionDim: number;
  sleepAimSway: number;
  pooMoveSlow: number;
  pooTurnSlow: number;
  hungerAimSway: number;
  hungerInteractSlow: number;
  thirstVisionBlur: number;
  viceAimSway: number;
  drunkAimSway: number; // transient, while drunkTimer > 0
  drunkBias: number; // transient steady aim drift, while drunkTimer > 0
}

/** Relief magnitudes (§3.5); `quality` (0..1) scales these at the call site. */
export interface ReliefMagnitudes {
  foodHunger: number;
  foodPooKick: number; // one-shot poo bump on food
  foodPooKickDegradedExtra: number; // extra bump scaled by (1 - quality)
  waterThirst: number;
  waterPooKick: number;
  toiletPoo: number;
  cigaretteVice: number;
  vodkaVice: number;
  vodkaSleep: number;
  drunkSeconds: number; // drunkTimer set on vodka (× quality)
  coffeeSeconds: number; // coffeeTimer set on coffee (fixed duration)
  napSleep: number;
}

export interface MeterTunables {
  graceSeconds: number; // single-meter crisis timeout → game over
  compoundGrace: number; // seconds with >= 2 crises → game over
  hysteresis: number; // leave-crisis happens below (100 - hysteresis)
  diffCreepPerLevel: number; // all rates ×= 1 + this * difficulty
}

export interface MeterBalance {
  rates: MeterRates;
  warn: Record<MeterKey, number>;
  modifiers: MeterModifiers;
  effects: MeterEffectCoeffs;
  relief: ReliefMagnitudes;
  tunables: MeterTunables;
}

export const meterBalance: MeterBalance = {
  rates: { sleep: 0.45, poo: 0.3, hunger: 0.55, thirst: 0.5, vice: 0.4, coffeeSleepRelief: 1.2 },
  warn: { sleep: 70, poo: 75, hunger: 70, thirst: 70, vice: 65 },
  modifiers: {
    nightSleepMul: 1.8,
    dayThirstMul: 1.4,
    viceJitterSleepMul: 1.5,
    fireThirstCoeff: 0.6,
    thirstGainMul: 0.5,
  },
  effects: {
    sleepMicroSleep: 0.2,
    sleepVisionDim: 0.4,
    sleepAimSway: 0.3,
    pooMoveSlow: 0.5,
    pooTurnSlow: 0.5,
    hungerAimSway: 0.4,
    hungerInteractSlow: 0.5,
    thirstVisionBlur: 0.6,
    viceAimSway: 0.5,
    drunkAimSway: 0.8,
    drunkBias: 0.5,
  },
  relief: {
    foodHunger: 60,
    foodPooKick: 12,
    foodPooKickDegradedExtra: 18,
    waterThirst: 70,
    waterPooKick: 8,
    toiletPoo: 95,
    cigaretteVice: 35,
    vodkaVice: 80,
    vodkaSleep: 20,
    drunkSeconds: 18,
    coffeeSeconds: 20,
    napSleep: 85,
  },
  tunables: { graceSeconds: 12, compoundGrace: 4, hysteresis: 8, diffCreepPerLevel: 0.04 },
};
