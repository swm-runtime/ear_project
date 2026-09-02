// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettierConfig = require('eslint-config-prettier');

module.exports = defineConfig([
  expoConfig,
  prettierConfig,
  {
    ignores: ['dist/*'],
  },
  {
    rules: {
      // convention.md 8장 — 필수 룰
      '@typescript-eslint/no-explicit-any': 'error',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      'no-console': 'error',
      // convention.md 2.3 — import 순서: react/외부 → @/shared → @/features → 상대 경로
      'import/order': [
        'error',
        {
          groups: [['builtin', 'external'], 'internal', ['parent', 'sibling', 'index']],
          pathGroups: [
            { pattern: '@/shared/**', group: 'internal', position: 'before' },
            { pattern: '@/features/**', group: 'internal', position: 'after' },
          ],
          pathGroupsExcludedImportTypes: ['builtin'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      // convention.md 2.2 — feature 간 import는 공개 API(index.ts)만 사용한다
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/features/*/*'],
              message:
                'feature 내부 파일 직접 import 금지 — 공개 API(@/features/<name>)만 사용한다(convention.md 2.2)',
            },
          ],
        },
      ],
    },
  },
  {
    // architecture.md 4.3 — shared는 features를 import하지 않는다
    files: ['src/shared/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/features/*', '@/features/*/*'],
              message:
                'shared는 features를 import하지 않는다 — 인터페이스를 정의하고 app/bootstrap에서 주입한다(architecture.md 4.3)',
            },
          ],
        },
      ],
    },
  },
  {
    // convention.md 9장 — console은 logger 구현체에서만 허용
    files: ['src/shared/lib/logger.ts'],
    rules: { 'no-console': 'off' },
  },
]);
