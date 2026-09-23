import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['test/live/**/*.live-spec.ts'],
    testTimeout: 300_000,
  },
});
