---
phase: 09-ui-brand
plan: 04
subsystem: ui
tags: [semantic-colors, brand-tokens, css-variables, dark-mode-ready, pageheader, tailwind-responsive]

# Dependency graph
requires:
  - phase: 09-01
    provides: ThemeProvider, teal brand CSS tokens, dark mode overrides, brand utility classes
  - phase: 09-02
    provides: PageHeader, PageContainer, Layout components, fullWidth routing
provides:
  - Dashboard using PageHeader (no custom hero)
  - OrderManager using PageHeader with brand colors (no terracotta, no Playfair)
  - KitchenViewV2 with semantic colors and station CSS variables
  - All pages and components free of terracotta hex references
  - Kitchen components using CSS variable-based colors (dark mode ready)
  - OrderFormPOS using brand CSS variables instead of hardcoded #E07856
affects: [09-05-verification]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Station colors via CSS variables: var(--color-station-packing) etc."
    - "Brand accent in components via var(--color-brand) arbitrary values"
    - "Tailwind responsive classes (md:hidden/md:flex) replacing window.innerWidth"
    - "bg-foreground text-background for dark summary panels (replacing removed gradient vars)"

key-files:
  created: []
  modified:
    - src/pages/Dashboard.tsx
    - src/pages/OrderManager.tsx
    - src/pages/RestockPlanner.tsx
    - src/pages/KitchenViewV2.tsx
    - src/components/orders/OrderFormPOS.tsx
    - src/components/kitchen/PackingPanel.tsx
    - src/components/kitchen/BoxingOrderCard.tsx

key-decisions:
  - "Replaced window.innerWidth mobile detection with Tailwind responsive classes (md:hidden/md:flex) in OrderManager"
  - "Used bg-foreground text-background for dark summary panels instead of removed --color-dark-gradient-from/to CSS vars"
  - "Kitchen #E07856 references replaced with station CSS vars (--color-station-packing) not brand vars (domain color, not accent)"
  - "Removed embedded Playfair Display font import from OrderFormPOS inline style block"
  - "Dashboard PageHeader uses action prop for Getting Started button (preserves functionality)"

patterns-established:
  - "Kitchen station colors use CSS variables exclusively (no hardcoded hex in components)"
  - "Brand accent in non-kitchen components via var(--color-brand) with dark/darker variants"
  - "All page headers standardized through PageHeader component"

# Metrics
duration: 6min
completed: 2026-02-14
---

# Phase 9 Plan 04: Complex Page Audit (Wave 2) Summary

**Dashboard/OrderManager/KitchenViewV2 PageHeader migration, terracotta-to-brand/station-variable replacement across 23 files, Playfair Display removal from OrderFormPOS**

## Performance

- **Duration:** 6 min
- **Tasks:** 2
- **Files modified:** 23

## Accomplishments
- Dashboard hero section replaced with PageHeader, spacing standardized to space-y-6
- OrderManager custom header replaced with PageHeader, all terracotta colors replaced with brand tokens, window.innerWidth replaced with Tailwind responsive classes
- KitchenViewV2 header standardized with semantic colors, station heading text-gray-900 replaced with text-foreground
- RestockPlanner redundant container py-6 wrapper removed (PageContainer provides padding)
- OrderFormPOS: removed embedded Playfair Display font import and order-form-heading class, replaced 20+ #E07856 hex references with var(--color-brand) CSS variables
- PackingPanel: replaced all #E07856 references with station CSS variables (--color-station-packing-*)
- 15 kitchen components: bg-white -> bg-card, border-[#E8E2DB] -> border-border for dark mode readiness

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix Dashboard, OrderManager, and RestockPlanner pages** - `be3c5d5` (feat)
2. **Task 2: Fix KitchenViewV2 and component-level color cleanup** - `889711b` (feat)

## Files Created/Modified
- `src/pages/Dashboard.tsx` - Custom hero replaced with PageHeader, space-y-8 to space-y-6
- `src/pages/OrderManager.tsx` - PageHeader, brand tokens, Tailwind responsive, no terracotta/order-heading
- `src/pages/RestockPlanner.tsx` - Removed redundant container py-6 wrapper
- `src/pages/KitchenViewV2.tsx` - Semantic header colors, station heading text-foreground
- `src/components/orders/OrderFormPOS.tsx` - Brand CSS vars, removed Playfair, semantic grays
- `src/components/orders/ProductButtons.tsx` - text-gray-500 to text-muted-foreground
- `src/components/kitchen/PackingPanel.tsx` - Station CSS variables, semantic grays, bg-card
- `src/components/kitchen/BoxingOrderCard.tsx` - bg-card, border-border, text-foreground
- `src/components/kitchen/BoxingPanel.tsx` - bg-card, border-border
- `src/components/kitchen/StickeringPanel.tsx` - bg-card, border-border
- `src/components/kitchen/ProductionLogPanel.tsx` - bg-card, border-border
- `src/components/kitchen/GoFoodStickerCard.tsx` - bg-card, border-border
- `src/components/kitchen/GoFoodPackingCard.tsx` - bg-card
- `src/components/kitchen/K3MartStockCard.tsx` - bg-card, border-border
- `src/components/kitchen/K3MartPackingCard.tsx` - bg-card
- `src/components/kitchen/SwipeableKitchenLayout.tsx` - bg-card, border-border
- `src/components/kitchen/BallTrayCounter.tsx` - bg-card, border-border, hover:bg-muted
- `src/components/kitchen/DailySummaryWidget.tsx` - bg-card, border-border
- `src/components/kitchen/ReadyToShipCard.tsx` - bg-card
- `src/components/kitchen/StickeringOrderCard.tsx` - bg-card, border-border
- `src/components/kitchen/KanbanColumn.tsx` - bg-card, border-border
- `src/components/kitchen/PackageCounter.tsx` - bg-card, border-border, hover:bg-muted
- `src/components/kitchen/PackagingStockItem.tsx` - bg-card, border-border

## Decisions Made
- **Replaced window.innerWidth with Tailwind responsive:** OrderManager used useState + useEffect for mobile breakpoint detection. Replaced with md:hidden/md:flex CSS classes which are more reliable and SSR-compatible.
- **Dark summary panel:** OrderManager's today stats footer used --color-dark-gradient-from/to (removed in Plan 01). Replaced with bg-foreground text-background which automatically adapts to light/dark themes.
- **Kitchen #E07856 -> station vars:** The packing panel's #E07856 hex references are station-specific (packing color), not brand accent. Replaced with --color-station-packing CSS variables to preserve domain semantics.
- **Removed Playfair Display import:** OrderFormPOS had an inline `<style>` block importing Playfair Display via Google Fonts. This was completely removed since Inter is the site-wide font (Plan 01 decision).
- **Dashboard PageHeader:** Kept the Getting Started button as the PageHeader action prop. Removed decorative gradient blurs and the Sparkles icon header label.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed broken order-form-heading CSS class reference**
- **Found during:** Task 2 (OrderFormPOS cleanup)
- **Issue:** After removing `order-form-heading` class name from className strings, the inline CSS `<style>` block had an empty `.{}` selector from the broken class name
- **Fix:** Removed the entire `<style>` block (Playfair Display import + both class definitions were now unnecessary)
- **Files modified:** src/components/orders/OrderFormPOS.tsx
- **Verification:** Build passes, no visual regression
- **Committed in:** 889711b

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor fix to prevent broken CSS selector. No scope creep.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 6 complex pages audited and fixed (Dashboard, OrderManager, OrderDetail, KitchenViewV2, Login, RestockPlanner)
- No terracotta references remain in any page or component files
- No order-heading class usage remains
- Kitchen station colors preserved via CSS variables
- Component-level cleanup complete across orders/, kitchen/ directories
- Plan 09-05 (verification) can now validate the full UI brand consolidation

## Self-Check: PASSED

- [x] src/pages/Dashboard.tsx uses PageHeader (confirmed via grep)
- [x] src/pages/OrderManager.tsx uses PageHeader (confirmed via grep)
- [x] No terracotta in src/pages/ (grep returns 0)
- [x] No terracotta in src/components/orders/ (grep returns 0)
- [x] No terracotta in src/components/dashboard/ (grep returns 0)
- [x] No terracotta in src/components/kitchen/ (grep returns 0)
- [x] No order-heading in src/ (grep returns 0)
- [x] Kitchen station colors preserved (23 occurrences in 2 files)
- [x] npm run build passes
- [x] Commit be3c5d5 exists (Task 1)
- [x] Commit 889711b exists (Task 2)

---
*Phase: 09-ui-brand*
*Completed: 2026-02-14*
