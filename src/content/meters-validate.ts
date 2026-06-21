/**
 * Runtime validator for the meters balance table (docs/areas/02-meters-and-status.md §5). Confirms
 * every rate/modifier/coefficient/relief magnitude is a finite number in a sane range and that all
 * five meters have warn thresholds in [1, 99]. Throws `ContentValidationError` (loud boot failure).
 */
import { ContentValidationError } from './content-error';
import { asObject, num } from './validate-helpers';
import { METER_KEYS } from '../types/meter-key';
import type { MeterBalance } from './meters';

export function validateMeterBalance(raw: unknown): MeterBalance {
  const path = 'content.meters';
  const root = asObject(raw, path);

  const ratesRaw = asObject(root.rates, `${path}.rates`);
  const rp = `${path}.rates`;
  const rates = {
    sleep: num(ratesRaw, 'sleep', rp, { min: 0 }),
    poo: num(ratesRaw, 'poo', rp, { min: 0 }),
    hunger: num(ratesRaw, 'hunger', rp, { min: 0 }),
    thirst: num(ratesRaw, 'thirst', rp, { min: 0 }),
    vice: num(ratesRaw, 'vice', rp, { min: 0 }),
    coffeeSleepRelief: num(ratesRaw, 'coffeeSleepRelief', rp, { min: 0 }),
  };

  const warnRaw = asObject(root.warn, `${path}.warn`);
  const warn = {} as Record<(typeof METER_KEYS)[number], number>;
  for (const k of METER_KEYS) {
    warn[k] = num(warnRaw, k, `${path}.warn`, { min: 1, max: 99 });
  }

  const modRaw = asObject(root.modifiers, `${path}.modifiers`);
  const mp = `${path}.modifiers`;
  const modifiers = {
    nightSleepMul: num(modRaw, 'nightSleepMul', mp, { min: 1 }),
    dayThirstMul: num(modRaw, 'dayThirstMul', mp, { min: 1 }),
    viceJitterSleepMul: num(modRaw, 'viceJitterSleepMul', mp, { min: 1 }),
    fireThirstCoeff: num(modRaw, 'fireThirstCoeff', mp, { min: 0 }),
    thirstGainMul: num(modRaw, 'thirstGainMul', mp, { min: 0 }),
  };

  const effRaw = asObject(root.effects, `${path}.effects`);
  const ep = `${path}.effects`;
  const effects = {
    sleepMicroSleep: num(effRaw, 'sleepMicroSleep', ep, { min: 0 }),
    sleepVisionDim: num(effRaw, 'sleepVisionDim', ep, { min: 0 }),
    sleepAimSway: num(effRaw, 'sleepAimSway', ep, { min: 0 }),
    pooMoveSlow: num(effRaw, 'pooMoveSlow', ep, { min: 0 }),
    pooTurnSlow: num(effRaw, 'pooTurnSlow', ep, { min: 0 }),
    hungerAimSway: num(effRaw, 'hungerAimSway', ep, { min: 0 }),
    hungerInteractSlow: num(effRaw, 'hungerInteractSlow', ep, { min: 0 }),
    thirstVisionBlur: num(effRaw, 'thirstVisionBlur', ep, { min: 0 }),
    viceAimSway: num(effRaw, 'viceAimSway', ep, { min: 0 }),
    drunkAimSway: num(effRaw, 'drunkAimSway', ep, { min: 0 }),
    drunkBias: num(effRaw, 'drunkBias', ep, { min: 0 }),
  };

  const relRaw = asObject(root.relief, `${path}.relief`);
  const lp = `${path}.relief`;
  const relief = {
    foodHunger: num(relRaw, 'foodHunger', lp, { min: 0, max: 100 }),
    foodPooKick: num(relRaw, 'foodPooKick', lp, { min: 0, max: 100 }),
    foodPooKickDegradedExtra: num(relRaw, 'foodPooKickDegradedExtra', lp, { min: 0, max: 100 }),
    waterThirst: num(relRaw, 'waterThirst', lp, { min: 0, max: 100 }),
    waterPooKick: num(relRaw, 'waterPooKick', lp, { min: 0, max: 100 }),
    toiletPoo: num(relRaw, 'toiletPoo', lp, { min: 0, max: 100 }),
    cigaretteVice: num(relRaw, 'cigaretteVice', lp, { min: 0, max: 100 }),
    vodkaVice: num(relRaw, 'vodkaVice', lp, { min: 0, max: 100 }),
    vodkaSleep: num(relRaw, 'vodkaSleep', lp, { min: 0, max: 100 }),
    drunkSeconds: num(relRaw, 'drunkSeconds', lp, { min: 0 }),
    coffeeSeconds: num(relRaw, 'coffeeSeconds', lp, { min: 0 }),
    napSleep: num(relRaw, 'napSleep', lp, { min: 0, max: 100 }),
  };

  const tunRaw = asObject(root.tunables, `${path}.tunables`);
  const tp = `${path}.tunables`;
  const tunables = {
    graceSeconds: num(tunRaw, 'graceSeconds', tp, { min: 0 }),
    compoundGrace: num(tunRaw, 'compoundGrace', tp, { min: 0 }),
    hysteresis: num(tunRaw, 'hysteresis', tp, { min: 1, max: 99 }),
    diffCreepPerLevel: num(tunRaw, 'diffCreepPerLevel', tp, { min: 0 }),
  };

  if (tunables.compoundGrace > tunables.graceSeconds) {
    throw new ContentValidationError('compoundGrace must be ≤ graceSeconds', tp);
  }

  return { rates, warn, modifiers, effects, relief, tunables };
}
