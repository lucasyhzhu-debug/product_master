---
phase: 17-unified-dispatch-planner-3rd-outlet
verified: 2026-02-17T04:30:00Z
status: passed
score: 6/6 must-haves verified
re_verification: false
gaps: []
human_verification:
  - test: "Open /dispatch-planner as Manager and verify capacity bars appear in the correct row order (Direct first, GoFood second, K3Mart third, Consignment fourth)"
    expected: "Four channel groups appear in priority order with colored left borders and segmented capacity bars"
    why_human: "Channel ordering depends on seeded data (seedDefaults not yet run in production). Code wiring is confirmed but initial data setup is a runtime step."
  - test: "Create a Direct Sales order with a dueDate 4+ days from today, then reload /dispatch-planner"
    expected: "Order appears as a sub-row in the Direct Sales channel. At dueDate-2 the cell is faded, at dueDate the cell is solid with the order quantity."
    why_human: "Direct order assembly logic is correct in code but the multi-table join behavior (orders -> orderItems -> dueDate offset) needs real data to confirm end-to-end."
  - test: "Verify Tamtem outlet appears in GoFood channel rows after the next cron run"
    expected: "Legato Tamtem shows as a GoFood outlet row alongside Goldfinch and Crystal (after seedGoBizOutlets is run for Tamtem)"
    why_human: "Tamtem is in GOBIZ_CONFIG and GOBIZ_OUTLET_SEED, but the externalOutlets record must be created via seedGoBizOutlets before the GoFood channel assembler can find it. This runtime step cannot be verified programmatically."
---

# Phase 17: Unified Dispatch Planner & 3rd Outlet Verification Report

**Phase Goal:** Manager can plan the entire week's production dispatch across all channels in one page, see demand waterfall, and the 3rd GoFood outlet (Tamtem) syncs transactions
**Verified:** 2026-02-17T04:30:00Z
**Status:** passed
**Re-verification:** No - initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Manager can configure channel priorities, commission rates, and sees planned targets for next 7 days | VERIFIED | `ChannelSettingsDialog` has Priorities tab (up/down reorder) and Channels tab (commission rate input per channel). `PlannerGrid` shows capacity bars with daily planned quantities. |
| 2 | Standalone weekly planner page shows all channels side-by-side without replacing K3Mart cockpit | VERIFIED | Route `/dispatch-planner` in `App.tsx` (line 269). K3Mart cockpit at `/k3mart-cockpit` untouched. Both routes active simultaneously. |
| 3 | Direct orders appear in planner at dueDate-2 as sub-rows with product, quantity, and target day | VERIFIED | `assembleDirectChannel` in `queries.ts` fetches orders by dueDate range, computes `prodStartStr = dueDate - 2`, creates outlet row per order with faded production-start cells and solid due-date cells. |
| 4 | Demand waterfall shows daily capacity allocation across channels by priority, over-capacity highlighted red | VERIFIED | `CapacityBar.tsx` renders segmented colored bars per channel. `isOverCapacity` flag triggers red dot and red label. `PlannerGrid` grand totals row also shows red text when over capacity. |
| 5 | Tamtem (G958262444) transactions sync automatically alongside Goldfinch and Crystal | VERIFIED | `GOBIZ_CONFIG.merchantIds` in `config.ts` (line 15) includes all 3 IDs. Adapter uses `[...GOBIZ_CONFIG.merchantIds]` for iteration. Cron `autoSyncGoBizRevenue` iterates all merchant IDs. |
| 6 | (Lower priority) System checks inventory sufficiency and flags insufficient dates | VERIFIED | `simulateInventory` query walks BOM per product vs `componentStock`, returns `ok/low/out` per day. "Simulate Inventory" button on DispatchPlanner page triggers it. Column headers show color-coded indicators (red=out, yellow=low, green=ok). |

**Score:** 6/6 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `convex/integrations/gobiz/config.ts` | Tamtem G958262444 added to merchantIds | VERIFIED | Lines 15-20: all 3 merchant IDs in `merchantIds` array and `merchantNames` map |
| `convex/schema.ts` | 4 new dispatch planner tables | VERIFIED | Lines 1245-1297: `dispatchPlans`, `dispatchChannelConfig`, `dispatchConsignmentOutlets`, `dispatchPlannerSettings` all defined with proper indexes |
| `convex/dispatchPlanner/mutations.ts` | seedDefaults + 7 mutations | VERIFIED | 8 mutations: `seedDefaults`, `savePlanCell`, `updateChannelConfig`, `reorderChannelPriorities`, `updatePlannerSettings`, `addConsignmentOutlet`, `updateConsignmentOutlet`, `removeConsignmentOutlet` |
| `convex/dispatchPlanner/queries.ts` | 5 queries for weekly plan assembly | VERIFIED | `getChannelConfig`, `getPlannerSettings`, `getConsignmentOutlets`, `getUnifiedWeeklyPlan`, `simulateInventory` - all substantive, multi-table queries |
| `convex/dispatchPlanner/helpers.ts` | Pure business logic helpers | VERIFIED | `generateWeekDates`, `getDayType`, `calculatePreFill`, `redistributeOverCapacity`, `epochToDateString`, `orderDueDateToProductionStart`, `CHANNEL_COLORS` |
| `src/hooks/convex/useDispatchPlanner.ts` | 12 frontend hooks | VERIFIED | 5 query hooks + 7 mutation hooks, all using `useProtectedMutation` or `useQuery` |
| `src/hooks/convex/index.ts` | Barrel exports for dispatch planner hooks | VERIFIED | Lines 389-402: all 12 hooks exported |
| `src/components/dispatchPlanner/ChannelSettingsDialog.tsx` | 4-tab settings dialog | VERIFIED | Priorities, Channels, Outlets, Capacity tabs - all substantive with real CRUD operations |
| `src/components/dispatchPlanner/WeekNav.tsx` | Week navigation component | VERIFIED | Prev/Next/Today navigation with formatted date range display |
| `src/components/dispatchPlanner/PlannerCell.tsx` | Editable cell with auto-save | VERIFIED | 300ms debounce save, Enter/Escape/Tab keyboard support, faded mode, read-only mode |
| `src/components/dispatchPlanner/CapacityBar.tsx` | Segmented capacity bar | VERIFIED | Per-channel colored segments, over-capacity red indicator, hover tooltip with breakdown |
| `src/components/dispatchPlanner/ChannelGroup.tsx` | Collapsible 3-level hierarchy | VERIFIED | Channel > Outlet > Product hierarchy with Framer Motion AnimatePresence |
| `src/components/dispatchPlanner/PlannerGrid.tsx` | Grid orchestrator | VERIFIED | Assembles CapacityBar + ChannelGroup, grand totals row, simulation result indicators |
| `src/pages/DispatchPlanner.tsx` | Main page | VERIFIED | Substantive page with week navigation, settings dialog, simulate inventory, full grid |
| `src/App.tsx` | Route `/dispatch-planner` | VERIFIED | Line 269: route exists with `canAccessDashboard` permission guard |
| `src/components/layout/Header.tsx` | Nav entry for Dispatch Planner | VERIFIED | Line 74: `CalendarRange` icon, `canAccessDashboard` permission, label "Dispatch" |
| `src/components/dispatchPlanner/index.ts` | Barrel exports for components | VERIFIED | All 6 components + types exported |
| `convex/_generated/api.d.ts` | Generated API includes dispatchPlanner | VERIFIED | Lines 23-25, 154-156: `dispatchPlanner/helpers`, `mutations`, `queries` all registered |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `DispatchPlanner.tsx` | `useDispatchPlannerWeekly` | import from `@/hooks/convex` | WIRED | Lines 33-37: imported and called at line 76 |
| `DispatchPlanner.tsx` | `useDispatchSavePlanCell` | import from `@/hooks/convex` | WIRED | Line 35, used in `handleSaveCell` callback at line 93 |
| `DispatchPlanner.tsx` | `useDispatchSimulateInventory` | import from `@/hooks/convex` | WIRED | Line 36, triggered by Simulate Inventory button at line 109 |
| `DispatchPlanner.tsx` | `PlannerGrid` | import from `@/components/dispatchPlanner` | WIRED | Line 25, rendered at line 191 with `data` and `onSaveCell` props |
| `DispatchPlanner.tsx` | `ChannelSettingsDialog` | import from `@/components/dispatchPlanner` | WIRED | Line 26, rendered at line 207 with `open` and `onOpenChange` props |
| `PlannerGrid.tsx` | `CapacityBar` | import from `./CapacityBar` | WIRED | Line 12, rendered in capacity row (lines 240-244) |
| `PlannerGrid.tsx` | `ChannelGroup` | import from `./ChannelGroup` | WIRED | Line 13, rendered per channel (lines 252-264) |
| `ChannelGroup.tsx` | `PlannerCell` | import from `./PlannerCell` | WIRED | Line 16, rendered per product row cell (line 286) |
| `useDispatchPlanner.ts` | `api.dispatchPlanner.queries` | Convex generated API | WIRED | All 5 query hooks use correct `api.dispatchPlanner.queries.*` paths |
| `useDispatchPlanner.ts` | `api.dispatchPlanner.mutations` | Convex generated API | WIRED | All 7 mutation hooks use `useProtectedMutation(api.dispatchPlanner.mutations.*)` |
| `Header.tsx` | `/dispatch-planner` | `mainNavItems` array | WIRED | Line 74: `{ path: '/dispatch-planner', label: 'Dispatch', icon: CalendarRange, permission: 'canAccessDashboard' }` |
| `GoBiz adapter` | `G958262444` (Tamtem) | `GOBIZ_CONFIG.merchantIds` spread | WIRED | Adapter line 270: `[...GOBIZ_CONFIG.merchantIds]` now includes Tamtem |
| `queries.ts getUnifiedWeeklyPlan` | `assembleDirectChannel` | local function call | WIRED | Line 185-186: called with all required parameters including `allDispatchPlans` |
| `queries.ts getUnifiedWeeklyPlan` | `assembleGofoodChannel` | local function call | WIRED | Line 188-190: called for GoFood channel |
| `queries.ts simulateInventory` | `componentStock` table | `ctx.db.query` | WIRED | Line 695: queries componentStock, aggregates by componentTypeId |

### Anti-Patterns Found

No blockers or stubs detected across dispatch planner files. The two instances of `return null` in `ChannelGroup.tsx` (empty outlets guard) and `PlannerGrid.tsx` (null simulation results) are legitimate guard patterns, not stubs.

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None | - | - | - | No anti-patterns found |

### Human Verification Required

#### 1. Channel Priority Order After Seed

**Test:** Run `dispatchPlanner:seedDefaults` with admin token, then open `/dispatch-planner` as Manager. Verify four channel groups appear in correct priority order.
**Expected:** Direct Sales (blue, priority 1) > GoFood (green, priority 2) > K3Mart (orange, priority 3) > Other Consignment (gray, priority 4)
**Why human:** Code logic is verified but actual rendering depends on seedDefaults being run in the production/dev Convex instance. The seed is not automatic on deploy.

#### 2. Direct Order Sub-Row Rendering

**Test:** Create a Direct Sales order with a dueDate 4+ days from today, confirm order, then reload `/dispatch-planner` on current week.
**Expected:** Order appears as a sub-row under "Direct Sales" channel. The cell at dueDate-2 is faded (production-start), the cell at dueDate shows the quantity in solid style.
**Why human:** The multi-table join (orders + orderItems + dueDate epoch range filter) needs real data to validate the epoch timezone math works correctly in WIB/Jakarta timezone.

#### 3. Tamtem GoFood Channel Row

**Test:** After running `seedGoBizOutlets` to register Tamtem in `externalOutlets`, reload `/dispatch-planner`.
**Expected:** Legato Tamtem appears as a sub-row under the GoFood channel alongside Goldfinch and Crystal.
**Why human:** Tamtem is registered in GOBIZ_CONFIG and GOBIZ_OUTLET_SEED, but the `externalOutlets` Convex record must be created via the existing `seedGoBizOutlets` mutation before `assembleGofoodChannel` can find it by `source="gobiz"`. This is a one-time runtime setup step.

### Gaps Summary

No gaps found. All 6 success criteria are verified in the codebase. The phase delivers:

1. **Schema foundation** (4 tables with proper indexes) registered in `convex/schema.ts` and the Convex generated API
2. **Full backend API** (5 queries + 8 mutations) with auth enforcement, multi-table assembly, and inventory simulation
3. **Pure helpers** for date math, capacity redistribution, and pre-fill calculation
4. **12 React hooks** wrapping all backend operations with `useProtectedMutation`
5. **6 UI components** forming a complete grid: WeekNav, CapacityBar, PlannerCell, ChannelGroup, PlannerGrid, ChannelSettingsDialog
6. **Main page** at `/dispatch-planner` with week navigation, channel settings, inventory simulation button
7. **Routing** with `canAccessDashboard` auth guard and Header navigation entry
8. **Tamtem** added to GoBiz config so it syncs on the next cron run

One important runtime note: `seedDefaults` must be run once in the Convex dashboard after deployment to populate the initial channel config, planner settings, and consignment outlets. This is documented in the Plan 01 summary.

---

_Verified: 2026-02-17T04:30:00Z_
_Verifier: Claude (gsd-verifier)_
