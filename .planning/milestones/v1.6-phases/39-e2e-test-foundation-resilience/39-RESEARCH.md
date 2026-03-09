# Phase 39: E2E Test Foundation & Resilience - Research

**Researched:** 2026-03-06
**Domain:** Playwright E2E testing + Convex backend resilience (auto-seed)
**Confidence:** HIGH

## Summary

Phase 39 adds E2E Playwright tests for the 3 most critical user paths (order lifecycle, kitchen production, sales analytics) and fixes the Tamtem depot deduction silent failure. The existing E2E infrastructure is mature: `playwright.config.ts` is fully configured (Chromium-only, serial, 60s timeout), `global-setup.ts` handles user PIN reset via ConvexHttpClient, and `helpers.ts` provides `loginAsManager`, `navigateTo`, `waitForDataLoad`, and screenshot utilities. There are already 8 spec files (1,850+ LOC) providing established patterns for page navigation, DOM assertions, and screenshot capture.

The Tamtem depot fix is straightforward: `convex/productInventory/mutations.ts:processGofoodSales` (lines 583-589) silently skips items when `outlet.linkedStorageLocationId` is null. The fix is to auto-seed the depot storage location (and optionally zero-stock inventory rows) when the location is missing, following the same pattern as `convex/migrations/seedFinishedGoodsLocations.ts`.

**Primary recommendation:** Extend existing E2E infrastructure (no new test framework). Write 3 new spec files following established patterns. Fix Tamtem auto-seed inline in the deduction path or as a shared helper.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Order lifecycle test:** Full mutation flow via UI. Create a real order through the form, confirm it, trigger production, box it, and complete. Core path: Draft -> Confirmed -> InProduction -> Boxed -> CompleteShipped (skip AwaitingPayment and WaitingShipment/Labeled steps). ~25s per run.
- **Kitchen production test:** Full production flow via UI. Navigate to KitchenViewV2, trigger ball production via UI buttons, verify tray counts update, and do an EoS recording. Requires a confirmed order with production items already in the system (seed via the order lifecycle test or ConvexHttpClient).
- **Sales analytics test:** Period navigation + channel breakdown verification. Navigate to Sales Analytics, verify period selector works (switch weeks), verify channel breakdown table renders with correct columns. Matches RES-03 scope -- no deep data verification needed.
- **Test infrastructure reuse:** Extend existing helpers, global-setup, playwright.config. Keep serial execution, Chromium-only, screenshot-per-step.
- **Tamtem depot fix:** Auto-seed on first use. Create storage location automatically when depot deduction can't find it. Both Tamtem AND Goldfinch depot locations auto-seeded when missing. Create storage location AND seed zero-stock inventory batches for all active packaging component types.

### Claude's Discretion
- Test data seeding strategy (whether kitchen test depends on order test output or seeds independently)
- Exact DOM selectors for order form fields and kitchen buttons
- Whether to add a shared test fixture for "order with production items"
- Placement of auto-seed logic (inline in deduction path vs. shared helper)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| RES-01 | E2E Playwright test for order lifecycle (create -> confirm -> produce -> complete) | OrderCreate.tsx form has `Submit Order` button (line 965), StatusActionButtons.tsx has `Customer Paid!` (line 211), `Expedite Production` (line 222), `Mark Delivered` (line 239). Route: `/orders/new` for creation, `/orders/:id` for transitions. |
| RES-02 | E2E Playwright test for kitchen production flow (tray allocation -> EoS recording) | KitchenViewV2.tsx (312 LOC) renders EndOfShiftForm with 3-step flow (input -> review -> success). Route: `/kitchen`. Requires confirmed order with BOM items. |
| RES-03 | E2E Playwright test for sales analytics page (period selector, channel breakdown) | SalesAnalytics.tsx (49 LOC) has tabs: Overview, Mappings, Consignment, Settings. OverviewTab renders period preset badges (Past 24h, Today, Yesterday, This Week, Last 7 Days, etc.) and stats cards. Route: `/sales`. |
| RES-04 | Tamtem depot deduction no longer silently skips -- error logged or auto-seed runs | `convex/productInventory/mutations.ts:processGofoodSales` lines 583-589 silently `continue`s when `linkedLocationId` is null. Fix: auto-seed storage location following `seedFinishedGoodsLocations.ts` pattern. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @playwright/test | ^1.58.2 | E2E testing framework | Already installed, configured, 8 existing specs |
| convex/browser (ConvexHttpClient) | ^1.31.7 | Test data seeding in global-setup | Already used in global-setup.ts for PIN reset |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Vitest | ^4.0.18 | Unit tests for auto-seed logic | If backend fix needs unit test coverage |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| UI-driven order creation | ConvexHttpClient direct mutation | CONTEXT.md locks UI-driven approach to catch form bugs |
| Separate test database | Dev environment (exciting-fennec-671) | Established pattern -- tests run against dev Convex |

**No new dependencies needed.** Everything is already installed.

## Architecture Patterns

### Recommended Project Structure
```
tests/e2e/
  global-setup.ts             # Existing: PIN reset + user unlock
  helpers.ts                  # Existing: loginAsManager, navigateTo, waitForDataLoad, screenshot
  order-lifecycle.spec.ts     # NEW: RES-01
  kitchen-production.spec.ts  # NEW: RES-02
  sales-analytics-period.spec.ts  # NEW: RES-03
  screenshots/                # Existing: auto-captured per step
convex/
  productInventory/
    mutations.ts              # MODIFIED: processGofoodSales auto-seed
  inventory/
    depotAutoSeed.ts          # NEW (optional): shared auto-seed helper
```

### Pattern 1: E2E Spec Structure (from existing codebase)
**What:** Each spec file follows login -> navigate -> interact -> assert -> screenshot
**When to use:** All 3 new specs
**Example:**
```typescript
// Source: tests/e2e/entity-manager-verification.spec.ts
test.describe("Feature Name", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsManager(page);
  });

  test("step description", async ({ page }) => {
    await navigateTo(page, "/path");
    await waitForDataLoad(page);
    await screenshot(page, "step-name");
    await expect(page.locator("text=Expected")).toBeVisible();
  });
});
```

### Pattern 2: ConvexHttpClient Data Seeding (from global-setup.ts)
**What:** Direct mutation calls for test data setup
**When to use:** Seeding orders/products before kitchen test
**Example:**
```typescript
// Source: tests/e2e/global-setup.ts
const client = new ConvexHttpClient(convexUrl);
const users = await client.query(api.auth.queries.getActiveUsers);
await client.mutation(api.auth.mutations.unlockUser, { userId });
```

### Pattern 3: Convex Reactive Settle Time
**What:** 3-second waitForTimeout after navigation to let Convex queries settle
**When to use:** After every page navigation before assertions
**Why:** Convex queries are reactive (WebSocket push). The app renders loading state first, then data arrives. The existing `waitForAppReady` in helpers.ts already handles this with a 3s wait.
**Warning:** Do NOT reduce this timeout. Convex queries on complex pages (KitchenViewV2 has 4+ queries) need full settle time.

### Pattern 4: Status Transition Button Labels (Critical for RES-01)
**What:** Each order status has a specific forward-action button label
**When to use:** Order lifecycle E2E test
**Map:**
| Current Status | Button Label | Resulting Status |
|---------------|-------------|-----------------|
| Draft | "Submit Order" | AwaitingPayment |
| AwaitingPayment | "Customer Paid!" | PaymentReceived |
| PaymentReceived | "Expedite Production" | BeingPrepared |
| BeingPrepared | (kitchen completes) | AwaitingDelivery |
| AwaitingDelivery | "Mark Delivered" | Complete |

**Note:** CONTEXT.md says skip AwaitingPayment and WaitingShipment/Labeled steps. The "core path" is: create order (Draft) -> submit (AwaitingPayment) -> pay (PaymentReceived) -> expedite (BeingPrepared) -> box (AwaitingDelivery) -> deliver (Complete). The "skip" likely means don't test the manual waiting states, not skip them entirely.

### Anti-Patterns to Avoid
- **Parallel E2E tests with shared Convex state:** Tests modify real dev database. Serial execution (workers: 1) is mandatory. Never set `fullyParallel: true`.
- **Hardcoded Convex IDs in tests:** IDs change between environments. Always query by name/attribute, never by `Id<"table">`.
- **Short timeouts for Convex-backed pages:** Convex reactive queries need 3-5s settle time. The existing 15s `expect.timeout` and 10s `actionTimeout` are appropriate.
- **Testing against production Convex:** Always use dev environment (`exciting-fennec-671`). The global-setup.ts already defaults to this.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Auth flow for tests | Custom login flow | Existing `loginAsManager(page)` from helpers.ts | Handles PIN entry, avatar grid, redirect waiting |
| Page navigation + settle | Custom goto + wait | Existing `navigateTo(page, path)` from helpers.ts | Includes networkidle + 3s Convex settle time |
| Data load detection | Custom polling loops | Existing `waitForDataLoad(page)` from helpers.ts | Detects skeleton disappearance via `animate-pulse` class |
| Screenshot capture | Raw Playwright API | Existing `screenshot(page, name)` from helpers.ts | Consistent naming in `tests/e2e/screenshots/` |
| Storage location creation | Manual DB inserts | Pattern from `seedFinishedGoodsLocations.ts` | Field names, types, required fields all established |

**Key insight:** The existing E2E helper library covers all common operations. New specs should ONLY add domain-specific interactions (form fills, button clicks, status assertions).

## Common Pitfalls

### Pitfall 1: Order Create Form Has Complex Customer Selection
**What goes wrong:** Test tries to type into a customer field that doesn't exist or is hidden behind a search component.
**Why it happens:** `OrderCreate.tsx` uses `CustomerSearch` component (line 12) which is a search-then-select pattern, not a simple text input.
**How to avoid:** The executor must inspect the CustomerSearch component to find the correct selectors. It likely has a search input that triggers a dropdown. The test needs: (1) click/type in search, (2) select a customer from results, (3) verify customerSet state updates.
**Warning signs:** Test times out waiting for customer name input that isn't a simple `<input>`.

### Pitfall 2: Order Submission Creates Draft First
**What goes wrong:** Test clicks "Submit Order" but the order is not immediately in AwaitingPayment status.
**Why it happens:** `OrderCreate.tsx` flow is: auto-create Draft on first interaction -> replaceItems -> updateDraft -> updateOrderStatus to AwaitingPayment (lines 460-523). There are multiple async mutations before the redirect.
**How to avoid:** After clicking "Submit Order", wait for navigation back to `/orders` (the redirect at line 522), THEN navigate to the order detail page. Use `page.waitForURL` pattern.
**Warning signs:** Status assertions fail because the test checks too early.

### Pitfall 3: BeingPrepared Status Has No Forward Button
**What goes wrong:** Test looks for a button to advance from BeingPrepared but finds none.
**Why it happens:** `StatusActionButtons.tsx` line 226-230: when status is BeingPrepared, it renders text "Kitchen completes this order" instead of a button. The forward transition from BeingPrepared to AwaitingDelivery happens via kitchen boxing/packaging flow, NOT via a status button.
**How to avoid:** For E2E simplicity, use `moveForward` mutation directly via ConvexHttpClient to skip this step, OR use the `forceComplete` admin function (lines 97-153 of OrderDetail.tsx). Alternatively, the CONTEXT.md says "box it" which may refer to using the OrderDetail's forward action when status allows.
**Warning signs:** Test hangs waiting for a "Box" button on BeingPrepared orders.

### Pitfall 4: Kitchen Test Requires Pre-Seeded Production Data
**What goes wrong:** KitchenViewV2 shows empty production targets because no confirmed orders exist.
**Why it happens:** `ProductionTargetsBar` reads from `productionTargets` query which aggregates BOM from confirmed orders. No orders = no targets to display.
**How to avoid:** Either (a) run the order lifecycle test first and depend on its created order, or (b) seed an order directly via ConvexHttpClient in global-setup.ts or test setup. Option (b) is more reliable (independent tests).
**Warning signs:** Kitchen page renders but all production counts show 0.

### Pitfall 5: Sales Analytics Period Badges Use Badge Components, Not Buttons
**What goes wrong:** Test uses `page.locator("button")` to find period selectors.
**Why it happens:** `OverviewTab.tsx` line 172-178 renders period presets as `<Badge>` components with `className="cursor-pointer"` and `onClick` handlers, not as `<button>` elements.
**How to avoid:** Use text-based selectors: `page.locator("text=This Week")` or `page.locator('.cursor-pointer:has-text("This Week")')`.
**Warning signs:** Period filter clicks don't work, test can't find buttons.

### Pitfall 6: Tamtem Auto-Seed Must Match Schema Exactly
**What goes wrong:** Auto-seed creates a storage location with wrong field types or missing required fields.
**Why it happens:** `storageLocations` schema requires: `name` (string), `locationType` (union of literals), `isActive` (boolean), `isDefault` (optional boolean), `createdBy` (string), `createdAt` (number). Missing any required field causes Convex validation error.
**How to avoid:** Copy exact field structure from `seedFinishedGoodsLocations.ts` lines 37-44.
**Warning signs:** Convex mutation throws validation error on insert.

### Pitfall 7: processGofoodSales Is an internalMutation
**What goes wrong:** Test tries to call `processGofoodSales` via ConvexHttpClient.
**Why it happens:** It's an `internalMutation` (line 545), not a regular `mutation`. ConvexHttpClient can only call public mutations.
**How to avoid:** The Tamtem fix is a backend change, not testable via E2E. Test it via Vitest unit tests with `convex-test` framework.
**Warning signs:** ConvexHttpClient throws "function not found" error.

## Code Examples

### Order Lifecycle E2E Test Pattern
```typescript
// Navigate to order creation
await navigateTo(page, "/orders/new");
await waitForDataLoad(page);
await screenshot(page, "order-01-create-page");

// Select customer (CustomerSearch component)
// [Executor must inspect CustomerSearch.tsx for exact selectors]
await page.locator('input[placeholder*="customer" i]').fill("Test Customer");
await page.waitForTimeout(1000); // Wait for search results
await page.locator('[role="listbox"] >> text=Test Customer').first().click();

// Add product (ProductButtons component)
await page.locator('button:has-text("Original")').first().click();
await screenshot(page, "order-02-product-added");

// Submit order
await page.locator('button:has-text("Submit Order")').click();
await page.waitForURL(/\/orders/, { timeout: 15_000 });
```

### Status Transition Pattern
```typescript
// Navigate to order detail
await navigateTo(page, `/orders/${orderId}`);
await waitForDataLoad(page);

// Click "Customer Paid!"
await page.locator('button:has-text("Customer Paid!")').click();
await page.waitForTimeout(2000); // Convex mutation + reactive update

// Verify status badge changed
await expect(page.locator('text=Payment Received')).toBeVisible();
await screenshot(page, "order-03-payment-received");
```

### Period Selector Pattern (Sales Analytics)
```typescript
await navigateTo(page, "/sales");
await waitForDataLoad(page);

// Click "This Week" period badge
await page.locator('.cursor-pointer:has-text("This Week")').click();
await page.waitForTimeout(3000); // Wait for data reload

// Verify stats cards render
await expect(page.locator('text=Gross Revenue')).toBeVisible();
await screenshot(page, "sales-02-this-week");
```

### Auto-Seed Pattern (Backend)
```typescript
// Source pattern: convex/migrations/seedFinishedGoodsLocations.ts lines 27-44
// Find or create depot storage location
let depotLocation = await ctx.db
  .query("storageLocations")
  .filter((q) => q.eq(q.field("name"), "Tamtem Depot"))
  .first();

if (!depotLocation) {
  const depotId = await ctx.db.insert("storageLocations", {
    name: "Tamtem Depot",
    locationType: "depot",
    isActive: true,
    isDefault: false,
    createdBy: "auto-seed",
    createdAt: Date.now(),
  });
  depotLocation = await ctx.db.get(depotId);
  console.log(`[AUTO-SEED] Created Tamtem Depot: ${depotId}`);
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual test data seeding | ConvexHttpClient in global-setup | Phase 10 (Feb 2026) | Automated test user setup |
| No E2E tests | 8 spec files, screenshot-heavy | Phases 10, 27, 30, 32, 34 | Regression detection |
| Chromium + Chrome for Testing | Chrome for Testing only | Playwright 1.57+ | Slightly different rendering behavior |
| depot deduction silently skips | auto-seed on first use | This phase | No more missed inventory tracking |

**Deprecated/outdated:**
- None -- existing E2E infrastructure is current and well-maintained

## Open Questions

1. **Order creation flow complexity**
   - What we know: OrderCreate.tsx is 1,017 LOC with CustomerSearch, ProductButtons, VoucherInput, DueDatePills, QuickAddressButtons components. The form auto-creates a draft on first interaction.
   - What's unclear: Exact DOM structure of CustomerSearch (is it a combobox? autocomplete? custom dropdown?). Need to inspect the component source during planning.
   - Recommendation: Executor should grep CustomerSearch.tsx for input/button selectors before writing the test.

2. **BeingPrepared -> AwaitingDelivery transition**
   - What we know: StatusActionButtons shows "Kitchen completes this order" text instead of a forward button for BeingPrepared status. The transition happens via kitchen/boxing flow.
   - What's unclear: Whether the `moveForward` mutation works for BeingPrepared -> AwaitingDelivery when called from the order detail page, or if it requires kitchen-specific actions.
   - Recommendation: Use `forceComplete` admin endpoint or `moveForward` via ConvexHttpClient to skip this step in E2E. CONTEXT.md says "box it" but this may need to be a backend shortcut for test reliability.

3. **Kitchen test data dependency**
   - What we know: Kitchen production requires confirmed orders with BOM-resolved production items. Options: (a) depend on order lifecycle test creating an order first (fragile coupling), (b) seed independently via ConvexHttpClient.
   - What's unclear: Whether the dev database already has enough menu products and component types for a meaningful kitchen test without additional seeding.
   - Recommendation: Seed independently via ConvexHttpClient for test isolation. The global-setup already demonstrates this pattern. Check if menu products exist in dev database before adding more seeding.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Playwright ^1.58.2 |
| Config file | `playwright.config.ts` |
| Quick run command | `npx playwright test --grep "order-lifecycle"` |
| Full suite command | `npx playwright test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| RES-01 | Order lifecycle E2E | e2e | `npx playwright test order-lifecycle` | Wave 1 |
| RES-02 | Kitchen production E2E | e2e | `npx playwright test kitchen-production` | Wave 1 |
| RES-03 | Sales analytics E2E | e2e | `npx playwright test sales-analytics-period` | Wave 1 |
| RES-04 | Tamtem depot auto-seed | unit | `npm run test -- --grep "processGofoodSales"` | Wave 1 |

### Sampling Rate
- **Per task commit:** `npx playwright test --grep "{spec-name}" --reporter=list`
- **Per wave merge:** `npx playwright test --reporter=list`
- **Phase gate:** All E2E specs green + `npm run build` passes

### Wave 0 Gaps
- [ ] No npm script for Playwright (need `"test:e2e": "npx playwright test"` in package.json) -- optional convenience
- [ ] No unit test for `processGofoodSales` auto-seed logic -- should be added in Wave 1
- [ ] Kitchen test may need pre-seeded production data in global-setup.ts

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `playwright.config.ts`, `tests/e2e/global-setup.ts`, `tests/e2e/helpers.ts` -- current config and patterns
- Codebase analysis: `tests/e2e/*.spec.ts` (8 files) -- established test patterns
- Codebase analysis: `convex/productInventory/mutations.ts:processGofoodSales` lines 545-642 -- the silent skip bug
- Codebase analysis: `convex/migrations/seedFinishedGoodsLocations.ts` -- auto-seed reference pattern
- Codebase analysis: `src/pages/OrderCreate.tsx` (1,017 LOC) -- form structure and submit flow
- Codebase analysis: `src/components/orders/StatusActionButtons.tsx` -- button labels per status
- Codebase analysis: `src/pages/KitchenViewV2.tsx` (312 LOC) -- kitchen page structure
- Codebase analysis: `src/pages/SalesAnalytics.tsx` (49 LOC) -- tab structure
- Codebase analysis: `src/components/salesAnalytics/overviewUtils.ts` -- period presets with labels

### Secondary (MEDIUM confidence)
- [Playwright release notes](https://playwright.dev/docs/release-notes) -- version 1.58 features
- [Playwright official docs](https://playwright.dev) -- API reference

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- everything already installed and configured, 8 existing specs to reference
- Architecture: HIGH -- established patterns from 8 existing spec files, clear code patterns
- Pitfalls: HIGH -- all identified from direct codebase analysis of the relevant source files
- Tamtem fix: HIGH -- exact bug location identified (lines 583-589), exact fix pattern available (seedFinishedGoodsLocations.ts)

**Research date:** 2026-03-06
**Valid until:** 2026-04-06 (stable -- no dependency changes expected)
