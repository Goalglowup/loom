import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    exclude: ['portal/**', '**/node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['tests/**', '**/*.config.*', 'vitest.workspace.ts', '**/node_modules/**', 'dist/**', 'migrations/**', 'scripts/**', 'dashboard/**', '**/__mocks__/**']
    },
    testTimeout: 10000,
    hookTimeout: 10000
  }
});
