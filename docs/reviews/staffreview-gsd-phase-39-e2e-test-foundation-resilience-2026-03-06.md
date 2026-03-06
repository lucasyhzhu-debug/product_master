# Staff Review: Phase 39 -- E2E Test Foundation & Resilience

**Reviewer:** Senior Engineer (automated)
**Date:** 2026-03-06
**Branch:** `gsd/phase-39-e2e-test-foundation-resilience`
**Scope:** 6 files, 1,359 LOC across backend auto-seed helper + unit tests + 3 E2E specs

## Summary

Phase 39 delivers two capabilities: (1) a Tamtem depot auto-seed fix that eliminates silent inventory deduction failures in `processGofoodSales`, and (2) three new Playwright E2E specs covering order lifecycle, kitchen production, and sales analytics period navigation. The backend work is solid -- well-structured, idempotent, thoroughly tested. The E2E tests follow established patterns and handle graceful degradation well. However, the tests rely heavily on `waitForTimeout` sleeps and conditional branching that reduces their value as regression detectors.

**Overall quality:** Good. No critical architectural risks. The depot auto-seed is a clean, production-safe fix. The E2E tests are screenshot-heavy (good for debugging) but have structural issues that will cause maintenance burden.

---

## Critical Issues

None. There are no blocking issues that must be fixed before merge.

---

## Important Improvements

### IMP-01: Triple outlet fetch in auto-seed path (redundant DB reads)

**File:** `convex/productInventory/mutations.ts` lines 579, 586; `convex/productInventory/depotAutoSeed.ts` line 42

When the auto-seed path triggers, the outlet is fetched up to 3 times:
1. Line 579: `const outlet = await ctx.db.get(item.outletId)` -- to check `linkedStorageLocationId` (cache miss path)
2. Line 586: `const outlet = await ctx.db.get(item.outletId)` -- to get `outlet?.name` for auto-seed
3. `depotAutoSeed.ts` line 42: `const outlet = await ctx.db.get(outletId)` -- inside `ensureDepotLocation` to re-check `linkedStorageLocationId`

The re-check inside `ensureDepotLocation` is defensible (idempotency check), but fetch #2 at line 586 is pure waste -- the outlet was already fetched at line 579 and its `name` is available. The plan called this out explicitly: "The outlet variable from line 578 can be reused if in the same scope."

**Fix:** Hoist the outlet from line 579 into the auto-seed branch scope:
```typescript
} else {
  const outlet = await ctx.db.get(item.outletId);
  linkedLocationId = outlet?.linkedStorageLocationId ?? null;
  outletLocationCache.set(outletIdStr, linkedLocationId);

  if (!linkedLocationId && outlet) {
    const autoSeeded = await ensureDepotLocation(ctx, item.outletId, outlet.name ?? "Unknown");
    // ...
  }
}
```
This eliminates one DB read per unlinked outlet. Not a correctness issue, but a code quality one.

### IMP-02: E2E order lifecycle test has no hard assertions on status transitions

**File:** `tests/e2e/order-lifecycle.spec.ts` lines 282-329

The status transition assertions in Step 2 are wrapped in conditional `if ((await btn.count()) > 0)` guards. If the button is not found (e.g., due to a regression in `StatusActionButtons.tsx`), the test silently skips the transition instead of failing. This defeats the purpose of regression testing.

The test should either:
- Assert the button is visible (fail if missing), or
- If conditionals are needed for environment robustness, at minimum track which transitions were exercised and assert at least N transitions completed.

Currently, Step 2 can pass with zero transitions executed and still report success.

### IMP-03: E2E order lifecycle tests are not isolated -- Step 2 depends on Step 1's side effects

**File:** `tests/e2e/order-lifecycle.spec.ts`

Step 1 creates an order in the dev database. Step 2 navigates to `/orders` and tries to find "the most recent order." But there is no data linkage between the two tests -- the order ID is not passed between steps. Step 2 clicks the first available order card (line 223), which may not be the order created in Step 1 if other orders exist or if tests run out of order.

The plan acknowledged this: "Store the order URL/ID for subsequent tests if possible." This was not implemented.

**Fix options:**
- Use `test.describe.serial()` with a shared `let orderId` variable at describe scope
- Or combine Steps 1 and 2 into a single test (heavier but deterministic)

### IMP-04: `expect(true).toBe(true)` is a no-op assertion

**File:** `tests/e2e/sales-analytics-period.spec.ts` lines 146 and 187

Two tests end with `expect(true).toBe(true)`. This makes the test always pass regardless of what happened above. While this pattern exists in other E2E specs in the codebase (13 instances across 4 files), it indicates the test is logging results rather than asserting behavior.

For the "Channel breakdown" test (line 94-147): the test logs whether elements are visible but never asserts. If `Channel Breakdown` is not visible, the test still passes. This test should at minimum assert that EITHER the channel breakdown OR an empty state is visible.

---

## Refinements

### REF-01: `depotAutoSeed.ts` uses table-scan filter instead of index for `storageLocations`

**File:** `convex/productInventory/depotAutoSeed.ts` lines 68-71

```typescript
const existing = await ctx.db
  .query("storageLocations")
  .filter((q) => q.eq(q.field("name"), config.locationName))
  .first();
```

There is no index on `storageLocations.name`, so this is a full table scan. With only ~5-10 storage locations in production, this is fine for now. But if the pattern is reused, consider adding a `by_name` index. Very low priority.

### REF-02: Sales analytics E2E test duplicates hero card label assertions from overview spec

**File:** `tests/e2e/sales-analytics-period.spec.ts` lines 50-55, 66-69, 79-83

The period selector test checks for "Gross Sales", "Net Sales", etc. The existing `sales-analytics-overview.spec.ts` already verifies stats card visibility (US-6). The plan explicitly said "does NOT duplicate coverage from existing sales-analytics-overview.spec.ts." While the purpose here is to verify cards persist after period switch (subtly different from initial render), the boundary is blurry and creates maintenance coupling.

### REF-03: Kitchen production test fills EoS values that persist in the dev database

**File:** `tests/e2e/kitchen-production.spec.ts` lines 137, 145, 211

The EoS test enters production counts (5 Big Balls, 3 Mid Balls) and submits them. Since tests run against the shared dev database (`exciting-fennec-671`), this creates real production log entries that pollute development data. There is no cleanup step.

This is consistent with the existing order lifecycle test (which also creates real orders), but production log entries affect dashboard metrics and production target calculations. Consider adding a `[E2E]` tag to the `performedBy` field or adding cleanup in a teardown hook.

### REF-04: Kitchen test's `expect(page.locator("text=5"))` is overly broad

**File:** `tests/e2e/kitchen-production.spec.ts` line 205

```typescript
await expect(page.locator("text=5").first()).toBeVisible();
```

This asserts that the text "5" appears somewhere on the page. Since "5" could appear in any context (dates, quantities, IDs, version numbers), this assertion has near-zero diagnostic value. It should at minimum scope to the review modal or use a more specific selector.

### REF-05: `depotAutoSeed.ts` seeds inventory rows for `menuProductId` found via `menuProductComponents` link to packaging `componentTypes`, but `productInventory` tracks by `menuProductId` + `locationId`

This is architecturally correct -- the auto-seed walks packaging components to find which menuProducts use them, then seeds zero-stock rows per menuProduct at the new location. The logic is sound. However, the iteration pattern (componentTypes -> menuProductComponents -> menuProducts -> check productInventory) performs N*M DB queries in the inner loop. With ~5 component types and ~7 menu products, this is ~35 queries. Acceptable for a one-time auto-seed but worth noting if the pattern is reused in hot paths.

---

## Test Reliability Assessment

### Unit Tests (depotAutoSeed.test.ts) -- HIGH reliability

The 6 unit tests use `convex-test` with proper schema, test all plan-specified scenarios (Tamtem, Goldfinch, already-linked, idempotent, unknown, packaging components), and have precise assertions. These will be stable in CI. **Rating: 9/10.**

### E2E: Order Lifecycle (order-lifecycle.spec.ts) -- MEDIUM-LOW reliability

**Stability risks:**
- **Data dependency:** Assumes at least one customer exists in the dev database (or handles create-new fallback). If the dev database is reset, the fallback path exercises different code.
- **Selector fragility:** Uses class-based selectors like `.absolute.z-50` (line 49) and `button.flex.flex-col[class*="rounded-lg"][class*="border"]` (line 132) that will break on any CSS refactor.
- **Sequential step coupling:** Step 2 looks for the order created by Step 1 via "first card on Kanban board" heuristic, not by ID.
- **Conditional skip pattern:** Most assertions are wrapped in `if (count > 0)` guards, which means the test degrades to a page-load smoke test if any selector breaks.
- **Timeout sensitivity:** 14 distinct `waitForTimeout` calls with durations from 300ms to 3000ms. Total sleep time: ~20s out of 60s timeout budget.

**Rating: 4/10.** Will pass today but likely to flake or silently degrade within 2-3 weeks of active development.

### E2E: Kitchen Production (kitchen-production.spec.ts) -- MEDIUM reliability

**Stability risks:**
- **Graceful degradation too aggressive:** If the EoS form is hidden (no production targets), the test returns early with a log message (line 112). This is documented as intentional, but means the test provides zero coverage of the 3-step flow on some runs.
- **Dev database state dependency:** Requires production targets to be configured. If targets are not configured, Step 2 exercises nothing.
- **Real mutation submission:** Creates real production log entries in dev database.

**Positive factors:**
- Uses `id^="produced-"` attribute selector (line 125) -- more stable than class-based selectors
- Good screenshot coverage (9 screenshots across both steps)
- Handles chef selector presence/absence gracefully

**Rating: 5/10.** Reasonable for a smoke test; unreliable as a regression test.

### E2E: Sales Analytics Period (sales-analytics-period.spec.ts) -- MEDIUM-HIGH reliability

**Stability risks:**
- Two tests end with `expect(true).toBe(true)` -- always pass
- Period badge selector `.cursor-pointer` is a Tailwind utility class, not a semantic selector

**Positive factors:**
- Period switching test has real assertions (hero cards visible, monetary values present)
- Tab navigation test asserts round-trip successfully
- Low data dependency (works with empty revenue data)

**Rating: 6/10.** Most reliable of the three E2E specs.

### Overall E2E Assessment

The E2E tests follow the established codebase pattern (screenshot-heavy, conditional assertions, `waitForTimeout`-based). This is consistent with the 8 existing specs. However, the pattern itself produces tests that are closer to "manual testing scripts with screenshots" than true automated regression tests. They catch page-load crashes but not functional regressions.

---

## Plan Fidelity Assessment

### 39-01 (Tamtem Depot Auto-Seed) -- EXCELLENT

| Plan Item | Status | Notes |
|-----------|--------|-------|
| `ensureDepotLocation` helper in `depotAutoSeed.ts` | Implemented | Clean separation, idempotent |
| Tamtem Depot (locationType: "depot") | Implemented | Correct |
| Legato Goldfinch (locationType: "venue") | Implemented | Correct |
| Unknown outlets skip with warning | Implemented | Returns null, caller logs warning |
| Idempotent (check-before-insert) | Implemented | Queries by name before creating |
| Link outlet after creation | Implemented | Patches `linkedStorageLocationId` |
| Seed zero-stock inventory rows | Implemented | Walks componentTypes -> menuProductComponents |
| `[AUTO-SEED]` log prefix | Implemented | All console.log calls prefixed |
| `createdBy: "auto-seed"` | Implemented | Matches plan exactly |
| Unit tests | Implemented | 6 tests, 407 LOC, all scenarios covered |
| Reactivate inactive location | Implemented (bonus) | Not in plan but good defensive behavior |

**Gaps:** None. This was executed faithfully with a small beneficial addition.

### 39-02 (Order Lifecycle & Kitchen E2E) -- GOOD with gaps

| Plan Item | Status | Notes |
|-----------|--------|-------|
| Order creation via real UI form | Implemented | Full form interaction |
| Customer selection via CustomerSearch | Implemented | Search + dropdown + fallback |
| Product addition via ProductButtons | Implemented | Clicks first product |
| Submit Order with redirect wait | Implemented | Handles address/price dialogs |
| Status: AwaitingPayment -> PaymentReceived | Implemented | "Customer Paid!" button |
| Status: PaymentReceived -> BeingPrepared | Implemented | "Expedite Production" + override dialog |
| BeingPrepared terminal state documented | Implemented | "Kitchen completes this order" check |
| Kitchen page loads with targets | Implemented | Checks Original/Jumbo/NoBreakdown |
| EoS 3-step flow (input -> review -> submit) | Implemented | Full flow with graceful degradation |
| Screenshots per step | Implemented | 20+ screenshots total |

**Gaps:**
- Plan said "Store the order URL/ID for subsequent tests if possible" -- not done (IMP-03)
- Plan said transitions should exercise "at least 2 status transitions" -- test can pass with 0 transitions
- CONTEXT.md described "Create a real order through the form, confirm it, trigger production, box it, and complete" -- test only reaches BeingPrepared (acceptable per plan's "FALLBACK APPROACH")

### 39-03 (Sales Analytics Period) -- GOOD

| Plan Item | Status | Notes |
|-----------|--------|-------|
| Period selector switches time windows | Implemented | Today + This Week |
| Stats cards persist after switch | Implemented | Asserts hero card labels |
| Channel breakdown column verification | Partially | Logs presence but doesn't assert |
| Tab navigation round-trip | Implemented | Overview -> Settings -> Overview |
| No duplication of overview spec | Mostly | Some overlap on hero card checks |

**Gaps:**
- Channel breakdown test has no hard assertions (just `console.log` + `expect(true).toBe(true)`)
- Expected column headers are logged but not asserted

---

## Verdict

**CONDITIONAL PASS** -- merge-ready with recommended fixes.

The backend auto-seed work (39-01) is excellent: well-structured, fully tested, idempotent, production-safe. No changes needed.

The E2E tests (39-02, 39-03) achieve their stated goal of establishing test foundations for the 3 critical paths. They follow existing codebase patterns faithfully. However, two improvements should happen either pre-merge or as fast-follow:

1. **IMP-02:** Add at minimum a "transitions completed" counter assertion to the order lifecycle test
2. **IMP-04:** Replace `expect(true).toBe(true)` in the channel breakdown test with a real assertion

The remaining items (IMP-01 triple-fetch, IMP-03 test isolation, REF-*) are nice-to-haves that can be addressed in a future quality pass.

---

*Review completed: 2026-03-06*
*Phase: 39-e2e-test-foundation-resilience*
*Files reviewed: 6 (1,359 LOC)*
