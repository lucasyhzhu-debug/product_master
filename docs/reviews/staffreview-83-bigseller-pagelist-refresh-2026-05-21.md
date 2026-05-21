# Staff Review: Phase 83 — BigSeller pageList Refresh (5 plans)

**Date:** 2026-05-21
**Plans:** `83-03-token-auto-refresh`, `83-04-n1-elimination`, `83-05-adaptive-polling`, `83-06-pagesize-bump`, `83-07-parallel-fetch`
**Reviewers:** Staff Developer (Implementation) + Principal Developer (Architecture)
**Verification:** All load-bearing code claims grep-verified against the live codebase before review.

---

## 1. Summary

**Overall Assessment: APPROVE with revisions** (all revisions applied in this pass).

The plan set is high quality: one PLAN per PR exactly matching D-06's boundaries, a low-risk-first `depends_on` chain (83-04→05→06→07), grep-verifiable acceptance criteria on every task, concrete diffs lifted from the SPECs, and a `<threat_model>` per plan. The pattern-mapper pre-pass already caught the single highest-risk issue (the `updateToken` validator gap) and it is correctly baked into 83-03 Task 1. Remaining findings are about **verification fidelity** and **cross-plan sequencing**, not design.

**Counts:** 0 Critical · 2 Improvements · 3 Refinements — all addressed.

---

## 2. Critical Issues (Must Fix)

**None.** The would-be Critical — `updateToken`'s validator (`mutations.ts:62`) and the table schema (`schema.ts:1281`) are `v.union(v.literal("success"), v.literal("error"))` and would throw `ArgumentValidationError` on `"auto-refreshed-from-response"` — was caught by the pattern mapper (Flag #1) and is 83-03 Task 1 with grep-verifiable criteria on both files. Verified the validator/schema shapes are exactly as the plan states.

---

## 3. Improvements (Recommended) — APPLIED

| # | Improvement | Impact | Plan |
|---|-------------|--------|------|
| I1 | 83-07 must `depends_on` 83-03 | High | 83-07 |
| I2 | 83-05 Task 2 grep criteria are a false-pass on multi-line `runAfter` | Medium | 83-05 |

### I1: 83-07 silently depends on 83-03's token-capture code
83-07 Task 1/2 explicitly refactor the `latestRefreshedToken` / `authErrorObserved` / persist-once-at-end block — code that **83-03 introduces** — into the new `fetchPage` flow and make it concurrency-safe. But 83-07's frontmatter `depends_on` listed only `["83-06-pagesize-bump"]`. The wave structure (83-03 is wave 1, 83-07 is wave 4) happens to order them correctly, but as separate PRs the explicit dependency wasn't encoded: merging 83-07 before 83-03 would write code referencing a token-capture block that doesn't exist yet.

**Applied:** `depends_on: ["83-06-pagesize-bump", "83-03-token-auto-refresh"]` + a prose sequencing note in the objective instructing the executor to STOP and surface the missing dependency rather than re-introduce the capture block.

### I2: 83-05 Task 2 verification is unreliable (multi-line `runAfter`)
The `ctx.scheduler.runAfter(...)` poll-reschedule calls are **multi-line** — the delay arg is on its own line (confirmed at `sync.ts:322-324`). So:
- `grep -c 'runAfter(\s*pollDelayMs' …` returns **0 even after a correct edit** (grep is line-based; `\s` doesn't cross newlines).
- `grep -c 'runAfter(\s*BIGSELLER_POLL_INTERVAL_MS' … returns 0` is a **false-pass** — it's already 0 before any change, so it passes whether or not the work was done.

**Applied:** replaced with `grep -c 'pollDelayMs(' … >= 5` (1 import + 4 delay args) plus a read-and-verify instruction for the 4 specific reschedule sites, with a note that `BIGSELLER_POLL_INTERVAL_MS` legitimately remains on its import line so a bare grep count isn't a clean signal.

---

## 4. Refinements (Minor) — APPLIED

- **R1 (83-07 Task 3):** acceptance criterion `grep -c "it(" … increased by >= 4 over the 83-03 baseline` is not checkable in a single command (needs a before/after diff, and 83-04 also extends the same file). Replaced with an absolute floor (`>= 9`), a distinctive `describe('BigSeller parallel fetch')` grep, and a grep for the R2 partial-failure test marker.
- **R2 (83-07 Task 2/3):** O1 platform parallelization is a deliberate **behavior change** — today a page-1 fatal early-returns from the whole function (all-or-nothing); under O1 the plan scopes the failure to one platform and lets the other's data land. Added an explicit behavior bullet + a locking test (`it("scopes a one-platform page-1 fatal to that platform under O1")`) asserting the terminal status is `"error"` with the failing platform named AND the surviving platform's orders still land.
- **R3 (83-03 Task 4):** the build-vs-reuse text could be read as authorizing two freshness sources (the query's `tokenExpiresAt` AND a panel-side `decodeMucTokenExp`). Clarified: ONE production source (the query field); `decodeMucTokenExp` is the shared pure decoder that produces it and is unit-tested directly — the panel consumes the precomputed `tokenExpiresAt` only.

---

## 5. Duplication Analysis

| Existing Code | Location | How the plans use it |
|---------------|----------|----------------------|
| `decodeJwtPayload` | `convex/lib/jwt.ts:5` | Reused directly in sync.ts for `tokenExpiresAt`; frontend twin `decodeMucTokenExp` duplicates ~8 lines per CLAUDE.md Pitfall #18 (no cross-import). Verified. |
| `updateToken` (internalMutation) | `convex/platformCredentials/mutations.ts:56` | Persist target for D-03. Confirmed `internalMutation` (threat-model claim holds). |
| Map-return batch pattern | `convex/orders/helpers/batchFetching.ts:32` | Analog for `getRevenueByIds`. Verified the pattern exists. |
| Array→Map caller build | `convex/productionCounts/queries.ts:31` | Documented Flag #5 fallback if a `Map` doesn't round-trip `ctx.runQuery`. |
| amber/red banner blocks | `BigSellerSyncPanel.tsx:331-346 / :448` | Copy-source for the freshness banners; `tokenExpired` prop + `onOpenTokenDialog` already wired. Verified. |

No net-new duplication risk. The `getRevenueById` single-doc query is intentionally retained (other callers); only the two sync.ts loops stop calling it.

---

## 6. Phase/Wave Accuracy

| Plan | Wave | depends_on | Assessment |
|------|------|------------|------------|
| 83-03 token-refresh + banner | 1 | [] | Good — independent per CONTEXT D-03. |
| 83-04 O4 N+1 | 1 | [] | Good — pure refactor, lowest risk. |
| 83-05 O3 polling | 2 | 83-04 | Good — sequential to avoid sync.ts conflicts. |
| 83-06 O6 pageSize | 3 | 83-05 | Good. |
| 83-07 O1+O2 | 4 | 83-06 **+ 83-03 (added)** | Fixed via I1. |

Ordering matches D-05 low-risk-first (O4→O3→O6→O2/O1) and D-06 PR split. No missing phases.

---

## 7. Specialist Agent Recommendations

| Plan | Recommended Agent | Rationale |
|------|-------------------|-----------|
| 83-03 | `convex-backend` + `react-ui-builder` | Validator/schema/sync.ts backend + banner frontend. |
| 83-04 / 83-05 / 83-06 | `convex-backend` | Pure backend (query, scheduler, config + fixtures). |
| 83-07 | `convex-backend` | Concurrency refactor; pair with `tdd-test-architect` for the race tests. |

---

## 8. Git Workflow Assessment

- Branch-per-PR matches D-06 (5 separate PRs, separate triple-reviews). ✅
- Each plan ends with `npm run build` + `npm run test -- bigseller` gates. ✅
- Each plan updates `docs/CHANGELOG.md` (83-03 also folds the D-02 `orderState` archival note). ✅
- Rollback: 83-03 documents the "Paste Token" UI recovery path; 83-06 carries a full revert runbook; the rest are `git revert`-able single-concern PRs. ✅

---

## 9. Documentation Checkpoints

| Plan | Doc updates |
|------|-------------|
| 83-03 | `docs/SCHEMA.md` (new `lastRefreshStatus` value), `docs/CHANGELOG.md` (token-refresh + D-02 archival note), `docs/BIGSELLER_PROFIT_API.md` (token auto-refresh mechanism + Last Verified). |
| 83-04/05/06/07 | `docs/CHANGELOG.md` per PR (O4 / O3 / O6 / O1+O2). |

---

## 10. Testing Plan Assessment

**Overall Testing Verdict: Adequate.**

| Layer | What's tested | Type | Status |
|-------|---------------|------|--------|
| Backend | token persist + 4 guards + exp derivation | convexTest (new `sync.test.ts`) | Planned |
| Backend | `getRevenueByIds` parity + Map round-trip | convexTest | Planned |
| Backend | `pollDelayMs` ramp + max-8 bound | unit (cron.test.ts) | Planned |
| Backend | pageSize 100 in 3 fixtures + helpers value-assert | unit | Planned |
| Backend | no-double-count, page-2 failure, leak-guard survival, token-refresh-under-concurrency, concurrency cap, **partial-platform-failure (R2)** | convexTest race tests | Planned |
| Frontend | `decodeMucTokenExp` (valid/malformed/no-exp) + banner render (yellow/red/disable) | Vitest + RTL | Planned |

Flag #4 (no sync-action test file) is correctly handled: 83-03 creates `__tests__/sync.test.ts`; 83-04/83-07 extend it. Flag #5 round-trip check is a real test, not an assumption.

---

## 11. Edge Cases Addressed

- [x] Empty / unchanged / auth-error token → no persist (83-03 guards + tests)
- [x] Malformed JWT → `decodeMucTokenExp` returns null, banner falls back
- [x] Missing/deleted revenue id → omitted from batch map, not null (83-04)
- [x] Max-poll bound preserved under faster ramp (83-05)
- [x] pageSize 100 rejected → `code:-1`, revert runbook, no data loss (83-06)
- [x] Concurrent double-count, cross-platform leak, partial-platform failure (83-07)

---

## 12. Approval Conditions

**For approval:** none outstanding (0 Critical).
**Applied before execution:** I1, I2, R1, R2, R3 (all 5 revisions landed in this pass).

**Verdict:** Approved for execution via `/gsd-execute-phase 83` (low-risk-first, one PR per plan).

---

*Generated by /staffreview skill — Staff + Principal dual-persona review, codebase-verified.*
