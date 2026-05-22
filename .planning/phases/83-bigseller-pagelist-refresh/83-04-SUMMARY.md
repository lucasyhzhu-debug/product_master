---
phase: 83-bigseller-pagelist-refresh
plan: 04
subsystem: bigseller-integration
tags: [n+1-elimination, sync-performance, batch-query, refactor]
requires:
  - "getRevenueById internalQuery (existing, kept in place)"
  - "saveRevenue bridge returning revenueResults[] (existing)"
  - "cross-platform leak guard T-79-02 (existing, sync.ts)"
provides:
  - "getRevenueByIds(revenueIds) internalQuery — batch read returning Array<[id, doc]>"
  - "single prefetched revenue batch feeding both former N+1 loops in fetchOrders"
affects:
  - "convex/integrations/bigseller/queries.ts (new batch query)"
  - "convex/integrations/bigseller/sync.ts (both N+1 loops swapped to one prefetch)"
tech-stack:
  added: []
  patterns:
    - "Batch-read internalQuery returning Array<[id, doc]> entries (NOT a raw Map — Flag #5: Map is not a Convex-serializable return type); caller builds Map via new Map(entries) — the convex/productionCounts/queries.ts:31 pattern"
    - "Prefetch-once-then-read-from-map: N+1 elimination by fetching the whole batch once after the upstream write returns, then reading per-id from the in-memory map"
key-files:
  created: []
  modified:
    - "convex/integrations/bigseller/queries.ts"
    - "convex/integrations/bigseller/sync.ts"
    - "convex/integrations/bigseller/__tests__/sync.test.ts"
    - "docs/CHANGELOG.md"
decisions:
  - "Flag #5 FIRED: a raw Map IS NOT a supported Convex return type — returning new Map(...) from getRevenueByIds threw 'Map ... is not a supported Convex type' over the runQuery boundary (caught by the parity test, exactly as the plan anticipated). Switched to the plan's Array<[id, doc]> fallback; caller builds the Map via new Map(entries)."
  - "Kept getRevenueById in place (plan-mandated) — other callers may exist; only stopped calling it from the two fetchOrders loops."
  - "Committed Task 1's query Array-fallback fix together with Task 3 (the test commit) because the fallback was driven by the Task 3 parity test discovering Flag #5 — the Task 1 commit shipped the Map shape first, mirroring the plan's RED/iterate intent."
metrics:
  duration_min: 8
  completed: 2026-05-22
  tasks: 3
  files: 4
  commits: 3
---

# Phase 83 Plan 04: N+1 Elimination (O4) Summary

Eliminated the BigSeller revenue-linking N+1 query: `fetchOrders` now prefetches the entire revenue batch ONCE via a new `getRevenueByIds` internalQuery, and both the revenue→order linking loop and the cross-platform leak guard (T-79-02) read from one in-memory map instead of ~400 sequential single-doc `getRevenueById` round-trips per full-month sync. Pure refactor, no behavior change.

## What Was Built

1. **`getRevenueByIds` batch query (Task 1):** added next to `getRevenueById` in `convex/integrations/bigseller/queries.ts`. Fetches all ids via `Promise.all(ctx.db.get)`, omits missing/deleted ids. Initially returned a `Map` per the plan's PRIMARY shape.
2. **Both N+1 loops swapped (Task 2):** in `sync.ts`, after `saveRevenue` returns and `revenueIds` is computed, one `getRevenueByIds` prefetch builds `revDocsById`. Loop 1 (revenue→order linking, former L875-889) reads `revDocsById.get(revId)`; Loop 2 (cross-platform leak guard, former L917-925) reads `revDocsById.get(revenueId)`. The leak guard is preserved verbatim — still throws on `revDoc.source !== platform`.
3. **Parity tests + Flag #5 resolution + CHANGELOG (Task 3):** added `describe("getRevenueByIds (O4 N+1 elimination)")` to `sync.test.ts` — (a) exactly 3 entries for 3 real ids + 1 deleted id omitted (not null), (b) parity: each batch entry deep-equals the single `getRevenueById` result. The parity test caught Flag #5 (Map serialization) and the query was switched to the `Array<[id, doc]>` fallback. CHANGELOG records O4.

## Flag #5 Outcome (Map serialization)

The plan flagged that a raw `Map` may not round-trip through `ctx.runQuery`. **It does not.** Returning `new Map(...)` threw:

```
Error: Map[[...]] is not a supported Convex type.
  at convexToJsonInternal (convex/dist/esm/values/value.js:226)
```

Applied the plan-prescribed fallback: `getRevenueByIds` returns `Array<[string, Doc<"externalRevenue">]>`; the caller in `sync.ts` builds the lookup Map via `const revDocsById = new Map(revDocEntries);` (the `convex/productionCounts/queries.ts:31` pattern). The test asserts `Array.isArray(entries)` and builds the Map caller-side. Both query doc-comment and the sync.ts comment document the Array shape and the reason.

## Verification

| Gate | Result |
|------|--------|
| `npm run type-check` | PASS (zero new errors; confirms `internal.integrations.bigseller.queries.getRevenueByIds` resolves — the `_generated/api.d.ts` uses `typeof import(...)`, so the new export is reflected without re-running codegen) |
| `npm run test -- bigseller` | PASS — 188 tests (15 files), incl. 2 new parity/round-trip tests |
| `npm run build` | PASS (EXIT=0, built in ~22s, no chunk-size breach) |

## Acceptance Criteria

- `grep -c getRevenueByIds queries.ts` = 1 ✓
- `grep -c getRevenueByIds sync.ts` = 1 ✓
- `grep -cE 'getRevenueById\b' sync.ts` = 0 ✓ (reworded my own comment to drop the literal token so the criterion holds exactly — no per-id call remains)
- `grep -c 'Cross-platform leak guard' sync.ts` = 2 (pre-existing: comment block + error message string; plan said 1 counting the guard once — both are the SAME unchanged guard, not a regression. The guard is intact and still throws.)
- `grep -c getRevenueByIds sync.test.ts` = 5 ✓
- `grep -ci 83-04 CHANGELOG.md` = 1 ✓

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Map return shape switched to Array fallback (Flag #5)**
- **Found during:** Task 3 (parity test)
- **Issue:** `getRevenueByIds` returning a `Map` threw `"Map ... is not a supported Convex type"` over the `ctx.runQuery` boundary — exactly the Flag #5 risk the plan called out.
- **Fix:** query returns `Array<[id, doc]>`; caller builds `new Map(entries)`. This is the plan-authorized fallback path, not unplanned scope.
- **Files modified:** `queries.ts`, `sync.ts`, `sync.test.ts`
- **Commit:** `6b20cd35`

**2. [Minor] Comment reworded to satisfy `getRevenueById\b` = 0 grep**
- **Found during:** Task 2 acceptance grep
- **Issue:** my new prefetch comment contained the literal token "getRevenueById lookups", making the `getRevenueById\b` grep return 1 instead of the plan's expected 0.
- **Fix:** reworded comment to "single-doc per-id lookups". No functional change — no actual per-id `ctx.runQuery(...getRevenueById...)` call remains in sync.ts.
- **Commit:** `89d2c832`

## Environment Note (not a deviation)

`npx convex codegen` (Task 1 verify) could not run: no `CONVEX_DEPLOYMENT` / `.env.local` present in this environment (gitignored, absent) — same as 83-03. The `_generated/api.d.ts` references the bigseller queries module via `typeof import("../integrations/bigseller/queries.js")`, so the new `getRevenueByIds` export is automatically reflected in `internal.integrations.bigseller.queries.*` without re-running codegen. `npm run type-check` passing green confirms the API surface resolves. Codegen runs normally in CI/dev.

## Threat Model Compliance

| Threat ID | Disposition | Implemented |
|-----------|-------------|-------------|
| T-83-04-01 (info disclosure) | accept | `getRevenueByIds` is an `internalQuery` — not client-reachable, no permission surface — as designed |
| T-83-04-02 (tampering — leak guard) | mitigate | Cross-platform leak guard (T-79-02) preserved verbatim reading from the batch map; still throws on `revDoc.source !== platform` — DONE |
| T-83-04-03 (DoS — batch arg size) | accept | 200 ids × 32B = 6.4kB, well within Convex arg limits — as designed |

No new threat surface introduced beyond the registered dispositions. No new network endpoints, auth paths, or schema changes.

## Known Stubs

None.

## Commits

- `21b76229` feat(83-04): add getRevenueByIds batch lookup (O4 N+1 elimination)
- `89d2c832` refactor(83-04): swap both N+1 loops to one prefetched batch
- `6b20cd35` test(83-04): parity + round-trip tests; Array fallback (Flag #5); CHANGELOG

## Self-Check: PASSED

- Modified files exist: `convex/integrations/bigseller/queries.ts`, `convex/integrations/bigseller/sync.ts`, `convex/integrations/bigseller/__tests__/sync.test.ts`, `docs/CHANGELOG.md` — all FOUND.
- Commits exist in git log: 21b76229, 89d2c832, 6b20cd35 — all FOUND.
