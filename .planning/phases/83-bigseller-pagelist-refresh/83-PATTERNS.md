# Phase 83: BigSeller pageList Refresh - Pattern Map

**Mapped:** 2026-05-21
**Files analyzed:** 9 (2 new, 7 modified)
**Analogs found:** 9 / 9 (every new/modified file has a strong in-repo analog)

> Scope note: 83-01a is already merged. This map covers the two remaining
> deliverables: **(1) Token auto-refresh + freshness banner (D-03/D-04)** and
> **(2) Sync optimizations O1/O2/O3/O4/O6 (D-05/D-06)**. 83-01b W1-W3 are archived
> (D-02) — no code, not mapped.

---

## File Classification

| New/Modified File | New? | Role | Data Flow | Closest Analog | Match |
|-------------------|------|------|-----------|----------------|-------|
| `src/lib/bigsellerToken.ts` → `decodeMucTokenExp()` | NEW | utility | transform | `convex/lib/jwt.ts` `decodeJwtPayload()` | exact |
| `src/components/salesAnalytics/BigSellerSyncPanel.tsx` (freshness banner) | MOD | component | request-response | in-file `tokenExpired` + COGS banners (this file, L330-346 / L500-511) | exact (same file) |
| `convex/integrations/bigseller/queries.ts` → `getRevenueByIds()` | NEW | query | CRUD (batch read → Map) | `getRevenueById` (same file L127-134) + `convex/orders/helpers/batchFetching.ts` (Map-return pattern) | exact |
| `convex/integrations/bigseller/sync.ts` (token capture, O1/O2/O3 + N+1 swap) | MOD | service/action | request-response + event-driven (scheduler) | self (existing fetch loop L690-714, poll L339-448, N+1 loops L875-925) | self |
| `convex/platformCredentials/mutations.ts` `updateToken` (widen validator) | MOD | mutation | CRUD | self (L56-84) | self |
| `convex/integrations/bigseller/config.ts` `BIGSELLER_PAGE_SIZE` 50→100 | MOD | config | n/a | self (L49) | self |
| `convex/integrations/bigseller/__tests__/sync.test.ts` (token-refresh + race tests) | MOD/NEW | test | n/a | `__tests__/cron.test.ts`, `__tests__/helpers.test.ts` (HAR-fixture lock pattern) | role-match |
| `convex/integrations/bigseller/__tests__/cron.test.ts` (O3 interval assertion) | MOD | test | n/a | self | self |
| `docs/SCHEMA.md` / `docs/CHANGELOG.md` / `docs/BIGSELLER_PROFIT_API.md` | MOD | docs | n/a | n/a | n/a |

---

## Pattern Assignments

### DELIVERABLE 1 — Token auto-refresh + freshness banner (D-03/D-04)

---

### `src/lib/bigsellerToken.ts` → `decodeMucTokenExp()` (NEW, utility, transform)

**Analog:** `convex/lib/jwt.ts` `decodeJwtPayload()` — the EXACT backend equivalent.
Copy this verbatim, then narrow the return to just `exp` (ms) for the banner.

**Core decode pattern** (`convex/lib/jwt.ts:5-15`, copy this exactly):
```typescript
export function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid JWT format");
  }
  // base64url -> base64 -> decode
  const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const json = atob(padded);   // atob exists in the browser too — works frontend
  return JSON.parse(json);
}
```

**exp→ms + daysRemaining derivation** (copy from `convex/integrations/bigseller/adapter.ts:117-133` — the `previewBigSellerToken` action already does exactly this math; the frontend helper should mirror it so the banner thresholds match the dialog):
```typescript
const exp = payload.exp as number | undefined;
if (exp === undefined || exp === null) { /* no expiry */ }
const expiresAt = exp * 1000;                                  // Unix seconds -> ms
const daysRemaining = Math.floor((expiresAt - Date.now()) / 86400000);
```

**Recommended frontend signature** (D-04: "base64url payload decode, no signature verification"):
```typescript
// src/lib/bigsellerToken.ts
// Returns exp in ms, or null if the token is malformed / has no exp.
// No signature verification — we trust the server-issued JWT (see 83-RESEARCH.md).
export function decodeMucTokenExp(mucToken: string): number | null {
  try {
    const parts = mucToken.split(".");
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded)) as { exp?: number };
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}
```

**Pitfall to honor:** the frontend already has a precedent for a parallel decoupled
impl of a backend helper (`src/lib/dateUtils.ts` `utcToWibDateStr` — intentionally
NOT banned by ESLint, see CLAUDE.md Pitfall #18 / D-13). `decodeMucTokenExp` is
the same situation: a frontend twin of `convex/lib/jwt.ts`. Do NOT try to import
the convex helper into `src/` — duplicate the ~8 lines.

**NOTE — possible simpler path:** `getHealthStatusAll` (`convex/platformCredentials/queries.ts:210`,
`PlatformHealthStatus.daysRemaining` L197) ALREADY computes BigSeller token
`daysRemaining` server-side and `SettingsTab.tsx:262` already derives
`bigsellerTokenExpired` from it. The banner could be driven entirely off
`bigsellerHealth.daysRemaining` with no new helper. D-04 explicitly asks for
`decodeMucTokenExp()` though — flag this to the planner as a "build the helper as
specified, OR reuse `daysRemaining`" decision. If reusing health data, the helper
becomes optional.

**Tests:** add `src/lib/__tests__/bigsellerToken.test.ts` — assert decode of a real
HAR JWT (use the `exp:1780911842` token from `83-RESEARCH.md:32`), malformed
(2-part / non-base64) → `null`, missing `exp` → `null`.

---

### `BigSellerSyncPanel.tsx` — freshness banner (MOD, component, request-response)

**Analog:** TWO banners already exist in THIS SAME FILE — copy their exact markup/classes.

**Yellow warning banner** — copy `tokenExpired` banner (`BigSellerSyncPanel.tsx:330-346`):
```tsx
{tokenExpired && (
  <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md px-3 py-2">
    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
    <span>Token expired -- paste new token to continue syncing.</span>
    {onOpenTokenDialog && (
      <Button variant="outline" size="sm" className="h-6 text-xs ml-auto" onClick={onOpenTokenDialog}>
        Paste Token
      </Button>
    )}
  </div>
)}
```
For the NEW yellow `<24h` banner: same `amber-*` classes, message
`Token expires in {N}h — paste fresh token`, same `Paste Token` button via
`onOpenTokenDialog`.

**Red blocking banner** — copy the multi-line amber pattern at L500-511 but swap
to `red-*` classes (the file already uses red for the failed-sync block at L447-460:
`bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900`). Red banner
blocks sync: it should set the `Sync Now` button `disabled` (the button at L277
already ANDs `tokenExpired` into `disabled` — extend that condition, or fold the
expired state into the existing `tokenExpired` prop).

**Color-threshold helper analog** — `BigSellerTokenDialog.tsx:149-153` shows the
exact green/yellow/red `daysRemaining` threshold function the project already uses:
```typescript
function getExpiryColorClass(daysRemaining: number): string {
  if (daysRemaining > 7) return "border-green-500 text-green-700 ...";
  if (daysRemaining >= 3) return "border-amber-500 text-amber-700 ...";
  return "border-red-500 text-red-700 ...";
}
```
D-04 uses a 2-state (24h yellow / expired red) variant — keep the same class
vocabulary.

**Countdown formatting:** reuse `formatCountdown` from `@/lib/formatters` (already
imported in `BigSellerTokenDialog.tsx:25`) for "N hours" display.

**Data source for the banner:** the panel needs the token `exp`. Two wiring options
(planner decides):
1. Pass `daysRemaining`/`tokenExpiresAt` down as a prop from `SettingsTab.tsx`
   (where `bigsellerHealth` already lives, L262) — mirrors the existing
   `tokenExpired` prop drilling (`SettingsTab.tsx:326`).
2. Call `decodeMucTokenExp()` on a token the panel fetches. Option 1 is cheaper
   (no new query, no token exposure to frontend) and matches the existing
   `tokenExpired={bigsellerTokenExpired}` pattern.

**Test analog:** `src/components/salesAnalytics/__tests__/BigSellerSyncPanel.test.tsx`
(exists, L54+) — extend it. Note its mock pattern at L22:
`useBigSellerSyncState: () => ({ data: { stage: "idle" }, isLoading: false })`.

---

### `convex/integrations/bigseller/sync.ts` — token capture (MOD, action, request-response)

**Analog:** self. Hook into the existing fetch loop in `fetchOrders`
(`sync.ts:690-714`) and the poll fetch in `pollSyncTask` (`sync.ts:364-371`).

**Capture point** — immediately after `responseText = await response.text();`
(currently `sync.ts:709`), before the `code` parse:
```typescript
// Accumulate freshest muctoken in OUTER scope (declare `let latestRefreshedToken = ""`
// alongside totalInserted at sync.ts:592).
const refreshedToken = response.headers.get("muctoken") ?? "";
if (refreshedToken && refreshedToken !== mucToken) {
  latestRefreshedToken = refreshedToken;
}
```

**Auth-error guard:** the loop already has TWO auth-abort points that `return` early —
`detectHtmlResponse` (L717-720) and `isJsonAuthError` (L743-747). Per the SPEC
defensive guard "skip persist if any auth error observed", set an
`authErrorObserved = true` flag at those points (or rely on the early `return`
meaning the end-of-sync persist block is never reached — early return already
satisfies the guard for these two cases).

**Persist-once-at-end** — after the per-platform loop completes (the SPEC says
"after the entire fetch loop completes successfully"), guarded:
```typescript
if (latestRefreshedToken && !authErrorObserved) {
  try {
    await ctx.runMutation(
      internal.platformCredentials.mutations.updateToken,
      {
        platformId: BIGSELLER_PLATFORM_ID,           // from ./config (L5)
        currentToken: latestRefreshedToken,
        tokenExpiresAt: /* decode exp*1000 via decodeJwtPayload from ../../lib/jwt */,
        lastRefreshAt: Date.now(),
        lastRefreshStatus: "auto-refreshed-from-response",
      }
    );
  } catch (err) {
    console.error("BigSeller token auto-refresh persist failed:", err);
    // do NOT fail the sync — we already have the data (SPEC guard)
  }
}
```
**Reuse `decodeJwtPayload` from `convex/lib/jwt.ts`** to set `tokenExpiresAt` so the
freshness banner / health query stays accurate (see `adapter.ts:109-126` for the
exact decode→exp*1000 usage already in this codebase). `updateToken` accepts
optional `tokenExpiresAt` (L60).

**`ctx.runMutation`/`ctx.runQuery` call style** — already used throughout this file
(e.g. L876-879, L603); mirror it.

---

### `convex/platformCredentials/mutations.ts` `updateToken` — MUST widen validator (MOD, mutation, CRUD)

**CRITICAL — schema-doc vs validator mismatch.** CONTEXT D-03/D-04 say "no
schema change needed — fields already exist." That is true for the Convex *table*,
but the `updateToken` **argument validator** at `mutations.ts:62` is:
```typescript
lastRefreshStatus: v.union(v.literal("success"), v.literal("error")),
```
Passing `"auto-refreshed-from-response"` will throw `ArgumentValidationError` at
runtime. The validator MUST be widened:
```typescript
lastRefreshStatus: v.union(
  v.literal("success"),
  v.literal("error"),
  v.literal("auto-refreshed-from-response"),
),
```
Check the `platformCredentials` table schema in `convex/schema.ts` too — if
`lastRefreshStatus` is typed as a `v.union(...)` literal there (not bare
`v.string()`), the SCHEMA also needs the new literal, contradicting the "no schema
change" note. **Flag this to the planner as a required correction to the D-03/D-04
"no schema change" assumption.** The handler body (L75-83) needs no change.

---

### DELIVERABLE 2 — Sync optimizations (D-05/D-06)

---

### `getRevenueByIds(ids): Map` (NEW, internalQuery, batch read → Map) — O4

**Primary analog:** `getRevenueById` in the SAME file (`queries.ts:127-134`) — the
N+1 culprit. The new query is its batch form:
```typescript
export const getRevenueById = internalQuery({
  args: { revenueId: v.id("externalRevenue") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.revenueId);
  },
});
```

**Map-return analog:** `convex/orders/helpers/batchFetching.ts:32-44` shows the
canonical `Promise<Map<Id<...>, Doc<...>>>` build pattern used elsewhere in the
repo:
```typescript
): Promise<Map<Id<"orders">, OrderDataBatch>> {
  const result = new Map<Id<"orders">, OrderDataBatch>();
  ...
}
```

**Recommended new query** (drop into `queries.ts` next to `getRevenueById`):
```typescript
export const getRevenueByIds = internalQuery({
  args: { revenueIds: v.array(v.id("externalRevenue")) },
  handler: async (ctx, args) => {
    const docs = await Promise.all(args.revenueIds.map((id) => ctx.db.get(id)));
    const map = new Map<string, Doc<"externalRevenue">>();
    docs.forEach((doc, i) => {
      if (doc) map.set(args.revenueIds[i], doc);
    });
    return map;   // Convex serializes Map; or return as Array<[id, doc]> if Map
  },              // serialization is a concern — confirm in test.
});
```
**Caveat (SPEC O4):** 200 ids × 32B = 6.4kB arg — well within limits. Internal-only,
no permission concerns. **Verify Convex Map-over-the-wire serialization** — if it
doesn't round-trip, return `Array<[id, doc]>` and build the Map on the caller side
(the `new Map(entries)` pattern at `convex/productionCounts/queries.ts:31`).

**Call-site swaps** in `sync.ts`:
- Loop 1 (`sync.ts:875-889`): replace per-id `getRevenueById` with one
  `getRevenueByIds(revenueIds)` then read from the map.
- Loop 2 (`sync.ts:917-925`, cross-platform leak guard): same map, no per-row query.
  Pre-fetch ONE batch after `saveRevenue` returns (SPEC O4).

---

### `pollSyncTask` adaptive polling (MOD, action, event-driven/scheduler) — O3

**Analog:** self. `pollSyncTask` (`sync.ts:339-448`) currently reschedules with a
flat constant:
```typescript
await ctx.scheduler.runAfter(
  BIGSELLER_POLL_INTERVAL_MS,                    // 60000 — config.ts:20
  internal.integrations.bigseller.sync.pollSyncTask,
  { ...args, pollAttempt: args.pollAttempt + 1 }
);
```
This `runAfter` reschedule appears 3× (L375-379 network-error, L415-419 invalid-JSON,
and the not-complete branch further down). **Change the DELAY argument per
`pollAttempt`, NOT the constant** (SPEC O3 caveat + Memory: "scheduler-chain via
`ctx.scheduler.runAfter` is the only scheduling primitive").

**Recommended:** add a helper (in `config.ts` or `helpers.ts`):
```typescript
// 15s ×3, 30s ×2, 60s thereafter. Max attempts unchanged (BIGSELLER_MAX_POLLS=8)
// so worst-case bound stays ~8 min.
export function pollDelayMs(pollAttempt: number): number {
  if (pollAttempt < 3) return 15000;
  if (pollAttempt < 5) return 30000;
  return 60000;
}
```
Replace all three `runAfter(BIGSELLER_POLL_INTERVAL_MS, ...)` with
`runAfter(pollDelayMs(args.pollAttempt), ...)`. Keep `BIGSELLER_MAX_POLLS` (config.ts:17)
at 8.

**Test analog / required change:** `cron.test.ts` references `pollAttempt` at L27/57/102.
The SPEC says a "60s assertion" must change — grep confirms no literal `60000`
currently in cron.test.ts, so the interval assertion may live in a sync test or be
new. **Add a unit test for `pollDelayMs`** (15/15/15/30/30/60/60/60 for attempts
0..7) and verify max-attempts bound is honored. This is the cleanest place to lock O3.

---

### `BIGSELLER_PAGE_SIZE` 50→100 (MOD, config) — O6

**Analog:** self. One number at `convex/integrations/bigseller/config.ts:49`:
```typescript
export const BIGSELLER_PAGE_SIZE = 50;
```
Consumed once at `helpers.ts:61` (`pageSize: BIGSELLER_PAGE_SIZE` inside
`buildPageListBody`). Change to `100`. SPEC O6: revert to 50 with an
empirical-limit comment if BigSeller returns `code:-1`. The HAR-fixture body-shape
lock test (`__tests__/fixtures/2026-05-19-*-pageList-body.json`, from 83-01a) will
need its `pageSize` expectation updated to 100 — see Shared Patterns below.

---

### `sync.ts` O1 (parallel platforms) + O2 (parallel pages 2..N) (MOD, action, request-response)

**Analog:** self. The sequential structures to parallelize:
- O1: `for (const [platform, shopIds] of platformShops)` at `sync.ts:676`.
  Wrap each platform body in an async fn, `Promise.all` them. `priceOracle`,
  `mappingBySku`, `menuProductById` are built once before the loop (L634-662) and
  read-only → safe for concurrent use (SPEC O1).
- O2: `while (pageNo <= totalPage)` at `sync.ts:690`. After page 1 reveals
  `totalPage`, fan out pages 2..N with `Promise.all`, cap concurrency at 4, order
  results by `pageNo` (SPEC O2).

**Concurrency analog in repo:** `Promise.all` over `ctx.db.get` is already used in
`convex/orders/helpers/batchFetching.ts` and `convex/reports/incomeStatement.ts:738`.
For capped concurrency (max 4), there is no existing batched-concurrency helper —
implement a simple chunked `Promise.all` (slice into groups of 4).

**Race caveats (SPEC O1):** `updateSyncStage` mutations from both platform branches
will race. SPEC recommends option (a): skip per-platform stage updates, only update
overall status. The cross-platform leak guard (`sync.ts:921-925`) is per-row → still
correct under concurrency.

**Required NEW tests (D-06):** concurrent platform write doesn't double-count;
page-2 failure in parallel mode still surfaces in the error log; these go in a
sync-action test file (create `__tests__/sync.test.ts` if absent — none exists yet,
the closest test analogs are `cron.test.ts` and `helpers.test.ts`).

---

## Shared Patterns

### JWT decode (no verification)
**Source:** `convex/lib/jwt.ts:5-15` `decodeJwtPayload()`
**Apply to:** `decodeMucTokenExp()` (frontend twin), `sync.ts` token-capture
`tokenExpiresAt` computation (reuse the backend export directly there).
**Math:** `expiresAt = exp * 1000`, `daysRemaining = Math.floor((expiresAt - Date.now()) / 86400000)` — `adapter.ts:117-133`.

### Internal query → Convex action call style
**Source:** `sync.ts:603`, `sync.ts:876-879` — `ctx.runQuery(internal.integrations.bigseller.queries.X, {...})`
**Apply to:** the new `getRevenueByIds` call site (O4), the `updateToken`
`ctx.runMutation(internal.platformCredentials.mutations.updateToken, ...)` call (D-03).

### Banner / alert markup
**Source:** `BigSellerSyncPanel.tsx:330-346` (amber), `:447-460` (red), `:500-511` (amber multi-line)
**Apply to:** the new 2-state freshness banner. Classes:
amber = `text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800`;
red = `bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900`.
Icon: `AlertTriangle` from lucide-react (already imported).

### HAR-fixture body-shape lock tests
**Source:** `convex/integrations/bigseller/__tests__/fixtures/2026-05-19-*-pageList-body.json` + `helpers.test.ts` (83-01a, staffreview I1 / Memory lesson 83-01a)
**Apply to:** O6 `pageSize` change MUST update the fixture's `pageSize` and the lock
test's bidirectional (missing AND extra keys) assertion. Per Memory lesson: fixture
JSON is the SINGLE source of truth — do not inline arrays in the test.

### Map-return query
**Source:** `convex/orders/helpers/batchFetching.ts:32-44`, `convex/productionCounts/queries.ts:31` (`new Map(arr.map(...))`)
**Apply to:** `getRevenueByIds` (O4).

---

## No Analog Found

None. Every artifact has a strong in-repo analog (most are self-modifications or
exact twins of `convex/lib/jwt.ts` / `getRevenueById`). RESEARCH.md code examples
are NOT needed as fallback — prefer the codebase analogs above.

---

## Planner Flags (read before writing plans)

1. **D-03/D-04 "no schema change" is incomplete** — `updateToken`'s argument
   validator (`mutations.ts:62`) AND possibly the `platformCredentials` table schema
   (`convex/schema.ts`) must add the `"auto-refreshed-from-response"` literal, or the
   mutation throws `ArgumentValidationError`. Add a plan task for it.
2. **`decodeMucTokenExp()` may be redundant** — `getHealthStatusAll.daysRemaining`
   already computes BigSeller token freshness server-side and is already wired into
   `SettingsTab.tsx:262`. The banner could reuse it with zero new helper/query. D-04
   asks for the helper explicitly — planner should either build it as specified or
   decide to reuse `daysRemaining` (cheaper, no token exposed to frontend).
3. **O3 "60s assertion"** — no literal `60000` exists in `cron.test.ts` today; the
   assertion to update is likely implicit. Anchor O3 with a new `pollDelayMs` unit
   test rather than hunting a stale assertion.
4. **No sync-action test file exists** — O1/O2 race tests and D-03 token-refresh
   tests need a new `convex/integrations/bigseller/__tests__/sync.test.ts`. Closest
   structural analogs: `cron.test.ts`, `helpers.test.ts`.
5. **Convex Map serialization** — confirm `getRevenueByIds` returning a `Map`
   round-trips over `ctx.runQuery`; fall back to `Array<[id, doc]>` + caller-side
   `new Map(entries)` if not.

---

## Metadata

**Analog search scope:** `convex/integrations/bigseller/**`, `convex/lib/jwt.ts`,
`convex/platformCredentials/**`, `convex/orders/helpers/batchFetching.ts`,
`src/lib/**`, `src/components/salesAnalytics/**`
**Files scanned:** ~14 (read in full or targeted)
**Pattern extraction date:** 2026-05-21
