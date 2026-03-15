---
phase: quick-32
plan: 01
subsystem: ui
tags: [react, navigation, dropdown, lucide]

requires:
  - phase: 48-frontend-permissions
    provides: canManageReimbursements permission flag and expense nav links
provides:
  - Financials dropdown in desktop header consolidating 6 financial pages
  - Financials section in mobile header sheet
  - Financial items in MobileBottomNav More sheet
  - Financials area card on HubPage
affects: [header, navigation, hub-page]

tech-stack:
  added: []
  patterns: [dropdown-nav-grouping]

key-files:
  created: []
  modified:
    - src/components/layout/Header.tsx
    - src/components/layout/MobileBottomNav.tsx
    - src/pages/HubPage.tsx

key-decisions:
  - "financialItems array placed between depotItems and configItems for logical grouping"
  - "Financials dropdown renders between main nav items and Depots dropdown in desktop header"
  - "MobileBottomNav groups all 6 financial items together (Expenses, Exp.Analytics, Income Stmt, Reimburse, Bank Accts, Payroll)"
  - "HubPage Financials card uses amber-500 color and FileText icon"

patterns-established:
  - "Financials dropdown pattern: same DropdownMenu structure as Depots/Config/Admin"

requirements-completed: [NAV-01]

duration: 4min
completed: 2026-03-15
---

# Quick Task 32: Financials Dropdown Nav Summary

**Consolidated 6 financial pages (Income Statement, Expenses, Exp. Analytics, Reimburse, Bank Accts, Payroll) under a single Financials dropdown in desktop header, mobile sheet section, MobileBottomNav, and HubPage area card**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-15T14:38:19Z
- **Completed:** 2026-03-15T14:42:35Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Desktop header reduced from 9 mainNavItems + 6 adminItems to 6 mainNavItems + 3 adminItems, with 6 items in new Financials dropdown
- All 3 navigation surfaces (desktop header, mobile header sheet, MobileBottomNav) now have complete Financials grouping
- HubPage has new Financials area card with 6 links, amber icon, visible to users with canAccessDashboard OR canSubmitExpenses OR canManageReimbursements

## Task Commits

Each task was committed atomically:

1. **Task 1: Restructure Header.tsx - create Financials dropdown and mobile section** - `afb350e` (feat)
2. **Task 2: Add financial items to MobileBottomNav and Financials card to HubPage** - `7607c08` (feat)

## Files Created/Modified
- `src/components/layout/Header.tsx` - Created financialItems array, removed financial items from mainNavItems/adminItems, added Financials dropdown and mobile sheet section
- `src/components/layout/MobileBottomNav.tsx` - Added Income Stmt, Reimburse, Bank Accts, Payroll to moreItems grouped with existing Expenses/Exp.Analytics
- `src/pages/HubPage.tsx` - Added Financials area card to HUB_AREAS and LINK_ICONS entries for all 6 financial labels

## Decisions Made
- financialItems array positioned between depotItems and configItems for logical grouping
- Desktop Financials dropdown placed between main nav items and Depots dropdown (matching plan)
- MobileBottomNav financial items ordered: Expenses, Exp.Analytics, Income Stmt, Reimburse, Bank Accts, Payroll (high-frequency first)
- HubPage Financials card placed after Sales & Distribution, before Configuration (index 3)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 6 financial pages reachable from every navigation surface
- Build passes, TypeScript clean
- Ready for visual verification

---
*Quick Task: 32-create-financials-dropdown-nav*
*Completed: 2026-03-15*
