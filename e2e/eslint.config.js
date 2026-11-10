import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['playwright-report', 'test-results'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  // Playwright detects a fixture's dependencies from its destructuring pattern,
  // so a fixture that needs none must still declare the empty one.
  {
    files: ['fixtures/**/*.ts'],
    rules: { 'no-empty-pattern': 'off' },
  },
  // The issue summary script is a node CLI: `console` is its only output.
  {
    files: ['scripts/**/*.ts'],
    languageOptions: { globals: { console: 'readonly', process: 'readonly' } },
  },
);
