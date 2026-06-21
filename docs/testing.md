# Test Strategy & Quality Gates

> Status: **Foundation doc (mandatory).** This is the authoritative testing
> contract; it **supersedes** the summary that used to live in `architecture.md §7`
> (which now points here). Read alongside `game-design.md`, `architecture.md`,
> `compliance.md`, and `compatibility.md`.

## 1. Why this doc is stricter than usual

**This game is built by AI.** The Credits area attributes every engineering role to
Claude. That changes the threat model for quality: the risk is not a tired human
cutting a corner, it is an automated author optimizing for a **green check** and able
to make a red suite green the easy way — focusing/skipping tests, silencing the type
checker, lowering coverage, writing assertion-free or mock-only tests, or simply
asserting "all tests pass" without running them.

So our gates must be **un-gameable and machine-enforced**, not assertable. The rule
of thumb: *if a shortcut would make the gate pass without making the software
correct, the gate must mechanically forbid the shortcut.*

## 2. The CI gate is the source of truth

An area is **"done" only when CI is green** — never because an agent reports that it
is. Area 00 (Core Platform) owns `.github/workflows/ci.yml`, which runs on every push
and PR:

1. `npm run check` = `tsc --noEmit && eslint . && vitest run` (with coverage).
2. The cross-browser Playwright matrix (see `compatibility.md` §8).
3. The content-compliance lint (§8 here).
4. The focused/disabled-test grep backstop (§4).

Mutation testing (§5) runs on logic-touching PRs and nightly (kept off the fast path
so the inner loop stays quick). A lightweight **pre-push git hook** runs `npm run
check` locally so red never reaches the remote in the first place.

## 3. Test types & coverage (carried over, with additions)

Unchanged from the original strategy:

- **Unit (Vitest):** pure logic — meter drain curves, scoring math, spawn schedules
  at given seeds, economy transitions, incident triggers. Deterministic via seeded
  RNG and injected `dt`.
- **Integration (Vitest):** cross-area behavior through the event bus and
  `GameState` (e.g. "destroying a drone adds 1 ruble *and* emits `scoreChanged`").
- **DOM/canvas (jsdom):** HUD/menus render expected text/state; storage round-trips.
  Fake/in-memory backends only.
- **No flakiness:** no wall-clock, real timers, real audio hardware, or
  `Math.random()`. Mock Web Audio and Storage.

**Coverage — tightened.** Logic modules (`src/systems`, `src/content` validators,
scoring, meters, economy) must meet **≥ 85% lines AND ≥ 85% branches AND ≥ 85%
functions**. Lines-only is the easiest metric for an AI to satisfy without real
assertions; branch + function thresholds close that gap. Thresholds are committed in
`vitest.config.ts` and CI fails below them. **Lowering any threshold requires lead
sign-off** (enforced via CODEOWNERS on the config — see §9).

## 4. Un-gameable gate rules (lint / config)

Area 00 wires these into `eslint.config.js`, `vitest.config.ts`, and a CI grep step:

- **No focused or disabled tests in commits.** `eslint-plugin-vitest`
  `no-focused-tests` (`.only`, `fit`, `fdescribe`) and `no-disabled-tests`
  (`.skip`, `xit`, `xdescribe`). A CI grep is the backstop in case lint is bypassed.
- **No assertion-free tests.** `eslint-plugin-vitest` `expect-expect`. A test that
  runs code but asserts nothing does not count.
- **No mock-only tautologies.** A test may not assert *only* that a mock it just
  configured was called with what it was just told to return; review rejects these.
  Prefer asserting observable behavior/state over implementation calls.
- **No silent type/lint escape hatches.** `@typescript-eslint/no-explicit-any`
  (no bare `as any`), `@typescript-eslint/ban-ts-comment` (no `@ts-ignore` /
  `@ts-expect-error` without a written justification), and
  `eslint-comments/require-description` (no bare `eslint-disable`). The existing
  `Math.random` / `Date.now` / `performance.now` bans in logic dirs remain.

## 5. Mutation testing (anti-shallow-test gate)

Add **StrykerJS** (`npm run test:mutation`) over the pure-logic dirs (`src/systems`,
`src/content` validators, scoring, meters, economy). Mutation testing perturbs the
*implementation* and checks that some test fails — directly catching tests that
execute code without truly asserting its behavior, which is the dominant failure mode
of AI-written tests. Start with the score **advisory** (reported, non-blocking) and
**ratchet a minimum mutation score upward** as phases complete, so it can never
regress. Runs on logic-touching PRs and nightly, not on the fast inner-loop check.

## 6. Determinism golden test

Determinism is the project's central testability claim ("same seed + same inputs ⇒
identical run"). Guard it explicitly: a test in `/tests` runs the headless sim for a
fixed number of ticks at a fixed seed and a scripted input log, then asserts a **hash
of the resulting `GameState`** equals a committed golden value. This catches
nondeterminism an AI can introduce without noticing — `Map`/`Set` iteration-order
dependence, floating-point drift, or a stray real-clock read — none of which a single
run would reveal. When intended balance changes move the golden, the diff is reviewed
and the golden updated deliberately (not auto-regenerated in CI).

## 7. Cross-browser E2E

Real-browser end-to-end testing is **mandatory**, not optional. The Playwright matrix
(Chromium + WebKit + Firefox + emulated iPhone) and its minimum suite, caveats, and
performance budget are specified in `compatibility.md §8`. It is a required CI gate.

## 8. Content-compliance gate (AI authors copy at scale)

Because the AI generates large volumes of player-facing copy, `compliance.md`'s review
is backed by automation: a **content-lint** over `src/content/` data tables and UI
copy fails CI on forbidden terms / anti-stereotype framings, and every PR touching
player-facing content carries a **structured compliance checklist reviewed by someone
other than the authoring agent**. The `compliance.md §6` watch-items (Dmitri/vodka and
the "drunk" debuff, degraded-favor flavor, regime-voice copy and highscore seed names)
are named **regression cases** the reviewer re-checks whenever that content changes.

## 9. Process gates

- **No silent scope reduction.** Each area doc's "Required automated tests" list is a
  contract and a *minimum*. Deleting or weakening a required test (or a coverage /
  mutation threshold) requires lead sign-off. **CODEOWNERS** guards `*.test.ts`,
  `/tests`, the threshold configs, and the area docs so these changes can't merge
  unreviewed.
- **Independent verification.** After an AI builds an area, a **separate reviewer
  that did not write the code** — a human, or a fresh review agent (e.g. the
  `/code-review` skill) — checks for the anti-patterns in §4–§6 and for correctness
  before merge. The author reviewing their own work does not satisfy this.
- **CI claim discipline.** "Tests pass" is meaningful only with the CI run attached.
  A report of green without a CI link is treated as unverified.

## 10. Per-area required-test contract

Every `docs/areas/*.md §8` enumerates that area's required tests as a **minimum**. An
area is not complete until those tests are authored **and** the full `npm run check`,
the Playwright matrix, the content-lint, and (for logic areas) the mutation run are
green in CI, and the independent review (§9) has signed off.
