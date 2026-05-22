---
phase: 83-bigseller-pagelist-refresh
plan: 07
type: execute
wave: 4
depends_on: ["83-06-pagesize-bump", "83-03-token-auto-refresh"]
files_modified:
  - convex/integrations/bigseller/sync.ts
  - convex/integrations/bigseller/__tests__/sync.test.ts
  - docs/CHANGELOG.md
autonomous: true
requirements: []

must_haves:
  truths:
    - "Within a platform, after page 1 reveals totalPage, pages 2..N are fetched with Promise.all capped at concurrency 4, and results are processed in pageNo order (D-05 O2)"
    - "The two platforms (Shopee + TikTok) are fetched concurrently via Promise.all instead of the sequential for-loop (D-05 O1)"
    - "Concurrent processing does NOT double-count: each order is upserted/saved exactly once (per-externalTransactionId uniqueness preserved)"
    - "The cross-platform leak guard (sync.ts ~917-925, T-79-02) still throws on source mismatch under concurrency"
    - "A page-2 failure in parallel mode still surfaces in the error log; page-1 rejection still fails the sync"
    - "Token auto-refresh (83-03) still persists the freshest muctoken correctly under concurrency (latestRefreshedToken accumulation is concurrency-safe)"
  artifacts:
    - path: "convex/integrations/bigseller/sync.ts"
      provides: "parallel page fan-out (O2) + parallel platform fan-out (O1) with capped concurrency"
      contains: "Promise.all"
    - path: "convex/integrations/bigseller/__tests__/sync.test.ts"
      provides: "concurrency race tests (no double-count, page-2 failure surfaces, leak guard survives)"
      contains: "double-count|concurren"
  key_links:
    - from: "convex/integrations/bigseller/sync.ts"
      to: "Promise.all over platform branches"
      via: "O1 parallel platforms"
      pattern: "Promise.all"
---

<objective>
O1 + O2 — parallelize the BigSeller fetch (D-05, low-risk-first #4, paired in one PR per D-06 because both are concurrency work needing new race tests). This is the biggest win and biggest risk — done LAST.

- **O2 (parallel pages 2..N within a platform):** the `while (pageNo <= totalPage)` loop fetches pages serially. After page 1 reveals `totalPage`, fan out pages 2..totalPage with `Promise.all`, cap concurrency at 4, process results in `pageNo` order.
- **O1 (parallel platforms):** the `for (const [platform, shopIds] of platformShops)` loop runs Shopee then TikTok serially. Wrap each platform body in an async fn and `Promise.all` them. `priceOracle`, `mappingBySku`, `menuProductById` are built once before the loop and read-only — safe for concurrent use.

Per SPEC O1 race caveat: skip per-platform `updateSyncStage` writes that would race; only update overall status. The per-row cross-platform leak guard (T-79-02) and the per-`externalTransactionId` uniqueness in `saveRevenue`/`upsertOrders` keep concurrent writes correct (no double-count, no cross-platform leak).

Purpose: cut full-month sync from ~6-10 min toward ~1-2 min. Highest-risk optimization; ships with new race-condition tests.
Output: page fan-out + platform fan-out with a capped-concurrency helper, race tests, CHANGELOG.

**Sequencing (staffreview I1):** this plan refactors the token-capture block that 83-03 introduces (`latestRefreshedToken` / `authErrorObserved` / persist-once-at-end) into the new `fetchPage` flow and must make it concurrency-safe. It therefore `depends_on` 83-03 in addition to the 83-04→05→06 low-risk-first chain — 83-03 MUST land before this PR or the token-capture code it edits will not exist. If for any reason 83-03 has not landed in the executor's tree, STOP and surface the missing dependency rather than re-introducing the capture block here.
</objective>

<execution_context>
@D:/Claude/Product Manager/product_master/.claude/get-shit-done/workflows/execute-plan.md
@D:/Claude/Product Manager/product_master/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/83-bigseller-pagelist-refresh/83-CONTEXT.md
@.planning/phases/83-bigseller-pagelist-refresh/83-PATTERNS.md
@.planning/phases/83-bigseller-pagelist-refresh/83-02-sync-optimization-SPEC.md

<interfaces>
<!-- sync.ts:634-662 priceOracle / mappingBySku / menuProductById built ONCE, read-only — safe to share across concurrent platform branches. -->
<!-- sync.ts:667-673 platformShops Map<platform, shopIds[]> -->
<!-- sync.ts:676 `for (const [platform, shopIds] of platformShops)` — O1 target -->
<!-- sync.ts:690 `while (pageNo <= totalPage)` — O2 target. Page-1 specifics:
       - readiness-race retry (L766-784): page 1 only, sequential setTimeout retries — KEEP on page 1
       - page-1 fatal rejection (L789-809): updates sync 'failed' + error log, returns — KEEP
       - page>1 non-zero code: logs + pageNo++ continue (L810-811)
       - per-page body: normalize → upsertOrders → saveRevenue → link (getRevenueByIds, post-83-04) → item emit (shopee/tiktok) with leak guard -->
<!-- updateSyncStage 'storing' write at L832-839 races under O1 — skip per-platform, keep overall status (SPEC O1 caveat (a)). -->
<!-- 83-03 added `let latestRefreshedToken` / `let authErrorObserved` outer-scope accumulation + per-page header capture + persist-once-at-end. Under O1/O2 these are written from concurrent branches — see Task 2 concurrency note. -->
<!-- Concurrency analog: Promise.all over ctx.db.get in convex/orders/helpers/batchFetching.ts; no capped-concurrency helper exists — implement chunked Promise.all (slice into groups of 4). -->
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Extract per-page processing + parallelize pages 2..N (O2)</name>
  <read_first>
    - convex/integrations/bigseller/sync.ts (L676 platform loop; L682-823 page loop incl. readiness-race L766-784 + page-1-fatal L789-809; L825-925 per-page processing: normalize/upsert/saveRevenue/link/item-emit)
    - 83-02-sync-optimization-SPEC.md O2 (fan out pages 2..totalPage with Promise.all; order by pageNo; cap concurrency 4; mapOrderToStorage/mapOrderToRevenue are pure)
    - 83-PATTERNS.md O1/O2 section + Flag #4
  </read_first>
  <action>
Within a single platform branch, keep page 1 SEQUENTIAL (it carries the readiness-race retry L766-784 and the page-1-fatal handling L789-809, and it reveals `totalPage`). Only fan out pages 2..N.

1. Add a capped-concurrency helper near the top of the file (no existing helper — implement chunked Promise.all):
```typescript
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += limit) {
    const chunk = items.slice(i, i + limit);
    const settled = await Promise.all(chunk.map(fn));
    results.push(...settled);
  }
  return results;
}
```

2. Extract a `fetchPage(platform, endpoint, platformTemplate, shopIds, pageNo): Promise<{ rows: BigSellerOrderRow[]; refreshedToken: string; errorMsg?: string }>` that does ONE fetch: build body, fetch, capture the `muctoken` header (return it so the caller accumulates — do NOT write the outer `latestRefreshedToken` from inside concurrent calls), detect HTML/JSON auth error (return a sentinel so the caller aborts), parse, return rows. Keep the existing diagnostic logging.

3. Refactor the platform branch:
   - Fetch page 1 via the existing sequential path (readiness retry + page-1-fatal intact). Capture page 1's `totalPage` and `refreshedToken`.
   - If `totalPage > 1`, build `[2, 3, ..., totalPage]` and `mapWithConcurrency(pageNos, 4, (n) => fetchPage(..., n))`. Collect rows in `pageNo` order (the array preserves order; concat page-1 rows first).
   - If any fanned-out page returns an auth-error sentinel, set `authErrorObserved = true` (do NOT persist token) and surface in the error log; a non-auth page>1 error logs and contributes 0 rows (matches today's `pageNo++; continue`).
   - Accumulate `latestRefreshedToken` from the returned `refreshedToken`s in the SEQUENTIAL caller after the Promise.all resolves (post-resolution single-threaded — concurrency-safe).
   - Process all collected rows through the existing normalize → upsertOrders → saveRevenue → link (getRevenueByIds batch from 83-04) → item-emit-with-leak-guard pipeline. Keep the leak guard (L917-925) verbatim.

4. Drop the per-page `updateSyncStage('storing')` write inside the fan-out (it would race / fire N times); do ONE 'storing' stage update per platform before processing, or keep it at the page-1 point only.

Do NOT change `saveRevenue`/`upsertOrders` — they are keyed by `externalTransactionId` (unique per order) so re-processing the same row is idempotent and cannot double-count.
  </action>
  <verify>
    <automated>npm run test -- bigseller</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c 'mapWithConcurrency' convex/integrations/bigseller/sync.ts` returns >= 2 (definition + use)
    - `grep -c 'fetchPage' convex/integrations/bigseller/sync.ts` returns >= 2
    - `grep -c 'Cross-platform leak guard' convex/integrations/bigseller/sync.ts` returns 1 (guard preserved)
    - `npx convex codegen && npm run type-check` exits 0
    - `npm run test -- bigseller` exits 0
  </acceptance_criteria>
  <done>Pages 2..N fan out with concurrency cap 4, ordered by pageNo; page-1 readiness/fatal logic intact; token accumulated post-resolution; leak guard preserved; suite green.</done>
</task>

<task type="auto">
  <name>Task 2: Parallelize platforms (O1) with shared read-only lookups</name>
  <read_first>
    - convex/integrations/bigseller/sync.ts (L634-662 priceOracle/mappingBySku/menuProductById; L676 platform loop; the per-page pipeline from Task 1)
    - 83-02-sync-optimization-SPEC.md O1 (Promise.all platform branches; skip per-platform stage updates — caveat (a); leak guard per-row still correct)
    - 83-PATTERNS.md O1 ("priceOracle/mappingBySku/menuProductById built once before the loop, read-only → safe for concurrent use")
  </read_first>
  <action>
Wrap the per-platform body (the Task 1-refactored branch) in an async function `processPlatform(platform, shopIds): Promise<{ inserted: number; updated: number; revenue: number; itemsDeducted: number; itemsSkipped: number; skuCodes: string[]; platforms: string[]; refreshedToken: string; authError: boolean }>` and `Promise.all` over `platformShops`:
```typescript
    const platformResults = await Promise.all(
      [...platformShops].map(([platform, shopIds]) => processPlatform(platform, shopIds))
    );
```

Concurrency-correctness rules (SPEC O1):
- `priceOracle`, `mappingBySku`, `menuProductById` are built ONCE before the Promise.all and read ONLY inside `processPlatform` — safe.
- Each platform's `processPlatform` returns its own counts; AGGREGATE them after the Promise.all resolves (single-threaded) into `totalInserted`, `totalUpdated`, `totalRevenue`, `totalItemsDeducted`, `totalItemsSkipped`, `allSkuCodes`, `allPlatforms`, and pick the freshest `latestRefreshedToken` (`authErrorObserved = platformResults.some(r => r.authError)`). Do NOT mutate the shared outer counters from inside concurrent branches — return-and-aggregate.
- Per SPEC caveat (a): do NOT emit per-platform `updateSyncStage` writes that would race; keep only the overall status updates (fetching/storing/done) outside the Promise.all.
- The cross-platform leak guard inside each branch (T-79-02) stays — it is per-row and `processPlatform` stamps `source` from its own `platform`, so concurrency cannot leak.
- An auth error in EITHER platform sets `authErrorObserved` → 83-03's persist block is skipped.

Then the existing token persist-once block (83-03) and `updateSyncLog` completion run AFTER the Promise.all + aggregation, single-threaded.

If `processPlatform` for one platform hits a page-1 fatal rejection, it should record an error for that platform but NOT abort the other platform's already-resolved work — surface the per-platform error in the sync log (today a page-1 fatal returns early from the whole function; under O1, scope the failure to the platform and let the other platform's data still land, then mark the sync 'error' with the failing platform named).
  </action>
  <verify>
    <automated>npm run test -- bigseller</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c 'processPlatform' convex/integrations/bigseller/sync.ts` returns >= 2
    - `grep -c 'Promise.all' convex/integrations/bigseller/sync.ts` returns >= 2 (page fan-out + platform fan-out)
    - `grep -c 'authErrorObserved' convex/integrations/bigseller/sync.ts` returns >= 2 (set from aggregation + used in persist guard)
    - `npx convex codegen && npm run type-check` exits 0
    - `npm run test -- bigseller` exits 0
  </acceptance_criteria>
  <done>Both platforms run concurrently with shared read-only lookups; counts aggregated post-resolution; per-platform stage races removed; leak guard + token-persist guard intact; suite green.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Concurrency race tests; CHANGELOG; build</name>
  <read_first>
    - convex/integrations/bigseller/__tests__/sync.test.ts (extend; created in 83-03)
    - 83-02-sync-optimization-SPEC.md success criteria ("concurrent platform write doesn't double-count; page-2-failure in parallel mode still surfaces in error log")
    - 83-PATTERNS.md Flag #4 (race tests go in sync.test.ts)
  </read_first>
  <behavior>
    - concurrent platform processing upserts each order exactly once (no double-count)
    - a page-2 failure in parallel mode surfaces in the error log; page-1 fatal still marks the sync failed/error
    - the cross-platform leak guard throws when a revenue row's source != the order's platform
    - token auto-refresh still persists the freshest muctoken under concurrency
    - (staffreview R2) when ONE platform hits a page-1 fatal under O1, the sync reaches a defined terminal status ("error", with the failing platform named) while the OTHER platform's data still lands — this is a deliberate behavior change from today's all-or-nothing early-return, and must be asserted
  </behavior>
  <action>
Extend `convex/integrations/bigseller/__tests__/sync.test.ts` with `describe("BigSeller parallel fetch (O1/O2)")`:
- `it("does not double-count orders under concurrent platform processing")` — mock fetch so Shopee + TikTok each return a small page; after fetchOrders, assert `bigsellerOrders` / `externalRevenue` row counts equal the sum of unique orders (each `externalTransactionId` present exactly once).
- `it("surfaces a page-2 failure in parallel mode in the error log")` — mock page 1 ok + page 2 returning a non-zero code; assert the failure is logged (spy on `console.error`) and page-1 data still lands.
- `it("preserves the cross-platform leak guard under concurrency")` — force a revenue row whose `source` mismatches the order's platform; assert the guard throws (or that the item-emit path rejects it). Reuse/keep the existing leak-guard coverage.
- `it("still persists the freshest muctoken under concurrent platforms")` — both platforms return a fresher muctoken header; assert `platformCredentials.currentToken` is updated and `lastRefreshStatus === "auto-refreshed-from-response"` (regression guard for 83-03 under O1/O2).
- `it("honors the page concurrency cap of 4")` — if `mapWithConcurrency` is unit-testable in isolation, assert it never runs more than 4 fn calls in flight (track an in-flight counter); otherwise assert ordering of results by pageNo.
- (staffreview R2) `it("scopes a one-platform page-1 fatal to that platform under O1")` — mock Shopee page-1 fatal + TikTok success; assert (a) the sync terminal status is "error" with the failing platform identifiable in the sync log / error message, and (b) TikTok's orders still landed in `bigsellerOrders`. This locks the deliberate partial-success behavior change so a future refactor can't silently revert to all-or-nothing or, worse, drop the surviving platform's data.

Use real assertions. CHANGELOG entry: "Phase 83-07: BigSeller sync O1+O2 — parallel platform fetch (Shopee + TikTok concurrent) and parallel pages 2..N within a platform (Promise.all, concurrency cap 4, results ordered by pageNo). Per-platform stage races removed (overall status only). Per-externalTransactionId idempotency + the T-79-02 cross-platform leak guard keep concurrent writes correct (no double-count, no leak). New race-condition tests added. Cuts full-month sync from ~6-10 min toward ~1-2 min." Run the build gate.
  </action>
  <verify>
    <automated>npm run test -- bigseller &amp;&amp; npm run build</automated>
  </verify>
  <acceptance_criteria>
    - `grep -ci 'double-count\|concurren' convex/integrations/bigseller/__tests__/sync.test.ts` returns >= 1
    - `grep -c 'BigSeller parallel fetch' convex/integrations/bigseller/__tests__/sync.test.ts` returns 1 (the new describe block exists)
    - (staffreview R1 — absolute, not a baseline-delta) `grep -c "it(" convex/integrations/bigseller/__tests__/sync.test.ts` returns >= 9 (>= 5 from 83-03/04 + the 5 new O1/O2 cases incl. the partial-failure test)
    - `grep -ci 'page-1 fatal\|scopes a one-platform' convex/integrations/bigseller/__tests__/sync.test.ts` returns >= 1 (the R2 partial-failure test is present)
    - `grep -ci '83-07' docs/CHANGELOG.md` returns >= 1
    - `npm run test -- bigseller` exits 0
    - `npm run build` exits 0
  </acceptance_criteria>
  <done>Race tests cover no-double-count, page-2-failure surfacing, leak-guard survival, token-refresh-under-concurrency, and the concurrency cap; CHANGELOG records O1+O2; build green.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| concurrent action branches → shared writes | Two platform branches + N page fetches write to bigsellerOrders / externalRevenue / platformCredentials. |
| BigSeller API → action runtime | Vendor response per page/platform; auth errors must abort safely under concurrency. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-83-07-01 | Tampering / data integrity | upsertOrders + saveRevenue under concurrency | mitigate | Both are keyed by `externalTransactionId` (unique per order) — re-processing is idempotent, so concurrent platform/page writes cannot double-count. Counts are aggregated post-resolution (single-threaded), not mutated from concurrent branches. (Tasks 1-3) |
| T-83-07-02 | Tampering / cross-platform leak | item-emit leak guard (T-79-02) | mitigate | The per-row guard (`revDoc.source !== platform → throw`) is preserved verbatim inside each `processPlatform`; `source` is stamped from the branch's own `platform`, so concurrency cannot route items to the wrong platform. Covered by a race test. (Tasks 2-3) |
| T-83-07-03 | Tampering | credential persist under concurrency | mitigate | `latestRefreshedToken` / `authErrorObserved` are aggregated AFTER Promise.all resolves (not written from concurrent branches); persist runs once, single-threaded, with 83-03's empty/unchanged/auth-error guards. An auth error in either platform skips the persist. Covered by a race test. (Tasks 2-3) |
| T-83-07-04 | DoS / rate-limit | concurrent pageList calls | mitigate | Page concurrency capped at 4 via `mapWithConcurrency`; platform fan-out is 2 — bounded total in-flight requests. (Task 1) |
| T-83-07-05 | Repudiation / silent failure | page-2 failure in parallel mode | mitigate | A fanned-out page failure is logged and surfaced; page-1 fatal still marks the sync failed/error with the platform named — no silent 0-order completion. Covered by a race test. (Tasks 1-3) |
</threat_model>

<verification>
- `npx convex codegen && npm run type-check` — refactor compiles.
- `npm run test -- bigseller` — race tests + existing suite green (incl. 83-03/04/05/06 coverage).
- `npm run build` — passes.
</verification>

<success_criteria>
- Pages 2..N fan out (cap 4, ordered by pageNo); platforms run concurrently with shared read-only lookups.
- No double-count; cross-platform leak guard survives; token auto-refresh persists correctly under concurrency.
- Page-2 failure surfaces; page-1 fatal still fails the sync.
- Per-platform stage races removed; CHANGELOG records O1+O2; bigseller suite + build green.
</success_criteria>

<output>
After completion, create `.planning/phases/83-bigseller-pagelist-refresh/83-07-SUMMARY.md`
</output>
