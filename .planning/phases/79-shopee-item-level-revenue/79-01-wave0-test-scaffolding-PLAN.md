---
phase: 79
plan: 01
type: execute
wave: 0
depends_on: []
files_modified:
  - convex/integrations/bigseller/__tests__/priceOracle.test.ts
  - convex/integrations/bigseller/__tests__/prorateItems.test.ts
  - convex/integrations/bigseller/__tests__/dominantSku.test.ts
  - convex/integrations/bigseller/__tests__/cron.test.ts
  - convex/bigsellerOrders/__tests__/backfill.test.ts
  - convex/externalData/__tests__/revenue-invariants.test.ts
  - convex/externalData/__tests__/retroactive-mapping-shopee.test.ts
  - convex/externalData/__tests__/sell-through-shopee.test.ts
  - convex/reports/__tests__/incomeStatement-shopee.test.ts
autonomous: true
requirements: [DA-05, DA-06, DA-07, DA-09, DA-10, DA-12]
tags: [bigseller, shopee, tiktok, tdd, scaffolding]
must_haves:
  truths:
    - "Every Wave-1 task has a failing test in place BEFORE implementation begins"
    - "Tests reference helper signatures (buildPriceOracle, prorateItems, dominantSku, backfillBigsellerItems, nightlySync) that do not exist yet"
    - "Each test file compiles (imports resolve) even though helpers return undefined / throw NotImplemented"
  artifacts:
    - path: convex/integrations/bigseller/__tests__/priceOracle.test.ts
      provides: Property tests for buildPriceOracle (median over single-SKU orders)
    - path: convex/integrations/bigseller/__tests__/prorateItems.test.ts
      provides: Sum invariant tests — Σ items.totalPrice === orderAmount
    - path: convex/integrations/bigseller/__tests__/dominantSku.test.ts
      provides: Dominant SKU tie-breaker tests (max qty, then max price)
    - path: convex/integrations/bigseller/__tests__/cron.test.ts
      provides: Skip-if-not-idle cron tests
    - path: convex/bigsellerOrders/__tests__/backfill.test.ts
      provides: Backfill idempotency tests
    - path: convex/externalData/__tests__/revenue-invariants.test.ts
      provides: Parent/child sum equality test (D-04)
    - path: convex/externalData/__tests__/retroactive-mapping-shopee.test.ts
      provides: Cascade updates items + dominant-SKU parent (D-08, D-09)
    - path: convex/externalData/__tests__/sell-through-shopee.test.ts
      provides: Shopee/TikTok branch returns real per-product volume
    - path: convex/reports/__tests__/incomeStatement-shopee.test.ts
      provides: Shopee per-product COGS uses BOM × quantity
  key_links:
    - from: Wave 0 test files
      to: Wave 1 plan tasks (02..06)
      via: "<automated> pointers in each task"
      pattern: "npm run test -- <pattern>"
---

<objective>
Create 9 failing test files (Wave 0 of Nyquist validation strategy) that pin down expected behavior for every pure helper, mutation, and query branch introduced in Wave 1. Every Wave-1 task has an <automated> pointer into these files; they MUST exist and fail red before Wave 1 begins.

Purpose: TDD guard rails. Prevent silent scope drift, enforce residual-rounding invariant (D-01), revenue-conservation invariant (D-04), and dominant-SKU rule (D-09) as non-negotiable acceptance criteria.

Output: 9 .test.ts files, all committed, all failing (import errors or NotImplementedError). Wave 1 flips them green.
</objective>

<execution_context>
@D:/Claude/Product Manager/product_master/.claude/get-shit-done/workflows/execute-plan.md
@D:/Claude/Product Manager/product_master/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/79-shopee-item-level-revenue/79-CONTEXT.md
@.planning/phases/79-shopee-item-level-revenue/79-RESEARCH.md
@.planning/phases/79-shopee-item-level-revenue/79-VALIDATION.md
@convex/integrations/bigseller/helpers.ts
@convex/integrations/bigseller/sync.ts
@convex/integrations/gobiz/adapter.ts
@convex/externalData/mutations.ts
@convex/externalData/queries.ts
@convex/bigsellerOrders/mutations.ts
@convex/schema.ts

<interfaces>
<!-- Helper signatures defined in RESEARCH.md §Code Examples. Tests must import these; Wave 1 implements them. -->

From convex/integrations/bigseller/helpers.ts (NEW exports Wave 1 will add):
```typescript
export function buildPriceOracle(
  orders: ReadonlyArray<{ orderAmount?: number; saleAmount: number; skuVoList: ReadonlyArray<{ sku: string; skuNum: number }> }>
): Map<string, number>;

export function prorateItems(
  order: { orderAmount?: number; saleAmount: number; skuVoList: Array<{ sku: string; skuNum: number }> },
  oracle: Map<string, number>,
  mappingBySku: Map<string, { menuProductId?: string; menuProductPrice?: number }>
): Array<{ sku: string; skuNum: number; unitPrice: number; totalPrice: number }>;

export function dominantSku(
  skuVoList: ReadonlyArray<{ sku: string; skuNum: number }>,
  mappingBySku: Map<string, { menuProductId?: string; menuProductPrice?: number }>
): { sku: string | null; menuProductId: string | null };
```

From convex/bigsellerOrders/mutations.ts (NEW export Wave 1 will add):
```typescript
export const backfillBigsellerItems: Mutation<{ token: string; limit?: number }>;
export const rescanEmptyRows: Action<{ token: string }>;
```

From convex/integrations/bigseller/cron.ts (NEW file Wave 1 will add):
```typescript
export const nightlySync: InternalAction<{}>;
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create 3 pure-helper test files (priceOracle, prorateItems, dominantSku)</name>
  <read_first>
    - convex/integrations/bigseller/helpers.ts (current file; NEW helpers will be added in Wave 1)
    - convex/integrations/bigseller/__tests__/helpers.test.ts (existing test file — match its vitest import style)
    - .planning/phases/79-shopee-item-level-revenue/79-RESEARCH.md §Code Examples + §Golden-Sample Invariant Tests
  </read_first>
  <action>
Create three new test files under `convex/integrations/bigseller/__tests__/`:

**File 1: `priceOracle.test.ts`** — Imports `buildPriceOracle` from `../helpers`. Test cases:
1. Empty orders → returns empty Map.
2. Single order `{orderAmount: 100000, skuVoList: [{sku:"A", skuNum:2}]}` → `oracle.get("A") === 50000`.
3. Three single-SKU orders for same SKU with per-unit prices [40000, 50000, 60000] → median 50000.
4. Four samples [40000, 50000, 60000, 70000] → even-length median = (50000+60000)/2 = 55000.
5. Multi-SKU orders are IGNORED (skuVoList.length !== 1).
6. Orders with skuNum <= 0 or baseAmount <= 0 are IGNORED.
7. Uses `orderAmount` when present, falls back to `saleAmount` when `orderAmount` is undefined.

**File 2: `prorateItems.test.ts`** — Imports `prorateItems` from `../helpers`. Test cases (D-01 sum invariant is the anchor):
1. Single-SKU order `{orderAmount: 100001, skuVoList:[{sku:"A", skuNum:3}]}` with empty oracle + empty mapping → `items[0].totalPrice === 100001` exactly, `unitPrice === 33334` (rounded).
2. Two-SKU order `{orderAmount: 100001, skuVoList:[{sku:"A", skuNum:2}, {sku:"B", skuNum:3}]}` — residual (1 IDR) goes to **largest-qty item (B, qty=3)**. Assert `items[0].totalPrice + items[1].totalPrice === 100001` exactly.
3. Oracle-primary: oracle has `A=50000`, order `{orderAmount: 100000, skuVoList:[{sku:"A", skuNum:2}]}` → 100% attributed to A. `items[0].totalPrice === 100000`.
4. Mapping-secondary: oracle empty, mapping has `A={menuProductPrice: 50000}`, order same shape → same result.
5. Flat-share fallback: both oracle and mapping empty → equal-weighted pro-rata across all qty.
6. Property test (10 random orders): for every order, `Σ items.totalPrice === orderAmount` (integer equality).
7. Empty skuVoList → returns `[]`.

**File 3: `dominantSku.test.ts`** — Imports `dominantSku` from `../helpers`. Test cases (D-09):
1. Empty skuVoList → `{sku: null, menuProductId: null}`.
2. Single-SKU `[{sku:"A", skuNum:5}]` → sku="A", menuProductId from mapping.
3. Multi-SKU `[{sku:"A", skuNum:5}, {sku:"B", skuNum:3}]` → "A" (max qty).
4. Tie-break by price: `[{sku:"A", skuNum:3}, {sku:"B", skuNum:3}]` with mapping prices A=40000, B=60000 → "B" (max price).
5. Tie with equal prices: either A or B (document: first-listed wins — this is assumption A5 in RESEARCH.md).
6. Unmapped SKU: sku has no entry in mapping → menuProductId is null but sku still reported.

All three files MUST fail with import errors until Wave 1 adds the exports.
  </action>
  <verify>
    <automated>npm run test -- --run convex/integrations/bigseller/__tests__/priceOracle.test.ts convex/integrations/bigseller/__tests__/prorateItems.test.ts convex/integrations/bigseller/__tests__/dominantSku.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - File exists: convex/integrations/bigseller/__tests__/priceOracle.test.ts (grep exports `import { buildPriceOracle }`)
    - File exists: convex/integrations/bigseller/__tests__/prorateItems.test.ts (grep contains `Σ items.totalPrice` or equivalent sum-invariant assertion)
    - File exists: convex/integrations/bigseller/__tests__/dominantSku.test.ts (grep contains `max qty` and `tie-break`)
    - vitest reports all 3 files RED (import error: `buildPriceOracle is not exported from ../helpers`)
    - No file uses `expect(true).toBe(true)` placeholder
  </acceptance_criteria>
  <done>3 test files committed, vitest output shows 3 red files with import errors.</done>
</task>

<task type="auto">
  <name>Task 2: Create 6 convex-test integration test files</name>
  <read_first>
    - convex/integrations/bigseller/__tests__/ (existing test file structure)
    - convex/externalData/mutations.ts (saveRevenueItems line 587, applyRetroactiveProductMapping line 446)
    - convex/externalData/queries.ts (sell-through branches line 1020-1200)
    - convex/reports/incomeStatement.ts (resolveItemsCOGS line 133-184)
    - convex/schema.ts (externalRevenueItems line 1140, bigsellerOrders line 1556)
    - .planning/phases/79-shopee-item-level-revenue/79-RESEARCH.md §Golden-Sample Invariant Tests
  </read_first>
  <action>
Create six convex-test integration test files using the `convexTest` harness (pattern: match existing `convex/externalData/__tests__/*.test.ts` files if present, else follow `convex-test` README).

**File 4: `convex/integrations/bigseller/__tests__/cron.test.ts`** — Imports `internal.integrations.bigseller.cron.nightlySync`. Test cases:
1. `bigsellerSyncState.stage = "idle"` → cron calls runBigsellerSync with last-7-days window. Assert exactly 1 externalSyncLogs row, status NOT error.
2. `bigsellerSyncState.stage = "fetching"` → cron skips. Assert exactly 1 new externalSyncLogs row with status=`"error"`, errorMessage contains `"skipped: manual sync in progress"`. Assert ZERO new externalRevenue / externalRevenueItems / bigsellerOrders rows.
3. Cron fires but runBigsellerSync throws → logged as error row with full message.

**File 5: `convex/bigsellerOrders/__tests__/backfill.test.ts`** — Imports `api.bigsellerOrders.mutations.backfillBigsellerItems`. Test cases:
1. Seed 3 `bigsellerOrders` each with `skuVoList.length > 0` and matching `externalRevenue` rows. Call backfill. Assert N items created (sum of skuVoList lengths).
2. Call backfill AGAIN — assert `{ created: 0, skipped: N }` (idempotency via `(revenueId, externalItemId=sku)` dedup).
3. Seed 1 `bigsellerOrder` with empty skuVoList. Assert it is SKIPPED, no placeholder items created (D-18).
4. Auth: call without admin token → throws. Call with manager token → throws (admin-only per V4 access control in RESEARCH §Security).

**File 6: `convex/externalData/__tests__/revenue-invariants.test.ts`** — Test cases (D-04):
1. Seed 1 Shopee `externalRevenue` with `revenueGross = 100001` and 2 items. Property: `Σ items.totalPrice === parent.revenueGross` (integer equality).
2. After retroactive mapping cascade, invariant still holds.
3. Query `sellThrough` for channel=shopee — does NOT sum both parent.revenueGross AND items.totalPrice (would double-count).

**File 7: `convex/externalData/__tests__/retroactive-mapping-shopee.test.ts`** — Test cases (D-08, D-09):
1. Seed Shopee order with mixed SKUs `[{sku:"A", skuNum:5}, {sku:"B", skuNum:3}]`, items initially unmapped. Call `applyRetroactiveProductMapping(sku="A", menuProductId="mp-A")`. Assert:
   - All items with externalItemId="A" have linkedMenuProductId="mp-A", isAutoMatched=true
   - Items with externalItemId="B" are unchanged
   - Parent externalRevenue.linkedMenuProductId === "mp-A" (A is dominant, qty 5 > 3)
2. Same seed. Call mapping for "B" first, then "A". Assert parent ends with "mp-A" (last mapping wins ONLY if it becomes dominant).
3. Mapping for minor SKU (B, qty=3 in order where A has qty=5) → items patched, parent NOT updated (A still dominant).
4. Run same mapping mutation twice → identical DB state (idempotency).

**File 8: `convex/externalData/__tests__/sell-through-shopee.test.ts`** — Test cases (DA-07):
1. Seed Shopee revenue + 2 items for menuProduct "mp-Jumbo" with quantities [2, 3]. Call `sellThroughQuery(channel="shopee")`. Assert result contains entry with `menuProductId="mp-Jumbo"`, `quantity=5` (SUM of item.quantity, not revenue / avgPrice).
2. Same test for `channel="tiktok"`.
3. Unmapped items (linkedMenuProductId=null) still counted by productName/sku.
4. Weekday vs weekend split correct based on transactionDate.

**File 9: `convex/reports/__tests__/incomeStatement-shopee.test.ts`** — Test cases (DA-09):
1. Seed Shopee revenue with items linked to menuProduct that has BOM cost = 10000 IDR/unit. Item quantity = 5. Call income statement. Assert COGS line shows 50000 IDR for Shopee channel.
2. COGS override on menuProduct (Phase 70 feature) used when present.
3. Unmapped items contribute to `unmappedProductsMap` with zero COGS, not counted as mapped product.

All 6 files MUST fail red until Wave 1 lands the implementations.
  </action>
  <verify>
    <automated>npm run test -- --run convex/integrations/bigseller/__tests__/cron.test.ts convex/bigsellerOrders/__tests__/backfill.test.ts convex/externalData/__tests__/revenue-invariants.test.ts convex/externalData/__tests__/retroactive-mapping-shopee.test.ts convex/externalData/__tests__/sell-through-shopee.test.ts convex/reports/__tests__/incomeStatement-shopee.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - 6 new test files exist under convex/*/__tests__/
    - Each file uses convexTest harness with schema + modules import
    - vitest reports all 6 RED (missing exports / NotImplementedError / wrong behavior)
    - No `expect(true).toBe(true)` placeholders
    - Each file has at least 2 distinct test cases
    - Revenue invariant test asserts integer equality (not approximate)
  </acceptance_criteria>
  <done>6 integration test files committed, all failing red, ready for Wave 1 to turn green.</done>
</task>

<task type="auto">
  <name>Task 3: Populate VALIDATION.md per-task map + mark wave_0_complete</name>
  <read_first>
    - .planning/phases/79-shopee-item-level-revenue/79-VALIDATION.md
    - All 9 new test files created in tasks 1-2
  </read_first>
  <action>
Edit `.planning/phases/79-shopee-item-level-revenue/79-VALIDATION.md`:

1. Replace the "TBD" row in §Per-Task Verification Map with one row per Wave-1 task (9 tasks across plans 02..06). Columns: Task ID (e.g., `79-02-T1`), Plan, Wave, Requirement (DA-XX), Threat Ref, Secure Behavior, Test Type, Automated Command (`npm run test -- --run <file>`), File Exists (✅ after Wave 0), Status (⬜ pending).

2. In §Wave 0 Requirements, check off all 8 bullet checkboxes since files are now created.

3. Update frontmatter: `wave_0_complete: true`, `nyquist_compliant: true`.

4. Under §Validation Sign-Off, check the 5 boxes (all tasks have automated verify, sampling continuity intact, Wave 0 covers MISSING refs, no watch-mode flags, latency < 90s).

5. Change Approval line to: `Approval: self-signed 2026-04-14 by planner`.
  </action>
  <verify>
    <automated>grep -q "wave_0_complete: true" .planning/phases/79-shopee-item-level-revenue/79-VALIDATION.md && grep -q "nyquist_compliant: true" .planning/phases/79-shopee-item-level-revenue/79-VALIDATION.md</automated>
  </verify>
  <acceptance_criteria>
    - `grep "wave_0_complete: true" 79-VALIDATION.md` returns match
    - `grep "nyquist_compliant: true" 79-VALIDATION.md` returns match
    - Per-Task Verification Map has at least 9 non-TBD rows
    - All 8 Wave 0 Requirements checkboxes show `[x]`
  </acceptance_criteria>
  <done>VALIDATION.md fully populated; planner-signed.</done>
</task>

</tasks>

<verification>
All 9 test files compile but run red. Helper and mutation signatures referenced are the EXACT names Wave 1 will implement. VALIDATION.md updated.
</verification>

<success_criteria>
- [ ] 9 .test.ts files created and committed
- [ ] All 9 fail red (`npm run test -- --run <each>` returns non-zero exit)
- [ ] 79-VALIDATION.md frontmatter: `wave_0_complete: true`, `nyquist_compliant: true`
- [ ] Per-task verification map has ≥9 rows
- [ ] No `expect(true).toBe(true)` anti-pattern
- [ ] `npm run type-check` still passes (test files may reference missing exports via `@ts-expect-error` or rely on vitest runtime)
</success_criteria>

## Git Workflow
**Branch:** `feature/79-shopee-item-level-revenue`
**Checkpoints:** None — all autonomous.

## Implementation Waves
### Wave 0: TDD Scaffolding [PARALLEL]
| Agent | Task | Files |
|-------|------|-------|
| convex-backend | Pure helper tests (priceOracle/prorate/dominantSku) | 3 files |
| convex-backend | Integration tests (cron/backfill/invariants/retro/sellThrough/incomeStatement) | 6 files |
| Planner | VALIDATION.md population | 1 file |

## Documentation Updates
- [ ] VALIDATION.md (required — this plan fills it)
- [ ] No other doc changes until Wave 1+

## Success Criteria (this plan)
- [ ] `npm run test -- --run` produces EXACTLY 9 red files (no green from these new files)
- [ ] `npm run type-check` passes
- [ ] All test files committed in a single TDD-scaffolding commit

<output>
After completion, create `.planning/phases/79-shopee-item-level-revenue/79-01-SUMMARY.md`
</output>
