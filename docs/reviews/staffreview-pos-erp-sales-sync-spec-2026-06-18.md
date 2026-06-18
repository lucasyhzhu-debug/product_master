# Staff Review: POS → Frollie Pro Sales Sync (ERP consumer spec)

**Date:** 2026-06-18
**Plan:** `docs/superpowers/specs/2026-06-17-pos-erp-sales-sync-erp-consumer-design.md`
**Reviewers:** Staff Developer (Implementation) + Principal Developer (Architecture)
**Plan Structure:** ✅ Validated (design spec — goal, file changes, schema, testing, rollout, self-review all present)

---

## 1. Summary

**Overall Assessment:** Revise (one Critical, then Approve)

The spec is unusually well-grounded — every codebase claim carries a verified `file:line`, the
source-literal cascade is exhaustive with severities, and the refund-sign correction (negative
`revenueGross`) is the right call backed by `incomeStatement.ts:299` + K3Mart precedent. One
**Critical** liveness bug in the cursor-persistence rule (§6.4) breaks the initial backfill. Two
improvements. After the §6.4 fix it is execution-ready.

## 2. Critical Issues (Must Fix)

| # | Issue | Category | Location |
|---|-------|----------|----------|
| 1 | "Persist cursor only after full drain to null" causes infinite non-progress on a large initial backfill | Logic / Liveness | §6.4, §8.2 #7 |

### Issue 1: Persist-only-after-full-drain is a liveness bug on the initial backfill

§6.4 says: *"Persist a cursor only after its phase fully drains to `nextCursor === null`."* That is
safe for steady-state hourly syncs (few pages) but **breaks the first run**, where the cursor is
absent and the feed returns *from the beginning of time* (CONTRACT §3). A Convex action is
time-bounded; a multi-thousand-page initial drain will not reach `null` in one invocation. With
persist-only-after-full-drain:

1. Run 1 starts at cursor=∅, processes K pages, action times out before `null`. Cursor **never persisted**.
2. Run 2 (next hour) starts at cursor=∅ again → re-pulls the same K pages → times out at the same place.
3. **The sync never advances.** Forever.

The dedup keys prevent *duplicate rows*, but they do not create *progress* — only a persisted cursor
does. This is the same class of bug as a paginated backfill that re-scans from the top each run
(`lessons_channel_backfill_177`).

**Recommendation:** Persist the cursor **after each successfully-processed page**, not only after the
full drain. The opaque cursor *is* the per-page watermark — that's its purpose. This stays fully
self-healing: a throw mid-page (before the post-page persist) leaves the cursor at the **previous**
page's `nextCursor`, so that page re-pulls and idempotent writes absorb the partial work. Progress is
monotonic; the initial backfill catches up over as many hourly runs as it takes. Also add a
**per-invocation page budget** (e.g. stop after N pages even if `nextCursor` is non-null, persist,
exit cleanly — the next run resumes) so one invocation can't run unbounded. Update the §8.2 #7 test
assertion from "cursor unmoved" to "cursor at the last successfully-processed page (not reset to ∅)".

## 3. Improvements (Recommended)

| # | Improvement | Impact | Effort |
|---|-------------|--------|--------|
| 1 | Specify the manual-trigger surface concretely (admin-gated public `action` wrapper vs dashboard-run internalAction) | M | L |
| 2 | Note the per-page child-write fan-out (≤N `runMutation` per page) and confirm it matches K3Mart's accepted cost | L | L |

### Improvement 1: Pin the manual-trigger mechanism
Rollout step 2 says "land behind a manual-trigger first," but `syncPosRevenue` is an `internalAction`
— not directly callable from a UI button. Pick one and state it: (a) a thin public
`action triggerPosSync` that `requireRole(admin)` then `ctx.runAction(internal...syncPosRevenue)`, or
(b) run the `internalAction` from the Convex dashboard Functions tab. (a) is friendlier and matches
the project's "UI for DB ops" preference (`feedback_ui_for_db_ops`); recommend (a).

### Improvement 2: Acknowledge the child-write fan-out
Phase A issues one batched `saveRevenue` per page (good — all parents in one mutation) but then one
`saveRevenueItemsWithCounts` **per new parent** (up to `limit` calls/page). This is exactly K3Mart's
accepted pattern (`adapter.ts:632-688`), so it's fine — just state it in §11 Performance so a future
reader doesn't mistake it for an N+1 regression.

## 4. Refinements (Optional)

- Parent `quantitySold = sum(line qty)` is product-units, not BOM balls — consistent with K3Mart, and
  no metric reads parent `quantitySold` for the "units sold = balls" rule (that resolves from children
  → `linkedMenuProductId` → BOM). Leave as-is; one inline note would prevent a future double-take.
- §6.1 shows `limit=100`; CONTRACT §3 allows max 500. For the initial backfill, `limit=500` cuts
  round-trips 5×. Recommend 500 for the drain.

## 5. Duplication Analysis

No duplication. The spec deliberately reuses `saveRevenue`, `saveRevenueItemsWithCounts`,
`collapseRevenuePeriod`, `createSyncLog`/`updateSyncLog`, `getCredentialsInternal`, the
`ChannelAdapter`/`ChannelSaleEvent` types, and the `/admin/unlinked-products` cascade. It correctly
**rejects** the draft's invented `createPosRevenueParent` in favor of the existing `saveRevenue`
upsert. Closest analog (K3Mart) is named and mirrored throughout.

## 6. Phase / Wave Accuracy

Spec, not a wave plan — wave breakdown is the next pipeline step (writing-plans). The implied order
(schema cascade → adapter → sync/cron → tests → rollout) is correct, and §3b's "type-check right
after the union widening" gate is the right sequencing insight.

## 8. Git Workflow Assessment

Docs-only artifact landing via squash-PR on `main` (pipeline convention). The *implementation* branch
+ commit checkpoints are defined by the forthcoming plan, not this spec. ✅ for this artifact.

## 10. Testing Plan Assessment

**Verdict:** Adequate (after Issue 1's test-assertion update). Eight tests cover normalize (both
directions), the bidirectional zod fixture lock, parent+item dedup, refund sign end-to-end,
`collapseRevenuePeriod`, cursor resume, and the source-cascade build gate. The `.strict()` (lock) vs
`.passthrough()` (runtime) distinction is correctly called out. Only gap: the cursor-resume test must
assert *monotonic progress*, not "unmoved" (Issue 1).

## 11. Edge Cases to Address

- [x] Empty page / immediate null, token missing, 401/429/500, partial-then-full refund, re-pull idempotency, qty:0 line — all in §11.
- [ ] **Initial backfill that exceeds one action invocation** — the Issue 1 fix (per-page persist + page budget) is what covers this; add it explicitly to §11.

## 12. Approval Conditions

**To approve, address:**
1. Critical #1 — per-page cursor persistence + page budget (§6.4) and the matching §8.2 #7 / §11 edits.

**Recommended before implementation:**
1. Improvement #1 — pin the manual-trigger surface.
2. Improvement #2 — note the child-write fan-out in §11.
3. Refinement — `limit=500` for the drain.

---

*Generated by /staffreview*
