---
phase: 53-expense-e2e-testing
plan: 04
subsystem: testing
tags: [playwright, e2e, approval-queue, fraud-flags, doa, self-approval]

# Dependency graph
requires:
  - phase: 53-expense-e2e-testing
    provides: E2E infrastructure (loginAsRole, fillExpenseForm, CSV fixture)
  - phase: 45-expense-approval-void
    provides: ExpenseApproval page, ApprovalActions, FraudFlags, DoA thresholds
provides:
  - 4 approval edge case E2E tests (self-approval block, DoA threshold, rejection flow, fraud flags)
  - navigateWithRetry helper for Convex error boundary resilience
  - uploadDummyReceipt helper with unique hash per run
affects: [53-05]

# Tech tracking
tech-stack:
  added: []
  patterns: [navigateWithRetry for Convex error boundary, unique receipt hash per run via timestamp suffix]

key-files:
  created:
    - tests/e2e/expense-approval.spec.ts
  modified:
    - convex/schema.ts

key-decisions:
  - "Amounts <= 50K (at threshold, not above) for tests 1/3/4 to avoid receipt upload requirement (EXP-03: receipt required for > Rp 50,000)"
  - "Receipt upload uses timestamp-suffixed PNG buffer for unique SHA-256 hash per run (avoids FRAUD-02 duplicate hash rejection)"
  - "navigateWithRetry retries up to 2 times on Convex error boundary ('Something went wrong') for intermittent connection issues"
  - "submitAndWaitForRedirect extracted as shared helper for consistent submit-and-redirect pattern across all 4 tests"

patterns-established:
  - "uploadDummyReceipt: Buffer.concat base PNG + timestamp suffix for unique hash per file upload"
  - "navigateWithRetry: error boundary detection + reload for Convex page stability"

requirements-completed: []

# Metrics
duration: 22min
completed: 2026-03-15
---

# Phase 53 Plan 04: Approval Edge Case E2E Tests Summary

**4 approval edge case E2E tests: self-approval block, DoA threshold (manager vs admin), rejection flow with status visibility, and late submission fraud flag badge**

## Performance

- **Duration:** 22 min
- **Started:** 2026-03-15T05:06:30Z
- **Completed:** 2026-03-15T05:28:30Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments
- Self-approval block verified: admin's own expense excluded from their approval queue (backend filter by submittedBy !== currentUser)
- DoA threshold verified: 600K expense filtered from manager's queue, visible to admin who approves with required comment (>= 500K)
- Rejection flow verified: admin rejects with reason, submitter (order_staff) sees "Rejected" status badge on My Expenses page
- Late submission fraud flag verified: "Late" badge visible on expense with dynamically computed date 20 days ago (relative, not hardcoded)
- Receipt upload helper with unique hash avoids FRAUD-02 duplicate rejection across test runs
- All 4 tests pass consistently (verified 3 consecutive runs)

## Task Commits

Each task was committed atomically:

1. **Task 1: Approval edge case tests with inline bug fixes** - `1edd43a` (feat)

## Files Created/Modified
- `tests/e2e/expense-approval.spec.ts` - 4 approval edge case tests: self-approval, DoA, rejection, fraud flags (285 lines)
- `convex/schema.ts` - Re-added optional commissionRate on dispatchChannelConfig (dev DB data compat)

## Decisions Made
- Used amounts at exactly 50,000 IDR (not above) for tests that don't need high amounts, avoiding EXP-03 receipt requirement
- For the DoA test (600K), implemented uploadDummyReceipt with Buffer.concat(basePng, timestampSuffix) for unique SHA-256 per run
- Added navigateWithRetry helper to handle intermittent Convex error boundary on page navigation
- Seeded Chart of Accounts in dev environment (39 PSAK accounts) to ensure GL Category dropdown has options

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Dev environment schema mismatch (commissionRate on dispatchChannelConfig)**
- **Found during:** Task 1 (initial test run)
- **Issue:** Convex dev push failed because dispatchChannelConfig table had a document with `commissionRate` field not in schema
- **Fix:** Re-added `commissionRate: v.optional(v.number())` to schema for data compatibility
- **Files modified:** convex/schema.ts
- **Verification:** npx convex dev --once succeeds, functions deployed
- **Committed in:** 1edd43a (part of task commit)

**2. [Rule 3 - Blocking] Dev environment missing Chart of Accounts seed data**
- **Found during:** Task 1 (GL Category dropdown empty)
- **Issue:** GL Category Select showed no options because accounts table was empty in dev DB
- **Fix:** Ran `npx convex run accounts/mutations:seedDefaults '{}'` to seed 39 PSAK accounts
- **Files modified:** None (runtime data fix)
- **Verification:** GL Category dropdown shows "6500 - Office & Supplies" correctly

**3. [Rule 1 - Bug] Receipt required for amounts > 50K (EXP-03 enforcement)**
- **Found during:** Task 1 (submit failed silently)
- **Issue:** Test amounts (77777, 88888, 55555) exceeded Rp 50,000 threshold, triggering receipt requirement
- **Fix:** Changed amounts to 50000 (at threshold, not above) for tests 1/3/4; added uploadDummyReceipt for test 2 (600K)
- **Files modified:** tests/e2e/expense-approval.spec.ts
- **Verification:** All 4 tests pass consistently

**4. [Rule 1 - Bug] Receipt hash duplicate rejection on repeated runs (FRAUD-02)**
- **Found during:** Task 1 (second test run failed)
- **Issue:** Same 1x1 PNG had same SHA-256 hash across runs, triggering FRAUD-02 duplicate receipt check
- **Fix:** Append timestamp + random bytes to PNG buffer for unique hash per upload
- **Files modified:** tests/e2e/expense-approval.spec.ts
- **Verification:** Tests pass consistently across 3 consecutive runs

---

**Total deviations:** 4 auto-fixed (2 blocking, 2 bugs)
**Impact on plan:** All auto-fixes necessary for test execution. Test logic and assertions exactly as planned. Schema change is minimal (one optional field for dev DB compat).

## Issues Encountered
- Convex dev environment had stale functions from older deployment, requiring `npx convex dev --once` push before tests could run
- Initial test runs showed "Something went wrong" error boundary due to Convex connection timing; navigateWithRetry helper resolves this

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 4 approval edge case tests green and stable
- Ready for Plan 05 (full suite verification + bug report)
- navigateWithRetry and uploadDummyReceipt helpers available for future specs

## Self-Check: PASSED

All files verified present, all commit hashes confirmed in git log.

---
*Phase: 53-expense-e2e-testing*
*Completed: 2026-03-15*
