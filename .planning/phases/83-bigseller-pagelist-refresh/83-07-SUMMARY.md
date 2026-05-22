---
phase: 83-bigseller-pagelist-refresh
plan: 07
subsystem: bigseller-integration
tags: [sync-performance, concurrency, parallel-fetch, race-tests, o1, o2]
requires:
  - "83-03 token capture block (latestRefreshedToken / authErrorObserved / persist-once) — refactored into fetchPage return + post-resolution aggregation"
  - "83-04 getRevenueByIds batch (existing) — reused inside processPlatform"
  - "83-06 BIGSELLER_PAGE_SIZE=100 (existing) — fewer pages per platform feeds the fan-out"
  - "priceOracle / mappingBySku / menuProductById built ONCE before the fan-out (existing, sync.ts) — read-only, concurrency-safe"
provides:
  - "mapWithConcurrency<T,R>(items, limit, fn) chunked-Promise.all helper (cap 4, order-preserving)"
  - "fetchPage(...) single-page fetch+parse returning rows/totalPage/refreshedToken/authError/errorCode"
  - "processPlatform closure: page 1 sequential, pages 2..N parallel; counts/token/auth RETURNED for post-resolution aggregation"
  - "Promise.all over platformShops (O1) — Shopee + TikTok concurrent"
  - "per-platform-scoped page-1 fatal (R2): sibling data lands, sync marked error naming the failing platform"
affects:
  - "convex/integrations/bigseller/sync.ts (platform for-loop replaced by Promise.all + processPlatform; per-page 'storing' write → once per platform)"
  - "convex/integrations/bigseller/__tests__/sync.test.ts (+7 tests: 2 mapWithConcurrency + 5 parallel-fetch)"
  - "docs/CHANGELOG.md (O1+O2 entry)"
tech-stack:
  added: []
  patterns:
    - "Chunked Promise.all (slice into groups of N) for capped concurrency — no external dep; order-preserving result array doubles as the pageNo-ordered collector (O2)."
    - "Return-and-aggregate over concurrent branches: per-platform counts/token/auth flag are RETURNED from processPlatform and merged AFTER Promise.all resolves (single-threaded) — never mutate shared outer counters from inside concurrent async fns (T-83-07-01/03)."
    - "Idempotent-key concurrency: upserts keyed by externalTransactionId make concurrent platform/page writes safe without locks (no double-count)."
key-files:
  created: []
  modified:
    - "convex/integrations/bigseller/sync.ts"
    - "convex/integrations/bigseller/__tests__/sync.test.ts"
    - "docs/CHANGELOG.md"
decisions:
  - "Tasks 1 (O2) and 2 (O1) shipped as ONE feat commit. The page-1 sequential extraction and the processPlatform wrapper are interdependent halves of a single concurrency rewrite (D-06 'paired in one PR'); splitting them would create churn with no atomic-revert benefit. Task 3 (tests+CHANGELOG) is its own commit."
  - "fetchPage does NOT perform the page-1 readiness-race retry or the page-1 fatal status write — those stay in the sequential page-1 path inside processPlatform. fetchPage returns errorCode/msg so the caller decides readiness-retry vs fatal."
  - "Token capture moved from a shared-outer-scope write inside the fetch loop to a RETURNED value from fetchPage; latestRefreshedToken is assigned only after Promise.all resolves (concurrency-safe per T-83-07-03)."
  - "Page-1 fatal is now per-platform-scoped (staffreview R2): the sibling platform's resolved data still lands and the sync is marked 'error' naming the failing platform — a deliberate behavior change from the old all-or-nothing early-return, locked by a race test."
  - "Leak-guard race test asserts every externalRevenue.source matches the platform encoded in its externalTransactionId (SH-*→shopee, TT-*→tiktok) rather than forcing a synthetic mismatch — under the idempotent (source, txnId) dedup key a real cross-platform mismatch cannot be manufactured, so the test locks the no-leak INVARIANT under concurrency, which is the meaningful property."
metrics:
  duration_min: 18
  completed: 2026-05-22
  tasks: 3
  files: 3
  commits: 2
---

# Phase 83 Plan 07: Parallel Fetch (O1+O2) Summary

Parallelized the BigSeller order fetch — the largest and highest-risk sync optimization (D-05 low-risk-first #5, done last). Two platforms (Shopee + TikTok) now run concurrently via `Promise.all` over a new `processPlatform` closure (O1), and within each platform pages 2..N fan out via a new `mapWithConcurrency` chunked-`Promise.all` helper capped at 4 and ordered by `pageNo` (O2). Page 1 stays sequential — it carries the readiness-race retry and the page-1-fatal handling and reveals `totalPage`. Per-platform counts, the freshest `muctoken`, and the auth-error flag are RETURNED from `processPlatform` and aggregated AFTER `Promise.all` resolves (single-threaded), so no shared mutable state is touched from concurrent branches. Combined with O3/O4/O6, this cuts a full-month sync from ~6-10 min toward ~1-2 min.

## What Was Built

1. **`mapWithConcurrency<T,R>(items, limit, fn)` + `fetchPage(...)` (Task 1, O2):** a chunked-`Promise.all` helper (slice into groups of `limit`, await each group, results preserve input order) — no existing batched-concurrency helper in the repo. `fetchPage` does ONE pageList fetch+parse and returns `{rows, totalPage, refreshedToken, authError, errorCode?, msg?}`; it captures the `muctoken` header and RETURNS it (never writes shared outer scope) and surfaces auth/non-auth errors structurally so the caller decides retry-vs-fatal. `BIGSELLER_PAGE_CONCURRENCY = 4`.

2. **`processPlatform` closure + page fan-out (Tasks 1+2):** page 1 sequential (readiness-race retry budget + page-1 fatal → scoped error return + reveals `totalPage`), then `[2..totalPage]` fanned out via `mapWithConcurrency(pageNos, 4, fetchPage)`, rows collected page-1-first in `pageNo` order. All collected rows run through the existing normalize → `upsertOrders` → `saveRevenue` → `getRevenueByIds` link → item-emit-with-leak-guard pipeline (leak guard T-79-02 preserved verbatim). The `updateSyncStage('storing')` write fires ONCE per platform (after page 1) instead of once per page — no racing per-page writes.

3. **`Promise.all` over platforms + post-resolution aggregation (Task 2, O1):** `Promise.all([...platformShops].map(([platform, shopIds]) => processPlatform(...)))`. Shared `priceOracle`/`mappingBySku`/`menuProductById` are built once before the fan-out, read-only inside. Counts/token/auth aggregated after resolution; `authErrorObserved = platformResults.some(r => r.authError)`. Auth error in either platform → `handleAuthFailure` + abort (mirrors pre-O1). Page-1 fatal scoped per-platform (R2): sibling data lands, sync marked `error` naming the failing platform.

4. **Race tests + CHANGELOG (Task 3, tdd):** `describe("BigSeller parallel fetch (O1/O2)")` drives `fetchOrders` end-to-end with a stubbed `global.fetch` keyed by endpoint+pageNo, plus `mapWithConcurrency` unit tests. Covers: no double-count under concurrent platforms (8 fetched incl. duplicates → 6 unique, idempotent), page-2 failure surfaces in error log + page-1 data lands, cross-platform leak guard survives (every revenue source matches its platform), token persists under concurrency, one-platform page-1 fatal scoped with sibling intact (R2), and the concurrency cap of 4.

## Verification

| Gate | Result |
|------|--------|
| `npm run type-check` | PASS (zero errors) |
| `npm run test -- bigseller` | PASS — 198 tests / 15 files (was 191; +7: 2 mapWithConcurrency + 5 parallel-fetch) |
| `npm run build` | PASS (EXIT=0, `✓ built in 22.03s`, no chunk-size breach) |

Note: `npx convex codegen` could not run in this environment (`No CONVEX_DEPLOYMENT set`), but the `_generated` API is current from prior plans 83-03/04 (which added `getRevenueByIds` / `updateToken` widening) and `npm run type-check` against it passes — the new code references only pre-existing generated API symbols, so no codegen was required.

## Acceptance Criteria

- **Task 1:** `grep -c mapWithConcurrency sync.ts` = 4 (≥2) ✓; `grep -c fetchPage sync.ts` = 4 (≥2) ✓; `npm run type-check` exit 0 ✓; `npm run test -- bigseller` exit 0 ✓
  - `grep -c 'Cross-platform leak guard' sync.ts` = **2**, criterion expected **1**. The guard appears twice — once in the comment, once in the throw message — and ALWAYS has (the original committed sync.ts also returned 2; see Deviations). The guard is preserved verbatim; the criterion's expected baseline was simply inaccurate.
- **Task 2:** `grep -c processPlatform sync.ts` = 7 (≥2) ✓; `grep -c 'Promise.all' sync.ts` = 7 (≥2) ✓; `grep -c authErrorObserved sync.ts` = 7 (≥2) ✓; type-check + tests exit 0 ✓
- **Task 3:** `grep -ci 'double-count\|concurren' sync.test.ts` = 13 (≥1) ✓; `grep -c 'BigSeller parallel fetch' sync.test.ts` = 1 ✓; `grep -c 'it(' sync.test.ts` = 16 (≥9) ✓; `grep -ci 'page-1 fatal\|scopes a one-platform' sync.test.ts` = 3 (≥1) ✓; `grep -ci 83-07 CHANGELOG.md` ≥1 ✓; tests + build exit 0 ✓

## Deviations from Plan

### Documentation

**1. [Plan-criterion inaccuracy] `Cross-platform leak guard` grep returns 2, not the criterion's 1**
- **Found during:** Task 1 acceptance check.
- **Issue:** The criterion `grep -c 'Cross-platform leak guard' === 1` assumed the phrase appears once. It appears twice — in the explanatory comment AND in the `throw new Error("Cross-platform leak guard: ...")` message. `git show HEAD~2:...sync.ts | grep -c` confirms the ORIGINAL committed code also returned 2. The guard is preserved verbatim (logic + message unchanged).
- **Fix:** None needed — the guard is intact. Documented rather than artificially editing the comment to satisfy a miscounted baseline.
- **Files modified:** none.

### Structural

**2. [D-06 intent] Tasks 1 (O2) + 2 (O1) shipped in one feat commit**
- **Found during:** Task 2.
- **Issue:** The plan lists O2 and O1 as two tasks/commits, but the page-1-sequential extraction (O2) and the `processPlatform` wrapper (O1) are interdependent halves of a single rewrite of the same `for...of platformShops` loop. Splitting them would require an intermediate state (pages parallel, platforms still sequential) that adds churn with no atomic-revert value.
- **Fix:** One `feat(83-07)` commit covers both O1 and O2 (D-06 explicitly pairs them in one PR). Task 3 is a separate `test(83-07)` commit.
- **Files modified:** `convex/integrations/bigseller/sync.ts`.

## Threat Model Compliance

| Threat ID | Disposition | Implemented |
|-----------|-------------|-------------|
| T-83-07-01 (Tampering — double-count under concurrency) | mitigate | `upsertOrders`/`saveRevenue` keyed by `externalTransactionId` (unique) → idempotent; counts aggregated post-`Promise.all` (single-threaded), never mutated from concurrent branches. Locked by the no-double-count race test (8 fetched, 6 unique, 2 idempotent updates). DONE |
| T-83-07-02 (Tampering — cross-platform leak) | mitigate | Per-row guard (`revDoc.source !== platform → throw`) preserved verbatim inside each `processPlatform`; `source` stamped from the branch's own `platform`. Locked by the leak-guard race test (every revenue source matches its platform). DONE |
| T-83-07-03 (Tampering — credential persist under concurrency) | mitigate | `latestRefreshedToken`/`authErrorObserved` aggregated AFTER `Promise.all`; `fetchPage` RETURNS the token (no concurrent shared write); persist runs once via `shouldPersistRefreshedToken` (83-03 guards). Auth error in either platform skips persist. Locked by the token-under-concurrency race test. DONE |
| T-83-07-04 (DoS / rate-limit — concurrent pageList calls) | mitigate | Page concurrency capped at 4 (`mapWithConcurrency` / `BIGSELLER_PAGE_CONCURRENCY`); platform fan-out is 2 → bounded total in-flight. Cap locked by the `mapWithConcurrency` in-flight-counter test. DONE |
| T-83-07-05 (Repudiation — silent page-2 failure) | mitigate | Fanned-out page failure logged in `fetchPage` + contributes 0 rows; page-1 fatal marks the sync `error` naming the platform. Locked by the page-2-failure and one-platform-page-1-fatal race tests. DONE |

No new threat surface, no new network endpoints, no auth paths, no schema changes.

## Known Stubs

None.

## Threat Flags

None — no new security-relevant surface (no new endpoints, auth paths, file access, or schema changes; same BigSeller pageList endpoint, same credential row).

## TDD Gate Compliance

Task 3 is `tdd="true"`. Per the same precedent as 83-05, this is a "lock existing behavior" task: the O1/O2 implementation already shipped in the Task 1+2 `feat` commit, so the race tests are GREEN-on-first-run against the shipped code rather than RED-first. The `test(83-07)` commit follows the `feat(83-07)` commit. The behaviors under test (no double-count, leak-guard survival, token persistence, partial-failure scoping, concurrency cap) are all verifiably exercised end-to-end via the stubbed-`fetch` `t.action` drive — real assertions, no `expect(true).toBe(true)`.

## Commits

- `ba0f1623` feat(83-07): parallelize BigSeller fetch — O1 platforms + O2 pages 2..N
- `e67236aa` test(83-07): O1/O2 race tests + CHANGELOG (no double-count, leak guard, token, partial-fail)

## Self-Check: PASSED

- Modified files exist: `convex/integrations/bigseller/sync.ts`, `convex/integrations/bigseller/__tests__/sync.test.ts`, `docs/CHANGELOG.md` — all FOUND.
- Commits exist in git log: ba0f1623, e67236aa — all FOUND.
