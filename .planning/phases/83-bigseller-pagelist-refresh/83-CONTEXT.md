# Phase 83: BigSeller pageList Refresh - Context

**Gathered:** 2026-05-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Restore and harden the BigSeller profit-data sync. The urgent correctness fix
(83-01a — 6 new required pageList fields) is **already merged (#161) and
confirmed working in prod**: orders are ingesting again. This phase covers the
**two remaining, independent follow-ups**:

1. **Token auto-refresh** — capture the refreshed `muctoken` JWT from BigSeller
   response headers and persist it, sliding the 20-day TTL forward so the cron
   never dies from token decay and staff stop manually repasting tokens.
2. **Sync speed-up (83-02)** — reduce manual full-month sync runtime from
   ~6-10 min to ~1-2 min via N+1 elimination, adaptive polling, larger page
   size, and platform/page parallelization.

**Not in this phase:** the schema fix itself (shipped in 83-01a) and the
subtractive `orderState`/`currency`/`searchContent` fallback (83-01b W1-W3 —
**archived**, see D-02).

</domain>

<decisions>
## Implementation Decisions

### 83-01a outcome (gates everything else)
- **D-01:** 83-01a (additive 6-field pageList fix) **worked in prod** after the
  manual backfill — sync ingests orders again, `code:-1` is gone. This
  resolves the decision tree in `83-01a-SUMMARY.md` down the "SUCCESS" branch.

### 83-01b subtractive fallback (W1-W3)
- **D-02:** **Archive — document only.** Because 01a worked, the subtractive
  changes (drop `"canceled"`+`"new"` from `orderState`, switch `currency`/
  `searchContent` to `""`) are NOT shipped — they would lose cancellation data
  with no upside. Action for planning: update CHANGELOG to record that BigSeller
  still accepts the legacy `orderState` values as of the 01a backfill date, and
  keep `83-01b-fallback-and-token-refresh-PLAN.md` W1-W3 as a documented standby
  re-trigger path if BigSeller drifts again. No code, no data-loss caveat.

### Token auto-refresh + freshness UI (was 83-01b W4 + I3)
- **D-03:** **Ship it — unconditional.** This is independent of the pageList
  fix (it only lived in the 01b file because staffreview I5 moved it there from
  83-02). Relabel out of the misleading "01b fallback" framing into its own
  deliverable. Mechanism: in `convex/integrations/bigseller/sync.ts` capture
  `response.headers.get("muctoken")` after each successful fetch, accumulate the
  freshest one in outer scope, and persist ONCE at end of a successful sync via
  `platformCredentials.mutations.updateToken` (`lastRefreshStatus:
  "auto-refreshed-from-response"`). See `83-01b-...-SPEC.md` Wave 4 for the full
  spec, defensive guards (skip if empty / equals current / auth error observed,
  wrap in try/catch), and tests.
- **D-04:** **Ship the freshness banner with it** (staffreview I3). On
  `BigSellerSyncPanel`: yellow "token expires in <N>h — paste fresh token" when
  `exp - now < 24h`, red blocking banner when expired. Add a `decodeMucTokenExp()`
  helper in `src/lib/` (base64url payload decode, no signature verification —
  trust the server-issued token). After auto-refresh lands, this banner should
  rarely fire; when it does it means the cron has been failing ~19 days
  (actionable signal). No `platformCredentials` schema change needed (fields
  already exist) — only document the new `lastRefreshStatus` value in
  `docs/SCHEMA.md`.

### 83-02 sync optimizations (all 5 in scope)
- **D-05:** **All five optimizations are in scope**, executed **low-risk first**
  per the plan's recommended order:
  1. **O4** N+1 elimination — add `getRevenueByIds()` batch lookup, replace ~400
     sequential `getRevenueById` calls. Pure refactor, easiest to test.
  2. **O3** adaptive polling — 15s×3 / 30s×2 / 60s ramp instead of flat 60s×8;
     keep max 8 attempts so worst-case bound is unchanged. Update the
     `cron.test.ts` 60s-interval assertion.
  3. **O6** pageSize 50→100 — one number; revert to 50 with an empirical-limit
     comment if BigSeller returns `code:-1`.
  4. **O2** parallel pages 2..N within a platform — `Promise.all` after page 1
     reveals `totalPage`; cap concurrency at 4; order results by `pageNo`.
  5. **O1** parallel platforms (Shopee + TikTok) — `Promise.all` the per-platform
     loop; biggest win, biggest risk; do last.
- **D-06:** **Separate PRs, separate triple-reviews.** O1+O2 paired in one PR
  (concurrency work, needs new race-condition tests); O3, O4, O6 each standalone.
  Token auto-refresh + banner (D-03/D-04) is its own PR, independent of 83-02.
  All must keep the existing `bigseller` test suite green and pass `npm run build`.

### Claude's Discretion
- Exact branch names, plan-file naming for the relabeled token-refresh
  deliverable, and PR sequencing within the low-risk-first order.
- Whether O6 (pageSize 100) survives — empirical; revert if rejected.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 83 artifacts
- `.planning/phases/83-bigseller-pagelist-refresh/83-OVERVIEW.md` — root cause, auth model, architecture, blast radius, deliverable split
- `.planning/phases/83-bigseller-pagelist-refresh/83-RESEARCH.md` — HAR diff, decoded JWT, working endpoints, response schema, token-refresh mechanism
- `.planning/phases/83-bigseller-pagelist-refresh/83-01a-SUMMARY.md` — what shipped in the merged fix + the outcome decision tree (now resolved: SUCCESS branch)
- `.planning/phases/83-bigseller-pagelist-refresh/83-01b-fallback-and-token-refresh-SPEC.md` — **Wave 4** is the token auto-refresh spec (D-03); W1-W3 are archived (D-02)
- `.planning/phases/83-bigseller-pagelist-refresh/83-02-sync-optimization-SPEC.md` — O1-O4/O6 specs, caveats, suggested execution order (D-05/D-06)
- `docs/reviews/staffreview-83-bigseller-pagelist-refresh-2026-05-19.md` — origin of the W4-promotion (I5) and freshness-banner (I3) decisions

### API + integration docs
- `docs/BIGSELLER_PROFIT_API.md` — pageList contract; "all fields required / silent code:-1" behavior; update "Last Verified" + token auto-refresh mechanism after this phase
- `docs/SCHEMA.md` — `platformCredentials` table; document the `lastRefreshStatus: "auto-refreshed-from-response"` value
- `docs/CHANGELOG.md` — ALWAYS update after merge; record 01b W1-W3 archival rationale (D-02)

### Code touchpoints
- `convex/integrations/bigseller/sync.ts` — `fetchOrders` / `triggerSync` / `pollSyncTask` (token capture D-03; O1/O2/O3 D-05; N+1 loops at ~875-889 / ~917-925 for O4)
- `convex/integrations/bigseller/helpers.ts` — `buildPageListBody` (already fixed by 01a; `BIGSELLER_PAGE_SIZE` for O6)
- `convex/integrations/bigseller/queries.ts` — add `getRevenueByIds()` for O4
- `convex/platformCredentials/mutations.ts` — `updateToken` mutation used by D-03
- `src/components/.../BigSellerSyncPanel` — freshness banner (D-04)
- `src/lib/` — new `decodeMucTokenExp()` helper (D-04)
- `convex/integrations/bigseller/__tests__/` — `helpers.test.ts`, sync/cron tests (cron.test.ts 60s assertion changes for O3)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `platformCredentials` table + `updateToken` mutation already exist (`currentToken`, `lastRefreshAt`, `lastRefreshStatus`) — token auto-refresh needs NO schema change.
- HAR-fixture body-shape lock tests established in 83-01a (`__tests__/fixtures/2026-05-19-*-pageList-body.json`) — pattern for catching vendor-API drift without code changes.
- The observability/fail-fast layer (2026-05-08) already surfaces real `code`/`errorMsg`/body snippets and transitions sync → `failed` on page-1 rejection.

### Established Patterns
- BigSeller actions run `"use node"`; scheduler-chain via `ctx.scheduler.runAfter` is the only scheduling primitive (O3 changes the per-iteration delay, not the constant).
- Single-file, no-DB-write fixes are `git revert`-able (01a precedent); token persistence is the first write-bearing change here — guard it.

### Integration Points
- Token capture hooks into the existing `fetchOrders` fetch loop; persist once at end (avoids cron+manual race on the `platformCredentials` row).
- Downstream consumers of BigSeller-populated tables (`externalRevenue`, `bigsellerOrders`, `externalRevenueItems`, `externalSyncLogs`) are table-schema-stable — no consumer changes needed.

### Blast Radius (from graphify)
Not re-computed during discussion — `83-OVERVIEW.md` already documents it: 68
BigSeller-named graph nodes; only **2** external callers reach INTO BigSeller
code (`src/contexts/AuthContext.tsx` admin gate, `convex/externalData/mutations.ts`
`saveRevenue` bridge). Data-level fan-out is read-only and schema-stable. The
fix surface is contained to `convex/integrations/bigseller/*`.

</code_context>

<specifics>
## Specific Ideas

- Token JWT is HS256, 20-day sliding `exp`; server returns a fresher token in the
  `muctoken` response header on every successful call. We never verify the
  signature — pass it back as-is in `cookie: muc_token=<jwt>`.
- The admin "20 days remaining" badge is literally `exp - now` from the decoded JWT.

</specifics>

<deferred>
## Deferred Ideas

- **83-01b W1-W3 (subtractive orderState/currency/searchContent)** — archived as a
  documented standby (D-02). Re-trigger only if BigSeller starts rejecting the
  legacy `orderState` values again; would carry a cancellation-data-loss caveat.
- **Staffreview I2** — extending `BigSellerOrderRow` with the 4 observed-but-unused
  HAR response fields. TODO comment already at `helpers.ts:225`. Not in this phase.

</deferred>

---

*Phase: 83-bigseller-pagelist-refresh*
*Context gathered: 2026-05-21*
