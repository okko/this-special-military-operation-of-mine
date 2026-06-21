import { defineConfig } from 'vite';

// Static, dependency-light build. No framework plugin (keeps logic testable per
// docs/architecture.md §1). Relative base so the bundle can be hosted from any path.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
