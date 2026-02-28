import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    exclude: ['portal/**', '**/node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['tests/**', '**/*.config.*', '**/node_modules/**', 'dist/**', 'migrations/**', 'scripts/**', 'dashboard/**']
    },
    testTimeout: 10000,
    hookTimeout: 10000
  }
});
