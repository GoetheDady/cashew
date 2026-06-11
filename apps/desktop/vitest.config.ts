import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: ['release/**', 'out/**', 'node_modules/**'],
  },
});
