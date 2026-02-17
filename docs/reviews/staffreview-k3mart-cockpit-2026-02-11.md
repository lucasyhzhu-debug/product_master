# Staff Review: K3 Mart Management Cockpit

**Date:** 2026-02-11
**Plan:** `C:\Users\Irfan\.claude\plans\vivid-soaring-star.md`
**Reviewers:** Staff Developer (Implementation) + Principal Developer (Architecture)

---

## 0. Plan Validation

```
PLAN VALIDATION CHECKLIST
=========================

[x] Git Workflow section exists?
  -> Branch: feature/k3mart-cockpit
  -> Checkpoints: "After each wave"

[x] Implementation Waves section exists?
  -> 6 waves defined
  -> Agents assigned (convex-backend, react-ui-builder, code-auditor)
  -> File paths specified for all waves
  -> PARALLEL/SEQUENTIAL marked

[x] Documentation Updates section exists?
  -> CHANGELOG.md checkbox present
  -> SCHEMA.md, API_REFERENCE.md also listed

[x] Success Criteria section exists?
  -> Type check requirement present
  -> Build requirement present
  -> 16 feature-specific criteria listed

=========================
Plan structure validated
```

---

## 1. Summary

**Overall Assessment:** Revise

The plan is ambitious and well-structured, covering a real business need (transitioning from read-only stock monitoring to a full dispatch management cockpit). The API reference and POC documentation are excellent. However, the plan has several critical issues: **no automated testing**, a **mega-query anti-pattern** that will cause performance problems, **schema duplication** with existing tables, multiple **race conditions** in the stock submission flow, and a **missing implementation wave** for the holidays utility. These must be addressed before implementation begins.

---

## 2. Critical Issues (Must Fix)

| # | Issue | Category | Location in Plan |
|---|-------|----------|------------------|
| 1 | No automated test plan | Testing | Wave 6 |
| 2 | `getCockpitSummary` mega-query | Performance | Wave 2 Queries |
| 3 | Race condition in bulk stock submissions | Logic | Wave 3 Actions |
| 4 | `restockTargets` vs `k3martDispatchPlans` duplication | Schema | Wave 1 |
| 5 | Missing wave for `indonesianHolidays.ts` | Implementation | Waves 1-5 |
| 6 | `autoBumpConsignmentTarget` duplicates `setProductTarget` | Duplication | Wave 2 Mutations |
| 7 | Redundant index `by_date` on `k3martDispatchPlans` | Schema | Wave 1 |

**Details:**

### Issue 1: No Automated Test Plan (Critical)

Wave 6 lists only `code-auditor` (type check), `npm run build`, and a manual test. There are **zero** automated test files planned. The project already has 10 test files under `tests/convex/` using `convex-test` with excellent patterns (see `gofoodDepot.test.ts` with 53 tests). A feature this large -- 5 queries, 8 mutations, 8 actions, 5 frontend components -- MUST have backend tests at minimum.

**Recommendation:** Add a testing wave between Wave 5 and Wave 6:
- `tests/convex/k3martCockpit.test.ts` -- Tests for queries and mutations (smart delta calculation, plan CRUD, status transitions, inventory adjustments)
- `tests/convex/k3martAdapter.test.ts` -- Tests for new adapter actions (mocked HTTP calls)
- Target: minimum 30 test cases covering happy path + error cases + edge cases

### Issue 2: `getCockpitSummary` Mega-Query

This single query joins **7+ tables**: `externalOutlets`, `externalStockSnapshots`, `restockTargets`, `externalRevenue` (7-day), `k3martDispatchPlans`, `productionCounts`, `productionProductTargets`, and `gofoodDepotStock`. In Convex, every table touched by a query creates a reactive subscription. A single change to any of these 7+ tables triggers a full re-evaluation and re-render.

**Impact:** Every stock sync, every sale, every production count update, every plan save -- all trigger a full cockpit recalculation pushed to every connected client.

**Recommendation:** Split into 3-4 focused queries:
1. `getOutletStockSummary` -- outlets + latest snapshots + today's sales
2. `getDispatchPlansForWeek` -- plans for the selected week
3. `getProductionReadiness` -- production counts vs planned quantities (already in the plan)
4. `getInventorySources` -- office stickered + goldfinch depot stock

This matches the existing pattern in `k3martKitchen/queries.ts` which already handles the outlet-stock-sales aggregation.

### Issue 3: Race Condition in Bulk Stock Submissions

`submitBulkStockIns` loops sequentially per outlet: `GET get-dashboard` (fresh stock) then `POST stock-flow/add`. If the POST fails or the K3 Mart API is slow, subsequent outlets proceed with potentially stale data. Also:

- **Partial failure**: If outlets 1-4 succeed but outlet 5 fails, there's no rollback. Internal inventory (productionCounts, gofoodDepotStock) has already been decremented for outlets 1-4.
- **Concurrent access**: Two browser tabs could submit simultaneously, double-decrementing office inventory.

**Recommendation:**
1. Add a `submissionInProgress` flag on the date's dispatch plans (mutex pattern). Check at start, set on begin, clear on complete.
2. Record each outlet's submission result individually. Failed outlets remain `confirmed` and can be retried.
3. **Do NOT decrement internal inventory until K3 Mart API confirms success** (i.e., after POST returns `success:true`). Currently the plan implies decrementing on submit, not on confirmation.

### Issue 4: `restockTargets` vs `k3martDispatchPlans` Overlap

The `restockTargets` table already stores per-outlet, per-product weekday/weekend restock targets for K3 Mart. The new `k3martDispatchPlans` table adds date-specific plans. The plan doesn't clarify the relationship:

- Does `k3martDispatchPlans` **replace** `restockTargets` for K3 Mart?
- Or does `k3martDispatchPlans` use `restockTargets` as **defaults** for auto-filling suggestions?
- The `getWeeklyDispatchPlans` query lists `restockTargets (weekday/weekend)` as a data source, suggesting the latter.

**Recommendation:** Document explicitly:
- `restockTargets` provides the **baseline targets** (weekday/weekend per outlet per product)
- `k3martDispatchPlans` stores the **actual daily plan** (can deviate from targets)
- Auto-suggestion formula: `suggestedQty = max(0, restockTargets.weekdayTarget - currentStock)`
- Consider whether `restockTargets` should be migrated/deprecated or kept as a companion table

### Issue 5: Missing Wave for `indonesianHolidays.ts`

The plan lists `src/lib/indonesianHolidays.ts` in "Key Files" as **Create** but no wave assigns any agent to create it. The WeeklyPlannerGrid in Wave 4 depends on it for weekend/holiday highlighting.

**Recommendation:** Add to Wave 1 (it's a static utility with no backend dependencies):
| Agent | Task | Files |
|-------|------|-------|
| react-ui-builder | Create holiday utility | `src/lib/indonesianHolidays.ts` |

### Issue 6: `autoBumpConsignmentTarget` Duplicates `setProductTarget`

The plan proposes a new mutation `autoBumpConsignmentTarget` that updates `productionProductTargets` with `source="consignment"` for deficit quantities. But `convex/productionTargets/mutations.ts:setProductTarget` already does exactly this -- it upserts a `productionProductTargets` record and auto-recomputes ball totals into `productionTargets.manualOverride`.

**Recommendation:** Remove `autoBumpConsignmentTarget` from the plan. Instead, call the existing `setProductTarget` mutation with `source: "consignment"` and the bumped quantity. This avoids duplicating the ball-total recomputation logic.

### Issue 7: Redundant Index on `k3martDispatchPlans`

Proposed indexes: `by_date`, `by_date_outlet`, `by_date_status`, `by_outlet_date`.

- `by_date` is a **prefix** of both `by_date_outlet` and `by_date_status`. In Convex, compound indexes can serve prefix queries, so `by_date` is redundant.
- 4 indexes on a frequently-written table (draft -> confirmed -> submitted -> approved) means 4 index updates per status change.

**Recommendation:** Remove `by_date` (already covered by `by_date_outlet` or `by_date_status`). Keep: `by_date_outlet`, `by_date_status`, `by_outlet_date`.

---

## 3. Improvements (Recommended)

| # | Improvement | Impact | Effort |
|---|-------------|--------|--------|
| 1 | Add `k3martDispatchPlans.weekNumber` for efficient week queries | High | Low |
| 2 | Split `submitStockFlow` action into fetch-then-submit pattern with retry | High | Medium |
| 3 | Add `isActive` field to `externalOutlets` toggle in existing schema | Medium | Low |
| 4 | Cache outlet dashboard data during bulk submit | Medium | Low |
| 5 | Use `actionToast` pattern for stock-in/out confirmations | Medium | Low |
| 6 | Add optimistic UI for plan cell edits | Medium | Medium |

**Details:**

### Improvement 1: Add `weekNumber` to Dispatch Plans

The `getWeeklyDispatchPlans` query needs to fetch 7 days of plans. With only `by_date_outlet`, it requires 7 index lookups (one per date) or a range scan. Adding a `weekNumber` field (ISO week, e.g., `"2026-W07"`) allows a single index query: `.withIndex("by_week", q => q.eq("weekNumber", "2026-W07"))`.

Alternatively, use a range query on `by_date_outlet` with `gte`/`lte` for the week's date range.

### Improvement 2: Retry Pattern for Stock Submissions

K3 Mart API may timeout or return 5xx errors. The plan's sequential submission has no retry logic. Add:
- 1 automatic retry with 2-second delay on HTTP 5xx or timeout
- Record attempt count in `k3martStockMovements`
- UI shows "Retrying..." state

### Improvement 3: Outlet Active Toggle Already Exists

The `externalOutlets` table already has `isActive: boolean`. The plan's `toggleOutletActive` mutation is straightforward, but note that the existing `discoverK3MartOutlets` action always sets `isActive: true`. After adding toggle capability, the discover action should **not** reactivate outlets that were manually deactivated.

### Improvement 4: Outlet Dashboard Caching During Bulk Submit

`submitBulkStockIns` calls `GET get-dashboard` per outlet. If both products go to the same outlet (Jumbo + Chewy), that's 2 dashboard calls for the same outlet. Cache the dashboard response per outlet within the bulk submit loop.

### Improvement 5: Use `actionToast` Pattern

Per CODE_STYLE.md, success confirmations should use `actionToast()` (floating near the click target), not `toast.success()`. The plan's stock-in/out forms and bulk submit dialog should use this pattern.

### Improvement 6: Optimistic UI for Plan Cells

The WeeklyPlannerGrid will have many editable cells. Without optimistic updates, each cell edit will feel sluggish (wait for mutation round-trip). Use local state for immediate visual feedback, then sync to backend.

---

## 4. Refinements (Minor Suggestions)

- The `k3martStockMovements.by_direction` index is unlikely to be queried alone (always filtered by outlet or date). Consider replacing with `by_outlet_direction` if needed.
- The `source` field on `k3martDispatchPlans` uses string literals (`"kitchen" | "goldfinch" | "outlet"`). Use `v.union(v.literal(...))` for type safety instead of `v.optional(v.string())`.
- The `destination` field on `k3martDispatchPlans` similarly should use typed literals.
- Consider adding `updatedBy` to `k3martDispatchPlans` for audit trail (who last edited each cell).
- The `k3martStockMovements.priceAtSubmission` and `currentStockAtSubmission` are good for auditing -- ensure these are populated from the fresh `get-dashboard` call, not from stale snapshot data.
- The `WeeklyPlannerGrid` at 8 outlets x 7 days = 56 cells per product tab. On mobile (280px minimum), this grid will not render usably. Plan should specify a mobile fallback (e.g., day-by-day view or stacked cards instead of grid).

---

## 5. Duplication Analysis

### Existing Code to Leverage

| Existing Code | Location | How to Use |
|---------------|----------|------------|
| `getK3MartKitchenSummary` | `convex/k3martKitchen/queries.ts` | Reuse outlet-stock-sales aggregation logic for `getOutletStockSummary` |
| `setProductTarget` | `convex/productionTargets/mutations.ts:171` | Use directly instead of creating `autoBumpConsignmentTarget` |
| `fetchProductDetail()` | `convex/integrations/k3mart/adapter.ts:31-54` | Pattern for new API helpers |
| Token retrieval (DB then env) | `convex/integrations/k3mart/adapter.ts:66-71` | Extract to shared `getK3MartToken()` helper |
| `K3MartStockCard` | `src/components/kitchen/K3MartStockCard.tsx` | Card design pattern (color scheme, layout) for `OutletCard` |
| `RestockPlanner` | `src/pages/RestockPlanner.tsx` | `formatRelativeTime()`, `isTomorrow()`, sync action patterns |
| `getRestockTargets` | `convex/restock/queries.ts` | Query for weekday/weekend target baselines |
| `saveRestockTarget` | `convex/restock/mutations.ts` | Mutation for updating baseline targets |

### Potential Duplication Risks

- **Token retrieval pattern** is repeated 3 times in the existing adapter (lines 66-71 in each action). With 8 new actions, this becomes 11 repetitions. Extract to `async function getK3MartToken(ctx): Promise<string>`.
- **Outlet stock aggregation** exists in `k3martKitchen/queries.ts` (lines 22-88). The new `getCockpitSummary` would re-implement the same logic. Consider extracting a shared helper.
- **`formatRelativeTime()`** exists in `RestockPlanner.tsx`. Move to `src/lib/utils.ts` for reuse.
- **Sell-through calculation** exists in both `RestockPlanner.tsx` and `convex/externalData/queries.ts:getChannelSellThrough`. The cockpit's 7-day velocity should reuse the backend query.

---

## 6. Phase/Wave Accuracy

| Phase | Assessment | Notes |
|-------|------------|-------|
| Wave 1: Schema + Config | Needs Adjustment | Missing `indonesianHolidays.ts`, redundant index |
| Wave 2: Backend Queries + Mutations | Needs Adjustment | `getCockpitSummary` should be split; `autoBumpConsignmentTarget` is duplicate |
| Wave 3: Backend Actions | Good | 8 actions well-defined, correct sequential dependency |
| Wave 4: Frontend Components | Good | 5 components well-scoped, parallel execution correct |
| Wave 5: Page Assembly | Good | Sequential after Wave 4 is correct |
| Wave 6: Verification | Needs Adjustment | Missing automated tests entirely |

**Ordering Issues:**
- Wave 1 needs `indonesianHolidays.ts` added (no backend dependency)
- Wave 2's `autoBumpConsignmentTarget` should be removed (use existing `setProductTarget`)
- Wave 5.5 (new): Testing wave should be added between assembly and verification

**Missing Phases:**
- **Wave 5.5: Testing** -- Backend tests with `convex-test`, at least 30 test cases
- **Wave 1 addition**: Static utility `src/lib/indonesianHolidays.ts`

---

## 7. Specialist Agent Recommendations

| Phase | Recommended Agent | Rationale |
|-------|-------------------|-----------|
| Wave 1: Schema + Config | `convex-backend` | Schema changes + config updates |
| Wave 1: Holidays utility | `react-ui-builder` | Pure TS utility, frontend concern |
| Wave 2: Queries | `convex-backend` | Complex aggregation queries |
| Wave 2: Mutations | `convex-backend` | Database operations with auth |
| Wave 3: Actions | `convex-backend` | HTTP API calls + Node.js runtime |
| Wave 4: Hooks + Components | `react-ui-builder` | UI components + Convex hooks |
| Wave 5: Page Assembly | `react-ui-builder` | Page layout + routing |
| Wave 5.5: Testing | `tdd-test-architect` | Test design + implementation |
| Wave 6: Verification | `code-auditor` | Type check + pattern compliance |

---

## 8. Git Workflow Assessment

### Branch Strategy

| Assessment | Status |
|------------|--------|
| Feature branch specified | Yes: `feature/k3mart-cockpit` |
| Branch naming convention | Correct (`feature/` prefix) |
| Merge strategy documented | Implicit ("After each wave" checkpoints) |

### Commit Strategy

| Phase | Expected Commits | Commit Type | Notes |
|-------|------------------|-------------|-------|
| Wave 1 | 2-3 | feat | Schema + config (atomic: schema first, then config) |
| Wave 2 | 2 | feat | Queries and mutations (separate commits) |
| Wave 3 | 1-2 | feat | Actions (single file, can be one commit) |
| Wave 4 | 3-4 | feat | Hooks + each major component group |
| Wave 5 | 1-2 | feat | Page assembly + routing |
| Wave 5.5 | 1 | test | Test files |
| Wave 6 | 0 | -- | Verification only, no new code |

### Recommended Commit Checkpoints

1. After schema changes -> `feat(k3mart): add dispatch plans and stock movements tables`
2. After config update -> `feat(k3mart): add 5 new endpoint paths and outlet 53`
3. After queries -> `feat(k3mart-cockpit): add cockpit queries`
4. After mutations -> `feat(k3mart-cockpit): add cockpit mutations`
5. After actions -> `feat(k3mart-cockpit): add stock-flow API actions`
6. After frontend hooks -> `feat(k3mart-cockpit): add hooks and outlet card components`
7. After page assembly -> `feat(k3mart-cockpit): add cockpit page with routing`
8. After tests -> `test(k3mart-cockpit): add backend tests`
9. After verification -> `chore: verify build passes`

### Pre-Push Verification

- [x] Plan includes `npm run build` check (Wave 6)
- [x] Plan includes `npm run type-check` verification (Success Criteria)
- [ ] Plan does NOT include `npm run test` before push (**add this**)

### CI/CD Considerations

| Concern | Assessment |
|---------|------------|
| Rollback strategy | Missing -- add "revert to pre-cockpit commit" |
| Deployment order | Correct -- Convex deploy (backend) before Vercel (frontend) |
| Data backup needed | Yes -- take `npx convex export` before deploying schema changes |
| Migration safety | Safe -- new tables only, no field modifications |

### Git Workflow Issues Found

- No explicit `npm run test` checkpoint between waves
- No `npx convex export` backup before schema changes
- No rollback strategy documented

---

## 9. Documentation Checkpoints

| Phase | Documentation Update Required |
|-------|-------------------------------|
| Wave 1 (Schema) | `docs/SCHEMA.md` (2 new tables) |
| Wave 2 (Backend) | `docs/API_REFERENCE.md` (5 queries, 8 mutations) |
| Wave 3 (Actions) | `docs/API_REFERENCE.md` (8 actions), `docs/apiS/K3_MART_API_REFERENCE.md` |
| Wave 5 (Frontend) | `docs/CHANGELOG.md` |
| Post-merge | `docs/ROADMAP.md` (if K3 Mart cockpit was a roadmap item) |

### CHANGELOG.md Entry (Draft)

```markdown
## 2026-02-XX - K3 Mart Management Cockpit

**Full dispatch management cockpit replacing the Restock Planner.**

- **New page**: `/k3mart-cockpit` with 7-day weekly dispatch planner, outlet cards, and production readiness
- **New tables**: `k3martDispatchPlans` (date-specific dispatch plans per outlet), `k3martStockMovements` (audit log of API submissions)
- **New actions**: Stock-in/out via K3 Mart API, bulk sequential submission, cancel pending requests
- **New queries**: Cockpit summary, weekly plans, outlet detail, production readiness, movement history
- **New config**: 5 new K3 Mart API endpoints (dashboard, stock-flow add/cancel, flow history), outlet 53
- **Kitchen integration**: Rolling 2-day consignment targets (delta-based), production readiness bar
- **Multi-source stock-in**: Kitchen (Office), Goldfinch, inter-outlet transfers
- **Holiday support**: Indonesian 2026 public holidays with weekend/holiday column highlighting
- **Routing**: `/restock` redirects to `/k3mart-cockpit`

**Files Created:**
- `convex/k3martCockpit/queries.ts`, `mutations.ts`
- `src/pages/K3MartCockpit.tsx`
- `src/components/k3martCockpit/` (5 components)
- `src/hooks/convex/useK3MartCockpit.ts`
- `src/lib/indonesianHolidays.ts`
- `docs/apiS/K3_MART_API_REFERENCE.md`

**Files Modified:**
- `convex/schema.ts` (2 new tables)
- `convex/integrations/k3mart/config.ts` (5 endpoints, outlet 53)
- `convex/integrations/k3mart/adapter.ts` (8 new actions)
- `src/App.tsx` (route + redirect)
- `src/components/layout/Header.tsx` (nav link)

**Commits:**
- {hash} - feat(k3mart): add dispatch plans and stock movements tables
- {hash} - feat(k3mart-cockpit): add cockpit page with routing
```

---

## 10. Testing Plan Assessment

**Overall Testing Verdict:** Missing

### Planned Tests

| Layer | What's Tested | Test Type | Status |
|-------|---------------|-----------|--------|
| Backend | Nothing | convex-test | **Missing** |
| Frontend | Nothing | Vitest + RTL | **Missing** |
| Integration | "Manual test: plan -> confirm -> submit" | Manual | Planned (Wave 6) |

### Missing Test Coverage (Must Add)

| # | Missing Test | Why It Matters | Suggested Approach |
|---|--------------|----------------|-------------------|
| 1 | Smart delta calculation | Core business logic -- kitchen targets depend on correctness | convex-test: known inputs -> expected kitchenOrderQty |
| 2 | `saveWeeklyDispatchPlan` upsert logic | Plans must not duplicate; batch upsert is tricky | convex-test: create, update, verify no duplicates |
| 3 | `confirmDayPlan` -> kitchen target delta | delta = planned - shelf stock; wrong delta = wrong production | convex-test: mock plans + stock, verify target delta |
| 4 | `processStockOutDestination` routing | Must correctly update productionCounts / gofoodDepotStock / queue transfer | convex-test: test all 3 destination types |
| 5 | `recordStockMovement` audit integrity | Movement log is the audit trail for K3 Mart reconciliation | convex-test: verify all fields populated |
| 6 | Auth rejection on protected mutations | All mutations require manager/admin; kitchen can't submit | convex-test: call with kitchen token, expect error |
| 7 | Cancel reversal logic | Cancel must reverse inventory adjustments (re-increment stock) | convex-test: submit, cancel, verify inventory restored |
| 8 | Concurrent submission guard | Two simultaneous bulk submits must not double-decrement | convex-test: simulate overlapping submissions |
| 9 | `submitStockFlow` with stale currentStock | API requires `currentStock` to match; stale data = rejection | convex-test: mock API returning fresh stock != cached |
| 10 | Edge: zero-quantity plan cells | Should not submit API calls for 0-qty plans | convex-test: include 0-qty plans, verify filtered out |

### Test Execution Checkpoints

1. After Wave 2 (backend): `npm run test` (new backend tests pass)
2. After Wave 3 (actions): `npm run test` (action tests with mocked HTTP pass)
3. After Wave 5 (frontend): `npm run test` (all existing + new tests pass)
4. Before merge: `npm run test && npm run build`

### Regression Risk

- `productionTargets/mutations.ts:setProductTarget` -- if cockpit calls this differently, existing kitchen target display may break
- `externalData/mutations.ts:saveSnapshots` -- stock sync may interact with cockpit's stale-data expectations
- `RestockPlanner.tsx` -- redirect from `/restock` must not break bookmarks/deep links
- `K3MartStockCard.tsx` -- kitchen view's K3 Mart card reads the same `productionProductTargets` data

---

## 11. Edge Cases to Address

The plan should explicitly handle:

- [ ] **Zero stock at all outlets** -- Cockpit should still display all 8 outlet cards with "0 stock" rather than hiding them
- [ ] **K3 Mart API down** -- Dashboard GET fails before stock-in POST; need graceful error with "API unreachable" state
- [ ] **Token expired mid-bulk-submit** -- Should stop remaining outlets, report partial success, not retry with bad token
- [ ] **Negative quantity prevention** -- Stock-out qty > current stock; plan says "must match actual" but doesn't specify validation
- [ ] **Same-day plan edits after submission** -- Can a manager edit today's plan after some outlets already submitted? Status must prevent double-submit
- [ ] **Weekend/holiday targets vs weekday** -- Plan uses `restockTargets.weekdayTarget` and `weekendTarget` but doesn't specify which to use for holiday-adjacent days (e.g., Friday before long weekend)
- [ ] **Inter-outlet transfer: both outlets have pending plans** -- Stock-out from outlet A to outlet B, but B already has a plan queued; need to reconcile
- [ ] **Goldfinch stock goes negative** -- `gofoodDepotStock.quantity` can go negative per existing docs; cockpit should warn when sourcing from Goldfinch with negative balance
- [ ] **New outlet discovered by refreshOutlets** -- A new outlet appears; it has no restockTargets, no dispatch plans. Auto-create defaults or leave blank?
- [ ] **Timezone handling** -- Plan uses YYYY-MM-DD dates. Jakarta is UTC+7. Ensure date boundaries align with manager's local time, not UTC.

---

## 12. Approval Conditions

**For Approval, address:**
1. Add automated testing wave (Issue #1) -- minimum 30 `convex-test` test cases
2. Split `getCockpitSummary` into focused queries (Issue #2)
3. Add concurrent-submission guard and inventory-after-API-confirm pattern (Issue #3)
4. Document `restockTargets` vs `k3martDispatchPlans` relationship (Issue #4)
5. Add `indonesianHolidays.ts` to Wave 1 (Issue #5)
6. Remove `autoBumpConsignmentTarget`, use existing `setProductTarget` (Issue #6)
7. Remove redundant `by_date` index (Issue #7)

**Recommended before implementation:**
1. Extract K3 Mart token retrieval to shared helper
2. Add retry pattern for stock submissions
3. Plan mobile fallback for 8x7 grid
4. Add `npm run test` to pre-push verification

---

*Generated by /staffreview skill*
*Staff Developer Review + Principal Developer Review*
