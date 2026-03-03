# Income Statement Feature Design

**Date:** 2026-03-01
**Status:** Revised (post-staffreview)
**Author:** Claude (brainstorming session with Irfan)
**Review:** `docs/reviews/staffreview-income-statement-design-2026-03-01.md`

---

## 1. Problem Statement

Frollie Recipe Master has rich financial data scattered across multiple tables and channels, but no unified view that computes a standard income statement. The business needs visibility into **Revenue -> COGS -> Gross Profit** at weekly granularity, with per-channel breakdown and clear data quality signals.

**Current state:**
- Revenue data exists in `externalRevenue` (unified ledger) for 6 channels + `consignmentSettlements` (parallel ledger)
- COGS is computed per-product via BOM (`componentTypes` + `menuProductComponents`) but only production COGS (balls) flows into order margins; packaging COGS is tracked but excluded
- No single query or view aggregates all channels into income statement format
- No export capability for financial data

**Desired state:**
- Standalone `/financials` page showing a weekly income statement (Revenue -> Gross Profit)
- Full COGS including production AND packaging resolved via BOM
- Channel-level breakdown with confidence indicators
- CSV export for external analysis
- Gap analysis panel showing data quality issues
- OpEx / EBIT deferred to a future milestone (bank transaction import)

---

## 2. Approach: Real-Time Query Aggregation

**Decision:** Query-time aggregation from existing data (Approach A).

**Rationale:** At SME scale (~100-500 transactions/week), real-time aggregation is fast and keeps data always current. Snapshot tables add staleness risk and complexity without meaningful performance benefit. If an order is corrected or a sync fills missing data, the P&L automatically reflects the fix.

**Alternatives considered:**
- **Snapshot table:** Pre-computed weekly P&L rows. Rejected: adds data duplication, staleness, and re-computation logic for no performance benefit at current scale.
- **Hybrid (real-time current + snapshot historical):** Rejected: most complex, overkill for current data volume. Can be added later if needed.

---

## 3. Git Workflow

**Branch:** `feature/income-statement`
**Base:** `main` (merge current `fix/sales-analytics-ball-estimate` first)

**Checkpoints:**
1. After backend COGS helper + income statement query -> `feat: add BOM COGS resolver and weekly income statement query`
2. After frontend page + hook + route -> `feat: add Income Statement page with week navigation`
3. After CSV export -> `feat: add CSV export for income statement`
4. After tests -> `test: add income statement query tests with known-value cases`
5. After docs -> `docs: update CHANGELOG and API_REFERENCE for income statement`
6. Final `npm run test && npm run build` -> merge to main

**Pre-merge:**
- `npm run test` passes (all existing + new tests)
- `npm run build` passes
- Manual smoke test: navigate `/financials`, verify numbers render, export CSV

**Rollback:** No schema changes, so standard `git revert` is safe. No data mutations — read-only feature.

---

## 4. Income Statement Structure

### Line Items and Data Sources

```
REVENUE
  Gross Revenue (by channel)
    Direct (WhatsApp/Instagram)    <- orders.totalAmount (via externalRevenue[source=internal])
    GoFood                         <- externalRevenue.revenueGross [source=gobiz]
    Shopee                         <- externalRevenue.revenueGross [source=shopee]
    TikTok                         <- externalRevenue.revenueGross [source=tiktok]
    K3Mart                         <- externalRevenue.revenueGross [source=k3mart]
    Consignment                    <- consignmentSettlements.totalRevenue (by periodStart in week)
    GrabFood                       <- (pending OAuth scope -- $0 until unblocked)

  Less: Revenue Deductions
    Customer Discounts             <- orders: totalAmount - (finalTotal - deliveryFee)
    Platform Commissions           <- externalRevenue.commission (GoFood, Shopee, TikTok)
    GoFood Ad Spend                <- externalRevenue.adBurn
    GoFood Promo Burn              <- externalRevenue.promoBurn
    Consignment Rev Share          <- consignmentSettlements.revShareAmount
    Seller Shipping Fees           <- externalRevenue (normalize at sync time -- see Decision 8)

  = NET REVENUE

COST OF GOODS SOLD
  Production COGS (Balls)          <- BOM resolution via in-memory maps (see Section 5)
  Packaging COGS                   <- BOM resolution via in-memory maps (see Section 5)

  = TOTAL COGS

GROSS PROFIT = NET REVENUE - TOTAL COGS
GROSS MARGIN % = GROSS PROFIT / NET REVENUE (show "N/A" when NET REVENUE = 0)
```

### COGS Resolution per Channel

| Channel | COGS Method | Notes |
|---------|------------|-------|
| Internal orders | `orderItems.unitCost` snapshot (production) + BOM packaging resolution | Production COGS already snapshotted at order time |
| GoFood / GoBiz | `linkedMenuProductId` -> BOM full resolution | Requires menu product mapping |
| Shopee / TikTok | `linkedMenuProductId` -> BOM full resolution | BigSeller `costFee` = 0, so BOM is only source |
| K3Mart | `linkedMenuProductId` -> BOM full resolution | Stock-delta inferred revenue |
| Consignment | `linkedMenuProductId` -> BOM full resolution | Manual settlement data |
| **Unmapped items** | **Revenue shown, COGS = 0, confidence = "missing"** | Flagged in gap analysis panel. No estimation -- honest zero. |

**Unmapped product strategy:** Items without `linkedMenuProductId` show their revenue but zero COGS, with `confidence: "missing"`. The gap analysis panel lists them by name so the user can map them via the existing Product Mapping tab in Sales Analytics. This is more honest than fabricating estimates from product names.

### Data Quality Classification

| Level | Meaning | UI Treatment |
|-------|---------|--------------|
| `exact` | Direct transaction data (orders, API sync) | Solid number, no indicator |
| `calculated` | Derived from BOM (ingredient costs -> COGS) | Number with calc icon |
| `inferred` | Estimated (K3Mart stock delta revenue) | Number with ~ prefix |
| `missing` | Data source unavailable or unmapped product COGS | Dash with warning icon |

---

## 5. Technical Architecture

### No New Schema Tables

The query reads from existing tables:
- `externalRevenue` -- unified revenue ledger (by_period index)
- `orders` -- internal order details for discount/delivery correction
- `consignmentSettlements` -- consignment revenue/rev share (by_period index)
- `menuProductComponents` -- BOM links per product
- `componentTypes` -- per-component COGS (unitCostIdr)
- `externalRevenueItems` -- line-item detail for BOM resolution on external channels

### BOM Preloading Strategy (Prevents N+1)

Follow the `getLifetimeTotalsInternal` pattern: preload BOM reference data into in-memory maps at query start, then do O(1) lookups per revenue item.

```
Step 1: Parallel preload (single table scan each, done once)
  menuProductComponents.collect()  -> Map<menuProductId, Component[]>
  componentTypes.collect()         -> Map<componentTypeId, { unitCostIdr, category }>

Step 2: Build per-product COGS map
  For each menuProductId in menuProductComponents:
    Sum componentTypes.unitCostIdr * quantity (grouped by category)
    -> Map<menuProductId, { production: number, packaging: number, total: number }>

Step 3: Per-revenue-item lookup = O(1) map.get(linkedMenuProductId)
```

This avoids N+1 queries entirely. The BOM tables are small (< 200 rows each at current scale).

### Reusable COGS Resolver Helper

Extract the BOM -> per-product COGS map building into `convex/lib/costCalculator.ts`:

```typescript
// New helper alongside existing calculateMenuProductCOGS
export function buildProductCOGSMap(
  bomComponents: Array<{ menuProductId: string; componentTypeId: string; quantity: number }>,
  componentTypes: Array<{ _id: string; unitCostIdr: number; category: string }>
): Map<string, { production: number; packaging: number; total: number }>
```

This is reusable by future features that need per-product COGS resolution across sets of products.

### Revenue Aggregation: Reuse Existing Logic

The existing `getDashboardSummaryByPeriodInternal` (convex/externalData/queries.ts:495) already handles:
- Fetching `externalRevenue` by period range
- Internal order discount correction via `fetchInternalOrderDataMap`
- Per-channel aggregation (gross, net, commission, adBurn, promoBurn)

The income statement query should **call this internal query** for the revenue section, then layer COGS resolution on top. This avoids duplicating ~150 lines of revenue aggregation logic.

If the existing query's return shape doesn't perfectly match (e.g., missing consignment), extend it rather than rewrite.

### Backend Query: `convex/reports/incomeStatement.ts`

**Single query:** `getWeeklyIncomeStatement` (combines P&L + gap analysis in one call)
- **Args:** `{ weekStart: number }` (epoch ms for Monday of the target week, WIB timezone)
- **Returns:** Structured P&L object with channel breakdown, deductions, COGS, gross profit, confidence flags, AND gap analysis

**Key computation steps:**
1. Calculate week range using WIB timezone (Mon 00:00 WIB -> Sun 23:59 WIB). Reuse `convex/lib/periodRange.ts` WIB helpers (`getWibComponents`, `wibMidnightToUtc`). Extend if needed for arbitrary week start input.
2. Fetch `externalRevenue` records in range (by_period index)
3. Fetch `consignmentSettlements` where `periodStart` falls within the target week (Option C -- no proration, see Decision 9)
4. For internal orders: lookup real order data for discount correction (existing `fetchInternalOrderDataMap` pattern)
5. For each channel: aggregate gross revenue, commissions, fees
6. **Parallel preload** BOM reference data (`menuProductComponents`, `componentTypes`) into in-memory maps
7. For COGS: resolve via `linkedMenuProductId` -> BOM map lookup. Unmapped items get `confidence: "missing"`, COGS = 0.
8. Compute gross profit and margin (guard division by zero -> "N/A")
9. Build gap analysis inline (unmapped products count + names, zero-COGS component types, missing channels)
10. Fetch previous week using same logic for comparison (delta %)

### Frontend

| Component | File | Purpose |
|-----------|------|---------|
| **Page** | `src/pages/FinancialStatement.tsx` | Income statement with period navigation, P&L table, gap analysis panel |
| **Hook** | `src/hooks/convex/useFinancials.ts` | Wraps query with week state, period navigation, export trigger |
| **Route** | `src/App.tsx` | `/financials`, permission: `canAccessDashboard` (Manager, Admin) |
| **CSV export** | Inside hook or `src/lib/csvExport.ts` | Flat-format CSV generation |

### CSV Export

Export button generates a **flat-format CSV** (one row per line item -- most flexible for external analysis):

| Column | Example |
|--------|---------|
| `period` | `2026-02-24 to 2026-03-02` |
| `section` | `revenue` / `deductions` / `cogs` / `summary` |
| `channel` | `Direct` / `GoFood` / `All` |
| `line_item` | `Gross Revenue` / `Platform Commissions` / `Production COGS` |
| `amount_idr` | `4200000` |
| `confidence` | `exact` / `calculated` / `inferred` / `missing` |
| `prev_week_idr` | `3800000` |
| `delta_pct` | `10.5` |

Footer rows: data quality notes (unmapped product count, missing channels).

---

## 6. UI Layout

```
/financials -- Income Statement Page

[PageHeader: "Income Statement"]                          [Export CSV]

Period: [< Prev Week] Week of Feb 24 - Mar 2, 2026 [Next Week >]
Compare to: Previous week

REVENUE                              This Week    Prev Week    Delta
  Gross Revenue                    Rp 12.450.000  Rp 11.200.000  +11%
    Direct (WhatsApp)               Rp 4.200.000   Rp 3.800.000  +11%
    GoFood                          Rp 3.100.000   Rp 2.900.000   +7%
    Shopee                          Rp 2.800.000   Rp 2.500.000  +12%
    TikTok                          Rp 1.200.000   Rp 1.000.000  +20%
    K3Mart                        ~ Rp 1.000.000     Rp 850.000  +18%
    Consignment                       Rp 150.000     Rp 150.000    0%

  Less: Deductions
    Customer Discounts               (Rp 320.000)  (Rp 280.000)
    Platform Commissions             (Rp 890.000)  (Rp 810.000)
    GoFood Ads + Promos              (Rp 150.000)  (Rp 120.000)
    Consignment Rev Share             (Rp 45.000)   (Rp 45.000)
    Seller Shipping                  (Rp 210.000)  (Rp 190.000)

  NET REVENUE                     Rp 10.835.000   Rp 9.755.000  +11%

COST OF GOODS SOLD
  Production COGS (Balls)          Rp 3.200.000   Rp 2.900.000  +10%
  Packaging COGS                     Rp 480.000     Rp 430.000  +12%
  TOTAL COGS                       Rp 3.680.000   Rp 3.330.000  +11%

GROSS PROFIT                       Rp 7.155.000   Rp 6.425.000  +11%
  Gross Margin                          66.0%          65.8%    +0.2pp

DATA QUALITY
  ! 3 unmapped products (no COGS -- map in Sales Analytics > Mappings)
  ! GrabFood revenue: Rp 0 (OAuth scope pending)
  ! BigSeller COGS: Rp 0 (not configured in BigSeller)
  * 42/45 products have BOM-linked COGS
```

**Formatting:** Use `formatCurrency` from `src/lib/utils.ts` for IDR formatting (Rp X.XXX.XXX). Reuse `GrowthIndicator` component from `src/components/salesAnalytics/OverviewTab.tsx:74` for delta rendering. Use `getPlatformPalette` from `src/lib/platformColors.ts` for channel color coding.

**Responsive:** Follow 280px minimum width pattern from CODE_STYLE.md. On mobile, stack "This Week" / "Prev Week" / "Delta" vertically or hide comparison columns behind a toggle.

---

## 7. Scope Boundaries

### In Scope (This Phase)
- Weekly income statement: Revenue -> COGS -> Gross Profit
- Per-channel revenue breakdown with confidence flags
- Full BOM COGS resolution (production + packaging)
- Previous week comparison with delta %
- CSV export (flat format)
- Data quality / gap analysis panel (inline, not separate query)
- Consignment integration into unified P&L

### Explicitly Deferred
| Item | Rationale | Future Milestone |
|------|-----------|-----------------|
| Bank transaction import | Enables OpEx -> EBIT. Separate data source integration. | v1.5+ |
| Monthly/quarterly views | Start with weekly. Period switching is additive. | Follow-up |
| Budget vs. actual | Requires budget input system | After OpEx tracking |
| GrabFood revenue | Blocked on external OAuth scope grant | Auto-populates when unblocked |
| BigSeller COGS config | External platform config, not Frollie code | External task |
| Packaging COGS in `orderItems.unitCost` | P&L computes full COGS; order margin stays production-only for now | Separate fix |
| Print-friendly view | Nice-to-have for sharing with partners | Follow-up |
| `estimateBallsFromName()` | Name-based ball estimation for unmapped products. Deferred -- honest zero COGS with "missing" flag is better than unreliable estimates. | If needed |

---

## 8. Key Design Decisions

1. **Real-time aggregation over snapshots:** SME scale, correctness over speed.
2. **Consignment folded into P&L:** `consignmentSettlements` treated as another channel in the unified view.
3. **Full COGS (production + packaging):** The P&L will show true COGS including packaging for the first time. More accurate than `orders.totalMargin` which only includes production.
4. **Confidence indicators are first-class:** Every number has a provenance. Users know what to trust and what to investigate.
5. **Gap analysis is inline:** Combined into the single P&L query return, not a separate query (avoids double table scans).
6. **Week starts Monday:** Aligns with Indonesian business week convention. WIB (UTC+7) timezone for day boundaries.
7. **Unmapped items = honest zero COGS:** Items without `linkedMenuProductId` show revenue but zero COGS with `confidence: "missing"`, flagged in gap analysis. No fabricated estimates.
8. **Seller shipping fees via `externalRevenue.commission`:** Use the unified `externalRevenue` fields consistently for all deductions. `sellerShippingFee` from BigSeller is currently NOT synced to `externalRevenue` -- note as a known gap. Future: normalize at sync time.
9. **Consignment period matching = periodStart-in-week:** Only include settlements where `periodStart` falls within the target week. No proration for multi-week settlements. Simple, deterministic, documented limitation.
10. **BOM preloading into in-memory maps:** Prevents N+1 queries. Preload `menuProductComponents` + `componentTypes` once at query start, build per-product COGS map, then O(1) lookups per revenue item.

---

## 9. Implementation Waves

### Wave 1: Backend [SEQUENTIAL]
| Agent | Task | Files |
|-------|------|-------|
| convex-backend | Extract `buildProductCOGSMap` helper | `convex/lib/costCalculator.ts` |
| convex-backend | Extend `periodRange.ts` for arbitrary week start (if needed) | `convex/lib/periodRange.ts` |
| convex-backend | Implement `getWeeklyIncomeStatement` query | `convex/reports/incomeStatement.ts` |

**Commit checkpoint:** `feat: add BOM COGS resolver and weekly income statement query`

### Wave 2: Frontend [PARALLEL, after Wave 1]
| Agent | Task | Files |
|-------|------|-------|
| react-ui-builder | Create FinancialStatement page with P&L table layout | `src/pages/FinancialStatement.tsx` |
| react-ui-builder | Create useFinancials hook with week navigation state | `src/hooks/convex/useFinancials.ts` |
| react-ui-builder | Add route + nav entry + barrel export | `src/App.tsx`, `src/hooks/convex/index.ts` |
| react-ui-builder | Implement flat-format CSV export | Inside page or `src/lib/csvExport.ts` |

**Commit checkpoint:** `feat: add Income Statement page with week navigation and CSV export`

### Wave 3: Testing [SEQUENTIAL, after Wave 2]
| Agent | Task | Files |
|-------|------|-------|
| tdd-test-architect | Backend tests for income statement query | `tests/convex/incomeStatement.test.ts` |
| code-auditor | Type check + pattern compliance | -- |
| Bash | `npm run test && npm run build` | -- |

**Commit checkpoint:** `test: add income statement query tests`

### Wave 4: Documentation [SEQUENTIAL, after Wave 3]
| Agent | Task | Files |
|-------|------|-------|
| -- | Update CHANGELOG, API_REFERENCE, ROADMAP | `docs/` |

**Commit checkpoint:** `docs: update CHANGELOG and API_REFERENCE for income statement`

---

## 10. Testing Plan

### Backend Tests: `tests/convex/incomeStatement.test.ts`

Using `convex-test` with seeded data:

| # | Test Case | Seed Data | Expected Output |
|---|-----------|-----------|-----------------|
| 1 | **BOM COGS accuracy** | 1 product: 1x BIG_BALL (Rp 19,231) + 1x Small Box (Rp 1,500) + 1x Sticker (Rp 200). 1 internal order for 2 units. | Production COGS = 38,462. Packaging COGS = 3,400. Total COGS = 41,862. |
| 2 | **Multi-channel revenue aggregation** | 3 `externalRevenue` records: internal (Rp 500K), gobiz (Rp 300K, commission Rp 30K), shopee (Rp 200K, commission Rp 20K). | Gross = 1M. Commissions = 50K. Net = 950K. 3 channels in breakdown. |
| 3 | **Internal order discount correction** | 1 order: totalAmount=100K, finalTotal=85K, deliveryFee=5K. Synced as externalRevenue. | Gross=100K. Discount=20K. Net product revenue=80K. |
| 4 | **Empty week** | No records in target week range. | All values = 0. No crash. Empty channels array. Gap analysis shows "No data". |
| 5 | **Unmapped product COGS = missing** | 1 `externalRevenueItem` with no `linkedMenuProductId`. | Revenue counted, COGS = 0, confidence = "missing". Item appears in gap analysis unmapped list. |
| 6 | **Consignment settlement inclusion** | Settlement with `periodStart` inside target week. Another with `periodStart` outside week. | Only the first is included. Second is excluded. |
| 7 | **WIB timezone boundary** | Revenue record at Mon 00:01 WIB (Sun 17:01 UTC). Another at Sun 23:59 WIB. | Both included in the same week. |
| 8 | **Division by zero: zero revenue margin** | Week with zero revenue. | Gross margin shows null / "N/A", not NaN. |
| 9 | **Negative net revenue** | Channel where commissions > gross revenue. | Net revenue is negative. No crash. Display as negative. |
| 10 | **`buildProductCOGSMap` unit test** | Direct test of the pure helper with known BOM data. | Correct map with production/packaging/total per product. |

### Test for `buildProductCOGSMap` helper (pure function, no ctx)

```typescript
// convex/lib/costCalculator.test.ts (or tests/convex/costCalculator.test.ts)
test("buildProductCOGSMap resolves production + packaging correctly", () => {
  const result = buildProductCOGSMap(bomComponents, componentTypes);
  expect(result.get("product1")).toEqual({ production: 19231, packaging: 1700, total: 20931 });
});
```

### Test Execution Checkpoints
1. After Wave 1 (backend): `npm run test` -- all existing + new backend tests pass
2. After Wave 2 (frontend): `npm run test` -- all tests pass
3. Before merge (Wave 3): Full `npm run test && npm run build`

### Regression Risk
- If `getDashboardSummaryByPeriodInternal` is called internally by the new query, existing tests that mock it may need awareness of new callers -- low risk since we call it, not modify it.
- Adding a new route to `App.tsx` -- smoke test that navigation doesn't break.
- No existing tests reference `convex/reports/` -- no direct regression.

---

## 11. Edge Cases

The implementation must handle:

- [ ] **Week with zero transactions** -- display zeros across all line items, not error
- [ ] **Channel with revenue but no BOM-linked products** -- COGS shows as "missing" for that channel
- [ ] **Deleted orders referenced by `externalRevenue`** -- `fetchInternalOrderDataMap` falls back to revenue record data (existing pattern)
- [ ] **Consignment settlements spanning multiple weeks** -- only attributed to the week containing `periodStart` (no proration, documented limitation)
- [ ] **`componentTypes.unitCostIdr` = 0** -- flag in gap analysis as "zero cost component"
- [ ] **Week navigation beyond available data** -- show empty P&L with zero values, not an error
- [ ] **Division by zero in margin** -- when net revenue = 0, margin shows "N/A" not NaN/Infinity
- [ ] **Negative net revenue** -- when deductions exceed gross (possible for high-commission channels), display as negative number
- [ ] **Products with `cogsMissingCount > 0`** -- ingredients with missing cost data, flag in gap analysis

---

## 12. Documentation Updates

- [ ] `docs/CHANGELOG.md` -- New "Income Statement" feature entry
- [ ] `docs/API_REFERENCE.md` -- New `reports.incomeStatement.getWeeklyIncomeStatement` query docs
- [ ] `docs/ROADMAP.md` -- Mark income statement as implemented, note OpEx/EBIT and bank import as future

---

## 13. Success Criteria

- [ ] `/financials` page renders weekly P&L with channel breakdown
- [ ] COGS includes both production (balls) and packaging components via BOM resolution
- [ ] Previous week comparison shows delta amounts and percentages
- [ ] Data quality panel accurately identifies unmapped products, missing channels, and COGS gaps
- [ ] CSV export downloads a flat-format P&L with all line items and confidence flags
- [ ] Unmapped products show revenue with zero COGS and `confidence: "missing"`
- [ ] Empty week renders zeros (no crash)
- [ ] Margin shows "N/A" when net revenue = 0
- [ ] `npm run test` passes (including new income statement tests)
- [ ] `npm run build` passes
- [ ] `npm run type-check` passes
- [ ] Page accessible to Manager and Admin roles only (`canAccessDashboard`)

---

## 14. Existing Code to Leverage

| Existing Code | Location | How to Use |
|---------------|----------|------------|
| `getDashboardSummaryByPeriodInternal` | `convex/externalData/queries.ts:495` | Call for revenue aggregation (channels, discounts, commissions) |
| `fetchInternalOrderDataMap` | `convex/externalData/queries.ts:19` | Internal order discount/delivery lookup pattern |
| `calculateMenuProductCOGS` | `convex/lib/costCalculator.ts:101` | Reference pattern for new `buildProductCOGSMap` |
| `getLifetimeTotalsInternal` | `convex/externalData/queries.ts:1762` | BOM preloading + in-memory map pattern to follow |
| `calculatePeriodRange` / WIB helpers | `convex/lib/periodRange.ts` | Week range calculation with WIB timezone |
| `sourceToPlatform` | `convex/externalData/queries.ts` | Source -> display name mapping |
| `getPlatformPalette` | `src/lib/platformColors.ts` | Channel color system for UI |
| `formatCurrency` | `src/lib/utils.ts` | IDR formatting (Rp X.XXX.XXX) |
| `GrowthIndicator` | `src/components/salesAnalytics/OverviewTab.tsx:74` | Delta % indicator UI component |

---

## 15. Known Gaps & Limitations

| Gap | Impact | Mitigation |
|-----|--------|------------|
| BigSeller `sellerShippingFee` not in `externalRevenue` | Seller shipping fees excluded from P&L deductions for Shopee/TikTok | Future: normalize at sync time. For now, only `commission` is deducted. |
| GrabFood OAuth scope pending | GrabFood channel shows Rp 0 | Automatically populates when OAuth is granted. |
| BigSeller `costFee` = 0 | Cannot cross-validate BOM COGS against platform COGS for Shopee/TikTok | Use BOM COGS as source of truth. Flag as known limitation. |
| Consignment multi-week settlements | Revenue attributed only to week of `periodStart` | Document limitation. Future: add proration if needed. |
| Unmapped products | Revenue counted, COGS = 0 | Flagged in gap analysis. User maps via Sales Analytics > Mappings tab. |
