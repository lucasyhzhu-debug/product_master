# Staff Review: Sales-Updates Telegram Bot

**Date:** 2026-05-28
**Plan:** `docs/superpowers/plans/2026-05-28-sales-updates-telegram-bot.md`
**Reviewers:** Staff Developer (Implementation) + Principal Developer (Architecture)
**Plan Structure:** ⚠️ One section added — see §0

---

## 0. Plan Structure Additions

The plan covers Goal, File Changes (per task), Waves (SEQUENTIAL marked), Testing (TDD per task), Success Criteria, and a self-review + risks list. **Missing: an explicit Rollback / Deployment section.** Added below; fold into the plan before execution.

### Rollback & Deployment (added)
- **Deployment:** single Convex deploy (backend-only, no schema → no migration ordering). Crons + functions register atomically; the deleted `bigseller nightly 7d resync` stops on that deploy.
- **Deploy precondition (HARD):** a Telegram chat MUST be assigned the `sales-updates` role *before or right after* deploy. There is **no env fallback** for `sales-updates` (the `TELEGRAM_FALLBACK_ROLE` fallback only covers `pack-list`). Until a chat is assigned, every daily/weekly/monthly cron run throws `No Telegram chat assigned` (visible as a failed cron in the dashboard) — no message sends. This is recoverable at any time by assigning the role; no redeploy needed.
- **Rollback:** `git revert` the merge commit + redeploy. This restores the `bigseller nightly 7d resync` cron and removes the 3 new crons. The feature is **read-only** (no writes to business tables beyond the sync actions it already triggers, which are idempotent upserts), so there is no data to clean up. Safe, instant rollback.
- **Partial-failure during deploy:** N/A — atomic deploy.

---

## 1. Summary

**Overall Assessment: Approve** (no Critical issues; 5 Improvements recommended).

Strong, well-scoped, backend-only plan with real TDD coverage. Every load-bearing assumption was verified against the codebase during this review and **all held** — including the two the plan itself flagged as risks (`menuProducts.name`, `orderItems.by_order` both exist), the GoFood/K3Mart per-product data source (both write `externalRevenueItems`), and the Convex cron API (lowercase `dayOfWeek: "monday"` is correct; the JSDoc's "Tuesday" example is the misleading one). Remaining concerns are efficiency and maintainability, not correctness — the highest-value being monthly read-budget and duplication with the existing `getRevenueByOutletInternal`.

---

## 2. Critical Issues (Must Fix)

**None.** All correctness-blocking risks the plan raised were verified as non-issues:

| Verified claim | Result | Evidence |
|---|---|---|
| `menuProducts.name` exists | ✅ | `convex/schema.ts:95` |
| `orderItems` `by_order` index | ✅ | `convex/schema.ts:369` |
| GoFood stores per-SKU product data | ✅ | `gobiz/adapter.ts:519-552` writes `externalRevenueItems` via `saveRevenueItemsWithCounts` |
| K3Mart stores per-SKU product data | ✅ | `k3mart/adapter.ts:598-678` (`externalProductCode`+`quantitySold`+items) |
| `crons.weekly` dayOfWeek format | ✅ lowercase | `node_modules/convex/.../cron.js:30-53` — `DAYS_OF_WEEK` lowercase; plan uses `"monday"` |
| `crons.monthly` `day` validity | ✅ | `validatedDayOfMonth` accepts 1–31; plan uses `1` |
| `fetchInternalOrderDataMap` exported | ✅ | `externalData/queries.ts:29` |

---

## 3. Improvements (Recommended)

| # | Improvement | Impact | Effort |
|---|-------------|--------|--------|
| 1 | Monthly read-budget / N+1 fan-out | H | M |
| 2 | Use `by_source_period` instead of collect-all-then-filter | M | L |
| 3 | Duplication with `getRevenueByOutletInternal` (internal-gross + outlet grouping) | M | M |
| 4 | K3Mart "(N orders)" label is misleading for consignment | M | L |
| 5 | `getChatIdByRole` hard-throw on unassigned role | L | L |

### Improvement 1: Monthly read-budget / N+1 fan-out
Task 2 does, per current-period row: a `by_revenue` item lookup (GoFood/K3Mart) **and**, per internal row, an `orders.by_order_number` lookup **plus** an `orderItems.by_order` lookup. For **daily** this is tens–low-hundreds of reads — fine. For **monthly** it scales with a full month of rows; at the documented current scale (~1K `externalRevenue` records total, per MEMORY.md) it stays well under Convex's 16,384-read per-query limit, but it will grow. The reference `getRevenueByOutletInternal` is lighter because it never fetches items.

**Recommendation:** (a) add a one-line scale comment in `getSalesSummary` citing the ~1K assumption and the 16K read ceiling (mirror the comment style at `queries.ts:1611`); (b) when monthly row count grows past ~5K, switch product aggregation to a bounded pre-aggregation or paginate. Not a blocker now — add the comment + a watch-item so it's a conscious decision, not a latent cliff.

### Improvement 2: Query per-source via `by_source_period`
`fetchInScopeRevenue` (Task 2) collects **all** sources in the period via `by_period` then JS-filters to `gobiz`/`k3mart`/`internal` — reading and discarding bigseller/shopee/tiktok/grabfood/consignment rows. A compound index already exists: **`by_source_period` (`["source","periodStart"]`, `convex/schema.ts:1223`)**.

**Recommendation:** replace the single `by_period` collect with three `by_source_period` range queries (one per in-scope source) merged together. Reads only what's needed, and pairs naturally with Improvement 1. Keep the `toInScope` mapping as a defensive guard.

### Improvement 3: Duplication with `getRevenueByOutletInternal`
`getSalesSummary` re-implements the source→outletId grouping, outlet-name resolution, and the internal-order gross selection (`rowGross` mirrors `queries.ts:1567-1574`). If the canonical internal-gross rule changes (e.g. switches from `totalAmount` to `finalTotal`), the summary silently drifts from the dashboard.

**Recommendation:** at minimum add a cross-reference comment in `rowGross` ("keep in sync with getRevenueByOutletInternal internal-order branch"). Better: extract a shared `aggregateRevenueByOutlet(rows, orderMap)` helper into `convex/externalData/` and consume it from both. Effort is moderate because the reference query is `preset`-bound and product-free; a clean extraction of just the gross/outlet core is the pragmatic middle path.

### Improvement 4: K3Mart "(N orders)" labelling
K3Mart rows are consignment **stock-delta** entries (`dataOrigin: "stock_delta"`), so `transactionCount` is a per-product-line count, not an order count. Rendering "🏪 K3Mart — Rp X (18 orders)" misrepresents consignment.

**Recommendation:** for K3Mart, omit the order count (render just "🏪 K3Mart — Rp X") or relabel to "(N lines)". Cheapest: drop the count for K3Mart in `renderChannel`.

### Improvement 5: `getChatIdByRole` hard-throw
If no chat is assigned to `sales-updates`, the orchestrator's `getChatIdByRole` throws and the whole action fails. Correct behavior, but the failure is a raw throw in logs.

**Recommendation:** wrap the `getChatIdByRole` call so an unassigned role logs a clear, actionable message ("Assign a chat to the `sales-updates` role at /admin/telegram-chats") before rethrowing. Also surface the deploy precondition (now in §0) in the plan's Task 5/6.

---

## 4. Refinements (Optional)
- **Empty-state total line:** the daily empty message still renders "Total: Rp 0 · 0 orders" above "No sales recorded today." Suppress the total line when `channels.length === 0`.
- **New-channel delta:** a channel with prior-period gross 0 and current >0 shows no delta (null). Consider rendering "▲ new" for that case in weekly/monthly.
- **Idempotency note:** the daily refresh re-syncs the same day each night; this relies on the sync adapters' idempotent upserts (true today). Worth a one-line comment so a future adapter change doesn't introduce double-counting.

---

## 5. Duplication Analysis

### Existing code to leverage
| Code | Location | How to use |
|------|----------|------------|
| `getRevenueByOutletInternal` | `convex/externalData/queries.ts:1515` | Source of the outlet/gross pattern — extract shared core (Improvement 3) |
| `fetchInternalOrderDataMap` | `convex/externalData/queries.ts:29` | Already reused by the plan ✅ |
| `fetchPeriodItems` (item fan-out) | `convex/externalData/queries.ts:522` | Same per-revenue item-fetch pattern; mirror or reuse |
| `by_source_period` index | `convex/schema.ts:1223` | Improvement 2 |
| `formatPackList` chunking | `convex/telegram/packListFormat.ts` | Pattern correctly mirrored by `salesSummaryFormat` ✅ |

### Potential duplication risks
- `rowGross` vs `getRevenueByOutletInternal` internal-order branch (Improvement 3).

---

## 6. Phase / Wave Accuracy

| Wave | Assessment | Notes |
|------|------------|-------|
| Wave 1 (range → query) | Good | Correct dependency order; Task 2 needs Task 1's `Cadence` type |
| Wave 2 (formatter → action) | Good | Formatter needs Task 2 return types; action needs both |
| Wave 3 (crons → verify → docs) | Good | Crons reference the Task 4 function ref — must exist first ✅ |

**Ordering issues:** none. **Missing phases:** none (rollback notes added in §0).

---

## 7. Specialist Agent Recommendations

| Wave | Recommended Agent | Rationale |
|------|-------------------|-----------|
| Wave 1–2 | `convex-backend` | All new code is Convex queries/actions/helpers |
| Wave 3 verify | `code-auditor` | Read-only type/pattern gate before merge |
| Post-impl | `tdd-test-architect` | If monthly-scale or orchestrator tests are added |

---

## 8. Git Workflow Assessment

### Branch & merge strategy
| Check | Status |
|-------|--------|
| Feature branch specified (`feature/sales-updates-telegram-bot`) | ✅ |
| Branch-from-main rule (Pitfall #12) | ✅ noted |
| Commit-per-task | ✅ each task ends in a commit |

### Pre-push verification
- [x] `npm run build` in plan (Task 6)
- [x] `npm run type-check` in plan (Tasks 4, 5, 6)
- [x] `npm run test` in plan (Tasks 1–3, 6)

### CI/CD & rollback
| Concern | Status |
|---------|--------|
| Rollback strategy | ✅ added (§0) |
| Deployment order | ✅ atomic, backend-only |
| Data backup needed | No (read-only feature) |
| Migration safety | N/A (no schema change) |

---

## 9. Documentation Checkpoints

| Wave | Docs |
|------|------|
| Wave 3 | `docs/CHANGELOG.md` (✅ drafted in Task 6), `docs/FILE_MAP.md` (✅) |
| Post-merge | Consider a CLAUDE.md note only if a 4th Telegram flow lands (Pitfall #21 already covers the pattern) |

No `docs/SCHEMA.md` change (correct — no schema change).

---

## 10. Testing Plan Assessment

**Verdict: Adequate.**

| Layer | What | Type | Status |
|-------|------|------|--------|
| Pure | `resolveCadenceRange` daily/weekly/monthly + Jan-boundary | vitest | ✅ planned |
| Backend | `getSalesSummary` grouping, GoFood-by-outlet, item/fallback products, cancelled exclusion, zero-sales omit, weekly delta | convex-test | ✅ planned |
| Pure | `formatSalesSummary` daily/weekly/empty/footer-status | vitest | ✅ planned |
| Action | `sendSalesSummary` orchestration | — | ⚠️ none (justified by `sendPackList` precedent) |

### Gaps (non-blocking)
| # | Missing test | Why it matters | Approach |
|---|--------------|----------------|----------|
| 1 | Orchestrator refresh-status→footer mapping | A mislabeled source (gofood/k3mart/direct) ships silently | Optional: extract the try/catch status object into a tiny pure helper and unit-test it |
| 2 | Monthly-scale read behavior | Latent read-budget cliff (Improvement 1) | Not a unit test — add the scale comment + watch-item |

### Regression risk
- `bigseller nightly 7d resync` cron removed: the `nightlySync` **action** stays (only the registration is deleted), so `bigseller/__tests__/cron.test.ts` still passes. Confirm no other file imports the cron registration (none expected). ✅

---

## 11. Edge Cases to Address
- [x] Zero-sales channel omitted; all-empty → "No sales recorded" (planned)
- [x] Prior-period gross 0 → delta null (planned); consider "▲ new" (Refinement)
- [x] Cancelled order items excluded for Direct (planned + tested)
- [x] GoFood row without item children → row-level `productName/quantitySold` fallback (planned + tested)
- [ ] K3Mart row with `externalProductCode` but no `productName` → confirm the item path supplies a name (items carry `productName`; the row-level fallback uses `productName` only — Direct/K3Mart rely on items/orderItems, so OK, but add a test asserting K3Mart product names render)
- [ ] Daily cron fires while `sales-updates` unassigned → clear error (Improvement 5)

---

## 12. Approval Conditions

**To approve:** nothing blocking — **Approved as-is.**

**Recommended before implementation (fold into the plan):**
1. Add the Rollback/Deployment section (§0) + the deploy precondition to Task 5/6.
2. Improvement 2 (swap to `by_source_period`) — cheap, do it during Task 2.
3. Improvement 1 scale comment + watch-item.
4. Improvement 4 (K3Mart order-count label).

Improvements 3 and 5 are strong but optional for v1.

---

*Generated by /staffreview*
