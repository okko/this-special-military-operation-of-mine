// Content-compliance lint (docs/compliance.md §5, docs/testing.md §8). A COARSE safety net over
// player-facing copy in src/content — it fails CI on forbidden terms (slurs/dehumanizing
// language) and on anti-stereotype framings that pin a vice/poverty/etc. trait on Russians as a
// people. It is NOT a substitute for the independent human review (compliance.md §7). The list
// grows as content lands; the scanner itself is unit-tested in content-lint.test.ts.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

export const FORBIDDEN = [
  // Slurs / dehumanizing language (minimal, non-exhaustive — extend as content grows).
  /\bsubhuman\b/i,
  /\bvermin\b/i,
  // Anti-stereotype framings: a vice/poverty/etc. presented as an inherent Russian national trait
  // (docs/compliance.md §2). Satire must punch at the regime/war, never at ordinary people.
  /\brussians?\s+are\s+(all\s+)?(drunk|drunks|lazy|stupid|dirty|poor|backward)/i,
  /\b(drunk|lazy|stupid|dirty|backward)\s+russians?\b/i,
];

export function scanText(text) {
  const hits = [];
  for (const re of FORBIDDEN) {
    const m = re.exec(text);
    if (m) hits.push(m[0]);
  }
  return hits;
}

function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out; // directory absent (nothing to scan yet) — clean by definition
  }
  for (const e of entries) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx|json|md)$/.test(p) && !p.endsWith('.test.ts')) out.push(p);
  }
  return out;
}

export function lintContentDir(root) {
  const offenders = [];
  for (const file of walk(root)) {
    for (const term of scanText(readFileSync(file, 'utf8'))) offenders.push({ file, term });
  }
  return offenders;
}

const argvPath = process.argv[1];
if (argvPath && import.meta.url === `file://${argvPath}`) {
  const offenders = lintContentDir(join(process.cwd(), 'src', 'content'));
  if (offenders.length > 0) {
    for (const o of offenders) console.error(`content-lint: forbidden "${o.term}" in ${o.file}`);
    process.exit(1);
  }
  console.log('content-lint: clean');
}
