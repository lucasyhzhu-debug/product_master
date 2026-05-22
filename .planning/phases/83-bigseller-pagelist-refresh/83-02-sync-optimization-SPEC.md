# Phase 83.02 — Sync Speed-Up (Follow-up)

> **Status:** Pending 83-01a merge. Not blocking — sync correctness is restored by 83-01a (and possibly 83-01b).
> **Expected payoff:** Manual full-month sync drops from ~6-10 min to ~1-2 min.
> **Risk profile:** Higher than 83-01 — touches concurrency, scheduler-chain, and
> N+1 queries. Should be done in its own PR with its own triple-review.
>
> **Post-staffreview revision (2026-05-19):** O5 (token auto-refresh from response
> headers) was promoted to **83-01b Wave 4** per staffreview I5 — it's a ~10 LOC
> change that eliminates 20-day token-decay toil. This plan now contains 5
> optimizations (was 6).

## Why split this out

83-01a is a 40-LOC additive schema fix that gets prod working today. Mixing
concurrency refactors into the same PR makes the fix slower to merge, riskier to
revert, and harder to triple-review. **Ship 83-01a first.** Open 83-02 as a
separate branch once the bleeding has stopped.

## Optimization opportunities (from staff-engineer review of `sync.ts`)

### O1. Parallelize platform fetch (biggest win, ~50% time)

**Current state:** `convex/integrations/bigseller/sync.ts:676` runs a sequential
`for (const [platform, shopIds] of platformShops)` loop. Each platform iteration
waits for its own paginated fetch + storage to complete before the next platform
starts.

**Cost:** Two platforms (Shopee + TikTok) means total runtime ≈ shopee_time + tiktok_time.
Currently observed: ~4-6 min per platform = 8-12 min total.

**Fix:** Wrap each platform iteration in a function and `Promise.all()` them.
Both write to different shops in `bigsellerOrders` so there's no contention.
`saveRevenue` is keyed by `externalTransactionId` (unique per platform) — no risk.

**Caveats:**
- `priceOracle` and `mappingBySku` are built once before the loop and shared
  read-only — safe for concurrent use
- `updateSyncStage` mutations from both branches will race. Need to either:
  (a) skip per-platform stage updates and only update overall status, or
  (b) use a small mutation that merges per-platform state into a `platformProgress`
  field. (a) is cheaper and probably sufficient.
- The cross-platform leak guard at sync.ts:917-925 still works — checks per-row.

### O2. Parallel pages 2..N within a platform (~75% time per platform)

**Current state:** `while (pageNo <= totalPage)` fetches pages 1, 2, 3... in series.
Page 1 reveals `totalPage`. With 198 orders / pageSize 50 = 4 pages, the loop
runs ~4 sequential HTTP round-trips per platform.

**Fix:** After page 1, if `totalPage > 1`, fan out pages 2..totalPage with
`Promise.all`. Order results by `pageNo`, then write all rows in one batch.

**Caveats:**
- `mapOrderToStorage` / `mapOrderToRevenue` are pure. Safe.
- Batching `upsertOrders` and `saveRevenue` may hit Convex mutation arg-size
  limits if `pageSize` × `totalPage` × rowSize is very large. For Frollie's volume
  (~200/month) this isn't an issue. Worth a guard for big retailers.
- BigSeller may rate-limit concurrent pageList calls. Cap concurrency at 4.

### O3. Adaptive polling (saves ~3-5 min per sync)

**Current state:** `pollSyncTask` polls every 60s for up to 8 attempts (480s ceiling).
BigSeller's `taskStatus` typically transitions to `complete` within 30-90s for
small windows. The 60s interval is way too long for short-window syncs.

**Fix:** Adaptive interval — start at 15s for the first 3 polls, 30s for next 2,
60s thereafter. Max poll count remains 8 so the worst-case bound stays at ~8min.

**Caveats:**
- Convex `ctx.scheduler.runAfter` is the only scheduling primitive. Change the
  `runAfter` delay between iterations rather than the outer `BIGSELLER_POLL_INTERVAL_MS`
  constant.
- Make sure tests in `cron.test.ts` that pin "60000 ms between polls" are updated.

### O4. N+1 query elimination in revenue linking (~200ms × N saved)

**Current state:** `sync.ts:875-889` loops over `revenueIds` and calls
`getRevenueById` once per id to look up `externalTransactionId`. Then
`sync.ts:917-925` loops again calling `getRevenueById` per row for the cross-platform
leak guard. For 200 rows this is 400 sequential single-doc lookups.

**Fix:** Add `getRevenueByIds(ids: Id[]): Map<id, doc>` to
`integrations/bigseller/queries.ts`. Pre-fetch the entire batch once after
`saveRevenue` returns. Both loops read from the in-memory map.

**Caveats:**
- Convex query arg size: 200 ids × 32 bytes = 6.4kB. Well within limits.
- The query is internal-only — no permission concerns.

### ~~O5. Token auto-refresh from response header~~

**MOVED to 83-01b Wave 4 per staffreview I5.** It's a small change with
disproportionately high operational payoff (kills the 20-day token-decay toil),
so it ships with the urgent fix bundle rather than waiting for optimization week.

### O6. Raise pageSize 50 → 100 (~50% page count)

**Current state:** `BIGSELLER_PAGE_SIZE = 50`. The HAR also uses 50, but that
matches BigSeller's default-UI page size — it's not necessarily a server-enforced
maximum.

**Fix:** Try `pageSize: 100`. If BigSeller rejects, raise back to 50 with a
comment pinning the empirical limit.

**Caveats:**
- Should test against prod first. Low risk — `code: -1` if rejected, no data loss.
- Won't help if BigSeller's response time is dominated by query planning rather
  than serialization. Worth measuring.

## Suggested execution order

1. **O4 (N+1 elimination)** — pure refactor, no concurrency, easiest to test.
2. **O3 (adaptive polling)** — single-file change, no new failure modes.
3. **O6 (pageSize 100)** — try it; revert if BigSeller rejects.
4. **O2 (parallel pages within platform)** — measurable win, contained risk.
5. **O1 (parallel platforms)** — biggest win, biggest risk. Do last.

(O5 was promoted to 83-01b Wave 4.)

## Git Workflow (for 83.02)

**Branch:** `feature/bigseller-sync-optimization-83-02` (off `main` after 83.01 merges)

**Don't bundle these into one PR.** Each optimization above is a separable PR:
- O1 + O2 in one PR (paired concurrency work)
- O3 alone
- O4 alone
- O6 alone (it's literally one number)

Each must pass `npm run build` and the existing `bigseller` test suite. O1/O2 should
add new race-condition tests. The nightly cron test (`cron.test.ts`) must keep
passing — its 60s assertion may need adjusting for O3.

## Success criteria (83.02 overall)

- [ ] Manual full-month sync runtime measured before + after each optimization
- [ ] All existing BigSeller tests pass
- [ ] New tests: concurrent platform write doesn't double-count; page-2-failure
      in parallel mode still surfaces in error log; adaptive polling honors
      max-attempts bound
- [ ] No new TypeScript errors
- [ ] Token TTL extends to ~20 days from the last successful sync (O5)
