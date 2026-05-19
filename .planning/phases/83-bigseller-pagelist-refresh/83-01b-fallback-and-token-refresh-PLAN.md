# Phase 83.01b — Subtractive Fallback + Token Auto-Refresh

> **Status:** CONDITIONAL — execute ONLY if 83-01a manual backfill returns `code:-1` or `totalSize:0` for known-non-empty windows. Otherwise, ARCHIVE this file and document in CHANGELOG that the legacy `orderState` values are still accepted by BigSeller.
>
> The **token auto-refresh (Wave 5)** is unconditional — promoted from 83-02 per staffreview I5. Ship it alongside any 01b activity, OR as a standalone PR if 01a is successful and 01b's subtractive changes aren't needed.

## What's in this plan

| Sub-wave | Action | Condition |
|---|---|---|
| Wave 1: Subtractive orderState | Drop `"canceled"` + `"new"` from default `orderState` array | Only if 01a fails with persistent `code:-1` |
| Wave 2: currency switch | `currency: "IDR"` → `""` on platform endpoints | Only if 01a Chunk 1 returns 0 rows |
| Wave 3: searchContent switch | `null` → `""` on platform endpoints | Only if 01a/02 still fails per-platform |
| **Wave 4: Token auto-refresh** | Capture `muctoken` from response headers + persist | **UNCONDITIONAL** (per staffreview I5) |

## Git Workflow

**Branch:** `fix/bigseller-pagelist-fallback-83-01b`
**Base:** `main` AFTER 83-01a has merged
**Checkpoints:** Same as 83-01a; triple-review gate per CLAUDE.md.

## Wave 1: Subtractive orderState — IF needed

**Trigger:** 83-01a manual sync returns `code:-1` with "Failed, please try again later" persistently (3+ retries over 15 min), AND a freshly-captured HAR confirms `orderState: ["completed","shipped","other"]` works on a manual browser-side BigSeller request.

**Change to `buildPageListBody`:**

```diff
-    // 83-01a INTENTIONALLY keeps "canceled"+"new" — see staffreview C1.
-    // If sync still returns code:-1 after this fix, escalate to 83-01b
-    // which trims these values.
-    orderState: ["completed", "shipped", "canceled", "other", "new"],
+    // 83-01b: BigSeller now rejects "canceled" + "new" — confirmed by
+    // manual browser HAR-capture on <DATE>. Removing them restored
+    // ingestion. Cancelled orders may need a separate query in future
+    // if business needs them; out of scope here.
+    orderState: ["completed", "shipped", "other"],
```

**Test updates:**

```diff
   it("includes all required fields", () => {
     ...
-    expect((body.orderState as string[]).length).toBe(5);
+    expect((body.orderState as string[]).length).toBe(3);
   });

-  it("includes all 5 order states including new", () => {
-    const body = buildPageListBody("2026-01-01", "2026-01-31", 1, []);
-    const states = body.orderState as string[];
-    expect(states).toContain("completed");
-    expect(states).toContain("shipped");
-    expect(states).toContain("canceled");
-    expect(states).toContain("other");
-    expect(states).toContain("new");
-  });
+  it("orderState contains 3 BigSeller-accepted values; no canceled or new", () => {
+    const body = buildPageListBody("2026-01-01", "2026-01-31", 1, []);
+    const states = body.orderState as string[];
+    expect(states).toEqual(["completed", "shipped", "other"]);
+    expect(states).not.toContain("canceled");
+    expect(states).not.toContain("new");
+  });
```

**Data-loss caveat to document in CHANGELOG:**

> Phase 83.01b: BigSeller no longer accepts `"canceled"` and `"new"` in the `orderState` filter. From this date forward, the BigSeller profit-data pipeline no longer ingests rows for orders in those states. **Backward impact:** historical rows already in `bigsellerOrders` table for those states remain. Going forward, our P&L and Sales Analytics views may slightly under-count cancellations. If business needs reinstating these, follow up by issuing a separate `pageList` call per state and merging in-memory.

## Wave 2: currency value-mutation — IF needed

**Trigger:** Wave 1 (or no-op if Wave 1 not needed) still returns `code:-1` on platform endpoints, AND fresh HAR confirms `currency: ""` works.

**Change:**

```diff
-    currency: "IDR",
+    // BigSeller now sources currency from totalCurrency; primary currency
+    // field must be empty on platform endpoints. Common may still accept "IDR".
+    currency: isPlatformSpecific ? "" : "IDR",
```

## Wave 3: searchContent — IF needed

**Trigger:** Wave 2 still rejects platform endpoints, AND fresh HAR confirms `""` works.

**Change:**

```diff
-    searchContent: null,
+    searchContent: isPlatformSpecific ? "" : null,
```

## Wave 4: Token auto-refresh (UNCONDITIONAL)

> Lifted out of 83-02 per staffreview I5. ~10 LOC. Eliminates the 20-day token-decay operational toil where users have to repaste tokens manually.

### Mechanism

Every successful BigSeller response carries a refreshed `muctoken` JWT in its response headers (HAR-verified: see 83-RESEARCH.md JWT decode). The browser captures it and replays it on the next request, sliding the 20-day TTL forward indefinitely.

Our action-runtime fetches don't currently capture this. As a result, the cron eventually fails because the token wasn't replayed and the JWT `exp` lapses after the original 20-day window.

### Implementation

In `convex/integrations/bigseller/sync.ts:fetchOrders` (and `triggerSync`, `pollSyncTask`), after each successful `fetch`:

```ts
// Inside the per-page loop in fetchOrders, after responseText is captured
// and BEFORE we parse for `code` value:
const refreshedToken = response.headers.get("muctoken") ?? "";
if (refreshedToken && refreshedToken !== mucToken) {
  latestRefreshedToken = refreshedToken; // accumulate in outer scope
}

// After the entire fetch loop completes successfully (totalInserted/Updated > 0
// or all platforms processed without auth error):
if (latestRefreshedToken) {
  await ctx.runMutation(
    internal.platformCredentials.mutations.updateToken,
    {
      platformId: BIGSELLER_PLATFORM_ID,
      currentToken: latestRefreshedToken,
      lastRefreshAt: Date.now(),
      lastRefreshStatus: "auto-refreshed-from-response",
    }
  );
}
```

**Why update ONCE at end (not per-page):**
- Avoids race with concurrent cron + manual sync writes to the same `platformCredentials` row
- Each response carries a NEWER JWT than the last (server refreshes per request), so the last one is the freshest
- Single mutation = single Convex write = cheaper

**Defensive guards:**
- Skip the update if `latestRefreshedToken` is empty or equals the current token
- Skip if any auth error was observed during the sync (don't overwrite a known-good token with a token from a session the server may have killed)
- Wrap the mutation in try/catch — if persistence fails, log it but don't fail the sync (we already have the data)

**Test additions:**

```ts
// convex/integrations/bigseller/__tests__/sync.test.ts (or wherever sync action tests live)
describe("BigSeller token auto-refresh", () => {
  it("persists a refreshed muctoken from response headers after successful fetch", async () => {
    // Mock fetch to return a response with `muctoken` header
    // Assert that updateToken was called with the new token
  });

  it("does NOT persist when refreshed token equals current token", async () => {
    // Mock fetch returning header equal to current token
    // Assert no updateToken call
  });

  it("does NOT persist when an auth error was detected during the sync", async () => {
    // Mock first-page success + second-page 401
    // Assert no updateToken call
  });
});
```

**Schema check:** `platformCredentials` table already has `currentToken`, `lastRefreshAt`, `lastRefreshStatus` fields — no schema change required. Add `"auto-refreshed-from-response"` to the documented values of `lastRefreshStatus` in `docs/SCHEMA.md`.

### UI update (small, paired with Wave 4)

Per staffreview I3, `BigSellerSyncPanel` should display token-freshness:
- If `exp - now < 24h`: yellow banner "Token expires in <N> hours — paste fresh token"
- If `exp - now < 0`: red banner blocking sync attempts

JWT decode is trivial (the header `{"alg":"HS256","typ":"JWT"}` and base64url payload — no signature verification needed client-side; we trust whatever the server gave us). Add a tiny `decodeMucTokenExp()` helper in `src/lib/`.

After Wave 4 lands, the 24h-warning banner should rarely appear (auto-refresh keeps the token rolling forward). When it DOES appear, it indicates the cron has been failing for ~19 days — actionable signal.

## Documentation Updates

- [ ] `docs/CHANGELOG.md` — 83.01b entry covering whichever waves shipped
- [ ] `docs/BIGSELLER_PROFIT_API.md` — update "Last Verified" date AND new known-good `orderState` if Wave 1 lands; document token auto-refresh mechanism
- [ ] `docs/SCHEMA.md` — `platformCredentials.lastRefreshStatus` value `"auto-refreshed-from-response"`
- [ ] `MEMORY.md` (lessons) — append: "BigSeller muctoken is a 20-day sliding JWT; server refreshes it in the response `muctoken` header on every request. Capturing + persisting that header keeps the token alive indefinitely (Phase 83-01b Wave 4)."

## Success Criteria

### If Waves 1/2/3 execute:
- [ ] Manual backfill chunks succeed
- [ ] `totalOrders` matches expected counts from BigSeller's own web UI
- [ ] Data-loss caveat documented in CHANGELOG (Wave 1)

### Wave 4 (unconditional):
- [ ] After a successful sync, `platformCredentials.currentToken` is updated to a fresh JWT
- [ ] Decoded `exp` of the new token is `now + 20 days` (±5 min)
- [ ] After running the nightly cron 20+ days in a row (or simulating), the token does NOT expire
- [ ] All new sync tests pass
- [ ] `npm run build` succeeds

## Rollback

Same approach as 83-01a — single-file fix, no DB writes, `git revert` restores prior state.

If Wave 4's auto-refresh causes the credential row to receive a bad token (e.g., the server returned a degraded token during a partial-failure response), the manual "Paste Token" UI is the recovery path. Wave 4's defensive guards (don't overwrite during auth-error syncs) make this scenario unlikely but not impossible.
