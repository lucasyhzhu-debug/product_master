# Phase 83 — Quad-Review Fixes (BigSeller sync refresh)

**Branch:** `gsd/phase-83-bigseller-pagelist-refresh`
**Applied:** 2026-05-22
**Gates:** `npm run type-check` PASS · `npm run test -- bigseller` PASS (199 tests) · `npm run build` EXIT=0

## Fixes Applied

### C1 (Critical) — Dedup summary totals by externalTransactionId
`processPlatform` collected `allRows` across pages, but BigSeller's pageList is not
snapshot-stable across pages so the same order can appear on >1 page. The persisted
upsert/saveRevenue path was already idempotent (keyed by `externalTransactionId`), but
the DISPLAY summary double-counted: `result.revenue` summed `platformIncome` over the raw
rows, `totalOrders = inserted + updated` counted a re-seen order twice, and the per-order
item-emit loop ran twice for a re-seen order.

**Fix:** dedup `allRows` by `platformOrderId` (→ `externalTransactionId`) once, immediately
after page collection and before any processing (keep first occurrence; page order
preserved). This single dedup fixes revenue, order-count, AND `itemsDeducted`/`itemsSkipped`
in one place — no separate counter dedup needed. The upsert path is untouched.
- **File:** `convex/integrations/bigseller/sync.ts`
- **Test:** extended "does not double-count" in `sync.test.ts` to assert
  `summary.totalRevenue === 540`, `summary.totalOrders === 6`, `newOrders === 6`,
  `updatedOrders === 0` (each platform: 3 unique orders × 90 income = 270; ×2 = 540/6).

### I1 (Important) — Terminal-state safety net around the parallel fan-out
An uncaught throw inside `processPlatform` (leak-guard throw, saveRevenue validator error,
item-emit failure) rejected `Promise.all` and escaped `fetchOrders` with NO terminal state
write, pinning `bigsellerSyncState` at stage `"storing"` — which `startSync`'s overlap guard
treats as "in progress", blocking every future run.

**Fix:** wrapped the fan-out + post-aggregation in try/catch. On throw, write a terminal
`"failed"` state + error sync-log naming the failure context (clears the active stage so the
overlap guard frees up). Successful-path early `return`s exit the try without hitting catch —
behavior unchanged.
- **File:** `convex/integrations/bigseller/sync.ts`

### I2 (Important) — Guard the unmapped "common" platform
A shop ID missing from `BIGSELLER_SHOP_PLATFORM_MAP` defaults `platform` to `"common"`, gets
fully processed, then the `r.source as "shopee" | "tiktok"` cast feeds `"common"` into the
saveRevenue validator and throws deep in the pipeline.

**Fix:** explicit guard at the top of `processPlatform` — if `platform` is neither `shopee`
nor `tiktok`, set a scoped `fatalError` (naming the unmapped shop IDs) and return cleanly.
Configured shopee/tiktok shops are unaffected.
- **File:** `convex/integrations/bigseller/sync.ts`

### I3 (Important) — Per-platform auth-failure scoping
When one platform's auth failed but the sibling already persisted data (under O1
parallelism), the sync reused the all-or-nothing "Token expired" message for the whole sync.

**Fix:** carry the platform name on `PlatformResult`. In the auth-failure branch, only emit
the generic global "token expired" message when EVERY processed platform saw the auth error;
otherwise pass a scoped message to `handleAuthFailure` naming the failing platform(s) and
noting the sibling's data was saved. `handleAuthFailure` gained an optional `scopedMessage`
param (defaults to the original global message — existing callers unchanged).
- **File:** `convex/integrations/bigseller/sync.ts`

### I4 (Important) — Preserve tokenExpiresAt on auth-failure updateToken
`updateToken` patched `tokenExpiresAt: args.tokenExpiresAt` unconditionally.
`handleAuthFailure` calls `updateToken` WITHOUT `tokenExpiresAt`, erasing the stored expiry
and silently nulling the D-04 freshness banner.

**Fix:** `tokenExpiresAt: args.tokenExpiresAt ?? cred.tokenExpiresAt`. The auto-refresh path
passes a fresh `tokenExpiresAt`, so `??` keeps the new value there; the auth-failure path
(no arg) now preserves the existing expiry.
- **File:** `convex/platformCredentials/mutations.ts`
- **Test:** new test in `sync.test.ts` — seeds a credential with an expiry, calls
  `updateToken` WITHOUT `tokenExpiresAt` (auth-failure shape), asserts the expiry is preserved.

### I5 (Minor→Important) — getCredentialStatus shape consistency
The no-credentials branch of `getCredentialStatus` omitted `tokenExpiresIn` while the
populated branch always returns it.

**Fix:** added `tokenExpiresIn: null` to the no-creds branch.
- **File:** `convex/platformCredentials/queries.ts`

### M2 (Minor) — Removed dead BIGSELLER_POLL_INTERVAL_MS
Superseded by `pollDelayMs` (O3). Grep across `convex/`, `src/`, and tests confirmed the only
real-code reference was the declaration itself (all other hits are docs/planning artifacts).
Removed the constant from `config.ts`.
- **File:** `convex/integrations/bigseller/config.ts`
- **Not removed:** `decodeMucTokenExp` / `src/lib/bigsellerToken.ts` (plan-created, tested;
  the simplify pass owns it).

## Deferred (NOT fixed — documented only)

- **M1: SKU-side N+1 tail** (`saveProductMappings`/`checkProductMapping` per-SKU loops) —
  pre-existing, out of O4's revenue-linking scope; warrants a separate optimization PR.
- **M3: startSync UTC-vs-WIB date math** — pre-existing, low impact.
- **Nitpick: concurrent "storing" stage double-write** — harmless (idempotent singleton patch).
- **Nitpick: panel `as any` casts** — pre-existing UI casts, no correctness impact.
- **Nitpick: fetchPage swallowing errorMsg on page>1** — by design (page>1 errors log and
  contribute 0 rows; only page-1 errors are fatal per R2).

## Notes
- `npm run lint` reports 507 pre-existing repo-wide errors (`any` / unused-vars) and exits 0;
  it is not the merge gate (`npm run build` is, per CLAUDE.md). No new lint-error categories
  introduced by these fixes.
</content>
</invoke>
