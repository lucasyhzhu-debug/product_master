---
phase: 09-ui-brand
plan: 03
subsystem: ui
tags: [page-header, semantic-tokens, brand-consistency, padding-cleanup, page-audit]

# Dependency graph
requires:
  - phase: 09-01
    provides: "CSS design tokens, brand utility classes, ThemeProvider"
  - phase: 09-02
    provides: "PageContainer uniform padding, Layout shell, PageHeader component"
provides:
  - Enhanced PageHeader with badge slot prop
  - 3 pages migrated from custom headers to PageHeader (Ingredients, Materials, MenuProducts)
  - 8 pages cleaned up for consistent padding, spacing, and semantic color tokens
  - Terracotta hardcoded colors replaced with semantic tokens in InventoryManager
affects: [09-04-page-audit-wave2, 09-05-verification]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "PageHeader badge prop for inline status indicators next to title"
    - "PageHeader action prop for header-level buttons (replaces manual flex wrappers)"
    - "space-y-6 as standard content section spacing (PageContainer handles outer padding)"

key-files:
  created: []
  modified:
    - src/components/layout/PageHeader.tsx
    - src/pages/IngredientsManager.tsx
    - src/pages/MaterialsManager.tsx
    - src/pages/MenuProductsManager.tsx
    - src/pages/PackagingView.tsx
    - src/pages/UsersManager.tsx
    - src/pages/VouchersManager.tsx
    - src/pages/WhatsAppTemplatesManager.tsx
    - src/pages/InventoryManager.tsx
    - src/pages/SalesAnalytics.tsx
    - src/pages/K3MartCockpit.tsx

key-decisions:
  - "ComponentTypesManager.tsx is a deleted stub file -- skipped from audit (not a real page)"
  - "LocationsManager.tsx already fully compliant -- no changes needed"
  - "Semantic status colors (green/yellow/red for margins, blue/green for discount types) preserved as-is -- these are semantic, not brand accent"
  - "Terracotta gradient on InventoryManager receive button replaced with default primary button (shadcn Button already uses brand teal)"
  - "K3MartCockpit sync button moved into PageHeader action prop instead of manual flex wrapper"
  - "PackagingView badge moved into PageHeader badge prop instead of inline flex wrapper"

patterns-established:
  - "All standard pages use PageHeader (not custom headers) -- 13+ pages now compliant"
  - "No page adds its own p-6/container wrapper -- PageContainer is sole padding source"
  - "Hardcoded gray/white/terracotta replaced with semantic tokens across audited pages"

# Metrics
duration: 5min
completed: 2026-02-14
---

# Phase 9 Plan 03: Page Audit Wave 1 Summary

**PageHeader badge slot enhancement, 3 custom-header migrations (Ingredients/Materials/MenuProducts), and 8 pages cleaned for consistent padding, semantic colors, and space-y-6 spacing**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-14T08:11:00Z
- **Completed:** 2026-02-14T08:16:01Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments
- Enhanced PageHeader with optional `badge` ReactNode prop for inline status indicators
- Migrated IngredientsManager, MaterialsManager, and MenuProductsManager from custom headers to PageHeader
- Removed redundant `p-6` outer padding from UsersManager, VouchersManager, WhatsAppTemplatesManager, InventoryManager, SalesAnalytics (PageContainer provides uniform padding)
- Replaced terracotta `#E07856` hardcoded colors with semantic primary tokens in InventoryManager
- Replaced `text-gray-900` with `text-foreground` in WhatsAppTemplatesManager, K3MartCockpit
- Refactored PackagingView and K3MartCockpit to use PageHeader badge/action props properly

## Task Commits

Each task was committed atomically:

1. **Task 1: Enhance PageHeader and fix 6 pages with custom headers** - `d56ad59` (feat)
2. **Task 2: Fix remaining standard pages for consistency** - `90f7f2c` (feat)

## Files Created/Modified
- `src/components/layout/PageHeader.tsx` - Added badge ReactNode prop, wrapped title in flex container with gap-3
- `src/pages/IngredientsManager.tsx` - Migrated from custom h1+ArrowLeft to PageHeader, removed useNavigate
- `src/pages/MaterialsManager.tsx` - Migrated from custom h1+ArrowLeft to PageHeader, removed useNavigate
- `src/pages/MenuProductsManager.tsx` - Migrated from custom h1+ArrowLeft to PageHeader with action buttons, removed ArrowLeft import
- `src/pages/PackagingView.tsx` - Refactored to use PageHeader badge prop for order count
- `src/pages/UsersManager.tsx` - Replaced p-6 with space-y-6, removed mt-6 gap (space-y handles it)
- `src/pages/VouchersManager.tsx` - Replaced p-6 with space-y-6, removed mt-6 on Tabs
- `src/pages/WhatsAppTemplatesManager.tsx` - Replaced p-6 with space-y-6, fixed text-gray-900 to text-foreground
- `src/pages/InventoryManager.tsx` - Replaced p-6 with space-y-6, removed terracotta gradient button and badge colors
- `src/pages/SalesAnalytics.tsx` - Replaced p-6 with space-y-6, removed mt-6 on Tabs
- `src/pages/K3MartCockpit.tsx` - Fixed text-gray-900 to text-foreground, moved sync button into PageHeader action prop

## Decisions Made
- **ComponentTypesManager.tsx skipped:** The file is a 4-line stub with a comment saying it was removed. Not a real page.
- **LocationsManager.tsx no-op:** Already used PageHeader, space-y-6, bg-card, and semantic tokens. Zero changes needed.
- **Semantic status colors preserved:** Colors like text-green-600/text-yellow-600/text-red-600 for margin health indicators, bg-blue-500/bg-green-500 for product type badges, and text-blue-600/text-green-600 for discount type display are semantic -- they convey meaning, not brand identity. Left as-is.
- **InventoryManager receive button simplified:** Replaced terracotta gradient `bg-gradient-to-r from-[#E07856] to-[#D66A4A]` with default shadcn Button styling (which uses the teal primary from Plan 01).
- **K3MartCockpit and PackagingView refactored:** Instead of wrapping PageHeader in manual flex divs for buttons/badges, moved these into the proper PageHeader props (action, badge).

## Deviations from Plan

None - plan executed exactly as written. All 13 standard pages audited as specified (ComponentTypesManager being a deleted stub is the only deviation from the file list, but this was noted in the plan itself: "Also known as ComponentTypesManager. Check actual filename.").

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- 13 standard pages now have consistent PageHeader, spacing, and semantic color tokens
- Plan 04 (Wave 2 page audit) can focus on the complex pages: KitchenViewV2, OrderManager, OrderDetail, Dashboard
- Those pages have significantly more hardcoded colors (text-gray-900, bg-white, border-gray-200, order-heading) and will need careful per-component auditing

## Self-Check: PASSED

- [x] src/components/layout/PageHeader.tsx has badge prop (verified)
- [x] IngredientsManager.tsx imports PageHeader (verified)
- [x] MaterialsManager.tsx imports PageHeader (verified)
- [x] MenuProductsManager.tsx imports PageHeader (verified)
- [x] No text-gray-900/bg-white/border-gray-200 in any audited page (verified)
- [x] No p-6 wrappers in WhatsAppTemplatesManager (verified)
- [x] No terracotta #E07856 in InventoryManager (verified)
- [x] npm run build passes (verified)
- [x] Commit d56ad59 exists (Task 1)
- [x] Commit 90f7f2c exists (Task 2)

---
*Phase: 09-ui-brand*
*Completed: 2026-02-14*
