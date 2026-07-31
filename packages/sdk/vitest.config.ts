import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Build output is ignored by Git and must never execute as a duplicate
    // source test after a local SDK build.
    exclude: [...configDefaults.exclude, '**/dist/**'],
  },
});
