import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const src = fileURLToPath(new URL('./src', import.meta.url));
const emptyModule = fileURLToPath(new URL('./test/empty-module.ts', import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\//, replacement: `${src}/` },
      // `server-only` throws outside the react-server condition; tests run server code directly.
      { find: /^server-only$/, replacement: emptyModule },
    ],
  },
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'test/**/*.test.{ts,tsx}'],
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    testTimeout: 20_000,
    hookTimeout: 30_000,
    coverage: {
      provider: 'v8',
      include: ['src/lib/**', 'src/server/**'],
      exclude: ['**/*.test.{ts,tsx}', '**/*.d.ts'],
      reporter: ['text-summary', 'html'],
      thresholds: {
        // SPEC §5.2: the money engine has 100% branch coverage.
        'src/lib/money/**': { branches: 100, functions: 100, lines: 100, statements: 100 },
      },
    },
  },
});
