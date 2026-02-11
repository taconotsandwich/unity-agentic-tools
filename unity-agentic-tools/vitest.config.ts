import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    globals: true,
  },
  coverage: {
    provider: 'v8',
    reporter: ['text', 'json', 'html'],
    exclude: ['**/*.test.ts', 'node_modules'],
  },
});
