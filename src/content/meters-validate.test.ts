import { describe, it, expect } from 'vitest';
import { validateMeterBalance } from './meters-validate';
import { meterBalance } from './meters';
import { ContentValidationError } from './content-error';

function clone(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(meterBalance)) as Record<string, unknown>;
}

describe('validateMeterBalance', () => {
  it('accepts the shipped balance table', () => {
    expect(validateMeterBalance(meterBalance)).toEqual(meterBalance);
  });

  it('rejects a non-object', () => {
    expect(() => validateMeterBalance(null)).toThrow(ContentValidationError);
    expect(() => validateMeterBalance(42)).toThrow(ContentValidationError);
  });

  it('rejects a negative drain rate', () => {
    const bad = clone();
    (bad.rates as Record<string, number>).sleep = -1;
    expect(() => validateMeterBalance(bad)).toThrow(/rates.*sleep.*≥ 0/s);
  });

  it('rejects a warn threshold out of [1,99]', () => {
    const tooHigh = clone();
    (tooHigh.warn as Record<string, number>).poo = 100;
    expect(() => validateMeterBalance(tooHigh)).toThrow(ContentValidationError);
    const tooLow = clone();
    (tooLow.warn as Record<string, number>).poo = 0;
    expect(() => validateMeterBalance(tooLow)).toThrow(ContentValidationError);
  });

  it('rejects a missing meter in the warn table', () => {
    const bad = clone();
    delete (bad.warn as Record<string, number>).vice;
    expect(() => validateMeterBalance(bad)).toThrow(/warn.*vice/s);
  });

  it('rejects a relief magnitude over 100', () => {
    const bad = clone();
    (bad.relief as Record<string, number>).foodHunger = 101;
    expect(() => validateMeterBalance(bad)).toThrow(ContentValidationError);
  });

  it('rejects compoundGrace greater than graceSeconds', () => {
    const bad = clone();
    (bad.tunables as Record<string, number>).compoundGrace = 999;
    expect(() => validateMeterBalance(bad)).toThrow(/compoundGrace must be ≤ graceSeconds/);
  });

  it('rejects a non-numeric field', () => {
    const bad = clone();
    (bad.rates as Record<string, unknown>).poo = 'fast';
    expect(() => validateMeterBalance(bad)).toThrow(/must be a number/);
  });
});
