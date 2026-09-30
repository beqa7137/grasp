import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['test/live/**/*.compare.ts'],
    testTimeout: 7_200_000,
  },
});
