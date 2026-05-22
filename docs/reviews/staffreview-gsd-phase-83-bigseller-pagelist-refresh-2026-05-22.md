---
review_type: staffreview
target: gsd/phase-83-bigseller-pagelist-refresh
diff_base: 18092111
reviewed: 2026-05-22
reviewer: Claude (staffreview, Opus 4.7)
scope: plan-to-implementation fidelity + architectural risk
plans_reviewed: [83-03, 83-04, 83-05, 83-06, 83-07]
files_reviewed:
  - convex/integrations/bigseller/sync.ts
  - convex/integrations/bigseller/config.ts
  - convex/integrations/bigseller/queries.ts
  - convex/platformCredentials/queries.ts
  - convex/platformCredentials/mutations.ts
  - convex/schema.ts
  - src/lib/bigsellerToken.ts
  - src/components/salesAnalytics/BigSellerSyncPanel.tsx
  - src/components/salesAnalytics/SettingsTab.tsx
  - convex/integrations/bigseller/__tests__/sync.test.ts
findings:
  critical: 1
  important: 4
  minor: 3
  nitpick: 2
verdict: ship-with-fixes
---

# Staff Review — Phase 83 BigSeller pageList Refresh

## Summary

Phase 83 delivers the BigSeller sync-performance refresh exactly as scoped: token
auto-refresh + 2-state freshness banner (D-03/D-04, plan 83-03), N+1 elimination
(O4, plan 83-04), adaptive polling (O3, plan 83-05), pageSize 50→100 (O6, plan
83-06), and the paired parallel-fetch (O1 platforms + O2 pages 2..N, plan 83-07).
The low-risk-first sequencing of D-05 was honored to the letter — O4 → O3 → O6 →
O2+O1, biggest-win/biggest-risk last — and D-06's pairing of O1+O2 in one PR with
dedicated race tests is respected. All five optimizations plus the token work landed;
nothing planned is missing from the diff.

Plan fidelity is high and the documented deviations are sound:

- **Flag #5 (Map serialization)** fired exactly as the 83-04 plan anticipated — a raw
  `Map` does not round-trip across `ctx.runQuery`. The executor switched to the
  plan-authorized `Array<[id, doc]>` fallback with caller-side `new Map(entries)`.
  Correct, and the parity test that caught it is real.
- **Page-1-fatal per-platform scoping (R2)** is a deliberate, documented behavior
  change from the old all-or-nothing early return: under O1 the sibling platform's
  already-resolved data lands and the sync is marked terminal-error naming the failing
  platform. The impl matches the claim and a race test (`scopes a one-platform page-1
  fatal…`) locks it.
- **Grep-criterion mismatches** (`Cross-platform leak guard` = 2 not 1; multi-line
  `runAfter` defeating a single-line grep) are correctly identified as inaccurate
  baselines, not regressions — `git show` of the original confirms the guard always
  returned 2, and the guard logic is preserved verbatim.

The concurrency model is the right one: per-platform counts/token/auth are RETURNED
from `processPlatform` and aggregated AFTER `Promise.all` resolves (single-threaded),
never mutated from concurrent branches; upserts are idempotent by
`externalTransactionId`; the `mapWithConcurrency` cap of 4 bounds in-flight pageList
requests; shared `priceOracle`/`mappingBySku`/`menuProductById` are built once and read
only inside the concurrent branches. Token capture moved cleanly from a shared-outer
write to a returned value, making it concurrency-safe.

One blocker remains: the user-facing/logged `totalRevenue` summary double-counts orders
that recur across pages or platforms, and the new no-double-count test asserts row
idempotency but never the revenue total — so the divergence ships green. Four further
issues concern error-path robustness under the new concurrency (uncaught throw pinning
the UI at "storing", the dead-but-wired `"common"` validator trap, partial-success auth
messaging) and a latent return-shape mismatch.

This is a clean, well-sequenced phase. The findings below are the gap between "works on
the happy path / today's config" and "robust under the failure modes the new concurrency
introduces." Recommend shipping after the Critical fix; the Important items are low-effort
hardening that should land in the same PR while the context is hot.

---

## Critical Issues

### C-01: `totalRevenue` summary double-counts recurring orders — and the test that should catch it doesn't assert it

**File:** `convex/integrations/bigseller/sync.ts:1102-1109` (per-platform accumulation),
`:1124-1136` (cross-platform aggregation); test gap at
`convex/integrations/bigseller/__tests__/sync.test.ts:327-357`.

`result.revenue += row.platformIncome ?? 0` sums over every row in `allRows`, which is
the raw page-1 + fanned-pages-2..N concatenation. Orders are upserted **idempotently**
by `externalTransactionId` (`upsertOrders` / `saveRevenue` both dedup), so the persisted
order/revenue rows are unique — but the summary `totalRevenue` counts a duplicated order's
`platformIncome` once per occurrence. The summary feeds `bigsellerSyncState.summary.totalRevenue`
(the "Revenue: X IDR" figure in `BigSellerSyncPanel`) and the success-log line.

This is not theoretical: the new test `does not double-count orders under concurrent
platform processing` (line 327) **deliberately re-emits** `${prefix}-1` on page 2 of each
platform, then asserts `orders.length === 6` and `revenue.length === 6` (row idempotency) —
but never reads back `summary.totalRevenue`. So the exact scenario that proves the row-level
idempotency contract also silently inflates the displayed revenue, and the green test gives
false confidence. (The same loop also adds the SKU twice to `skuCodeSet` — harmless because
it's a Set, but it's the same root cause.)

Note this is a *latent* defect today only because BigSeller's `totalPage`-driven pagination
normally returns disjoint pages; it becomes live whenever BigSeller returns an order on more
than one page (the documented readiness-lag / re-pull window can do this), and the test
intentionally simulates it.

**Fix:** Deduplicate by `externalTransactionId` before the revenue/SKU accumulation so the
summary matches the idempotent persisted set:

```ts
const seen = new Set<string>();
for (const row of allRows) {
  if (seen.has(row.platformOrderId)) continue; // upsert is idempotent — count once
  seen.add(row.platformOrderId);
  result.revenue += row.platformIncome ?? 0;
  result.platforms.push(platform);
  for (const sku of row.skuVoList || []) {
    if (sku.sku) skuCodeSet.add(`${platform}::${sku.sku}`);
  }
}
```

Then add an assertion to the no-double-count test: read
`bigsellerSyncState.summary.totalRevenue` and expect it to equal the sum over the **6 unique**
orders, not the 8 raw rows. Without the assertion the fix is unguarded and can silently
regress (this phase is itself the proof that a row-count assertion is insufficient).

---

## Important

### I-01: An uncaught throw inside `processPlatform` pins the UI at "storing" forever

**File:** `convex/integrations/bigseller/sync.ts:1048-1052` (leak-guard throw), `1119-1121`
(`Promise.all`); no try/catch around the fan-out + aggregation.

The cross-platform leak guard throws (`throw new Error("Cross-platform leak guard…")`), as
can any unexpected error inside `processPlatform` (a `saveRevenueItemsWithCounts` failure,
the I-02 validator throw, an upsert error). That rejection propagates out of `Promise.all`
→ out of `fetchOrders`. Only the token-persist block is wrapped in try/catch; the main
pipeline is not. A throw therefore skips every terminal `updateSyncStage("failed")` /
`updateSyncLog("error")` write. `bigsellerSyncState` stays at `storing` (it was set per-platform
at :927), `isActive` stays true, "Sync Now" stays disabled, no failure toast, no error log row —
and the cron overlap guard (`stage !== "idle"`, startSync :268-275) blocks the next nightly run
indefinitely. Pre-O1 this was less severe because the sequential loop's early returns wrote a
terminal stage; the concurrency rewrite removed that safety without adding a catch-all.

**Fix:** Wrap the `Promise.all` + aggregation in a try/catch that, on throw, writes a `failed`
sync stage + `error` sync-log row before rethrowing. The leak guard is a should-never-fire
invariant, but the handler must still leave recoverable state so the operator and the cron can
proceed.

### I-02: The `"common"` platform branch is a dead-but-wired validator trap for the next shop addition

**File:** `convex/integrations/bigseller/sync.ts:820` (default `"common"`), `:865-868`
(`platformTemplate`), `:986-987` (`r.source as "shopee" | "tiktok"` into `saveRevenue`).

`processPlatform` fully supports a `"common"` platform: it resolves the endpoint, sets
`platformTemplate = "common"`, and normalizes fees with `"common"`. Any `shopId` in
`BIGSELLER_FROLLIE_SHOP_IDS` lacking a `BIGSELLER_SHOP_PLATFORM_MAP` entry defaults to
`"common"` (:820). But the revenue bridge casts `r.source as "shopee" | "tiktok"` (:987) and
`saveRevenue`'s validator does not accept `"common"` — adding an unmapped shop would throw an
`ArgumentValidationError` mid-`Promise.all`, which (per I-01) escapes uncaught and pins the
sync at `storing`. Both configured shops are mapped today so it cannot fire, but the trap is
armed for the next shop addition and the `as` cast hides it from the type-checker.

**Fix:** Guard at the top of `processPlatform` so an unmapped shop produces a scoped, surfaced
error instead of an uncaught validator throw:

```ts
if (platform !== "shopee" && platform !== "tiktok") {
  result.fatalError = `Unmapped BigSeller shop platform "${platform}" — add it to BIGSELLER_SHOP_PLATFORM_MAP`;
  return result;
}
```

This routes through the existing R2 page-1-fatal path (scoped error, sibling data intact) and
removes the lying `as` cast.

### I-03: Auth failure in one platform marks the whole sync "failed" after the sibling already persisted

**File:** `convex/integrations/bigseller/sync.ts:1137-1144`.

`processPlatform` writes `upsertOrders` / `saveRevenue` / item-emit for page 1 (and fanned
pages) *before* returning. If platform A succeeds and platform B then returns an auth error,
`authErrorObserved` becomes true and `handleAuthFailure` marks the sync `failed` with "Token
expired" — but platform A's orders/revenue/items are already in the database. The operator sees
"failed / token expired" while half the data silently landed, with no signal that it did.

This is inconsistent with the deliberate R2 treatment the phase gave the *page-1-fatal* path
(scoped error naming the platform, sibling data acknowledged). The auth path reuses the pre-O1
all-or-nothing message, whose comment claims it "mirrors the pre-O1 early-return" — but pre-O1
the early return happened *before any sibling write*, so the mirror is no longer accurate under
concurrency. The freshness banner will also say "token expired" while data partially landed.

**Fix:** Align the auth path with R2: include which platform(s) saw the auth error and note the
sibling's data was saved, OR confirm-and-document in the decision log that partial persistence
under auth failure is intended (it is recoverable — a re-sync is idempotent — but the message
must not imply zero data landed).

### I-04: `getCredentialStatus` returns an inconsistent object shape across its two branches

**File:** `convex/platformCredentials/queries.ts:30-39` (no-credentials) vs `:42-55` (populated).

The no-credentials branch omits `tokenExpiresIn`; the populated branch includes it. Consumers
destructuring `tokenExpiresIn` get `undefined` vs a number depending purely on whether
credentials exist — and TypeScript will not flag it because the inferred return type is a union
of two differently-shaped objects. This is a latent shape mismatch that the phase's own banner
work (which leans on credential-status shapes) makes more likely to be consumed.

**Fix:** Add `tokenExpiresIn: null` to the no-credentials return so both branches share an
identical key set. (Low effort; prevents a future `undefined`-vs-`null` banner bug.)

---

## Minor

### M-01: The SKU-side tail of `fetchOrders` is still N+1 — the same pattern O4 was created to remove

**File:** `convex/integrations/bigseller/sync.ts:1204-1229`.

After the O1/O2 fan-out, the handler loops over `allSkuCodes` twice, each iteration awaiting a
single mutation (`saveProductMappings` with a one-element `mappings: [...]` array, :1208) or a
single query (`checkProductMapping`, :1224). For a multi-SKU month this is dozens-to-hundreds of
serial round-trips — the exact N+1 shape O4 eliminated for revenue linking, left intact on the
SKU side in the *same function*. Performance is out of v1 scope, but flagging as a
consistency/quality gap given the phase's stated N+1-elimination goal: `saveProductMappings`
already accepts a batched array, and `mappingBySku` (already loaded at :797) can compute
`unmappedSkus` in memory without per-SKU queries.

### M-02: Readiness-retry blocking sleeps (up to 100s) run inside the concurrent fan-out — verify against the Convex action timeout

**File:** `convex/integrations/bigseller/sync.ts:909` (`setTimeout` sleep) +
`config.ts:77` (`BIGSELLER_PAGELIST_READINESS_RETRY_DELAYS_MS` summing to 100s).

The page-1 readiness retry sleeps `[10s, 30s, 60s]` = 100s worst case, inside each
`processPlatform`, both running under `Promise.all`. Parallel waits are fine (the two platforms
warm up concurrently), but the cold-sync wall-clock is now `max(platform readiness waits) + poll
ramp + fan-out`. Convex actions have an execution-time ceiling; confirm 100s of readiness sleep
plus the page fan-out stays within budget. Not a defect — a verification item the plan did not
call out.

### M-03: `startSync` incremental date math uses UTC calendar fields, not WIB

**File:** `convex/integrations/bigseller/sync.ts:1288-1293` (`formatDate`) + `:288-296`.

`formatDate` uses `getFullYear/getMonth/getDate` (runtime-local = UTC in Convex). For a WIB
(UTC+7) business, "today" in UTC can lag the local date near midnight, so an incremental
`endDate` can be one day behind. Pre-existing (not introduced this phase) and low-impact for a
30-day window, but flagged given the project's documented WIB-correctness emphasis (CLAUDE.md
Pitfall #18 / D-13). Consider `getWibDateStr` from `convex/lib/periodRange.ts` if boundaries ever
tighten.

---

## Nitpick

### N-01: Auth-error-mid-pagination still persists earlier pages (consistent, but undocumented)

**File:** `convex/integrations/bigseller/sync.ts:951-960`. A fanned-out page that returns
`authError` sets the flag and `continue`s, but page 1 (and pages collected before it) were
already pushed into `allRows` and upserted at :973-1003 before the platform returns. This is
consistent with the "data already saved" reality elsewhere (and ties into I-03), but worth one
line in the decision log since the banner will then say "token expired."

### N-02: The 83-07 SUMMARY's "+7 tests / 198 total" vs the `it(` count of 16

The SUMMARY reports `grep -c 'it(' sync.test.ts = 16` and "+7 tests" (was 191 → 198 suite-wide).
Both are internally consistent (16 is the sync.test.ts file count incl. the 83-03/04 cases; +7
is the delta this plan added across files). No action — noting only that the two numbers measure
different scopes and a future reader may conflate them.

---

## Design / Decision Compliance

| Decision | Honored? | Evidence |
|----------|----------|----------|
| D-01 (01a worked — gates phase) | yes | Phase builds only follow-ups; no schema fix re-shipped. |
| D-02 (01b W1-W3 archived, doc-only) | yes | CHANGELOG records the orderState archival note; `orderState` length-5 fixture assertions untouched (83-06 Task 2). |
| D-03 (token auto-refresh, unconditional) | yes | `shouldPersistRefreshedToken` + persist-once-at-end (:1177-1202), guarded (empty/unchanged/auth-error), wrapped in try/catch. |
| D-04 (2-state freshness banner) | yes | Yellow `<24h` + red expired banners in `BigSellerSyncPanel`; `tokenExpiresAt` plumbed query→SettingsTab→panel; single freshness source (R3 honored — panel does not re-decode). |
| D-05 (all 5, low-risk-first) | yes | O4→O3→O6→O2+O1 ordering matches commit history; O1 last. |
| D-06 (O1+O2 paired, separate triple-reviews) | yes | O1+O2 in one feat commit with race tests (deviation #2 documented and sound); 83-03/04/05/06 standalone. |

Banner work (D-04) is fully wired — `getHealthStatusAll` exposes `tokenExpiresAt`
(queries.ts:198, 404), SettingsTab reads `bigsellerHealth?.tokenExpiresAt` and drills it to the
panel. The "no schema change needed" claim in CONTEXT was correctly overridden by the plan
(Flag #1): both the `updateToken` validator and the `platformCredentials.lastRefreshStatus`
schema union were widened for `"auto-refreshed-from-response"` (mutations.ts, schema.ts:1281).

## Over-Engineering Check

None material. `mapWithConcurrency` is a ~10-line chunked `Promise.all` — the minimal correct
primitive, not a dependency or an abstraction. The `Array<[id, doc]>` return shape is forced by
Convex serialization, not a choice. The persist-guard is extracted to a pure
`shouldPersistRefreshedToken` precisely so it is unit-testable — appropriate given it gates a
credential write. The phase did not gold-plate.

---

_Reviewed 2026-05-22 · staffreview · diff base 18092111..HEAD_
