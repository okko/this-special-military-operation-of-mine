// Flat config (ESLint 9). The "un-gameable gate" rules from docs/testing.md §4 all map to
// existing rules — no hand-written AST plugin is needed. Type-aware linting is intentionally
// NOT enabled: every required rule here is syntactic, so we avoid the cost/fragility of a
// parserOptions.project setup. `tsc --noEmit` (run separately by `npm run check`) is the
// type gate.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import vitest from 'eslint-plugin-vitest';
import comments from '@eslint-community/eslint-plugin-eslint-comments';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'build/**',
      'coverage/**',
      'node_modules/**',
      'playwright-report/**',
      'test-results/**',
      '.stryker-tmp/**',
      'reports/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Project-wide TypeScript source rules.
  {
    files: ['**/*.ts'],
    languageOptions: {
      globals: { ...globals.browser },
    },
    plugins: {
      '@eslint-community/eslint-comments': comments,
    },
    rules: {
      // TypeScript handles undefined-symbol detection; the core rule double-flags globals.
      'no-undef': 'off',
      // No silent type-escape hatches (testing.md §4).
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/ban-ts-comment': [
        'error',
        {
          'ts-ignore': true,
          'ts-nocheck': true,
          'ts-expect-error': 'allow-with-description',
          minimumDescriptionLength: 10,
        },
      ],
      // No bare eslint-disable comments.
      '@eslint-community/eslint-comments/require-description': ['error', { ignore: [] }],
      // console.log/.debug is spam; guarded warn/error logging is allowed (event bus,
      // content loader).
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },

  // Test files: forbid the AI-friendly ways to make a red suite green (testing.md §4).
  // Scoped to *.test.ts so the Playwright *.spec.ts files (which use their own runner) are
  // linted by the general rules only.
  {
    files: ['**/*.test.ts'],
    plugins: { vitest },
    rules: {
      'vitest/no-focused-tests': 'error',
      'vitest/no-disabled-tests': 'error',
      'vitest/expect-expect': 'error',
    },
  },

  // Logic dirs: time is injected and randomness is seeded (docs/architecture.md §3,
  // docs/areas/00-core-platform.md §3.3.2). main.ts lives directly under src/ and is the
  // ONLY place allowed to read the real clock — it is deliberately outside this glob.
  {
    files: ['src/core/**', 'src/systems/**', 'src/content/**', 'src/state/**', 'src/persistence/**'],
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use core/rng (deterministic, seedable).' },
        { object: 'Date', property: 'now', message: 'Time is injected as dt; do not read the clock in logic.' },
        {
          object: 'performance',
          property: 'now',
          message: 'Only main.ts reads the clock; logic receives dt.',
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'Date', message: 'No real clock in logic — dateISO is supplied by the caller.' },
      ],
    },
  },

  // Node-context files: config + the content-lint script.
  {
    files: ['*.config.{js,ts}', '*.config.*.{js,ts}', 'scripts/**/*.{js,mjs}'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },

  prettier,
);
