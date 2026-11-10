import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import { fsdRule } from './eslint-rules/fsd.js';

export default tseslint.config(
  {
    ignores: [
      'dist',
      'coverage',
      'android',
      'ios',
      'src/shared/api/schema.d.ts',
      'public/mockServiceWorker.js',
      '.*.mjs',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  reactHooks.configs['recommended-latest'],
  reactRefresh.configs.vite,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['src/shared/ui/primitives.tsx', 'src/shared/ui/feedback.tsx'],
    rules: {
      'react-refresh/only-export-components': [
        'error',
        { allowExportNames: ['useToast', 'useAlert'] },
      ],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/**/*.test.{ts,tsx}', 'src/shared/test/**'],
    plugins: { architecture: { rules: { fsd: fsdRule } } },
    rules: { 'architecture/fsd': 'error' },
  },
  // Сборочные скрипты — не браузерный код: они запускаются в node внутри
  // контейнера, и `console` там легитимен (это их единственный вывод).
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: { globals: { console: 'readonly', process: 'readonly' } },
  },
);
