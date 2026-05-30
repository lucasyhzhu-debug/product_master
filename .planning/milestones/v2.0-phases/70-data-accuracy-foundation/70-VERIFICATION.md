---
phase: 70-data-accuracy-foundation
verified: 2026-04-10T07:48:14Z
status: human_needed
score: 4/4
overrides_applied: 0
human_verification:
  - test: "Verify direct sales orders appear in Sales Analytics revenue view"
    expected: "Orders with status PaymentReceived/BeingPrepared/AwaitingDelivery/Complete show as internal channel revenue entries"
    why_human: "Requires running app against real or seeded data to confirm end-to-end display"
  - test: "Verify Income Statement uses COGS override for a menu product"
    expected: "Set cogsOverrideIdr on a product, then view P&L -- COGS column reflects override, not BOM"
    why_human: "Requires full pipeline execution: schema write, Income Statement query recalculation, UI rendering"
  - test: "Verify inline COGS edit on MenuProductsManager product card"
    expected: "Click COGS value -> input appears -> Enter saves -> amber Override badge shown"
    why_human: "Interactive UI behavior (click-to-edit, blur/Enter/Escape handling) requires manual testing"
  - test: "Verify Employment Details section in UsersManager edit dialog"
    expected: "Edit a user -> Employment Details section visible with hire date, salary, bank holder name fields"
    why_human: "Form layout, input types, and save persistence require visual + interactive confirmation"
---

# Phase 70: Data Accuracy Foundation Verification Report

**Phase Goal:** All revenue sources and product costs are accurate in the system, and employee records carry financial metadata
**Verified:** 2026-04-10T07:48:14Z
**Status:** human_needed
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Direct sales orders (e.g., Bali order 0330-002) appear in Sales Analytics and Income Statement revenue | VERIFIED | `syncInternalOrders` action creates `externalRevenue` records for orders with status in `REVENUE_COUNTABLE_STATUSES`; `fixConfirmedOrders` migration advances stuck Confirmed orders to PaymentReceived; hourly cron registered in `convex/crons.ts` |
| 2 | Historical direct sales orders from past periods appear correctly in their respective period P&L views | VERIFIED | `forceFullSync` param bypasses incremental timestamp, scanning all orders; "Backfill All Orders" button in SettingsTab calls `syncInternalOrders({ forceFullSync: true })`; revenue date uses `order.confirmedAt ?? order.orderDate` for correct period assignment |
| 3 | Manager can set a flat COGS override on any menu product, and the Income Statement uses that override instead of BOM calculation | VERIFIED | `cogsOverrideIdr` field on `menuProducts` schema; `buildProductCOGSMap` accepts optional third param with override logic; `incomeStatement.ts` passes `menuProductsList` to `buildProductCOGSMap`; inline editing on `MenuProductsManager.tsx` with amber Override badge; 5 unit tests confirm override behavior |
| 4 | Employee profile page shows hire date, base rate, and bank account holder name fields that can be edited by admin | VERIFIED | `hireDate`, `baseSalaryIdr`, `bankAccountHolderName` on `users` table in schema; `updateUser` mutation accepts all three fields; `listUsers` query returns all three fields; `UsersManager.tsx` has "Employment Details" section with date input, number input, text input |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `convex/integrations/internal/adapter.ts` | Revenue sync with forceFullSync + externalRevenueItems | VERIFIED | 199 lines; contains `forceFullSync`, `saveRevenueItems`, `getOrderItemsByOrderNumbers`, `totalItems` tracking |
| `convex/integrations/internal/queries.ts` | getRevenueOrders + getOrderItemsByOrderNumbers | VERIFIED | 86 lines; both queries exported as internalQuery; items filtered by `!isCancelled` |
| `convex/crons.ts` | Hourly cron for internal order sync | VERIFIED | 14 lines; `crons.interval("sync internal orders revenue", { hours: 1 }, ...)` |
| `convex/migrations/fixConfirmedOrders.ts` | Migration to fix stuck Confirmed orders | VERIFIED | 115 lines; queries by_status Confirmed, traces orderEvents, advances paid orders to PaymentReceived with audit trail |
| `src/components/salesAnalytics/SettingsTab.tsx` | Backfill All Orders button | VERIFIED | Contains `handleBackfillInternal`, `forceFullSync: true`, "Backfill All Orders" text |
| `convex/schema.ts` | cogsOverrideIdr on menuProducts + employee fields on users | VERIFIED | `cogsOverrideIdr: v.optional(v.number())` at line 121; `hireDate`, `baseSalaryIdr`, `bankAccountHolderName` at lines 464-466 |
| `convex/lib/costCalculator.ts` | buildProductCOGSMap with override parameter | VERIFIED | Third optional param `menuProducts?`; override skip logic in BOM loop; override application after BOM |
| `convex/menuProducts/mutations.ts` | update mutation with cogsOverrideIdr + clearCogsOverride | VERIFIED | Both args present; handler logic at lines 283-284 |
| `convex/auth/mutations.ts` | updateUser with employee fields | VERIFIED | `hireDate`, `baseSalaryIdr`, `bankAccountHolderName` in args at lines 204-206 |
| `src/pages/MenuProductsManager.tsx` | Inline COGS override with Override badge | VERIFIED | `editingCogsId` state, `handleCogsOverrideSave`, `startCogsEdit`, amber Override Badge |
| `src/hooks/convex/useMenuProducts.ts` | MenuProductUpdateInput with cogsOverrideIdr | VERIFIED | `cogsOverrideIdr` at line 38, `clearCogsOverride` at line 39 |
| `src/pages/UsersManager.tsx` | Employment Details section | VERIFIED | "Employment Details" section with `edit-hireDate`, `edit-salary`, `edit-bankHolder` inputs |
| `tests/convex/costCalculator.test.ts` | Override tests | VERIFIED | 5 override tests passing (override replaces BOM, undefined fallback, backward compat, zero valid, mix) |
| `tests/convex/internalAdapter.test.ts` | Pipeline tests | VERIFIED | 5 tests passing (query shape, item exclusion, ID format, full sync, incremental sync) |
| `src/components/menuProducts/ProductForm.tsx` | Must NOT contain cogsOverrideIdr (D-09) | VERIFIED | No matches found -- override is inline-only, not in dialog |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `convex/crons.ts` | `convex/integrations/internal/adapter.ts` | `api.integrations.internal.adapter.syncInternalOrders` | WIRED | Line 9: cron interval calls action |
| `convex/integrations/internal/adapter.ts` | `convex/externalData/mutations.ts` | `saveRevenueItems` | WIRED | Line 132: ctx.runMutation call |
| `convex/integrations/internal/adapter.ts` | `convex/integrations/internal/queries.ts` | `getOrderItemsByOrderNumbers` | WIRED | Line 119: ctx.runQuery call |
| `convex/reports/incomeStatement.ts` | `convex/lib/costCalculator.ts` | `buildProductCOGSMap` with menuProducts override data | WIRED | Line 675: menuProductsList passed as third arg |
| `src/pages/MenuProductsManager.tsx` | `convex/menuProducts/mutations.ts` | cogsOverrideIdr via useUpdateMenuProduct | WIRED | Lines 372, 383: mutation calls with clearCogsOverride and cogsOverrideIdr |
| `src/pages/UsersManager.tsx` | `convex/auth/mutations.ts` | updateUser with employee fields | WIRED | Line 147: bankAccountHolderName passed in mutation |
| `convex/auth/queries.ts` | `src/pages/UsersManager.tsx` | listUsers returns employee fields | WIRED | Lines 55-57: hireDate, baseSalaryIdr, bankAccountHolderName returned |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|-------------------|--------|
| `adapter.ts` | orders | `getRevenueOrders` query -> `ctx.db.query("orders")` | DB query with status filter | FLOWING |
| `adapter.ts` | orderItemsMap | `getOrderItemsByOrderNumbers` -> `ctx.db.query("orderItems")` | DB query with order join | FLOWING |
| `incomeStatement.ts` | cogsMap | `buildProductCOGSMap(bom, types, menuProductsList)` | DB queries for BOM + menu products | FLOWING |
| `MenuProductsManager.tsx` | product.cogsOverrideIdr | Convex useQuery real-time | DB field on menuProducts | FLOWING |
| `UsersManager.tsx` | user.hireDate/baseSalaryIdr/bankAccountHolderName | listUsers query | DB fields on users | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| COGS override logic | `vitest run tests/convex/costCalculator.test.ts` | 15/15 passed (incl. 5 override tests) | PASS |
| Internal adapter pipeline | `vitest run tests/convex/internalAdapter.test.ts` | 5/5 passed | PASS |
| TypeScript type safety | `npm run type-check` | Clean exit (0 errors) | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-----------|-------------|--------|----------|
| DA-01 | 70-01 | Direct sales orders flow into externalRevenue bridge | SATISFIED | syncInternalOrders creates externalRevenue + externalRevenueItems; hourly cron; fixConfirmedOrders migration |
| DA-02 | 70-01 | Historical direct sales backfilled into revenue bridge | SATISFIED | forceFullSync param + "Backfill All Orders" button in SettingsTab |
| DA-03 | 70-02 | Flat COGS override per menu product | SATISFIED | cogsOverrideIdr schema field; buildProductCOGSMap override; inline editing on MenuProductsManager |
| DA-04 | 70-02 | Employee profile with hire date, base rate, bank holder name | SATISFIED | Schema fields + updateUser mutation + listUsers query + UsersManager Employment Details section |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | - | - | - | No anti-patterns found in phase 70 files |

### Human Verification Required

### 1. Sales Analytics Revenue Display

**Test:** Deploy to dev, create or confirm a direct sales order, wait for cron (or trigger sync from Settings), then check Sales Analytics
**Expected:** Internal channel revenue entries appear with correct amounts and dates
**Why human:** Requires running backend + frontend against real data to confirm end-to-end pipeline

### 2. Income Statement COGS Override

**Test:** Set cogsOverrideIdr on a menu product, then view Income Statement for a period with that product's sales
**Expected:** COGS column reflects the override value, not BOM calculation
**Why human:** Requires full pipeline: schema write -> buildProductCOGSMap recalculation -> Income Statement render

### 3. Inline COGS Edit UX

**Test:** Open MenuProductsManager, click COGS value on a product card
**Expected:** Input appears (placeholder "Auto (BOM)"), type value + Enter saves, amber "Override" badge shows; clear input + Enter removes override
**Why human:** Interactive click-to-edit behavior, keyboard handling (Enter/Escape/blur), visual badge display

### 4. Employment Details in UsersManager

**Test:** Open UsersManager, edit a user
**Expected:** Employment Details section visible below avatar URL with date picker, salary number input, bank holder name text input; save persists all fields
**Why human:** Form layout, field types, save persistence, section visibility

### Gaps Summary

No automated gaps found. All 4 roadmap success criteria are verified at the code level. All 4 requirement IDs (DA-01 through DA-04) are satisfied with substantive, wired, and data-flowing implementations. 20 tests pass, type-check is clean.

4 items require human verification to confirm end-to-end behavior in a running application.

---

_Verified: 2026-04-10T07:48:14Z_
_Verifier: Claude (gsd-verifier)_
