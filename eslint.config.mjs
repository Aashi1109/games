import { defineConfig, globalIgnores } from 'eslint/config';
import js from '@eslint/js';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier/flat';
import globals from 'globals';

export default defineConfig([
  globalIgnores([
    '**/node_modules/**',
    '**/dist/**',
    '**/output/**',
    '.next/**',
    'tmp/**',
    'public/**',
    'design/**',
    'docs/**',
    'assets/**',
    'next-env.d.ts',
    'playwright-report/**',
    'test-results/**',
  ]),
  { ...js.configs.recommended, files: ['**/*.{js,mjs}'] },
  {
    files: ['**/*.{js,mjs}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  ...nextVitals.map((config) => ({
    ...config,
    files: ['src/**/*.tsx'],
  })),
  ...nextTypescript.map((config) => ({
    ...config,
    files: ['src/**/*.{ts,tsx}', 'tests/**/*.ts', '*.ts'],
  })),
  {
    files: ['src/**/*.{ts,tsx}', 'tests/**/*.ts', '*.ts'],
    rules: {
      'no-empty': ['error', { allowEmptyCatch: true }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-unused-expressions': 'error',
    },
  },
  {
    // A fresh document isolates each game's full-screen CSS and canvas session.
    // React still owns every page and cleans up the mounted engine.
    files: ['src/games/**/*.tsx'],
    rules: {
      '@next/next/no-html-link-for-pages': 'off',
      '@next/next/no-location-assign-relative-destination': 'off',
    },
  },
  {
    // These input sanitizers intentionally match ASCII control characters.
    files: [
      'src/games/doodle-dash/room-service.ts',
      'src/games/drift/server/index.ts',
    ],
    rules: { 'no-control-regex': 'off' },
  },
  prettier,
]);
