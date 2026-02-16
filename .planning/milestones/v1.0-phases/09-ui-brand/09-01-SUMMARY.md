---
phase: 09-ui-brand
plan: 01
subsystem: ui
tags: [tailwind-css-v4, dark-mode, css-variables, theme-context, design-tokens, teal-brand]

# Dependency graph
requires: []
provides:
  - ThemeProvider context with light/dark/system toggle (useTheme hook)
  - CSS design tokens for dual-theme (light + dark) with teal brand accent
  - Brand utility CSS classes (text-brand, bg-brand, border-brand, hover variants)
  - UI_BRAND_REFERENCE.md -- source of truth for all visual design decisions
  - Dark mode @custom-variant for Tailwind v4 class-based toggling
affects: [09-02-layout-components, 09-03-page-audit-wave1, 09-04-page-audit-wave2, 09-05-verification]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "ThemeProvider context pattern: localStorage + prefers-color-scheme + .dark class toggle"
    - "CSS variable dual-theme: @theme for light tokens, .dark {} for dark overrides"
    - "@custom-variant dark for Tailwind v4 class-based dark mode"
    - "Brand color tokens (--color-brand-*) replacing hardcoded color palette"

key-files:
  created:
    - src/contexts/ThemeContext.tsx
    - docs/UI_BRAND_REFERENCE.md
  modified:
    - src/index.css
    - src/main.tsx
    - index.html

key-decisions:
  - "Inter-only typography (dropped Playfair Display) -- single font reduces FOUT, matches Notion-style reference"
  - "Teal #0D9488 as brand accent replacing terracotta #E07856 -- fresh, natural feel for snack brand"
  - "Border radius 12px/8px/6px (up from 8px/6px/4px) -- warmer, more approachable"
  - "shadcn primary token remapped to teal HSL -- all shadcn Button/Ring components automatically use brand color"
  - "Kitchen station and domain colors preserved as-is (semantic, not theme-dependent)"

patterns-established:
  - "ThemeProvider wraps app outside ConvexProvider (theme independent of backend)"
  - "Brand colors via CSS variables -- automatic dark mode switching"
  - "All brand utility classes use var(--color-brand-*) not hardcoded hex"

# Metrics
duration: 5min
completed: 2026-02-14
---

# Phase 9 Plan 01: Theme Foundation Summary

**ThemeProvider context with light/dark/system toggle, teal brand tokens replacing terracotta, Inter-only typography, 360-line UI brand reference document**

## Performance

- **Duration:** 5 min
- **Tasks:** 2
- **Files created:** 2
- **Files modified:** 3

## Accomplishments
- Created ThemeProvider context managing light/dark/system preference with localStorage persistence and system media query sync
- Replaced entire terracotta color palette (#E07856) with teal brand accent (#0D9488) in CSS tokens
- Added complete dark theme overrides for all semantic shadcn tokens via .dark {} class
- Removed Playfair Display font, standardized on Inter with weights 400-800
- Created comprehensive 360-line UI_BRAND_REFERENCE.md covering colors, typography, spacing, layout, components, dark mode, responsive, and animations
- Updated border radius to warm/rounded 12px/8px/6px values
- Wired ThemeProvider into main.tsx outside ConvexProvider

## Task Commits

Each task was committed atomically:

1. **Task 1: Create ThemeProvider and update CSS tokens** - `9dcc0e9` (feat)
2. **Task 2: Create brand reference document** - `fae7e0d` (docs)

## Files Created/Modified
- `src/contexts/ThemeContext.tsx` - ThemeProvider with light/dark/system toggle, useTheme hook
- `src/index.css` - Complete overhaul: teal brand tokens, dark mode overrides, brand utility classes
- `src/main.tsx` - ThemeProvider wrapper added outside ConvexProvider
- `index.html` - Inter-only Google Fonts (dropped Playfair Display, added weights 700/800)
- `docs/UI_BRAND_REFERENCE.md` - Comprehensive brand/UI reference (360 lines)

## Decisions Made
- **Inter-only typography:** Dropped Playfair Display entirely. Inter at 700-800 weight provides sufficient visual hierarchy for headings. Matches "Notion-style" reference. Removes ~90KB font download.
- **Teal brand accent:** #0D9488 (teal-600) as primary, with #0F766E hover and #115E59 active. In dark mode, lighter #14B8A6 for contrast.
- **shadcn primary remapped:** Changed --color-primary from dark blue (hsl(222.2 47.4% 11.2%)) to teal (hsl(172 90% 30%)) so all shadcn Button, Ring, etc. automatically use brand color.
- **Ring color remapped:** --color-ring also set to teal HSL to match focus rings with brand.
- **Kitchen/domain colors preserved:** Station colors (production, boxing, stickering, packing), GoFood, K3Mart, and kitchen status colors remain unchanged -- they are semantic, not brand accent.
- **Border radius increased:** --radius-lg from 0.5rem to 0.75rem (12px), --radius-md from calc to 0.5rem (8px), --radius-sm from calc to 0.375rem (6px).
- **Removed deprecated CSS tokens:** --color-text-primary, --color-text-secondary, --color-text-muted, --color-dark-gradient-from/to, --font-heading all removed.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- ThemeProvider is active and ready for theme toggle UI (Plan 02 will add to Header/Layout)
- Dark mode CSS variables are defined but no pages use dark: prefix yet (Plans 03/04 will audit)
- Brand utility classes (text-brand, bg-brand, etc.) are ready but page components still reference terracotta in their own code (Plans 03/04 will migrate)
- UI_BRAND_REFERENCE.md is the source of truth for all subsequent plan work

## Self-Check: PASSED

- [x] src/contexts/ThemeContext.tsx exists
- [x] docs/UI_BRAND_REFERENCE.md exists (360 lines)
- [x] src/index.css has no terracotta references
- [x] index.html has no Playfair references
- [x] ThemeProvider in main.tsx confirmed
- [x] @custom-variant dark in index.css confirmed
- [x] .dark {} block in index.css confirmed
- [x] npm run type-check passes
- [x] Commit 9dcc0e9 exists (Task 1)
- [x] Commit fae7e0d exists (Task 2)

---
*Phase: 09-ui-brand*
*Completed: 2026-02-14*
