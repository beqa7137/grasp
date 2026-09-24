import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['test/**/*.e2e-spec.ts'],
    // Suites share one test database and reset it in beforeAll, so they must not interleave.
    fileParallelism: false,
  },
});
