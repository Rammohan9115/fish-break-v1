// ESLint (flat config): typescript-eslint recommended + react-hooks. The type checker (tsc) already enforces
// strictness; lint adds the rules tsc can't (no `any`, hook rules, unused disables).
import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['*.cjs', 'dist', 'dev-dist', 'node_modules', 'art-src', 'public', 'qa', 'scripts/audit', 'supabase/functions', 'playwright-report', 'test-results'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      '@typescript-eslint/ban-ts-comment': 'error',
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
);
