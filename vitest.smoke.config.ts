import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/smoke/**/*.smoke.ts'],
    testTimeout: 60000,
    hookTimeout: 30000,
    // Run smoke tests serially — shared browser state, sequential signup flows
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
});
