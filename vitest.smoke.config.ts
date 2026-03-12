import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'smoke',
    globals: true,
    environment: 'node',
    include: ['tests/smoke/**/*.smoke.ts'],
    testTimeout: 60000,
    hookTimeout: 120000, // Increased to 2 minutes for browser launch + signup flows
    // Run smoke tests serially — shared browser state, sequential signup flows
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
});
