import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'convex/_generated']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
  // Disable react-refresh for shadcn/ui components that export variants
  {
    files: ['src/components/ui/badge.tsx', 'src/components/ui/button.tsx'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
  // Phase 81: no-restricted-imports rule scaffold (D-12).
  // Plans 02 (C3 WIB date helpers) and 03 (C1 Platform resolver) extend the
  // `paths` and `patterns` arrays below as they delete legacy exports.
  // With both arrays empty, the rule is inert today — that is by design;
  // this is a foundation for the upcoming consolidations.
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [
          // Plan 02 / 03 will add entries here as they delete legacy exports.
        ],
        patterns: [
          // Plan 02 / 03 will add entries here.
        ],
      }],
    },
  },
])
