---
phase: 83-bigseller-pagelist-refresh
reviewed: 2026-05-22T00:00:00Z
depth: standard
files_reviewed: 13
files_reviewed_list:
  - convex/integrations/bigseller/sync.ts
  - convex/integrations/bigseller/config.ts
  - convex/integrations/bigseller/queries.ts
  - convex/platformCredentials/mutations.ts
  - convex/platformCredentials/queries.ts
  - convex/schema.ts
  - src/lib/bigsellerToken.ts
  - src/components/salesAnalytics/BigSellerSyncPanel.tsx
  - src/components/salesAnalytics/SettingsTab.tsx
  - convex/integrations/bigseller/__tests__/sync.test.ts
  - convex/integrations/bigseller/__tests__/cron.test.ts
  - convex/integrations/bigseller/__tests__/helpers.test.ts
findings:
  critical: 1
  warning: 5
  info: 3
  total: 9
status: issues_found
---

# Phase 83: Code Review Report

**Reviewed:** 2026-05-22
**Depth:** standard
**Files Reviewed:** 13
**Status:** issues_found

## Summary

Reviewed the BigSeller sync-performance refresh: token auto-refresh (D-03), freshness
banner (D-04), N+1 elimination (O4 `getRevenueByIds`), adaptive polling (O3), pageSize
50→100 (O6), and parallel fetch (O1 platforms via `Promise.all`, O2 pages via
`mapWithConcurrency`).

The concurrency design is largely sound: per-platform counts/token/auth are returned and
aggregated post-`Promise.all` (single-threaded) rather than mutated from concurrent
branches, upserts are idempotent by `externalTransactionId`, the cross-platform leak guard
stamps `source` from the loop variable, and the `getRevenueByIds` Array-of-entries shape
correctly sidesteps the non-serializable-`Map` Convex boundary (Flag #5). Tests cover the
no-double-count, page-2-failure, leak-guard, token-persist, and one-platform-fatal contracts.

The one blocker is a correctness defect in the displayed/logged `totalRevenue` summary
(double-counts orders that recur across pages or platforms) — the new batched accumulation
preserves the prior per-row behavior, but it is now provably divergent from the idempotent
upsert the same code path performs, and the new sync.test.ts asserts row-count idempotency
while leaving the revenue total unasserted. Remaining findings are robustness gaps around
the latent "common" platform path, the partial-data-on-auth-failure semantics, and N+1
sequential mutation loops at the tail of `fetchOrders`.

## Critical Issues

### CR-01: `totalRevenue` summary double-counts orders that recur across pages/platforms

**File:** `convex/integrations/bigseller/sync.ts:1102-1109` (accumulation) and `:1124-1136` (aggregation)

**Issue:** `result.revenue += row.platformIncome ?? 0` sums over every entry in `allRows`,
but `allRows` is the raw concatenation of page 1 + the fanned-out pages 2..N. Orders are
upserted idempotently by `externalTransactionId` (`upsertOrders` / `saveRevenue` both dedup),
so the persisted order/revenue rows are unique — but the summary `totalRevenue` (and the
console summary line, and `summary.totalRevenue` shown in `BigSellerSyncPanel`) counts a
duplicated order's `platformIncome` once per occurrence. The new `sync.test.ts`
"does not double-count orders under concurrent platform processing" deliberately re-emits
`${prefix}-1` on page 2 and asserts `orders.length === 6` and `revenue.length === 6`, but
never asserts `summary.totalRevenue`, so the divergence passes green. The user-facing
"Revenue: X IDR" figure and the success log are therefore unreliable whenever BigSeller's
pageList returns an order on more than one page (the exact scenario the test simulates as
the idempotency contract).

**Fix:** Deduplicate by `externalTransactionId` before summing revenue and collecting SKUs,
so the summary matches the idempotent persisted set:
```ts
// after allRows is assembled, before the revenue/sku accumulation loop
const seen = new Set<string>();
for (const row of allRows) {
  const txn = row.platformOrderId;
  if (seen.has(txn)) continue;        // already counted — upsert is idempotent
  seen.add(txn);
  result.revenue += row.platformIncome ?? 0;
  result.platforms.push(platform);
  for (const sku of row.skuVoList || []) {
    if (sku.sku) skuCodeSet.add(`${platform}::${sku.sku}`);
  }
}
```
Add an assertion to the no-double-count test: read `bigsellerSyncState.summary.totalRevenue`
and expect it to equal the sum over the 6 unique orders, not the 8 raw rows.

## Warnings

### WR-01: "common" platform path feeds an invalid `source` into `saveRevenue` (config-gated crash)

**File:** `convex/integrations/bigseller/sync.ts:865-868, 982-1003`

**Issue:** `processPlatform` fully supports a `"common"` platform (it computes
`getPageListEndpoint(platform)`, sets `platformTemplate = "common"`, and calls
`normalizePlatformFees(row, "common")`). Any `shopId` in `BIGSELLER_FROLLIE_SHOP_IDS`
without a `BIGSELLER_SHOP_PLATFORM_MAP` entry defaults to `"common"` (sync.ts:820). But the
revenue bridge then casts `r.source as "shopee" | "tiktok"` (:988) and `saveRevenue`'s
`sourceValidator` does not accept `"common"` — adding an unmapped shop would throw an
`ArgumentValidationError` mid-sync and abort the action with the sync stuck in `storing`
(no `failed` write, since the throw escapes `Promise.all`). Today both configured shop IDs
are mapped so it cannot fire, but the dead-but-wired `"common"` branch is a trap for the
next shop addition.

**Fix:** Either drop the `"common"` branch entirely (assert the platform is shopee/tiktok
and skip otherwise), or guard at the top of `processPlatform`:
```ts
if (platform !== "shopee" && platform !== "tiktok") {
  result.fatalError = `Unmapped BigSeller shop platform "${platform}" — add it to BIGSELLER_SHOP_PLATFORM_MAP`;
  return result;
}
```
so an unmapped shop produces a scoped, surfaced error instead of an uncaught validator throw.

### WR-02: An uncaught throw inside `processPlatform` leaves the sync stuck in `storing`

**File:** `convex/integrations/bigseller/sync.ts:1048-1052, 1119-1121`

**Issue:** The cross-platform leak guard (`throw new Error("Cross-platform leak guard…")`)
and any unexpected throw (e.g. WR-01's validator error, a `saveRevenueItemsWithCounts`
failure) propagate out of `processPlatform` → rejects `Promise.all` → throws out of
`fetchOrders`. The token-persist block is wrapped in try/catch, but the main pipeline is
not, so a throw skips every terminal `updateSyncStage("failed")` / `updateSyncLog("error")`
write. The UI's `bigsellerSyncState` is then pinned at `storing` indefinitely (`isActive`
stays true; "Sync Now" stays disabled) with no failure toast and no error log row. The cron
overlap guard (`stage !== "idle"`) would also block the next nightly run.

**Fix:** Wrap the `Promise.all` + aggregation in a try/catch that, on throw, writes a
`failed` sync stage and an `error` sync-log row before rethrowing/returning. The leak guard
is a should-never-fire invariant, but the handler should still leave recoverable state.

### WR-03: Auth error in one platform marks the whole sync "failed" but the sibling's data was already written

**File:** `convex/integrations/bigseller/sync.ts:1137-1144`

**Issue:** `processPlatform` performs `upsertOrders` / `saveRevenue` / item-emit for page 1
(and fanned pages) before returning. If platform A succeeds and platform B then returns an
auth error, `authErrorObserved` is true and `handleAuthFailure` marks the sync `failed`
with "Token expired" — but platform A's orders/revenue/items are already persisted. The
operator sees "failed / token expired" while half the data silently landed. The page-1
fatal path (R2, :1146-1169) was deliberately designed to surface this as a scoped `error`
naming the platform; the auth path was not given the same treatment and reuses the
all-or-nothing "failed" message, which is now misleading under partial concurrency.

**Fix:** At minimum, make the auth-failure message reflect partial success (e.g. include
which platform(s) saw the auth error and note that the other platform's data was saved), or
align it with the R2 scoping so the operator knows data partially landed. Confirm this is
the intended behavior with the phase decision log — the comment claims it "mirrors the
pre-O1 early-return", but pre-O1 the early-return happened before any sibling write.

### WR-04: N+1 sequential mutations/queries in the `fetchOrders` tail (per-SKU)

**File:** `convex/integrations/bigseller/sync.ts:1204-1229`

**Issue:** After the O1/O2 fan-out, the handler loops over `allSkuCodes` twice, each iteration
awaiting a single mutation (`saveProductMappings` with a one-element array, :1208) or a
single query (`checkProductMapping`, :1224) sequentially. For a multi-SKU month this is
dozens-to-hundreds of serial round-trips — the same N+1 pattern O4 was introduced to remove
for revenue linking, left in place on the SKU side. (Performance is out of v1 scope, but this
is flagged as a quality/consistency defect: the phase's stated goal was N+1 elimination and
this is the largest remaining one in the same function.)

**Fix:** Batch both: pass the full mapping array to a single `saveProductMappings` call
(it already accepts `mappings: [...]`), and add a batch `checkProductMappings` internal query
(or reuse `getShopeeAndTikTokMappingsWithProducts` already loaded earlier as `mappingBySku`)
to compute `unmappedSkus` in memory instead of one query per SKU.

### WR-05: `getCredentialStatus` returns an inconsistent object shape across branches

**File:** `convex/platformCredentials/queries.ts:29-56`

**Issue:** The no-credentials branch (:30-39) omits `tokenExpiresIn`, while the populated
branch (:45-55) includes it. Consumers reading `tokenExpiresIn` get `undefined` vs a number
depending on whether credentials exist, which TypeScript will not catch because the return
type is inferred as a union. This is a latent shape mismatch for any caller that destructures
`tokenExpiresIn`.

**Fix:** Add `tokenExpiresIn: null` to the no-credentials return object so both branches
share an identical key set.

## Info

### IN-01: Auth-error platforms still contribute persisted data that is never rolled back

**File:** `convex/integrations/bigseller/sync.ts:951-960`

**Issue:** A fanned-out page that returns `authError` sets `result.authError = true` and
`continue`s, but pages collected before it (and page 1) were already pushed into `allRows`
and will be upserted at :973-1003 before the platform returns. Combined with WR-03, an auth
error mid-pagination still writes the earlier pages. This is consistent with "data is
already saved" elsewhere, but worth an explicit note in the decision log since the banner
will say the token is expired.

### IN-02: `pageDelayMs`/readiness retries are blocking sleeps inside a concurrent fan-out

**File:** `convex/integrations/bigseller/sync.ts:909` and `config.ts:77`

**Issue:** The page-1 readiness retry uses `await new Promise(r => setTimeout(r, delay))`
with delays summing to 100s, executed inside each `processPlatform` which both run under
`Promise.all`. Two platforms warming up simultaneously is fine (they wait in parallel), but
the worst-case wall-clock for a cold sync is now max(platform readiness waits) + poll ramp;
ensure the action's execution-time budget (Convex action timeout) accommodates 100s of
readiness sleep plus the page fan-out. Not a defect, but verify against the platform timeout.

### IN-03: `startSync` incremental date math uses runtime-local calendar fields (UTC in Convex), not WIB

**File:** `convex/integrations/bigseller/sync.ts:1288-1293` (`formatDate`) and `:288-296`

**Issue:** `formatDate` derives the date from `getFullYear/getMonth/getDate`, which are
runtime-local — UTC in Convex. For a WIB (UTC+7) business, "today" in UTC can lag the local
date by up to 7 hours, so an incremental `endDate` computed near local midnight can be one
day behind. This is pre-existing (not introduced this phase) and low-impact for a 30-day
default window, but flagged given the project's documented WIB-correctness emphasis
(CLAUDE.md). Consider using the existing WIB helper (`getWibDateStr` from
`convex/lib/periodRange.ts`) for consistency if incremental boundaries ever tighten.

---

_Reviewed: 2026-05-22_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
