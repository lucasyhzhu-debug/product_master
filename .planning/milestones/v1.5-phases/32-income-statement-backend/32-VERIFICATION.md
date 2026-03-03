---
phase: 32-income-statement-backend
verified: 2026-03-02T11:50:00Z
status: passed
score: 5/5 must-haves verified
re_verification: false
---

# Phase 32: Income Statement Backend Verification Report

**Phase Goal:** System can compute a complete weekly income statement from existing data -- revenue per channel, deductions, full BOM COGS, gross profit, with confidence classification and data quality gap identification
**Verified:** 2026-03-02T11:50:00Z
**Status:** passed
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Calling `getWeeklyIncomeStatement({ weekStart })` returns per-channel gross revenue aggregated from `externalRevenue` and `consignmentSettlements` for the target week | VERIFIED | Query exported at `convex/reports/incomeStatement.ts:481`. Revenue grouped by source (line 130-135), consignment handled separately (line 284-366). Both use `by_period` index on `periodStart`. Integration test `tests/convex/incomeStatement.test.ts` confirms revenue aggregation in "delta comparison" test (line 357-387). |
| 2 | Revenue deductions (customer discounts, platform commissions, ad/promo burn, consignment rev share) are computed and subtracted to produce net revenue per channel | VERIFIED | Internal discount computed as `totalAmount - (finalTotal - deliveryFee)` (line 175-177). Platform deductions use `rec.commission ?? 0`, `rec.adBurn ?? 0`, `rec.promoBurn ?? 0` with null-safe `?? 0` (line 187-190). Consignment rev share at line 292. Net = gross - all deductions (line 197-203). Integration test "negative net revenue" (line 296-326) confirms deductions > gross works correctly. |
| 3 | Full BOM COGS (production balls + packaging) is resolved via `buildProductCOGSMap` for every revenue item with a `linkedMenuProductId`, and unmapped items get COGS = 0 | VERIFIED | `buildProductCOGSMap` exported from `convex/lib/costCalculator.ts:148`. Called in handler at line 577-588. COGS resolution per revenue item at lines 209-254. Unmapped items get `{ production: 0, packaging: 0, total: 0 }` (line 219) with `confidence: "missing"` (line 221-222). Unit test verifies exact COGS values: production=19231, packaging=1700, total=20931 (`costCalculator.test.ts:18-35`). Integration test "known BOM COGS accuracy" (`incomeStatement.test.ts:226-281`) verifies end-to-end. |
| 4 | Every financial figure carries a confidence level (exact/calculated/inferred/missing) in the query response | VERIFIED | `Confidence` type defined (line 24). Channel revenue confidence via `getChannelRevenueConfidence()` (lines 98-112): internal/gobiz/shopee/tiktok/grabfood/consignment="exact", k3mart="inferred". Product COGS confidence: "calculated" when BOM-resolved, "missing" when unmapped (lines 221-222). Channel-level confidence = lowest of revenue + product confidences via `lowestConfidence()` (lines 258-264). Integration test confirms unmapped product has `confidence: "missing"` (line 217-223). |
| 5 | The query response includes a gap analysis section listing unmapped product names, zero-cost component types, and missing channel warnings | VERIFIED | `GapAnalysis` interface (lines 55-65) with `unmappedProducts`, `zeroCostComponents`, `missingChannels`, `totalMappedProducts`, `totalProducts`. Unmapped tracking during aggregation (lines 228-239). Zero-cost components filtered (lines 382-384). Missing channels checked against known sources (lines 391-406). Integration tests: "unmapped product appears in gap analysis" (line 178-224), "zero-cost component appears in gap analysis" (line 328-355). |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `convex/reports/incomeStatement.ts` | Weekly income statement query | VERIFIED | 643 lines, exported `getWeeklyIncomeStatement` query with pure `aggregateWeek` function. Registered in `convex/_generated/api.d.ts` line 149. |
| `convex/lib/costCalculator.ts` | `buildProductCOGSMap` helper | VERIFIED | Function exported at line 148. Pure function, no ctx. Single-pass aggregation. Category logic matches existing `calculateMenuProductCOGS`. |
| `convex/lib/periodRange.ts` | `calculateWeekRange` helper | VERIFIED | Function exported at line 149. Pure function. Returns `{ currentStart, currentEnd, previousStart, previousEnd }`. `WEEK_MS` constant at line 135. |
| `convex/externalData/queries.ts` | `fetchInternalOrderDataMap` exported | VERIFIED | `export async function fetchInternalOrderDataMap(` at line 19. Imported by income statement query. |
| `tests/convex/costCalculator.test.ts` | Unit tests for helpers | VERIFIED | 10 tests: 6 for `buildProductCOGSMap` + 4 for `calculateWeekRange`. All pass. Known-value assertion: 19231+1700=20931. |
| `tests/convex/incomeStatement.test.ts` | Integration tests | VERIFIED | 8 tests covering: empty week, unmapped COGS, BOM accuracy, zero margin, negative net, zero-cost components, delta comparison, quantity scaling. All pass. |
| `docs/CHANGELOG.md` | Income statement entry | VERIFIED | Unreleased v1.5 section with full Phase 32 details (lines 17-30). |
| `docs/API_REFERENCE.md` | Query documentation | VERIFIED | Reports: Income Statement section at line 1542. Documents args, return structure (WeekData, Deltas, GapAnalysis), usage example, and notes. Library utilities section for helpers at line 1601. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `incomeStatement.ts` | `costCalculator.ts` | `import { buildProductCOGSMap }` | WIRED | Import at line 15, called at line 577 |
| `incomeStatement.ts` | `periodRange.ts` | `import { calculateWeekRange }` | WIRED | Import at line 16, called at line 487 |
| `incomeStatement.ts` | `externalData/queries.ts` | `import { sourceToPlatform, fetchInternalOrderDataMap }` | WIRED | Import at lines 18-20, `sourceToPlatform` used at lines 268/353, `fetchInternalOrderDataMap` called at lines 572-573 |
| `incomeStatement.ts` | schema `externalRevenue` | `ctx.db.query("externalRevenue").withIndex("by_period")` | WIRED | Index `by_period` confirmed in schema.ts line 1080 |
| `incomeStatement.ts` | schema `consignmentSettlements` | `ctx.db.query("consignmentSettlements").withIndex("by_period")` | WIRED | Index `by_period` confirmed in schema.ts line 1569 |
| `incomeStatement.ts` | schema `externalRevenueItems` | `ctx.db.query("externalRevenueItems").withIndex("by_revenue")` | WIRED | Index `by_revenue` confirmed in schema.ts line 1102 |
| `incomeStatement.ts` | schema `menuProductComponents` | `ctx.db.query("menuProductComponents").collect()` | WIRED | Full table scan for BOM preload at line 532 |
| `incomeStatement.ts` | schema `componentTypes` | `ctx.db.query("componentTypes").collect()` | WIRED | Full table scan at line 533 |
| `aggregateWeek` | handler (purity) | No `ctx` param, synchronous | WIRED | `function aggregateWeek(` at line 116 (not async). All `ctx.db` calls are in handler (lines 500-574 only). Called synchronously at lines 591-606. |
| Test files | `api.reports.incomeStatement` | `import { api }` | WIRED | Tests call `t.query(api.reports.incomeStatement.getWeeklyIncomeStatement, ...)`. Generated API types include module at api.d.ts line 149, 306. |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| IS-01 | 32-02 | System computes weekly gross revenue aggregated per channel from `externalRevenue` + `consignmentSettlements` | SATISFIED | Revenue grouped by source in `aggregateWeek`, consignment handled separately. Both data sources queried with `by_period` index. |
| IS-02 | 32-02 | System computes revenue deductions (customer discounts, platform commissions, ad/promo burn, consignment rev share) per channel | SATISFIED | Internal discount = `totalAmount - (finalTotal - deliveryFee)`. Platform: commission/adBurn/promoBurn with `?? 0`. Consignment: revShareAmount. Net = gross - all deductions. |
| IS-03 | 32-01, 32-02 | System resolves full BOM COGS (production + packaging) via in-memory map preloading from `menuProductComponents` + `componentTypes` | SATISFIED | `buildProductCOGSMap` preloads into Map with O(1) lookup. Production vs packaging category split matches `calculateMenuProductCOGS`. Unit test confirms 19231+1700=20931. |
| IS-04 | 32-02 | System computes net revenue, total COGS, gross profit, and gross margin percentage | SATISFIED | `netRevenue = totalGross - totalDeductions`, `totalCogs = totalProductionCogs + totalPackagingCogs`, `grossProfit = netRevenue - totalCogs`, `grossMarginPercent = grossProfit/netRevenue*100 or null`. All in `aggregateWeek` lines 418-445. |
| IS-05 | 32-02 | System classifies every financial figure with confidence level (exact/calculated/inferred/missing) | SATISFIED | Channel revenue confidence via `getChannelRevenueConfidence()`. Product COGS confidence: calculated/missing. Channel confidence = lowest via `lowestConfidence()`. Integration test verifies missing confidence propagation. |
| IS-06 | 32-02 | System identifies data quality gaps inline (unmapped products, zero-cost components, missing channels) | SATISFIED | `GapAnalysis` interface with `unmappedProducts` (tracked during aggregation), `zeroCostComponents` (filtered from componentTypes), `missingChannels` (checked against known sources). Two integration tests verify gap analysis output. |
| IS-13 | 32-03 | Backend tests verify BOM COGS accuracy with known-value assertions | SATISFIED | `costCalculator.test.ts` test 1: exact values 19231/1700/20931. `incomeStatement.test.ts` "known BOM COGS accuracy" test: end-to-end verification. |
| IS-14 | 32-03 | Backend tests verify multi-channel revenue aggregation, discount correction, and edge cases | SATISFIED | 8 integration tests cover: empty week, unmapped COGS, BOM accuracy, zero margin, negative net, zero-cost gap, delta comparison, quantity scaling. |

No orphaned requirements. REQUIREMENTS.md maps IS-01 through IS-06, IS-13, IS-14 to Phase 32. All 8 are covered by plans 32-01, 32-02, 32-03 and satisfied in the codebase.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None | -- | -- | -- | No anti-patterns detected |

No TODOs, FIXMEs, placeholders, console.logs, empty implementations, or stub return values found in any modified file.

### Human Verification Required

### 1. Real Data Accuracy

**Test:** Call `getWeeklyIncomeStatement` with a weekStart that has actual production data in the dev environment. Compare returned values against manual calculation from the Convex dashboard.
**Expected:** Per-channel gross, deductions, COGS, and gross profit match manual spot-check within rounding tolerance.
**Why human:** Requires real seeded data and manual cross-reference against known business values. Automated tests use synthetic data only.

### 2. Edge Case: Large Dataset Performance

**Test:** Call the query for a week with many revenue records (50+ external revenue rows, 200+ revenue items). Observe response time.
**Expected:** Response within Convex query timeout (no 504). No excessive memory from full `menuProductComponents` + `componentTypes` table scans.
**Why human:** Performance characteristics depend on production data volume and cannot be verified with synthetic unit tests.

### Gaps Summary

No gaps found. All 5 success criteria truths are verified. All 8 requirements (IS-01 through IS-06, IS-13, IS-14) are satisfied. All artifacts exist, are substantive (no stubs), and are properly wired. Type-check passes, build passes, and all 18 tests pass (10 unit + 8 integration).

The implementation follows the planned architecture faithfully:
- Pure `aggregateWeek` function with all I/O in the handler (matches getLifetimeTotalsInternal pattern)
- BOM COGS resolution via in-memory maps with single-pass aggregation
- Null-safe optional field access with `?? 0` throughout
- Delivery fees correctly excluded from P&L
- Gross margin = null (not NaN) when net revenue = 0
- Previous week comparison with delta amounts and percentage points

---

_Verified: 2026-03-02T11:50:00Z_
_Verifier: Claude (gsd-verifier)_
