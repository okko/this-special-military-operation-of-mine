/**
 * Highscore table repository (docs/areas/09-state-and-persistence.md §4). Self-contained for
 * Phase 1 (its own sort/cap); Phase 5 (Highscores area) may refactor it to delegate to that
 * area's pure table logic. Total-order comparator: score↓ → shiftSeconds↓ → dronesDowned↓ →
 * earlier dateISO.
 */
import type { Storage } from './storage';
import { HIGHSCORES_MAX, KEY_HIGHSCORES, type HighscoreEntry } from './schemas';

export interface HighscoresRepo {
  list(): HighscoreEntry[];
  qualifies(score: number): boolean;
  rankFor(score: number): number; // 1-based, or HIGHSCORES_MAX + 1 if it wouldn't place
  add(entry: HighscoreEntry): { rank: number };
  clear(): void;
}

function compare(a: HighscoreEntry, b: HighscoreEntry): number {
  if (b.score !== a.score) return b.score - a.score;
  if (b.shiftSeconds !== a.shiftSeconds) return b.shiftSeconds - a.shiftSeconds;
  if (b.dronesDowned !== a.dronesDowned) return b.dronesDowned - a.dronesDowned;
  return a.dateISO.localeCompare(b.dateISO);
}

function isEntry(v: unknown): v is HighscoreEntry {
  if (typeof v !== 'object' || v === null) return false;
  const e = v as Record<string, unknown>;
  return (
    typeof e.name === 'string' &&
    typeof e.score === 'number' &&
    typeof e.shiftSeconds === 'number' &&
    typeof e.dronesDowned === 'number' &&
    typeof e.dateISO === 'string'
  );
}

export function createHighscoresRepo(storage: Storage): HighscoresRepo {
  function read(): HighscoreEntry[] {
    const raw = storage.get<unknown>(KEY_HIGHSCORES, []);
    if (!Array.isArray(raw)) return [];
    return raw.filter(isEntry).sort(compare).slice(0, HIGHSCORES_MAX);
  }

  function qualifies(score: number): boolean {
    const list = read();
    if (list.length < HIGHSCORES_MAX) return true;
    const lowest = list[list.length - 1];
    return lowest === undefined || score > lowest.score;
  }

  return {
    list: read,
    qualifies,
    rankFor(score: number): number {
      if (!qualifies(score)) return HIGHSCORES_MAX + 1;
      const higher = read().filter((e) => e.score > score).length;
      return higher + 1;
    },
    add(entry: HighscoreEntry): { rank: number } {
      const list = read();
      list.push(entry);
      list.sort(compare);
      const idx = list.indexOf(entry);
      storage.set(KEY_HIGHSCORES, list.slice(0, HIGHSCORES_MAX));
      return { rank: idx >= 0 && idx < HIGHSCORES_MAX ? idx + 1 : HIGHSCORES_MAX + 1 };
    },
    clear(): void {
      storage.remove(KEY_HIGHSCORES);
    },
  };
}
