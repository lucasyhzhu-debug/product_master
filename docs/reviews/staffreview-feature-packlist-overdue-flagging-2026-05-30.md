# Staff Review (Implementation Stage): Pack-list Overdue Flagging (SEED-001)

**Date:** 2026-05-30
**Branch:** `feature/packlist-overdue-flagging`
**Diff:** `b7c76606..2a7f80d3` (8 files, +548 / −112)
**Reviewers:** Staff Developer (Implementation) + Principal Developer (Architecture)
**Stage:** IMPLEMENTATION (the plan-stage review is `docs/reviews/staffreview-telegram-packlist-overdue-flagging-2026-05-30.md` — not superseded by this)
**Spec:** `docs/superpowers/specs/2026-05-30-telegram-packlist-overdue-flagging-design.md`
**Plan:** `docs/superpowers/plans/2026-05-30-telegram-packlist-overdue-flagging.md`

---

## 1. Summary

**Overall Assessment: Approve.** No Critical issues. The implementation is a near-verbatim, high-fidelity realization of the approved plan, plus one well-judged improvement added during code review (the all-overdue dangling-`Due Today (0)` header guard). All four plan-stage staffreview Improvements (I1–I4) are present in the shipped code/tests — not merely claimed. The single-source-of-truth design (`classifyDue`/`daysLate` in `dueClassification.ts`) holds: the threshold is derived exactly once and consumed by both the query and the formatter. There are zero schema/index changes (verified against `b7c76606:convex/schema.ts` — `by_status_due_date` pre-existed). The `generatedAt` discipline that kills `Date.now()` drift is threaded correctly through both formatters.

The findings below are all Minor or Nitpick — quality refinements, not blockers. The work is mergeable.

**Plan fidelity:** ~98%. The three layers (query buckets → formatter → send) match the plan's listed code line-for-line in the load-bearing logic. The only deviations are (a) one genuine improvement beyond the plan (dangling-header guard), (b) two extra defensive unit tests beyond what the plan listed, and (c) the breadcrumb wording change (plan-R1 adopted). All are additive and correct.

---

## 2. Critical Issues (Must Fix)

None.

The historically-Critical risk for this codebase — a convex test-file type error silently failing the production `deploy-convex` job (the split-brain incident, prod outage 2× per memory) — remains closed: `npm run build` type-checks `convex/**` including the new `convex/telegram/queries/__tests__/dueClassification.test.ts`. The plan's Task 5 build gate covers it. No new query/action split-brain surface (Convex deploys functions atomically; the new query shape and its only consumer `sendPackList` ship together).

---

## 3. Improvements (Recommended)

None rise to Improvement severity. All actionable items are Minor or Nitpick (Section 4/5). The plan-stage Improvements I1–I4 were the substantive ones and are all closed (Section 6).

---

## 4. Minor

### M1 — `formatUnpaidAlert` chunking is untested
The plan and prior staffreview (I3) drove a **mixed-section chunking test** for `formatPackList` (present at `packListFormat.test.ts:327-349`, verified passing-shape). But `formatUnpaidAlert` runs its blocks through the **same** `chunkBlocks` with no chunking test of its own. In practice the unpaid bucket is tiny (a handful of past-due-unpaid orders), so a >4000-char split is unlikely — hence Minor, not Improvement. Still, the unpaid renderer is a distinct block shape (amount + days-late + contact, no items), and a single multi-chunk assertion (≤4096, header appears once, every order marker once) would close the last formatter gap cheaply. Mirrors the M-class coverage the pack list already has.

### M2 — Optional plan test "empty pack list + non-empty unpaid alert" was not added
The plan-stage review listed this as a *nice-to-have* (its Testing table row 2, Section 11 unchecked box): assert that `formatPackList` → 1 chunk ("Nothing to pack ✅") coexists with a non-empty `formatUnpaidAlert`. It is **absent** from the diff. This is a legitimately-skipped optional (the two formatters are independent pure functions and each path is covered in isolation — empty pack list at `packListFormat.test.ts:43-50`, non-empty unpaid at `:367-377`), so the cross-product adds little. Noting it only because the focus prompt called it out: it is missing **by design**, not by oversight, and the underlying behavior is covered. No action required unless you want the explicit guard against a future coupling between the two.

### M3 — Unpaid bucket has no upper `dueDate` bound (full historical scan)
`packListQuery.ts:75-80` scans `AwaitingPayment` with `.lt("dueDate", startOfTodayMs)` — i.e. **every** unpaid order whose due date is before today, going back to the beginning of time. There is no lower bound. In a long-lived deployment, abandoned/stale `AwaitingPayment` orders from months ago accumulate and all surface in the daily 🚨 alert (and get fully card-built via `buildCard`'s per-order `orderItems` sub-query). The kanban board this mirrors is interactive and naturally bounded by what staff look at; this cron broadcasts unconditionally. The paid scans are naturally self-limiting (orders move out of `PaymentReceived`/`BeingPrepared`), but the unpaid scan is not. Today the order volume makes this a non-issue (Minor), but consider either a sane lower bound (e.g. last 30–60 days) or an operational practice of cancelling stale `AwaitingPayment` orders, before this list grows unbounded. The spec's "chase now" framing also implies *recent* past-due, not a year of zombie orders.

### M4 — `daysLate` is exported and consumed but `wibDayIndex`/`DueBucket`/`classifyDue` surface area is wider than needed
`dueClassification.ts` exports `wibDayIndex`, `classifyDue`, `daysLate`, and the `DueBucket` type. The formatter only needs `daysLate`; the query only needs `classifyDue`. `wibDayIndex` is exported solely for its own unit test, and `DueBucket`/`"future"` is never produced in a path that consumers branch on (the query's index bound excludes future, and it collapses `classifyDue` to a binary overdue/else at `packListQuery.ts:94`). This is intentional single-source-of-truth hygiene and the tests justify the exports, so it is fine — flagging only that the `"future"` arm is effectively dead in production (see N2).

---

## 5. Nitpick

### N1 — `chunkBlocks` known orphan-header limitation is documented, not fixed
`packListFormat.ts:132-136` carries an honest comment that a section header (`⚠️ OVERDUE` / `Due Today`) can land as the last block of a chunk with its orders flowing into the next chunk's continuation — visual-only, no data loss. This matches the plan's R-level disposition and the prior review's R2/I3 note (the test asserts no overflow + exactly-one-header, not anti-orphaning). Correct call to not over-engineer block look-ahead for a rare mid-section split. Documented honestly. No action.

### N2 — Defensive `else dueToday.push(card)` could mis-bucket an impossible `"future"`
`packListQuery.ts:94`: `classifyDue(...) === "overdue" ? overdue : dueToday`. A theoretically-`"future"` paid order would fall into `dueToday`. Unreachable because the index bound `lte("dueDate", endOfTodayMs)` excludes future rows (prior review R2). The current binary is fine; an explicit `=== "future"` drop would only document intent. Cosmetic.

### N3 — Breadcrumb wording adopted plan-R1 ("Pack list + alert send failed")
`sendPackList.ts:76` now reads `Pack list + alert send failed after N/M chunks` (plan-R1 said the old "Pack list send failed" mislabels when the alert chunks are what fail; this wording fixes it). Good adoption of an optional refinement. The `M` denominator (`chunks.length`) spans both pack + alert chunks, consistent with the new label. No action.

### N4 — `formatUnpaidAlert` header uses a literal `&amp;` rather than `escapeHtml`
`packListFormat.ts:186` hard-codes `Unpaid &amp; Past Due` inline (plan-R3 preferred this over `escapeHtml("Unpaid & Past Due")` on a constant). Reads directly and the test at `:373` asserts the escaped form. Correct, consistent. No action.

---

## 6. Staffreview Adoption Verification (I1–I4)

Each plan-stage Improvement verified **present in shipped code**, not just claimed in the adoption log:

| # | Improvement | Status | Evidence |
|---|-------------|--------|----------|
| **I1** | Drop dead `reason` from `UnpaidAlertInput` | ✅ Adopted | `packListFormat.ts:16-21` — `UnpaidAlertInput` has only `unpaidOverdue` + `generatedAt`; explicit comment why no `reason`. Call site `sendPackList.ts:54-57` passes no `reason`. |
| **I2** | Keep unpaid alert firing for all reasons (no midday gate) | ✅ Adopted as-designed | `sendPackList.ts:52-57` formats + appends `alertChunks` unconditionally for every reason; `formatUnpaidAlert` takes no reason. Matches user's confirmed "all reasons" decision (the converse of a midday-suppression gate). |
| **I3** | Mixed-section chunking test (OVERDUE + Due Today across 4096) | ✅ Adopted | `packListFormat.test.ts:327-349` — 25+25 orders, asserts every chunk ≤4096, each section header exactly once, each order marker exactly once. |
| **I4** | Derive `paymentStatus` from status in `seedOrder` fixture | ✅ Adopted | `packListQuery.test.ts:52` — `paymentStatus: (override.status ?? "PaymentReceived") === "AwaitingPayment" ? "Unpaid" : "Paid"`. No longer hard-coded `"Paid"`; `AwaitingPayment` seeds are realistically `"Unpaid"`. |

All four genuinely landed. The adoption log in the plan (lines 955-966) is accurate.

---

## 7. Plan Fidelity Analysis

**Layer-by-layer match to the plan's listed code:**

- **Task 1 (`dueClassification.ts`):** Matches plan verbatim. Implementation adds 2 extra unit assertions beyond the plan (`wibDayIndex(TODAY - 1)` decrement at `dueClassification.test.ts:18`; `daysLate(TOMORROW)` negative at `:43-45`) — strictly more coverage, good.
- **Task 2 (`packListQuery.ts`):** Matches plan's full handler body line-for-line (the `ACTIVE_STATUSES`, `packListComparator`, `buildCard`, dual paid scan, unpaid `.lt` scan, bucket split, return shape). The test file additionally gained a sort-dominance test (`packListQuery.test.ts:177-189`, "places overdue before due-today regardless of expedited") not in the plan — a valuable assertion that section ordering dominates the expedited flag. Additive.
- **Task 3 (`packListFormat.ts`):** Matches plan, **plus the one intentional deviation** (the dangling-header guard — see below).
- **Task 4 (`sendPackList.ts`):** Matches plan; breadcrumb wording upgraded per plan-R1 (N3).
- **Task 5 (docs):** CHANGELOG entry present and accurate (`docs/CHANGELOG.md` Unreleased → "Telegram pack-list overdue flagging (SEED-001)"), correctly states "No schema/index changes."

**The deviation beyond the plan's listed code (correctly added during code review):**
`formatPackList` now guards the `Due Today` header behind `if (input.dueToday.length > 0)` (`packListFormat.ts:165-170`). The plan's listed code emitted `<b>Due Today (${input.dueToday.length})</b>` **unconditionally** whenever `overdue.length > 0` (plan lines 777-779), which on an all-overdue day would render a dangling `Due Today (0)` label with nothing under it. The implementation fixes this and adds a covering test (`packListFormat.test.ts:290-300`, "omits the Due Today header when dueToday is empty but overdue is not"). This is a correct, in-scope improvement to the plan's code, not scope creep. Well caught.

**No scope creep, no shortcuts.** No order-surface dual-wiring (Pitfall #20 correctly N/A — `OrderSlideOver`/`OrderDetail` untouched, verified absent from diff). No new Telegram role (reuses `pack-list`). No `Date.now()` in the formatter.

---

## 8. Architectural Risk Assessment

| Dimension | Finding |
|-----------|---------|
| **Layer coupling** (query → formatter → send) | Clean. The query owns DB + bucketing and returns a plain data shape; the formatter is pure (only `daysLate` for date math); `sendPackList` is the only wiring point. The `generatedAt` contract is the single thread that couples them, and it's threaded explicitly (`sendPackList.ts:50,56`) rather than re-derived. Low risk. |
| **Single-source-of-truth** (`classifyDue`/`daysLate`) | Holds. Threshold derived once in `dueClassification.ts`; query uses `classifyDue`, formatter uses `daysLate`, both from the same module. No re-derivation elsewhere (grep-confirmed the formatter imports `daysLate` from `./queries/dueClassification`). Mirrors — but does not import — the frontend kanban rule (`getUrgencyLevel`); the intentional backend/frontend seam (documented in spec "Out of scope") is the correct call given the cross-runtime boundary. |
| **Cron / on-demand load** | Three index-bounded scans per invocation on `by_status_due_date`, fired by morning + midday crons (via `sendPackListResilient`) and on-demand `/pack`. Paid scans are self-bounding (orders churn out of the two active statuses). **Unpaid scan is unbounded historically** (M3) — the one load concern, currently negligible at this order volume but worth a bound long-term. Each surfaced order triggers one extra `orderItems` sub-query in `buildCard`; fine for the realistic N (tens). |
| **Schema implications** | Zero. Verified: `git diff` shows no `convex/schema.ts` change; `by_status_due_date` index pre-existed at base (`b7c76606:convex/schema.ts:324`). The unpaid `.lt` scan reuses it (status-prefix + dueDate range). CHANGELOG's "No schema/index changes" claim is accurate. |
| **Real-time correctness** | The query is an `internalQuery` invoked from an `internalAction` cron — not a reactive subscription, so no hooks-order / loading-state concerns apply. `generatedAt` echoes the injected `now`, killing the near-midnight drift class of bug. |

---

## 9. Over-Engineering Assessment

Minimal. The design is proportionate to the requirement:
- `chunkBlocks`/`truncate` extraction is justified DRY (two formatters share it).
- The 4-function helper module is the right granularity for a single-source threshold; `wibDayIndex` export exists for its unit test (acceptable).
- The `MAX_ORDER_LEN`/truncation guard is inherited from the pre-existing formatter (not new), and the orphan-header limitation is explicitly *not* solved (correctly — N1).
- `formatIdr` (precise) deliberately diverges from `salesSummary`'s abbreviated `rupiah` — justified (amount-owed must be exact), and the prior review's note to *not* prematurely consolidate the two into a shared currency module is respected here. Good restraint.

No gold-plating found.

---

## 10. Verification Checklist

- [x] Plan Tasks 1–5 all implemented and present in diff
- [x] Staffreview I1–I4 all present in code/tests (Section 6)
- [x] No schema change (verified against base)
- [x] `by_status_due_date` index pre-existed (no new index)
- [x] Single-source threshold (`dueClassification`) not re-derived
- [x] `generatedAt` threaded to both formatters (no `Date.now()` drift)
- [x] Byte-identical empty-overdue output preserved (`formatPackList` flat-list branch + base-version diff confirms identical render path)
- [x] Dangling `Due Today (0)` header guard added beyond plan + tested
- [x] CHANGELOG updated and accurate
- [ ] M1: `formatUnpaidAlert` chunking test (recommended, cheap)
- [ ] M3: bound the unpaid historical scan (long-term, not blocking)

**Recommendation: Approve and merge.** Optionally fold M1 (one test) before squash; M3 is a backlog item, not a merge blocker.

---

*Implementation-stage review. Plan-stage review preserved separately at `docs/reviews/staffreview-telegram-packlist-overdue-flagging-2026-05-30.md`.*
