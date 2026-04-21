---
name: Quick Task 260417-hyv Summary
description: Execution outcome for nav simplification
type: summary
status: complete
---

# Summary: Nav Bar Simplification

**Quick ID:** 260417-hyv
**Date:** 2026-04-17
**Branch:** `feature/999.4-channel-integration-spec`
**Commits (3):**
- `9f6d56ad` — refactor(nav): simplify header into 5 top-level slots
- `59858e36` — refactor(nav): NavItem as discriminated union
- `0530a610` — refactor(nav): drive dropdowns from single navGroups array

## What changed

Collapsed `src/components/layout/Header.tsx` from 8 top-level items + 5 dropdowns down to **1 top-level link + 4 dropdowns** (688 → 519 lines, net −169):

**Before:** `Sales  Analytics  Orders  Kitchen  Inventory  Planner  Help  Financials ▾  Accounting ▾  Depots ▾  Config ▾  Admin ▾`

**After:** `Dashboards ▾  Orders  Ops ▾  Finance ▾  Config ▾`

### Regrouping
| Old location | New location |
|---|---|
| Sales, Analytics (top) | **Dashboards** dropdown |
| Kitchen, My Perf, Inventory, Planner (top) + K3 Mart, GoFood, GrabFood (Depots) | **Ops** dropdown |
| Financials + Accounting dropdowns | merged **Finance** dropdown (separator between groups) |
| Help (top) + existing Config + Admin dropdowns | merged **Config** dropdown (separators between groups) |
| Orders (top) | unchanged |

### Code simplification
- `NavItem` redesigned as discriminated union (`NavLink | NavSeparator`) with `isSeparator()` type predicate. Eliminated three optional-chain guards.
- `navGroups[]` array drives both desktop dropdown rendering and mobile section rendering — collapsed 4 near-identical `<DesktopDropdown>` blocks and 4 near-identical `<MobileSection>` blocks into single loops.
- Extracted `DesktopDropdown` and `MobileSection` reusable components.
- Added `trimSeparators()` helper to collapse orphaned separators after permission filtering.
- Preload hooks (`_prefetchOrders`, `_prefetchKitchen`, `_prefetchInventory`, `_prefetchRestock`, `_prefetchGoFood`) preserved on hover/focus.

## Verification

- All 35 pre-refactor routes reachable via the new structure (byte-identical sorted set).
- No route paths, permission keys, or `rolesAllowed` values changed.
- `npm run type-check` → 0 errors.
- `npm run build` → fails with **pre-existing** phase-74 staff-attendance errors in `StaffPerformance.tsx`, `EndOfShiftForm.tsx`, `staffPerformanceExport.ts`, `KitchenViewV2.tsx`. Stashing this change and rerunning `build` reproduces the same errors — this commit is not the cause.

## Session incident

Mid-workflow the user switched to `main` and cherry-picked unrelated Phase 1000 commits onto it. Quick-task artifacts survived as untracked files. Workflow resumed on `feature/999.4-channel-integration-spec` where the 3 nav commits still live.

## Follow-up

- Fix pre-existing phase-74 build errors before merging this branch to main (out of scope for this quick task).
- Consider wrapping `filterItems` in `useMemo` if nav perf becomes a concern (REVIEW.md Nitpick #1) — not blocking.
