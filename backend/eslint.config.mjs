// @ts-check
import eslint from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';

// use the helper to compose a valid flat config
export default tseslint.config(
  // 1) ignores
  {
    ignores: [
      'dist/**',
      'test/**',            // ignore e2e tests for now
      'src/**/*.spec.ts',   // ignore unit tests (we can re-enable later)
      'eslint.config.mjs',
    ],
  },

  // 2) main TS config (type-aware)
  {
    files: ['**/*.ts'],
    extends: [
      eslint.configs.recommended,
      ...tseslint.configs.recommendedTypeChecked,
      // put prettier last so it wins formatting conflicts
      eslintPluginPrettierRecommended,
    ],
    languageOptions: {
      parserOptions: {
        // tells TS-ESLint to use your tsconfig automatically
        project: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.node,
        ...globals.jest,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
    },
  }
);
