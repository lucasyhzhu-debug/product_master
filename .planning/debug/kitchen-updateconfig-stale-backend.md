---
status: resolved
trigger: "Kitchen 'left components' invisible and Server Error on kitchenConfig/mutations:updateConfig when saving Nutella target (prod req 34e5c8ea449bff48)"
created: 2026-04-16T13:10:00Z
resolved: 2026-04-16T13:38:00Z
resolution_pr: "#142 fix(test): unblock convex deploy"
resolution_commit: 983cf6f4
---

## Symptoms

- Prod Vercel frontend shows kitchen Production Targets UI scaled for new component codes (Nutella-Regular, Hazelnut-Regular).
- Saving any target → `[CONVEX M(kitchenConfig/mutations:updateConfig)] Server Error Called by client` (req `34e5c8ea449bff48`).
- Non-BIG/MID ball "left components" never render on the kitchen view (nothing persisted).

## Root Cause

**Split-brain deploy:** PR #140 (`1b37634b fix(kitchen): component dedup + unified tracking config`) shipped the frontend changes AND the matching backend validators for `componentTracking` and `otherBallTargets`. However:

1. CI deploy workflow for #140 ran `npx convex deploy --yes` which type-checks `convex/` including tests.
2. Test files `convex/bankStatements/__tests__/{revenueGap,listCandidates}.test.ts` had **19 pre-existing TS errors** — 18× `TS18048 possibly undefined` after `.find()` calls, 1× `TS2769` on a `{ channel: string }` predicate applied to `result.rows` whose actual shape is `{ channels: string[] }`.
3. `deploy-convex` job failed → `trigger-vercel` condition `deploy-convex.result == 'success' || 'skipped'` failed → **neither** deployed for #140.
4. Next push #141 (docs-only, `.planning/` files) → `check-convex-changes` detected no `convex/` changes → `deploy-convex` **skipped** → `trigger-vercel` condition passed (skipped counts as OK) → **Vercel deployed the frontend alone**, still without a new Convex push.
5. Prod frontend now speaks the #140 protocol; prod backend still runs the pre-#140 validator → every `updateConfig` call carrying `componentTracking` / `otherBallTargets` throws `ArgumentValidationError`.

## Fix

PR #142 — null-guarded the 19 TS errors in the bank-statement test files so `npx convex deploy` type-checks clean. Pushing to main retriggered the workflow; Convex deploy succeeded; validators now accept the new fields. CHANGELOG updated.

## Operational Lesson

A skipped Convex deploy is treated the same as a successful one by the Vercel gate. So a failed Convex deploy followed by any convex-untouched commit (docs, planning artifacts, non-backend code) will quietly desynchronize the frontend from the backend. This is the pattern to watch for any time `gh run list` shows a Convex-deploy failure followed by a docs-only push.

**Guard idea:** add a check in `deploy.yml` that refuses to trigger Vercel if the most recent `deploy-convex` run on `main` (regardless of whether the current push touched convex) was a failure. Not implemented in this fix.
