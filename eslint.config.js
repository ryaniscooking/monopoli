import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/coverage/**', 'supabase/functions/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['scripts/**/*.ts', '*.js', '*.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    // Asset generator: Node script that also runs code inside a Playwright browser page.
    files: ['apps/web/scripts/**/*.mjs'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    // The engine is pure: time and randomness are injected, no DOM or Node APIs.
    files: ['packages/engine/src/**/*.ts'],
    languageOptions: { globals: {} },
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Inject an Rng instead.' },
        { object: 'Date', property: 'now', message: 'Inject `now` instead.' },
      ],
      'no-restricted-syntax': [
        'error',
        { selector: "NewExpression[callee.name='Date']", message: 'Inject `now` instead.' },
      ],
      'no-restricted-globals': ['error', 'window', 'document', 'process', 'globalThis', 'crypto'],
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
);
