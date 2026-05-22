# Phase 83.01a — Additive Schema Fix (ship-first)

> **Status:** Ready to execute. Approved by staffreview 2026-05-19 (`docs/reviews/staffreview-83-bigseller-pagelist-refresh-2026-05-19.md`).
> **Urgency:** P1. Production BigSeller data has been stale since 2026-04-22 (27 days).
> **Estimated effort:** ~40 LOC change, ~50 LOC test updates, 1 fixture, ~60 min including verify.
> **Scope discipline:** ADDITIVE ONLY. We ADD the 6 newly-required fields. We do NOT trim `orderState`, do NOT change `currency`, do NOT change `searchContent`. Conservative-by-design — those changes live in 83-01b as a fallback only if 83-01a alone is insufficient.

## Why split (per staffreview C1)

Three independent risk vectors were bundled in the original plan:

| Class | Action | Risk | Lives in |
|---|---|---|---|
| Additive | Add 6 new required fields | Low (BigSeller's error contract says these cause `code:-1`) | **83-01a (THIS plan)** |
| Subtractive | Drop `"canceled"` + `"new"` from `orderState` | High (silent data loss if BigSeller still accepts them) | 83-01b (only if 01a fails) |
| Value-mutation | `currency: "IDR"` → `""`, `searchContent: null` → `""` | Medium (1-sample HAR per platform) | 83-01b (only if 01a fails) |

If 83-01a restores sync, 83-01b is archived and we document that the legacy `orderState` values are still accepted by BigSeller.

## Git Workflow

**Branch:** `fix/bigseller-pagelist-additive-83-01a`
**Base:** `main` (pull current; confirm Phase 81 merge `e040b953` present)
**Checkpoints:**
1. After helpers.ts + test edits: `npm run test -- bigseller`
2. After fixture promotion: `npm run test` (full suite, no cross-module regressions)
3. After docs: `npm run lint`
4. Build gate: `npm run build`
5. **Triple-review gate** per CLAUDE.md (vendor-API contract change)
6. Merge → main → manual backfill (chunked per C3)

## Implementation Waves

### Wave 1: Backend [SEQUENTIAL — single source file]

| Agent | Task | Files |
|---|---|---|
| convex-backend | Add 6 required fields to `buildPageListBody`; introduce `isPlatformSpecific` switch for `groupType` (int 0 vs string ""), `orderStatus` (present only on platform endpoints), and `searchContent` (KEEP `null` for now per refinement R2) | `convex/integrations/bigseller/helpers.ts` |

**Exact change to `buildPageListBody` (helpers.ts:43-78):**

```ts
export function buildPageListBody(
  startDate: string,
  endDate: string,
  pageNo: number,
  shopIds: number[] = BIGSELLER_FROLLIE_SHOP_IDS,
  platformTemplate: "common" | "shopee" | "tiktok" = "common",
): Record<string, unknown> {
  const isPlatformSpecific = platformTemplate === "shopee" || platformTemplate === "tiktok";

  return {
    pageNo,
    pageSize: BIGSELLER_PAGE_SIZE,
    searchType: "order",
    platformTemplate,
    startTime: startDate,
    endTime: endDate,
    timeType: "orderCreatedTime",
    currency: "IDR",
    // 83-01a INTENTIONALLY keeps "canceled"+"new" — see staffreview C1.
    // If sync still returns code:-1 after this fix, escalate to 83-01b
    // which trims these values.
    orderState: ["completed", "shipped", "canceled", "other", "new"],
    queryType: "sku",
    orderType: "orderNo",
    orderBy: "",
    desc: false,
    inquireType: 0,
    platforms: [],
    shopIds,
    warehouseIds: [],
    searchContent: null,
    adjustmentUpdateTimeStartTime: null,
    adjustmentUpdateTimeEndTime: null,
    lableIds: null,
    hasLable: "",
    sampleOrder: null,
    dimension: "",
    evalationOrder: "",
    categoryList: "",

    // ── NEW REQUIRED FIELDS (HAR-verified 2026-05-19) ────────────────────
    // Omitting any of these causes BigSeller to return code:-1
    // "Failed, please try again later" with no field-name indication.
    // Source: `docs/BIGSELLER_PROFIT_API.md` Shared Request Schema, and
    // captured HAR at .planning/phases/83-bigseller-pagelist-refresh/
    // 83-RESEARCH.md "Field-by-field diff" section.

    /** Settlement filter. `1` = settled orders only. */
    settleStatus: 1,
    /** Transaction-status filter. Empty string = no constraint. */
    transactionStatus: "",
    /** Fulfilled-by-Shopee filter. Empty string = exclude FBS. */
    fbsOrder: "",
    /** Group dimension. int 0 on common; empty string on shopee/tiktok. */
    groupType: isPlatformSpecific ? "" : 0,
    /** Currency for response totals. ISO code. */
    totalCurrency: "IDR",
    /** Per-row order-status filter. Sent only on platform-specific endpoints. */
    ...(isPlatformSpecific ? { orderStatus: [] } : {}),
  };
}
```

### Wave 2: Tests [SEQUENTIAL after Wave 1]

| Agent | Task | Files |
|---|---|---|
| tdd-test-architect | Update existing test assertions; add 3 new tests; add HAR fixtures | `convex/integrations/bigseller/__tests__/helpers.test.ts` + new fixture files |

**Exact existing-test updates (per staffreview C2):**

`convex/integrations/bigseller/__tests__/helpers.test.ts`:

```diff
   it("includes all required fields", () => {
     const body = buildPageListBody("2026-01-01", "2026-01-31", 1, [5090946, 5092855]);
     expect(body).toHaveProperty("searchType", "order");
     expect(body).toHaveProperty("platformTemplate", "common");
     expect(body).toHaveProperty("currency", "IDR");
     expect(body).toHaveProperty("queryType", "sku");
     expect(body).toHaveProperty("orderState");
     expect(Array.isArray(body.orderState)).toBe(true);
-    expect((body.orderState as string[]).length).toBe(5);
+    // 83-01a keeps all 5 orderState values; 83-01b may trim. Re-pin if 01b lands.
+    expect((body.orderState as string[]).length).toBe(5);
+    // ── NEW: required-field presence (HAR 2026-05-19) ──
+    expect(body).toHaveProperty("settleStatus", 1);
+    expect(body).toHaveProperty("transactionStatus", "");
+    expect(body).toHaveProperty("fbsOrder", "");
+    expect(body).toHaveProperty("groupType", 0); // int on common endpoint
+    expect(body).toHaveProperty("totalCurrency", "IDR");
     expect(body).toHaveProperty("shopIds", [5090946, 5092855]);
     // ... rest unchanged
   });
```

**New test block:**

```ts
describe("buildPageListBody — platform-specific shape", () => {
  it("shopee body adds orderStatus and uses empty-string groupType", () => {
    const body = buildPageListBody("2026-01-01", "2026-01-31", 1, [5090946], "shopee");
    expect(body).toHaveProperty("platformTemplate", "shopee");
    expect(body).toHaveProperty("orderStatus", []);
    expect(body).toHaveProperty("groupType", ""); // string, not int
    expect(body).toHaveProperty("settleStatus", 1);
    expect(body).toHaveProperty("totalCurrency", "IDR");
  });

  it("tiktok body has the same shape as shopee with platformTemplate switched", () => {
    const shopee = buildPageListBody("2026-01-01", "2026-01-31", 1, [5092855], "shopee");
    const tiktok = buildPageListBody("2026-01-01", "2026-01-31", 1, [5092855], "tiktok");
    expect(tiktok.platformTemplate).toBe("tiktok");
    expect(shopee.platformTemplate).toBe("shopee");
    // Strip template, everything else must match
    const stripTemplate = (b: Record<string, unknown>) => {
      const c = { ...b };
      delete c.platformTemplate;
      return c;
    };
    expect(stripTemplate(tiktok)).toEqual(stripTemplate(shopee));
  });

  it("common body does NOT include orderStatus field", () => {
    const body = buildPageListBody("2026-01-01", "2026-01-31", 1);
    expect(body).not.toHaveProperty("orderStatus");
    expect(body).toHaveProperty("groupType", 0); // int 0 on common
  });
});
```

**HAR fixture lock test (per staffreview I1):**

Create `convex/integrations/bigseller/__tests__/fixtures/2026-05-19-shopee-pageList-body.json` etc., copied from `tmp/har-analysis/profit/*.md` request-body section. Then:

```ts
import shopeeFixture from "./fixtures/2026-05-19-shopee-pageList-body.json";
import tiktokFixture from "./fixtures/2026-05-19-tiktok-pageList-body.json";

describe("buildPageListBody — HAR fixture body-shape lock", () => {
  it("shopee body contains every key the captured-working shopee HAR body contains", () => {
    const body = buildPageListBody("2026-04-19", "2026-05-19", 1, [], "shopee");
    const ours = new Set(Object.keys(body));
    const theirs = new Set(Object.keys(shopeeFixture));
    const missing = [...theirs].filter((k) => !ours.has(k));
    // 83-01a may still leave gaps (orderState/currency/searchContent intentionally
    // not aligned to HAR). Allow that set; fail on any OTHER missing key.
    const KNOWN_DIFFS = new Set<string>(); // empty for 01a — see 01b for the diff window
    const unexpected = missing.filter((k) => !KNOWN_DIFFS.has(k));
    expect(unexpected).toEqual([]);
  });

  // Same shape for tiktok
});
```

> The fixture-based test catches NEW drift (BigSeller adding another field) without needing a code change. Future operator workflow when sync fails: capture new HAR → update fixture → test tells you exactly which key is missing.

### Wave 3: Docs [PARALLEL with Wave 2]

| Agent | Task | Files |
|---|---|---|
| convex-backend | Add 6 new required fields to "Shared Request Schema (Profit)" table; add "2026-05-19 schema drift" entry to Known Limitations; bump "Last Verified" date | `docs/BIGSELLER_PROFIT_API.md` |

### Wave 4: Verification [SEQUENTIAL after Waves 1+2+3]

| Agent | Task |
|---|---|
| Bash | `npm run type-check` |
| Bash | `npm run lint` |
| Bash | `npm run test -- bigseller` (helpers + helpers-edge-cases + sync + cron tests) |
| Bash | `npm run test` (full suite — catches regression in unrelated modules) |
| Bash | `npm run build` |
| code-auditor | Audit diff for type safety, no `any` regressions, no `// removed` debris |
| Skill: triple-review | Triple-review gate per CLAUDE.md execute-phase rules |
| user (manual) | Backfill per runbook below |

## Backfill Runbook (per staffreview C3 — chunked 14-day windows)

After merge to `main` and CI deploy completes:

1. Open `/admin` → BigSeller card.
2. Confirm "Connected" green dot. If token shows < 24 hours remaining, paste a fresh token first.
3. **Chunk 1:**
   - Start Date: `22/04/2026` (the day after our last good ingest)
   - End Date: `05/05/2026` (14 days)
   - Click "Sync Now"
   - Wait for "Complete" stage (~2-8 min)
   - Verify "Synced Orders" table shows rows dated 22 Apr–05 May
   - Sanity-check `totalSize` shown by BigSeller's profit page (logged in
     parallel browser tab) matches the count ingested
4. **Chunk 2:**
   - Start Date: `06/05/2026`
   - End Date: `19/05/2026` (today)
   - Repeat verify steps
5. Nightly cron resumes its trailing 7-day window on next run (20:00 UTC = 03:00 WIB).

**If a chunk fails with `code:-1` and our error message reads "Failed, please try again later":**
- Wait 5 min, retry once (BigSeller's readiness-race is real)
- If it fails again: escalate to **83-01b** (subtractive fallback)

## Failure Modes & Rollback (per staffreview C4)

### Failure modes during manual verify

1. **Still returns `code:-1` with a NEW message (not "Failed, please try again later")**
   → BigSeller added yet another field. Action: re-capture HAR, diff, ship as 83-01a.2 patch. ETA <2h.

2. **Returns `code:-1` with our familiar "Failed, please try again later"**
   → Probably the readiness-race retry. Wait 5 min, retry. If 3 retries fail, escalate to 83-01b.

3. **Returns `code:401006` (auth)**
   → Token expired. Paste fresh token. Unrelated to this fix.

4. **Returns 200/`code:0` with `totalSize: 0` for a date range we KNOW has orders**
   → Server-side `orderState` validation may have silently filtered our `"canceled"`/`"new"` values to 0. Escalate to **83-01b**.

5. **Shopee succeeds, TikTok fails (or vice versa)**
   → Per-platform field variance. Capture per-platform HAR, diff each body, ship targeted fix.

### Rollback

The fix touches a single function (`buildPageListBody`) plus tests + docs. If the fix produces a WORSE state than current:

```bash
git revert <commit-sha>
git push origin main
```

This restores the prior (broken) `buildPageListBody`. The cron will resume its already-broken sync but introduces no new failure modes vs the current state. Manual operators can paste a token and retry via existing `BigSellerSyncPanel` after revert. **No database cleanup needed** — the fix doesn't write anything new; it only changes what we *send* upstream.

If 83-01a IS the rollback target and 83-01b had also landed, revert 01b first to isolate which one introduced the regression.

## Documentation Updates

- [ ] `docs/CHANGELOG.md` — Phase 83.01a entry (template in staffreview report §9)
- [ ] `docs/BIGSELLER_PROFIT_API.md` — Shared Request Schema table + Known Limitations + "Last Verified: 2026-05-19"
- [ ] `MEMORY.md` (lessons) — append a 2-line note: "BigSeller pageList silently grew 6 required fields between Feb 2026 and May 2026 — fixed in 83-01a. When sync returns code:-1 with no msg, first action: capture HAR and diff body shape."

## Success Criteria

- [ ] `npm run type-check` passes
- [ ] `npm run lint` passes
- [ ] `npm run test -- bigseller` passes (existing + new tests)
- [ ] `npm run test` (full suite) passes
- [ ] `npm run build` succeeds
- [ ] HAR-fixture body-shape lock tests pass for shopee + tiktok (per staffreview I1)
- [ ] Manual backfill Chunk 1 (22 Apr–05 May) returns `totalOrders > 0`, ingests into `bigsellerOrders`
- [ ] Manual backfill Chunk 2 (06 May–19 May) returns `totalOrders > 0`, ingests into `bigsellerOrders`
- [ ] Most-recent row date in admin "Synced Orders" table = 19 May 2026 (or later if new orders landed)
- [ ] `externalRevenue` rows materialize for ingested orders
- [ ] `externalRevenueItems` (Phase 79) child rows materialize for orders with `skuVoList`
- [ ] Sales Analytics page renders May 2026 BigSeller orders correctly

## Decision tree after merge

```
Manual Chunk 1 sync result:
├─ totalOrders > 0 with newer dates than 22 Apr
│  ├─ Sanity totals match BigSeller's own web UI → SUCCESS, run Chunk 2
│  └─ Totals don't match → investigate field-level diff; do NOT ship 01b
├─ code:-1 "Failed, please try again later"
│  ├─ Retry after 5 min, up to 3 times → may succeed (readiness race)
│  └─ Persistent fail → escalate to 83-01b
├─ code:-1 with DIFFERENT message
│  └─ Re-capture HAR, diff, ship 83-01a.2 patch (~2h ETA)
└─ code:401006 → token expired, unrelated; user re-pastes
```

## Out of scope (deferred)

- Trimming `orderState` ("canceled" / "new") — only in 83-01b, only if 01a fails
- Switching `currency` to `""` — only in 83-01b, only if 01a fails
- Switching `searchContent` to `""` — only in 83-01b, only if 01a fails
- Token auto-refresh from response header (`muctoken` header) — see **83-01b** Wave 5
- All sync-speed optimizations (parallel platforms, parallel pages, adaptive polling, N+1 elim, pageSize bump) — see **83-02**
