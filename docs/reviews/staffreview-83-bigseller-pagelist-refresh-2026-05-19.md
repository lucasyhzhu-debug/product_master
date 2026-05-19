# Staff Review: Phase 83 — BigSeller pageList Schema Refresh

**Date:** 2026-05-19
**Plans reviewed:**
- `.planning/phases/83-bigseller-pagelist-refresh/83-OVERVIEW.md`
- `.planning/phases/83-bigseller-pagelist-refresh/83-01-pagelist-schema-fix-PLAN.md`
- `.planning/phases/83-bigseller-pagelist-refresh/83-02-sync-optimization-PLAN.md`
- `.planning/phases/83-bigseller-pagelist-refresh/83-RESEARCH.md`

**Reviewers:** Staff Developer (implementation) + Principal Developer (architecture)
**Author:** self (same author as the plan — extra adversarial bias applied)

---

## 1. Summary

**Overall Assessment: REVISE (4 critical, 5 improvements, 6 refinements)**

The plan correctly diagnoses the root cause (six new required fields in BigSeller's pageList payload), and the architecture choices (no schema change, single-file fix in `helpers.ts`, deferred optimizations) are sound. **However, the proposed fix is too aggressive: it bundles three independent risk vectors (additive fields, subtractive orderState, modified currency/searchContent) into one PR**, ignores existing test assertions that will break, and underspecifies the manual backfill that must follow the merge. With the splits and corrections below, the plan becomes ship-today-safe.

---

## 2. Critical Issues (Must Fix)

| # | Issue | Category | Location in Plan |
|---|---|---|---|
| C1 | Plan over-changes: bundles additive fix + subtractive orderState + value-mutating changes in one PR | Risk-management | `83-01` Wave 1 |
| C2 | Existing test assertions will FAIL after the fix — plan doesn't update them | Testing / CI | `83-01` Wave 1 |
| C3 | Manual backfill of 22 Apr → 19 May is 28 days, dangerously close to BigSeller's 31-day cap — no chunking strategy | Operations | `83-01` Success Criteria |
| C4 | No rollback strategy documented for the case where BigSeller adds *another* field next week | Risk-management | `83-01` Failure Modes |

---

### Critical Issue C1: Over-aggressive change bundling

The plan mixes three change classes:

| Class | Fields | Risk |
|---|---|---|
| **A — Additive** (new required fields) | `settleStatus`, `transactionStatus`, `fbsOrder`, `groupType`, `orderStatus`, `totalCurrency` | Low — server requires them |
| **B — Subtractive** (removed values) | `orderState` drops `"canceled"` + `"new"` | **High** — silently loses cancelled/new orders if BigSeller still accepts the values |
| **C — Value mutation** (changed existing values) | `currency: "IDR"` → `""`, `searchContent: null` → `""` on platform endpoints | Medium — HAR sample size is 1 per platform |

Class B is the dangerous one. The HAR shows the *user* selected `["completed","shipped","other"]` in BigSeller's UI when capturing — that doesn't prove BigSeller now *rejects* `"canceled"` and `"new"`. It only proves the user wasn't filtering for them. **Removing them could drop entire categories of orders from our `bigsellerOrders` table going forward, creating a silent data gap.**

If BigSeller still accepts `"canceled"`, our cancelled-order tracking continues to work. If BigSeller now rejects them, we'd still see `code: -1` *after* the class-A additive fix — at which point we'd know empirically and could remove them.

**Recommendation:**

Split the plan into two sequential sub-plans (NOT separate PRs — same branch, separate commits):

- **`83-01a`** (additive ONLY): Add the 6 new required fields. Keep `orderState`, `currency`, `searchContent` UNCHANGED. Deploy. Test against prod.
- **`83-01b`** (subtractive, IF needed): Only if `83-01a` still returns `code:-1`, then trim `orderState`. If `83-01a` works, archive `83-01b` and document the assumption that BigSeller accepts the legacy values.

This sequencing means class-C value mutations (which have HAR backing for platform endpoints only) should ALSO be conditional — keep `currency: "IDR"` for common (where HAR shows it must work alongside `totalCurrency`); change only for platform endpoints where HAR forces it.

---

### Critical Issue C2: Existing test assertions break — plan doesn't update them

`convex/integrations/bigseller/__tests__/helpers.test.ts` already pins the OLD body shape:

- Line 85: `expect(body).toHaveProperty("currency", "IDR")` — will fail if we change to `""`
- Line 89: `expect((body.orderState as string[]).length).toBe(5)` — will fail when we drop to 3
- Line 113-121: `it("includes all 5 order states including new")` — explicitly asserts `"canceled"` + `"new"` are present

`convex/integrations/bigseller/__tests__/helpers-edge-cases.test.ts:156`:
- `expect(fieldCount).toBeGreaterThanOrEqual(20)` — still passes after adding 6 fields, OK

The plan says "Update helper unit tests to assert presence of every required field" but doesn't enumerate WHICH existing assertions need editing. CI will fail at the test step.

**Recommendation:**

Plan must explicitly call out the line-by-line updates required:
- `helpers.test.ts:85` → if keeping `currency: "IDR"` (per C1 recommendation), unchanged. Otherwise update.
- `helpers.test.ts:89` → update length to `5` (if keeping all states) OR `3` (if dropping)
- `helpers.test.ts:113-121` → delete or rewrite to reflect actual `orderState` value
- Add new assertions for: `settleStatus`, `transactionStatus`, `fbsOrder`, `groupType`, `totalCurrency`, and conditional `orderStatus`

---

### Critical Issue C3: Backfill window dangerously close to BigSeller cap

The plan says verify with "2026-04-22 → 2026-05-19" — that's 28 days. BigSeller's `BIGSELLER_MAX_SYNC_DAYS = 31`. We're 3 days under the ceiling.

Risks:
- One slow sync task that BigSeller's planner doesn't finish in 8 polls (480s) leaves us with no data and a failed sync record
- If we miss a day during the workweek, the next attempt is 29 days — even closer to cap
- Memory says past full-month syncs took 8-12 min already; the new sync covers 2 platforms, both sequential — could hit 16-24 min, way over poll budget

**Recommendation:**

Backfill plan must chunk:
- Chunk 1: 2026-04-22 → 2026-05-05 (14 days) — verify rows ingested, sanity check totals against BigSeller web UI
- Chunk 2: 2026-05-06 → 2026-05-19 (14 days)
- Nightly cron then resumes the 7-day rolling window from 2026-05-20 onward

Add this to `83-01` Success Criteria. Document a `runbook` section the operator can follow without thinking.

---

### Critical Issue C4: No rollback strategy

The plan covers the case where BigSeller has changed AGAIN by the time we deploy — "re-export HAR, diff body" — but doesn't say what happens TO THE FIX in the interim. If we ship a fix that still doesn't work because of an unknown 7th field, do we:

- Revert the commit (loses the additive work we KNOW is correct)
- Hot-patch on top (preserves the work, accelerates iteration)

For a vendor-API drift fix, a one-line revert path matters.

**Recommendation:**

Add to `83-01`:

> **Rollback:** This phase touches a single function (`buildPageListBody`). If the fix produces a worse failure mode than the current state, revert with: `git revert <commit-sha>` — restores the previous body. Cron resumes the prior (still-broken) sync but doesn't introduce new failure modes. Manual operators can paste a token and retry via the existing `BigSellerSyncPanel` after revert. No DB cleanup required (the fix doesn't write anything; it only changes what we *send*).

---

## 3. Improvements (Recommended)

| # | Improvement | Impact | Effort |
|---|---|---|---|
| I1 | Add HAR-fixture test that locks the body shape against the captured HAR | High | Low |
| I2 | Update `BigSellerOrderRow` interface to type-annotate new optional response fields seen in HAR | Medium | Low |
| I3 | Add MUC token freshness check + warning in BigSellerSyncPanel before sync attempts | Medium | Medium |
| I4 | Document the `clientType` vs `clienttype` casing oddity in API reference doc | Low | Low |
| I5 | `83-02` O5 (token auto-refresh from response header) should be promoted to `83-01b` — small change, eliminates the "paste token every 20 days" toil | High | Low |

---

### Improvement I1: HAR-fixture test for body shape

The plan's new tests assert *presence* of each field. They don't assert exact-value match across the FULL body shape against the working HAR. This means a future drift where BigSeller renames a field (e.g., `settleStatus` → `settlementStatus`) wouldn't be caught — we'd add the new field, both old and new would be present in tests, and the new test would pass while the old one quietly stays.

**Recommendation:**

```ts
// Lock the WHOLE body shape to a HAR-captured fixture.
import HAR_SHOPEE_BODY from "./fixtures/2026-05-19-shopee-pageList-body.json";
import HAR_TIKTOK_BODY from "./fixtures/2026-05-19-tiktok-pageList-body.json";
import HAR_COMMON_BODY from "./fixtures/2026-05-19-common-pageList-body.json";

it("body shape matches HAR-captured working shopee payload exactly", () => {
  const body = buildPageListBody("2026-04-19", "2026-05-19", 1, [], "shopee");
  expect(Object.keys(body).sort()).toEqual(Object.keys(HAR_SHOPEE_BODY).sort());
});
```

Drop the three captured bodies as fixtures (already in `tmp/har-analysis/profit/*.md` — just promote the inner JSON). Tiny test, big regression net.

---

### Improvement I2: Type the new response fields seen in HAR

The HAR response (`shopee/pageList.json`) includes fields the current `BigSellerOrderRow` interface doesn't model:

- `costOfGoodsSold`
- `shopeeShippingRebate`
- `escrowTax`
- `deliverySellerProtectionFeePremiumAmount`

These are optional and we don't use them — but typing them avoids a future developer reaching for `(row as any).costOfGoodsSold` when they need it for a P&L feature. They also document where the data is, even if we ignore it today.

**Recommendation:**

Add as optional fields to `BigSellerOrderRow` in helpers.ts:152 with comments noting they're observed but unused (Phase 83 didn't surface a use case).

---

### Improvement I3: Token freshness check in sync panel

The MUC token is a 20-day sliding JWT. Today, an operator clicks "Sync Now" with a token that's 19 days old and the sync runs once successfully — but they don't know they're seconds from expiry. Then nightly cron tries to run 6 hours later, the token has expired, and the cron silently fails (with the existing observability fix it'll at least log the failure — but no one sees it).

**Recommendation:**

In `BigSellerSyncPanel`, after fetching the credential, decode the JWT's `exp` claim and:
- If `exp - now < 24h`: show a yellow "Token expires in <X hours>" banner with a "Re-paste token" button
- If `exp - now < 0`: red error state, block sync attempts

This is a 20-LOC UI change. Not 83-01 blocking but should land in the same week.

---

### Improvement I4: Document `clientType` casing oddity

HAR shows the BigSeller server accepts both `clientType: 1` and `clienttype: 1` (mixed-case across HTTP/2 lowercased headers). Our code sends lowercase. This works today but if BigSeller ever tightens to case-sensitive, we should know which one is canonical.

**Recommendation:** add a note to `docs/BIGSELLER_PROFIT_API.md` under "Required Request Headers".

---

### Improvement I5: Promote token auto-refresh (O5) into 83-01b

The plan defers token auto-refresh to phase 83.02 ("when bored"). But it's literally:
1. Read `response.headers.get("muctoken")` after every successful fetch
2. If present and non-empty, call `updateToken({ currentToken: <new> })`

That's ~10 LOC. It eliminates the "paste token every 20 days" operational toil entirely. Should be bundled with the schema fix.

**Recommendation:** Reorder. 83-01 becomes:
- 83-01a: Additive field fix
- 83-01b: Token auto-refresh from response headers (kills the 20-day decay)

If 83-01a works, 83-01b can ship same day. If 83-01a doesn't, we don't waste time on 83-01b.

---

## 4. Refinements (Minor Suggestions)

- **R1:** Test name `"2026-05-19 schema"` is brittle. Better: `"buildPageListBody — required fields"`. Date the COMMENT inside the test, not the test name.
- **R2:** `searchContent: ""` vs `null` — risk per template. My recommended `isPlatformSpecific ? "" : null` is a guess from a 1-sample HAR. Refinement: send `null` everywhere first; only switch to `""` if a platform endpoint rejects.
- **R3:** The current `user-agent` in `buildBigSellerHeaders` is `Chrome/131.0.0.0`. HAR shows `Chrome/148.0.0.0`. Probably doesn't matter (Chrome version is rarely checked by API servers) but stale is stale — bump to a current value.
- **R4:** `x-requested-with: XMLHttpRequest` is in our headers but NOT in the HAR. Some servers reject calls with this header in CORS preflight. Refinement: remove it and verify nothing breaks.
- **R5:** The 83-OVERVIEW doc lists "Phase 79 item rows" as a downstream consumer. Worth grepping `convex/externalRevenueItems` writers to confirm none break if `skuVoList` returns empty for `"new"` orderState (which we may now exclude) — should be no-op since Phase 79 already guards `if (!row.skuVoList || row.skuVoList.length === 0) continue;`. Worth a confirming comment.
- **R6:** The `83-RESEARCH.md` says "These can be deleted after the fix lands; they're transient research artifacts." Counter-suggestion: KEEP the captured HAR bodies as test fixtures (per I1). Delete the Python analysis scripts; keep the JSON.

---

## 5. Duplication Analysis

### Existing Code to Leverage

| Existing Code | Location | How to Use |
|---|---|---|
| `buildPageListBody` | `convex/integrations/bigseller/helpers.ts:43` | The function being fixed — no other body builders exist, no duplication risk. |
| `mapOrderToRevenue` / `mapOrderToStorage` | `helpers.ts:355` / `helpers.ts:409` | Already handle response field absence via `?` optionals — no changes needed for new fields. |
| `bigsellerOrders` schema | `convex/schema.ts:1662-1693` | Already has all profit columns. Confirms "no schema changes" axiom. |
| `BigSellerTokenDialog` | `src/components/salesAnalytics/BigSellerTokenDialog.tsx` | Existing "Paste Token" UI — I5's token-freshness banner can extend this component. |
| `platformCredentials.mutations.updateToken` | `convex/platformCredentials/mutations.ts` | Already exists — token auto-refresh (O5) just needs to call it. |

### Potential Duplication Risks

None. The fix is contained to one function; no parallel implementations to drift apart.

---

## 6. Phase/Wave Accuracy

| Phase | Assessment | Notes |
|---|---|---|
| 83-01 Wave 1 (helpers + test) | **Needs split** | Per C1: split into 83-01a (additive) + 83-01b (subtractive only if needed) |
| 83-01 Wave 2 (docs) | Good | Can run parallel with Wave 1 |
| 83-01 Wave 3 (verify) | Needs C3 fix | Manual backfill must chunk to 14-day windows |
| 83-02 (all 6 optimizations) | Mostly good | O5 should be promoted to 83-01 per I5 |

**Ordering issues:** None blocking. The proposed Wave 1 → Wave 2 → Wave 3 sequence is correct.

**Missing phases:**
- Backfill runbook (sub-phase under 83-01 Wave 3, per C3)
- Rollback runbook (per C4)

---

## 7. Specialist Agent Recommendations

| Phase | Recommended Agent | Rationale |
|---|---|---|
| 83-01a helpers.ts | `convex-backend` | Backend-only, no UI |
| 83-01a tests | `tdd-test-architect` | Test-architecture specialist; will catch C2 line-by-line |
| 83-01a docs | `convex-backend` (in parallel) | Just updating Markdown |
| 83-01a verification | `code-auditor` then user manual sync | Type/lint first, then real-world ping |
| 83-01b token refresh | `convex-backend` | Backend mutation chain |
| 83-01b banner UI | `react-ui-builder` | Component change in `BigSellerTokenDialog` or `BigSellerSyncPanel` |
| 83-02 all optimizations | `convex-backend` + `tdd-test-architect` | Each is backend-only; tests catch concurrency regressions |

After implementation, `triple-review` gate per CLAUDE.md execute-phase rules — this is a vendor-API contract change which is exactly the pattern triple-review was added for.

---

## 8. Git Workflow Assessment

### Branch Strategy

| Assessment | Status |
|---|---|
| Feature branch specified | ✅ Yes (`fix/bigseller-pagelist-schema-refresh-83-01`) |
| Branch naming convention | ✅ Correct (`fix/` prefix, kebab-case, phase-numbered) |
| Merge strategy documented | ⚠️ Implicit (CLAUDE.md says feature → main; not restated) |

### Commit Strategy

| Phase | Expected Commits | Commit Type | Notes |
|---|---|---|---|
| 83-01a code | 1 | `fix` | Additive fields + test updates |
| 83-01a docs | 1 | `docs` | API reference + CHANGELOG |
| 83-01a verification | 0 | — | Verify-only, no commit |
| 83-01b (if needed) | 1 | `fix` | Subtractive orderState + auth refresh |
| 83-01 merge | 1 | (merge commit) | Squash on PR-merge per CLAUDE.md |

### Recommended Commit Checkpoints

1. After helpers.ts edit + tests pass: `fix(bigseller): add new required pageList fields (HAR 2026-05-19)`
2. After API reference doc + CHANGELOG: `docs(bigseller): document 2026-05-19 schema drift + new required fields`
3. (Only if needed) After orderState trim: `fix(bigseller): drop canceled/new from orderState — rejected upstream`
4. (Only if I5 adopted) Token refresh: `feat(bigseller): auto-refresh muctoken from response header`

### Pre-Push Verification

- ✅ Plan includes `npm run build` check
- ✅ Plan includes `npm run type-check` verification
- ⚠️ Plan mentions manual sync but no automated `npm run test` for the e2e spec — Refinement: add `npm run test:e2e -- bigseller-sync.spec.ts` or note it's deferred to manual

### CI/CD Considerations

| Concern | Assessment |
|---|---|
| Rollback strategy | ❌ Missing (C4) |
| Deployment order | ✅ Correct (Convex deploys atomically; no migration order issue) |
| Data backup needed | No (read-only API call change) |
| Migration safety | ✅ N/A (no schema changes) |

---

## 9. Documentation Checkpoints

| Phase | Documentation Update Required |
|---|---|
| 83-01a | `docs/BIGSELLER_PROFIT_API.md` (Shared Request Schema + Known Limitations + last-verified date) |
| 83-01a | `docs/CHANGELOG.md` (Phase 83.01a entry) |
| 83-01b (if needed) | Same files, second entry |
| 83-01 close | Update `MEMORY.md` lessons.md with the 2026-05-19 schema drift incident |

### CHANGELOG.md Entry (Draft)

```markdown
## 2026-05-19 - Phase 83.01: BigSeller pageList schema refresh

**Restore BigSeller profit-data sync after vendor-side schema drift (no orders ingested since 2026-04-22).**

- Add 6 newly-required fields to `buildPageListBody`: `settleStatus`, `transactionStatus`, `fbsOrder`, `groupType`, `orderStatus` (platform endpoints only), `totalCurrency`
- Update existing `buildPageListBody` tests to reflect new required-field count
- Pin body shape to HAR-captured fixture (2026-05-19) to detect future drift
- Document Feb→May 2026 schema drift in `docs/BIGSELLER_PROFIT_API.md`

**Files Modified:**
- `convex/integrations/bigseller/helpers.ts`
- `convex/integrations/bigseller/__tests__/helpers.test.ts`
- `convex/integrations/bigseller/__tests__/fixtures/2026-05-19-{common,shopee,tiktok}-pageList-body.json` (NEW)
- `docs/BIGSELLER_PROFIT_API.md`
- `docs/CHANGELOG.md`

**Manual backfill required after merge:** sync 2026-04-22→2026-05-05, then 2026-05-06→2026-05-19, via `/admin` BigSeller card. Nightly cron resumes from 2026-05-20.

**Commits:**
- `<hash>` - `fix(bigseller): add new required pageList fields (HAR 2026-05-19)`
- `<hash>` - `docs(bigseller): document 2026-05-19 schema drift + new required fields`
```

---

## 10. Testing Plan Assessment

**Overall Testing Verdict: INSUFFICIENT (was: Adequate per plan author — escalated by review)**

### Planned Tests

| Layer | What's Tested | Test Type | Status |
|---|---|---|---|
| Backend helpers | new fields present in body | vitest | ✅ Planned |
| Backend helpers | existing fields don't regress | vitest | ❌ Missing (per C2) |
| Backend helpers | body shape locked to HAR fixture | vitest | ❌ Missing (per I1) |
| Backend sync | end-to-end sync ingests rows | manual | ✅ Planned |
| Backend cron | nightly cron still works after fix | vitest existing | ⚠️ Existing tests may break, not enumerated |
| Frontend sync panel | no behavior change | vitest existing | Not enumerated |
| E2E | full sync flow in browser | Playwright existing | Not enumerated |

### Missing Test Coverage (Must Add)

| # | Missing Test | Why It Matters | Suggested Approach |
|---|---|---|---|
| T1 | Pin existing test updates that WILL break | Without this, CI fails on first push | Enumerate `helpers.test.ts:85,89,113-121` in plan with new assertions |
| T2 | HAR-fixture body-shape lock test | Catches future drift without code changes | Promote `tmp/har-analysis/profit/*.json` to `__tests__/fixtures/` |
| T3 | Cron test re-verification | Cron uses same `buildPageListBody`; the existing test may pin orderState length | Read `cron.test.ts`, update if it pins body fields |
| T4 | Per-platform conditional test | `isPlatformSpecific` branch needs both arms exercised | Three tests: common, shopee, tiktok |

### Test Execution Checkpoints

1. After helpers.ts + test edits: `npm run test -- bigseller`
2. After full code change: `npm run test` (no cross-module regressions)
3. Before push: `npm run build` (type-check + bundle)
4. After deploy: manual sync against prod for 14-day window (per C3 chunking)

### Regression Risk

- `helpers.test.ts` — 3+ existing assertions break (C2)
- `helpers-edge-cases.test.ts:156` — field-count assertion still passes ✅
- `cron.test.ts` — may pin body fields; verify before edit
- `sync.test.ts` (in adapter/) — may pin response handling; verify
- `bigsellerOrders/__tests__/integration.test.ts` — uses test doubles, likely unaffected

---

## 11. Edge Cases to Address

The plan should explicitly handle:

- [ ] BigSeller returns `code: -1` with a NEW unrecognized message (not "Failed, please try again later") — should retain the page-1 fail-fast behavior added in 2026-05-08 observability fix
- [ ] BigSeller silently accepts our new fields but returns 0 rows for a date range we KNOW has orders — must distinguish "syntax OK but filter rejects" from "no data"
- [ ] Manual sync attempt while nightly cron is mid-flight — existing `skip-if-busy` guard at `cron.ts:50-67` handles this; verify still works after the fix
- [ ] Token expires mid-sync (between page 1 and page 2) — existing auth-failure handler at `sync.ts:717-720` aborts the fetch; verify
- [ ] BigSeller returns 200 OK with `code: 0` but `itemPageVo.rows` is empty for a confirmed-non-empty date — existing log at `sync.ts:815-818` covers it
- [ ] Frollie has new shop IDs added in BigSeller dashboard — `BIGSELLER_FROLLIE_SHOP_IDS` is hardcoded at `config.ts:27`; out of scope for 83.01 but worth a Memory note for future

---

## 12. Approval Conditions

**For Approval, address:**
1. **C1** — Split into 83-01a (additive) + 83-01b (subtractive only if 01a still fails)
2. **C2** — Enumerate the specific existing test assertions that will break, with exact line numbers and replacement values
3. **C3** — Add 14-day backfill chunking strategy to the runbook
4. **C4** — Add explicit revert command + post-revert state to "Failure modes" section

**Recommended before implementation:**
1. **I1** — HAR-fixture body-shape lock test
2. **I5** — Promote token auto-refresh from 83.02 to 83-01b

**Optional during implementation:**
1. R1–R6 refinements as time allows

---

## 13. Plan Structure Additions

The 83-01-PLAN.md is structurally complete (Git Workflow, Implementation Waves, Documentation Updates, Success Criteria all present). ✅ No silent additions needed.

The 83-02-PLAN.md is structurally complete. ✅

83-OVERVIEW.md is an orientation doc, not a phase plan — no CLAUDE.md template requirement. ✅

83-RESEARCH.md is a research artifact, not a phase plan — no CLAUDE.md template requirement. ✅

---

*Generated by /staffreview skill*
*Staff Developer Review + Principal Developer Review*
