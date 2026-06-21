import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { cwd } from 'node:process';
import { SPRITE_IDS } from './sprite-ids';

// Static scan (docs/areas/11-art-visual-style.md §8.5): every sprite-id-shaped string literal in
// src/ must be a registered SpriteId. Catches typos and ad-hoc string ids. This file is excluded
// from the scan (it names the prefixes itself).
const KNOWN = new Set<string>(SPRITE_IDS);
const ID_RE =
  /['"`]((?:soldier|gun|drone|decoy|fx|pickup|ui|icon|bg|font|portrait)\.[a-zA-Z0-9.]+)['"`]/g;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith('.ts') && !p.endsWith('sprite-id-usage.test.ts')) out.push(p);
  }
  return out;
}

describe('sprite-id usage scan', () => {
  it('every sprite-id-shaped literal in src/ is a registered SpriteId', () => {
    const offenders: string[] = [];
    for (const file of walk(join(cwd(), 'src'))) {
      const text = readFileSync(file, 'utf8');
      for (const m of text.matchAll(ID_RE)) {
        const id = m[1];
        if (id === undefined || id.startsWith('portrait.')) continue;
        if (!KNOWN.has(id)) offenders.push(`${id} (in ${file})`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('actually scans some files (guards against a broken walk)', () => {
    expect(walk(join(cwd(), 'src')).length).toBeGreaterThan(0);
  });
});
