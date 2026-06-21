import { describe, it, expect } from 'vitest';
import { createStorage, createMemoryBackend } from './storage';
import { createHighscoresRepo } from './highscores-repo';
import { HIGHSCORES_MAX, type HighscoreEntry } from './schemas';

function entry(score: number, over: Partial<HighscoreEntry> = {}): HighscoreEntry {
  return {
    name: 'AAA',
    score,
    shiftSeconds: 60,
    dronesDowned: 10,
    dateISO: '2026-06-21T00:00:00.000Z',
    ...over,
  };
}

function fresh() {
  return createHighscoresRepo(createStorage(createMemoryBackend()));
}

describe('HighscoresRepo', () => {
  it('starts empty and qualifies any score while under the cap', () => {
    const repo = fresh();
    expect(repo.list()).toEqual([]);
    expect(repo.qualifies(0)).toBe(true);
  });

  it('keeps the list sorted descending and capped at MAX', () => {
    const repo = fresh();
    for (let i = 0; i < HIGHSCORES_MAX + 5; i++) repo.add(entry(i * 10));
    const list = repo.list();
    expect(list.length).toBe(HIGHSCORES_MAX);
    const scores = list.map((e) => e.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    expect(scores[0]).toBe((HIGHSCORES_MAX + 4) * 10); // highest survived
  });

  it('add returns the 1-based rank, or MAX+1 when it does not place', () => {
    const repo = fresh();
    expect(repo.add(entry(100)).rank).toBe(1);
    expect(repo.add(entry(200)).rank).toBe(1); // new best
    expect(repo.add(entry(150)).rank).toBe(2);
    // Fill the table with high scores, then a tiny score should not place.
    for (let i = 0; i < HIGHSCORES_MAX; i++) repo.add(entry(1000 + i));
    expect(repo.add(entry(1)).rank).toBe(HIGHSCORES_MAX + 1);
  });

  describe('qualifies / rankFor around the cap boundary', () => {
    it('when full, qualifies only scores strictly above the lowest', () => {
      const repo = fresh();
      for (let i = 0; i < HIGHSCORES_MAX; i++) repo.add(entry(100 + i)); // lowest = 100
      expect(repo.qualifies(101)).toBe(true);
      expect(repo.qualifies(100)).toBe(false); // equal to lowest does not qualify
      expect(repo.qualifies(50)).toBe(false);
      expect(repo.rankFor(50)).toBe(HIGHSCORES_MAX + 1);
      expect(repo.rankFor(1000)).toBe(1);
    });
  });

  describe('tie-break ordering (score → shiftSeconds → dronesDowned → earlier date)', () => {
    it('orders equal scores by shiftSeconds descending', () => {
      const repo = fresh();
      repo.add(entry(100, { name: 'LO', shiftSeconds: 10 }));
      repo.add(entry(100, { name: 'HI', shiftSeconds: 99 }));
      expect(repo.list().map((e) => e.name)).toEqual(['HI', 'LO']);
    });

    it('breaks shiftSeconds ties by dronesDowned descending', () => {
      const repo = fresh();
      repo.add(entry(50, { name: 'FEW', shiftSeconds: 20, dronesDowned: 2 }));
      repo.add(entry(50, { name: 'MANY', shiftSeconds: 20, dronesDowned: 9 }));
      expect(repo.list().map((e) => e.name)).toEqual(['MANY', 'FEW']);
    });

    it('breaks full ties by earlier dateISO', () => {
      const repo = fresh();
      repo.add(entry(50, { name: 'LATE', dateISO: '2026-06-21T12:00:00.000Z' }));
      repo.add(entry(50, { name: 'EARLY', dateISO: '2026-06-21T09:00:00.000Z' }));
      expect(repo.list().map((e) => e.name)).toEqual(['EARLY', 'LATE']);
    });
  });

  it('rankFor returns the 1-based slot for a mid score when the table is not full', () => {
    const repo = fresh();
    repo.add(entry(300));
    repo.add(entry(100));
    expect(repo.rankFor(400)).toBe(1);
    expect(repo.rankFor(200)).toBe(2);
    expect(repo.rankFor(50)).toBe(3);
  });

  it('clear empties the table', () => {
    const repo = fresh();
    repo.add(entry(100));
    repo.clear();
    expect(repo.list()).toEqual([]);
  });

  it('ignores corrupt persisted entries', () => {
    const backend = createMemoryBackend();
    backend.setItem('orpd:highscores', JSON.stringify({ version: 1, data: [{ junk: true }, 5] }));
    const repo = createHighscoresRepo(createStorage(backend));
    expect(repo.list()).toEqual([]);
  });

  it('persists across repo instances over the same backend', () => {
    const backend = createMemoryBackend();
    const storage = createStorage(backend);
    createHighscoresRepo(storage).add(entry(500));
    expect(createHighscoresRepo(createStorage(backend)).list()[0]?.score).toBe(500);
  });
});
