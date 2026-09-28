import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

/**
 * Layer rules (ARCHITECTURE §3). Each zone lists what its files may NOT import.
 */
const serverOnly = {
  group: ['@/server', '@/server/**'],
  message: 'Client and shared code must not import server modules (ARCHITECTURE §3).',
};

const config = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'drizzle/**',
      'docs/**',
      'public/sw.js',
      'next-env.d.ts',
    ],
  },
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      'react/no-danger': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      eqeqeq: ['error', 'smart'],
      'no-console': ['error', { allow: ['warn', 'error', 'info'] }],
    },
  },
  {
    files: ['src/lib/money/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/*', '../*'],
              message:
                'lib/money is pure: only relative imports of its own files (ARCHITECTURE §3).',
            },
            {
              group: ['react', 'react-dom', 'next', 'next/*'],
              message: 'lib/money is framework-free.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/lib/**', 'src/features/**', 'src/components/**', 'src/client/**'],
    ignores: ['src/lib/money/**'],
    rules: { 'no-restricted-imports': ['error', { patterns: [serverOnly] }] },
  },
  {
    files: ['src/server/services/core/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/server/entitlements', '@/server/entitlements/**'],
              message: 'Free-forever flows never consult entitlements (SPEC §9.1).',
            },
          ],
        },
      ],
    },
  },
];

export default config;
