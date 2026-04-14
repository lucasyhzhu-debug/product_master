---
phase: 79
plan: 06
type: execute
wave: 2
depends_on: [79-01]
files_modified:
  - convex/externalData/queries.ts
autonomous: true
requirements: [DA-07, DA-08, DA-09]
tags: [shopee, tiktok, reports, sell-through, lifetime, cogs]
must_haves:
  truths:
    - "sellThrough query has explicit shopee + tiktok branches (in addition to gobiz/k3mart/internal)"
    - "Shopee/TikTok per-product volume = Σ item.quantity (not revenue / avgPrice)"
    - "Lifetime ball counts for Shopee/TikTok flow through existing source-agnostic lifetimeHelpers once items exist (NO code changes to lifetimeHelpers.ts — verified by test)"
    - "Income statement per-product COGS for Shopee/TikTok flows through existing source-agnostic resolveItemsCOGS (NO code changes to incomeStatement.ts — verified by test)"
    - "Weekday/weekend split + last7d/prev7d windows correctly applied using transactionDate (or periodStart fallback)"
  artifacts:
    - path: convex/externalData/queries.ts
      provides: shopee + tiktok branches in sellThrough product-level query
      contains: 'args.channel === "shopee" || args.channel === "tiktok"'
  key_links:
    - from: convex/externalData/queries.ts (sellThrough)
      to: externalRevenueItems (via by_revenue index)
      via: "ctx.db.query('externalRevenueItems').withIndex('by_revenue', ...)"
      pattern: "by_revenue"
---

<objective>
Add a `shopee` / `tiktok` branch to the sell-through product-level query in `convex/externalData/queries.ts`, mirroring the existing `gobiz` branch structure. Verify (via tests from Plan 01) that lifetime helpers and income statement COGS calculation pick up Shopee/TikTok items AUTOMATICALLY with no code changes (they are source-agnostic per RESEARCH.md findings).

Purpose: DA-07 + DA-08 + DA-09. Three success criteria satisfied by one code change + two validation tests.

Output: sell-through shopee/tiktok branches live; 3 tests green (sell-through-shopee, lifetime auto-pickup, incomeStatement-shopee).
</objective>

<execution_context>
@D:/Claude/Product Manager/product_master/.claude/get-shit-done/workflows/execute-plan.md
@D:/Claude/Product Manager/product_master/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/79-shopee-item-level-revenue/79-CONTEXT.md
@.planning/phases/79-shopee-item-level-revenue/79-RESEARCH.md §Code Examples (sell-through branch)
@convex/externalData/queries.ts (lines 1020-1200 — existing gobiz/k3mart/internal branches)
@convex/externalData/helpers/lifetimeHelpers.ts (VERIFY — no changes expected)
@convex/reports/incomeStatement.ts (VERIFY — no changes expected)
@convex/externalData/__tests__/sell-through-shopee.test.ts
@convex/reports/__tests__/incomeStatement-shopee.test.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add shopee + tiktok branches to sellThrough query</name>
  <read_first>
    - convex/externalData/queries.ts lines 1020-1200 (existing channel branches — mirror gobiz exactly)
    - convex/externalData/queries.ts (find the sellThrough query's outer switch/if-else structure; typically checks args.channel)
    - convex/externalData/__tests__/sell-through-shopee.test.ts (target behavior spec)
    - RESEARCH.md §Code Examples §"Sell-through Shopee/TikTok branch"
  </read_first>
  <action>
Locate the existing sell-through product-level query in `convex/externalData/queries.ts` (~line 1031-1130). It currently has branches for `gobiz`, `k3mart`, `internal`. Add a parallel branch for `shopee` / `tiktok`:

```typescript
} else if (args.channel === "shopee" || args.channel === "tiktok") {
  const revenue = await ctx.db
    .query("externalRevenue")
    .withIndex("by_source_period", (q) =>
      q.eq("source", args.channel).gte("periodStart", thirtyDaysAgo)
    )
    .collect();

  for (const r of revenue) {
    const items = await ctx.db
      .query("externalRevenueItems")
      .withIndex("by_revenue", (q) => q.eq("revenueId", r._id))
      .collect();

    const txnDate = r.transactionDate ?? r.periodStart;
    for (const item of items) {
      const entry = getOrCreate(
        item.productName,
        item.productName,
        item.linkedMenuProductId as string | undefined
      );
      // D-04: use item.quantity for per-product volume; DO NOT add r.revenueGross to qty counters
      if (isWeekend(txnDate)) entry.weekendSalesTotal += item.quantity;
      else entry.weekdaySalesTotal += item.quantity;
      if (txnDate >= sevenDaysAgo) entry.last7dSales += item.quantity;
      else if (txnDate >= fourteenDaysAgo) entry.prev7dSales += item.quantity;
      entry.transactionCount += 1;
    }
  }
}
```

**Important:**
- Place the new branch BEFORE the final `else` / default (or after gobiz branch — exact position preserves existing priority).
- DO NOT sum both `r.revenueGross` AND `item.totalPrice` anywhere — would double-count revenue (D-04 Pitfall 3).
- Reuse existing `getOrCreate`, `isWeekend`, `thirtyDaysAgo`, `sevenDaysAgo`, `fourteenDaysAgo` helpers already defined in scope.
- Adapt field names (`productName`, `transactionDate`, `periodStart`) to match schema; cross-check against `convex/schema.ts §externalRevenue` + `§externalRevenueItems`.
  </action>
  <verify>
    <automated>npm run test -- --run convex/externalData/__tests__/sell-through-shopee.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n 'args.channel === "shopee"\|channel === "tiktok"' convex/externalData/queries.ts` returns match in the sellThrough query
    - sell-through-shopee.test.ts all cases green
    - Diff shows ONLY additive change in queries.ts — no modification to existing gobiz/k3mart/internal branches
    - No reference to `r.revenueGross` inside the new branch's qty-accumulator loop (`grep -n "revenueGross" queries.ts` — new usage should be absent in the shopee/tiktok branch; RESEARCH confirms D-04)
    - `npm run type-check` + `npm run build` pass
  </acceptance_criteria>
  <done>Sell-through branch live; test green.</done>
</task>

<task type="auto">
  <name>Task 2: Verify lifetime + COGS auto-pickup (no code changes, validation only)</name>
  <read_first>
    - convex/externalData/helpers/lifetimeHelpers.ts §computeLifetimeTotals, §computeAvgRevenuePerBall
    - convex/reports/incomeStatement.ts §resolveItemsCOGS lines 133-184
    - convex/reports/__tests__/incomeStatement-shopee.test.ts (already seeded with Shopee items + BOM)
  </read_first>
  <action>
Run the two tests that prove lifetime helpers and income statement COGS pick up Shopee items without any code changes:

1. `npm run test -- --run convex/reports/__tests__/incomeStatement-shopee.test.ts`
2. `npm run test -- --run convex/externalData/helpers/__tests__/lifetimeHelpers.test.ts` (if it exists; if not, create a minimal lifetime test that:
   - Seeds Shopee revenue with 2 items linked to menuProducts with BOM ballsPerProduct=1 each
   - Calls computeLifetimeTotals for source="shopee"
   - Asserts totalBalls = Σ item.quantity × ballsPerProduct (NOT revenue/avgPrice)
   - Asserts items are NOT counted via the avgRevenuePerBall fallback path)

If either test fails, the assumption that these queries are "source-agnostic" was wrong — STOP and file a new task. If they pass, document the verification in `79-06-SUMMARY.md`:

> DA-08 (lifetime) and DA-09 (COGS) require ZERO code changes in Phase 79. Shopee items flow through existing source-agnostic queries automatically once Plan 03 wires item emission. Verification: [2 test results].

**Do NOT** modify lifetimeHelpers.ts or incomeStatement.ts in this phase. If they need changes to pass, the assumption was wrong — escalate.
  </action>
  <verify>
    <automated>npm run test -- --run convex/reports/__tests__/incomeStatement-shopee.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - incomeStatement-shopee.test.ts GREEN without touching incomeStatement.ts (diff shows zero lines changed in that file)
    - lifetimeHelpers test (existing or newly created) GREEN without touching lifetimeHelpers.ts
    - SUMMARY.md notes "DA-08, DA-09: verified source-agnostic pickup via tests only"
  </acceptance_criteria>
  <done>Two "zero-code-change" success criteria verified via tests.</done>
</task>

</tasks>

<verification>
3 tests from Plan 01 Task 2 turn green. Two of them (lifetime, COGS) green WITHOUT any production code changes to lifetimeHelpers.ts / incomeStatement.ts — this is the verification of RESEARCH.md's "source-agnostic" claim.
</verification>

<success_criteria>
- [ ] sell-through-shopee.test.ts green
- [ ] incomeStatement-shopee.test.ts green
- [ ] lifetimeHelpers test green (existing or new)
- [ ] Zero code changes outside queries.ts in this plan
- [ ] `npm run build` passes
</success_criteria>

## Git Workflow
**Branch:** `feature/79-shopee-item-level-revenue`

## Implementation Waves
### Wave 2: Reports branches [PARALLEL with plans 03, 04, 05 — different files]
| Agent | Task | Files |
|-------|------|-------|
| convex-backend | Add shopee/tiktok branch to sellThrough | convex/externalData/queries.ts |
| convex-backend | Verify lifetime + COGS auto-pickup | tests only — no prod code changes |

## Documentation Updates
- [ ] Code comment in queries.ts citing Phase 79 DA-07 + D-04 invariant
- [ ] SUMMARY.md documents "zero code change" verification for DA-08 + DA-09

## Success Criteria (this plan)
- [ ] 3 tests green
- [ ] Zero code changes in lifetimeHelpers.ts + incomeStatement.ts
- [ ] Build + type-check pass

<output>
Create `.planning/phases/79-shopee-item-level-revenue/79-06-SUMMARY.md`
</output>
