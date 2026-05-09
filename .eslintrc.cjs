/* eslint-disable @typescript-eslint/no-var-requires */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 2022, sourceType: 'module', ecmaFeatures: { jsx: true } },
  plugins: ['@typescript-eslint', 'react', 'react-hooks'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'prettier',
  ],
  settings: { react: { version: 'detect' } },
  env: { node: true, browser: true, es2022: true },
  ignorePatterns: [
    'dist/',
    'build/',
    'node_modules/',
    '*.config.js',
    '*.config.ts',
    '*.config.cjs',
    'apps/api/prisma/migrations/',
  ],
  rules: {
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    '@typescript-eslint/no-empty-function': 'off',
    'react/react-in-jsx-scope': 'off',
    'react/prop-types': 'off',
    'no-console': 'off',
    'no-empty': ['warn', { allowEmptyCatch: true }],
  },
  overrides: [
    { files: ['**/*.test.ts', '**/*.spec.ts'], env: { node: true } },
  ],
};
