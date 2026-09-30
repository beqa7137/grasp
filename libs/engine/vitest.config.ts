import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // A hang guard, not a speed check: CPU-heavy suites share the machine with parallel runs, and speed is asserted in CPU time.
    testTimeout: 30_000,
  },
});
