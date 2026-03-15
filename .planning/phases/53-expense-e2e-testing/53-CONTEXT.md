# Phase 53: Expense E2E Testing & UAT Bug Fixes - Context

**Gathered:** 2026-03-15
**Status:** Ready for planning

<domain>
## Phase Boundary

End-to-end Playwright tests for the expense system (Phases 41-50) running against the live dev environment, covering all 9 expense pages, full lifecycle flows, approval edge cases, fraud flag visibility, permission guards, and the historical CSV import wizard. Includes an autonomous bug-fix loop: tests that discover bugs trigger immediate fixes (if small/obvious) or documentation (if complex). Existing 690+ unit tests must stay green.

</domain>

<decisions>
## Implementation Decisions

### Multi-role auth setup
- Create dedicated test users per role in `global-setup.ts`: E2E-Admin, E2E-Manager, E2E-Kitchen, E2E-OrderStaff
- Idempotent creation: check if test user exists, create if missing, reset PIN to 999999 if exists
- Add generic `loginAsRole(page, role)` helper that selects the matching E2E-{Role} user from the avatar grid
- Keep existing `loginAsManager` for backward compatibility with 12 existing test files — no migration needed
- Test users persist across runs (no cleanup)

### Test data strategy
- Full lifecycle test is UI-driven end-to-end: create expense via ExpenseSubmit page, approve via ExpenseApproval, reimburse via ReimbursementManager
- Role switching mid-test: submit as E2E-OrderStaff, logout, loginAsRole('admin') to approve (tests real DoA flow with self-approval block)
- No cleanup of created test data — dev database is disposable. Use "E2E-" prefix in expense descriptions for identification
- P&L verification: match exact amounts — verify the specific expense amount appears in the OpEx breakdown on /financials for the correct GL category. Sequential test execution makes this deterministic

### Bug-fix loop
- Fix small/obvious bugs inline during test execution (natural TDD loop — write test, run, fix, rerun)
- Document complex bugs (requiring root-cause debugging) in `53-BUG-REPORT.md` in the phase directory
- If a bug blocks downstream tests, pause and ask user how to proceed (continue or close phase with bug report)
- Final bug report delivered at phase completion listing all discovered issues and their resolution status

### CSV import test fixture
- Static fixture file at `tests/e2e/fixtures/test-expenses.csv`
- Mixed valid + invalid rows: ~5 valid entries and ~3 invalid entries (bad date, missing amount, unknown GL code)
- Tests both the validation error display and the successful import flow
- After import confirms, navigate to /financials and verify imported amounts appear in OpEx breakdown — end-to-end proof that CSV -> JE -> P&L works

### Claude's Discretion
- Test file organization (one large spec vs. multiple focused specs per concern)
- Exact Playwright selectors and wait strategies for expense UI elements
- Screenshot naming conventions for expense test steps
- How to locate and verify fraud flag badges in the approval queue
- Whether to use `test.describe.serial()` for the lifecycle chain or separate ordered test files

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `tests/e2e/helpers.ts`: `loginAsManager`, `navigateTo`, `waitForDataLoad`, `screenshot`, `screenshotElement` — extend with `loginAsRole`
- `tests/e2e/global-setup.ts`: ConvexHttpClient-based setup pattern — extend with test user creation
- `tests/e2e/order-lifecycle.spec.ts`: Reference implementation for multi-step UI-driven lifecycle test with role switching
- `convex/auth/mutations.ts`: `resetPin`, `unlockUser` mutations available for test setup

### Established Patterns
- All E2E tests use `test.beforeEach` with `loginAsManager(page)` for auth
- Sequential test execution: `workers: 1`, `fullyParallel: false` in Playwright config
- Screenshots at each step for debugging: `tests/e2e/screenshots/` directory
- Conditional skip with `test.skip(true, reason)` when dev database lacks data

### Integration Points
- 9 expense routes to test: `/expenses`, `/expenses/new`, `/expenses/approve`, `/expense-analytics`, `/reimbursements`, `/bank-accounts`, `/payroll`, `/accounts`, `/import`
- Permission guards: `canSubmitExpenses` (all roles), `canApproveExpenses` (manager, admin), `canManageReimbursements` (admin only), `canAccessExpenseAnalytics` (manager, admin)
- P&L verification: `/financials` page with OpEx breakdown section showing journal entry amounts by GL account

</code_context>

<specifics>
## Specific Ideas

- User wants exact amount matching on P&L verification, not just "section visible" — sequential execution makes this deterministic
- Test users should be named with "E2E-" prefix (E2E-Admin, E2E-Manager, E2E-Kitchen, E2E-OrderStaff) for easy identification
- Bug report should include resolution status per bug: "fixed inline", "documented for later", or "blocking"
- CSV fixture should use realistic GL codes from the seeded Chart of Accounts (6xxx OpEx accounts)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 53-expense-e2e-testing*
*Context gathered: 2026-03-15*
