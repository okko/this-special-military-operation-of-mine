import { describe, it, expect } from 'vitest';
import { scanText } from './content-lint.mjs';

describe('content-lint scanner', () => {
  it('flags dehumanizing language', () => {
    expect(scanText('the enemy are vermin')).toContain('vermin');
    expect(scanText('treated as subhuman').length).toBeGreaterThan(0);
  });

  it('flags anti-stereotype national-trait framings', () => {
    expect(scanText('Russians are all drunk').length).toBeGreaterThan(0);
    expect(scanText('a lazy Russian conscript').length).toBeGreaterThan(0);
  });

  it('passes copy that mocks the regime/war, not the people', () => {
    expect(scanText('COMRADE! The Ministry thanks you for your sacrifice. +1 ₽')).toEqual([]);
    expect(scanText('Old Dmitri pours a vodka — the army used him up and threw him away.')).toEqual(
      [],
    );
  });
});
