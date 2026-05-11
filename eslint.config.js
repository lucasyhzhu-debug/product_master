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
  // Phase 81: no-restricted-imports rule (D-12).
  // Scaffold landed in Plan 81-01 (empty arrays). Plan 81-02 (C3) extended
  // it with the WIB date-helper bans below. Plan 81-03 (C1) will add the
  // Platform-resolver bans (sourceToPlatform, toDisplayChannel, etc.).
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [
          // Phase 81 / Plan 02: WIB date helper consolidation (D-12)
          {
            name: 'convex/staffAttendance/flagEngine',
            importNames: ['toWibDateString'],
            message: 'toWibDateString was consolidated in Phase 81. Use getWibDateStr from convex/lib/periodRange instead.',
          },
          {
            name: 'convex/gofoodDepot/helpers',
            importNames: ['getWibDateString', 'getWibDateStringDaysAgo'],
            message: 'These helpers were deleted in Phase 81. Use getWibDateStr from convex/lib/periodRange instead (for daysAgo: pass the pre-subtracted ms).',
          },
          {
            name: 'convex/lib/counter',
            importNames: ['getWibDateStr'],
            message: 'counter.ts no longer exports getWibDateStr (renamed to getWibMonthDayStr — returns MMDD, not YYYY-MM-DD). Use getWibDateStr from convex/lib/periodRange for YYYY-MM-DD.',
          },
          // Phase 81 / Plan 03: C1 platform-resolver consolidation (D-12)
          {
            name: 'convex/lib/externalSource',
            importNames: ['sourceToPlatform'],
            message: 'sourceToPlatform was deleted in Phase 81. Use platformDisplay(resolvePlatform({ source }).platform) from convex/reports/platform instead.',
          },
          {
            name: 'convex/reports/channelTaxonomy',
            message: 'channelTaxonomy was deleted in Phase 81. Use Platform / resolvePlatform / platformDisplay from convex/reports/platform instead.',
          },
        ],
        patterns: [
          // Path-variant matchers: callers in src/ vs convex/ use different
          // relative paths; the glob covers both.
          {
            group: ['**/staffAttendance/flagEngine'],
            importNames: ['toWibDateString'],
            message: 'See Phase 81: use getWibDateStr from convex/lib/periodRange.',
          },
          {
            group: ['**/gofoodDepot/helpers'],
            importNames: ['getWibDateString', 'getWibDateStringDaysAgo'],
            message: 'See Phase 81: use getWibDateStr from convex/lib/periodRange.',
          },
          {
            group: ['**/lib/counter'],
            importNames: ['getWibDateStr'],
            message: 'See Phase 81: counter.ts now exports getWibMonthDayStr (MMDD). For YYYY-MM-DD use getWibDateStr from convex/lib/periodRange.',
          },
          // Phase 81 / Plan 03: C1 platform-resolver consolidation (D-12)
          {
            group: ['**/convex/lib/externalSource', '**/lib/externalSource'],
            importNames: ['sourceToPlatform'],
            message: 'See Phase 81: use platformDisplay(resolvePlatform(row).platform) from convex/reports/platform.',
          },
          {
            group: ['**/convex/reports/channelTaxonomy', '**/reports/channelTaxonomy'],
            importNames: ['toDisplayChannel', 'sourceToDisplayChannel', 'DisplayChannel', 'DISPLAY_CHANNELS'],
            message: 'See Phase 81: use Platform / resolvePlatform / platformDisplay from convex/reports/platform.',
          },
        ],
      }],
    },
  },
])
