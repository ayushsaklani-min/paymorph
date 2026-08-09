import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
      '@paymorph/shared': new URL('../../packages/shared/src/index.ts', import.meta.url).pathname,
      '@paymorph/db': new URL('../../packages/db/src/index.ts', import.meta.url).pathname,
    },
  },
  test: {
    exclude: ['tests/e2e/**', 'node_modules/**', '.next/**'],
  },
});
