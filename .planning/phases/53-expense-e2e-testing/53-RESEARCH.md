# Phase 53: Expense E2E Testing & UAT Bug Fixes - Research

**Researched:** 2026-03-15
**Domain:** Playwright E2E testing for expense system (9 pages, multi-role auth, lifecycle flows, CSV import)
**Confidence:** HIGH

## Summary

Phase 53 adds comprehensive end-to-end Playwright tests for the expense system built across Phases 41-51. The project already has a mature E2E testing infrastructure: 12 existing spec files, a `global-setup.ts` using ConvexHttpClient for test user configuration, a `helpers.ts` with login/navigation/screenshot utilities, and a Playwright config enforcing sequential execution (`workers: 1`, `fullyParallel: false`). The testing domain is well-scoped: 9 expense routes with known permission guards, form structures with HTML id attributes on inputs, and established patterns for Convex reactive data handling.

The primary challenge is multi-role authentication. The current setup only supports a single role (manager/admin) via `loginAsManager`. Phase 53 requires 4 test users (E2E-Admin, E2E-Manager, E2E-Kitchen, E2E-OrderStaff) with role switching mid-test to verify DoA flows, self-approval blocks, and permission guards. The existing `createUser` mutation accepts name, pin, and role -- making idempotent user creation in `global-setup.ts` straightforward.

The CSV import test requires a static fixture file with known-good and known-bad rows using real GL account codes from the seeded Chart of Accounts (6xxx OpEx range). The HistoricalImportPage is a linear wizard with 5 states, testable via file input interaction and step-by-step verification.

**Primary recommendation:** Extend `global-setup.ts` with multi-role test user creation, add `loginAsRole(page, role)` to helpers.ts, then write focused spec files per test concern (access, lifecycle, approval, CSV import, analytics, P&L verification).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Multi-role auth setup:** Create dedicated test users per role in `global-setup.ts`: E2E-Admin, E2E-Manager, E2E-Kitchen, E2E-OrderStaff. Idempotent creation: check if test user exists, create if missing, reset PIN to 999999 if exists. Add generic `loginAsRole(page, role)` helper that selects the matching E2E-{Role} user from the avatar grid. Keep existing `loginAsManager` for backward compatibility with 12 existing test files -- no migration needed. Test users persist across runs (no cleanup).
- **Test data strategy:** Full lifecycle test is UI-driven end-to-end: create expense via ExpenseSubmit page, approve via ExpenseApproval, reimburse via ReimbursementManager. Role switching mid-test: submit as E2E-OrderStaff, logout, loginAsRole('admin') to approve (tests real DoA flow with self-approval block). No cleanup of created test data -- dev database is disposable. Use "E2E-" prefix in expense descriptions for identification. P&L verification: match exact amounts -- verify the specific expense amount appears in the OpEx breakdown on /financials for the correct GL category. Sequential test execution makes this deterministic.
- **Bug-fix loop:** Fix small/obvious bugs inline during test execution (natural TDD loop -- write test, run, fix, rerun). Document complex bugs (requiring root-cause debugging) in `53-BUG-REPORT.md` in the phase directory. If a bug blocks downstream tests, pause and ask user how to proceed (continue or close phase with bug report). Final bug report delivered at phase completion listing all discovered issues and their resolution status.
- **CSV import test fixture:** Static fixture file at `tests/e2e/fixtures/test-expenses.csv`. Mixed valid + invalid rows: ~5 valid entries and ~3 invalid entries (bad date, missing amount, unknown GL code). Tests both the validation error display and the successful import flow. After import confirms, navigate to /financials and verify imported amounts appear in OpEx breakdown -- end-to-end proof that CSV -> JE -> P&L works.

### Claude's Discretion
- Test file organization (one large spec vs. multiple focused specs per concern)
- Exact Playwright selectors and wait strategies for expense UI elements
- Screenshot naming conventions for expense test steps
- How to locate and verify fraud flag badges in the approval queue
- Whether to use `test.describe.serial()` for the lifecycle chain or separate ordered test files

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @playwright/test | ^1.58.2 | E2E test framework | Already installed and configured |
| convex/browser (ConvexHttpClient) | via convex ^1.31.7 | Global setup: create/reset test users | Already used in global-setup.ts |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Papa Parse | (already in project) | CSV fixture creation reference | Understand expected CSV format for test fixture |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Static CSV fixture | Programmatic CSV generation | Static is simpler, deterministic, easier to review |
| loginAsRole helper | Separate page objects | Helper function matches existing codebase pattern |

**No new installations needed.** All tools are already in the project.

## Architecture Patterns

### Recommended Test File Structure
```
tests/e2e/
  global-setup.ts           # Extended: create 4 E2E-* test users
  helpers.ts                # Extended: add loginAsRole()
  fixtures/
    test-expenses.csv       # NEW: CSV import test data
  expense-access.spec.ts    # NEW: Permission guard tests (4 roles x 9 routes)
  expense-lifecycle.spec.ts # NEW: Submit -> Approve -> Reimburse -> P&L
  expense-approval.spec.ts  # NEW: DoA, self-approval block, fraud flags, rejection
  expense-csv-import.spec.ts # NEW: CSV upload wizard with valid/invalid rows
  expense-analytics.spec.ts # NEW: Analytics dashboard, payroll, bank accounts, chart of accounts
```

### Pattern 1: Multi-Role Login Helper
**What:** Generic `loginAsRole(page, role)` that finds the E2E-{Role} user in the avatar grid by name
**When to use:** Every test that needs a specific role
**Example:**
```typescript
// Source: Extending existing tests/e2e/helpers.ts pattern
type TestRole = 'admin' | 'manager' | 'kitchen' | 'order_staff';

const ROLE_USER_NAMES: Record<TestRole, string> = {
  admin: 'E2E-Admin',
  manager: 'E2E-Manager',
  kitchen: 'E2E-Kitchen',
  order_staff: 'E2E-OrderStaff',
};

export async function loginAsRole(page: Page, role: TestRole) {
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.waitForSelector("button:has(.rounded-full)", { timeout: 15_000 });

  const targetName = ROLE_USER_NAMES[role];
  const userButton = page.locator("button").filter({ hasText: targetName }).first();
  await userButton.click();

  // Enter PIN (same flow as loginAsManager)
  await page.waitForSelector("button:has-text('Sign In')", { timeout: 5_000 });
  const pinDigits = "999999".split("");
  for (const digit of pinDigits) {
    await page.locator(".grid.grid-cols-3 button")
      .filter({ hasText: new RegExp(`^${digit}$`) })
      .click();
  }
  await page.locator("button:has-text('Sign In')").click();

  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 15_000 });
  await waitForAppReady(page);
}
```

### Pattern 2: Global Setup Multi-User Creation
**What:** Extend `global-setup.ts` to create 4 test users idempotently via ConvexHttpClient
**When to use:** Once before all tests (Playwright globalSetup)
**Example:**
```typescript
// Source: Extending existing tests/e2e/global-setup.ts pattern
const TEST_USERS = [
  { name: "E2E-Admin", role: "admin" },
  { name: "E2E-Manager", role: "manager" },
  { name: "E2E-Kitchen", role: "kitchen" },
  { name: "E2E-OrderStaff", role: "order_staff" },
] as const;

// For each test user:
// 1. Check if exists in getActiveUsers results
// 2. If exists: unlockUser + resetPin to 999999
// 3. If not exists: createUser with name, role, pin=999999
```

### Pattern 3: Role Switching Mid-Test (Logout + Login)
**What:** For lifecycle tests that need different roles at different stages
**When to use:** Expense lifecycle: submit as order_staff, approve as admin
**Example:**
```typescript
// Source: Based on existing order-lifecycle.spec.ts sequential step pattern
export async function logout(page: Page) {
  // Click user menu / avatar to find logout button
  // Or navigate directly to /login since session persists
  await page.goto("/login", { waitUntil: "networkidle" });
  // If redirected to landing page (still logged in), find logout button
  // The Login page has PublicOnlyRoute — if authenticated, redirects away
  // So we need to clear session. Alternative: find logout in UI.
}
```

### Pattern 4: Expense Form Fill Helper
**What:** Reusable helper to fill the ExpenseSubmit form fields
**When to use:** Any test that creates an expense
**Example:**
```typescript
async function fillExpenseForm(page: Page, data: {
  description: string;
  amount: string;
  vendorName: string;
  glCategory?: string; // text to match in select, e.g., "6500 - Office & Supplies"
  paymentMethod?: string;
}) {
  await page.locator("#description").fill(data.description);
  await page.locator("#amount").fill(data.amount);
  await page.locator("#vendorName").fill(data.vendorName);

  if (data.glCategory) {
    await page.locator("#accountId").click();
    await page.locator(`[role="option"]`).filter({ hasText: data.glCategory }).click();
  }

  if (data.paymentMethod) {
    await page.locator("#paymentMethod").click();
    await page.locator(`[role="option"]`).filter({ hasText: data.paymentMethod }).click();
  }
}
```

### Anti-Patterns to Avoid
- **Parallel execution for expense tests:** Tests create real data in shared dev database; parallel runs cause race conditions. Keep `workers: 1`.
- **Using `test.beforeEach` with `loginAsManager` for multi-role tests:** Need `loginAsRole` per test or explicit role switching.
- **Cleaning up test data:** User decision: no cleanup. Use "E2E-" prefix for identification instead.
- **Hardcoding Convex IDs:** GL account IDs are dynamic. Look them up by code (e.g., "6500") or select by text in UI.
- **Using `page.waitForTimeout` excessively:** Prefer `waitForSelector`, `expect(...).toBeVisible()`, or `waitForFunction` for Convex reactive updates.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| User creation for tests | Manual Convex dashboard setup | ConvexHttpClient in global-setup.ts | Idempotent, runs every test session |
| CSV fixture | Dynamic generation | Static `test-expenses.csv` file | Deterministic, reviewable, matches user decision |
| Login flow | Custom auth bypass | loginAsRole using real UI flow | Tests the actual login path, catches auth regressions |
| Screenshot management | Custom diffing | Playwright built-in `screenshot: "on"` + manual screenshots via helper | Already configured |
| Wait for Convex data | Manual timeouts everywhere | `waitForDataLoad` helper (animate-pulse skeleton check) | Already implemented, handles Convex reactive pattern |

**Key insight:** The existing E2E infrastructure is well-built. Extend, don't replace.

## Common Pitfalls

### Pitfall 1: Session Persistence Between Tests
**What goes wrong:** After loginAsRole in one test, the session persists in the browser context for the next test.
**Why it happens:** Playwright reuses browser context within a `test.describe` block.
**How to avoid:** Each test that needs a specific role should call `loginAsRole` in `beforeEach` or at the test start. The login flow already handles the redirect-if-authenticated case via `PublicOnlyRoute`.
**Warning signs:** Tests pass individually but fail when run in sequence.

### Pitfall 2: Convex Reactive Update Timing
**What goes wrong:** After a mutation (e.g., submitting an expense), the UI hasn't updated yet when the assertion runs.
**Why it happens:** Convex WebSocket subscriptions update reactively, but there's latency.
**How to avoid:** Use `page.waitForTimeout(2000-3000)` after mutations that change visible data, or better yet use `waitForSelector` or `expect(...).toBeVisible()` with adequate timeouts.
**Warning signs:** Tests intermittently fail with "element not found" after mutations.

### Pitfall 3: Select Component (shadcn/ui) Interaction
**What goes wrong:** Playwright can't interact with shadcn/ui Select dropdowns using native `select` locators.
**Why it happens:** shadcn/ui Select uses Radix primitives (custom divs, not native `<select>` elements).
**How to avoid:** Click the SelectTrigger by id, then find the option via `[role="option"]` and filter by text.
**Warning signs:** `page.selectOption()` throws "not a select element."

### Pitfall 4: Logout Flow Not Obvious
**What goes wrong:** No direct `/logout` route exists. Session is cookie/localStorage based.
**Why it happens:** Auth uses session tokens stored via AuthContext.
**How to avoid:** For role switching, navigate to `/login` directly. If still redirected (session active), clear localStorage/session storage, or look for the logout button in the UI. The simplest approach: use `page.evaluate(() => localStorage.clear())` then navigate to `/login`.
**Warning signs:** loginAsRole doesn't switch roles because previous session is still active.

### Pitfall 5: Self-Approval Block Testing
**What goes wrong:** Admin tries to approve their own expense but the backend rejects it silently (toast error, not a visible error in the queue).
**Why it happens:** Backend checks `submittedBy !== approverId`. If both are the same E2E user, the expense won't appear in the approval queue at all (query filters it out).
**How to avoid:** Submit as E2E-OrderStaff, then login as E2E-Admin to approve. The expense WILL appear in E2E-Admin's approval queue because they're different users.
**Warning signs:** "No pending expenses to review" when expecting one.

### Pitfall 6: P&L Verification Timing
**What goes wrong:** Expense approval creates a journal entry, but the P&L income statement doesn't reflect it immediately.
**Why it happens:** The /financials page queries journalEntryLines with period filtering. If the test runs near midnight WIB, the expense date might fall in a different period than expected.
**How to avoid:** Use explicit date input for expenses (not "today"), ensure the /financials page period filter covers that date, and use `waitForDataLoad` before asserting amounts.
**Warning signs:** Amount not found in P&L but expense was correctly approved.

### Pitfall 7: CSV File Upload in Playwright
**What goes wrong:** `page.setInputFiles()` doesn't work because the file input might be hidden.
**Why it happens:** HistoricalImportPage uses a styled file input pattern (hidden input triggered by button click).
**How to avoid:** Use `page.locator('input[type="file"]').setInputFiles(path)` which works even for hidden inputs, or use `page.waitForEvent('filechooser')` pattern.
**Warning signs:** File upload seems to do nothing.

## Code Examples

### Example 1: Idempotent Test User Setup (global-setup.ts extension)
```typescript
// Source: convex/auth/mutations.ts createUser + existing global-setup.ts pattern
const TEST_PIN = "999999";

async function ensureTestUser(
  client: ConvexHttpClient,
  users: Array<{ _id: string; name: string; role: string }>,
  name: string,
  role: string
) {
  const existing = users.find((u) => u.name === name);

  if (existing) {
    // User exists: unlock + reset PIN
    await client.mutation(api.auth.mutations.unlockUser, { userId: existing._id });
    await client.mutation(api.auth.mutations.resetPin, { userId: existing._id, newPin: TEST_PIN });
    console.log(`[E2E Setup] Reset existing user: ${name}`);
    return existing._id;
  } else {
    // User doesn't exist: create
    const userId = await client.mutation(api.auth.mutations.createUser, {
      name,
      pin: TEST_PIN,
      role,
    });
    console.log(`[E2E Setup] Created new user: ${name} (${role})`);
    return userId;
  }
}
```

### Example 2: ExpenseSubmit Form Selectors
```typescript
// Source: src/pages/ExpenseSubmit.tsx form field analysis
// All inputs have id attributes - reliable selectors:
// - #description    -- text input
// - #amount         -- number input
// - #expenseDate    -- date input
// - #accountId      -- SelectTrigger (click to open, then [role="option"])
// - #vendorName     -- text input
// - #paymentMethod  -- SelectTrigger
// Buttons: "Save Draft" and "Submit for Approval" (text-based locators)
```

### Example 3: Fraud Flag Badge Selectors
```typescript
// Source: src/components/expenses/FraudFlags.tsx
// Fraud flag badges in approval queue:
// - Duplicate: Badge with text "Duplicate" and AlertTriangle icon (aria-label="Duplicate warning")
// - Late: Badge with text "Late (>14 days)" and Clock icon (aria-label="Late submission")
// - Rejection: Badge variant="destructive" with text "{N}x rejected"
//
// Locate via:
page.locator('[aria-label="Duplicate warning"]');  // or
page.locator('text=Duplicate').first();
page.locator('text=Late (>14 days)').first();
page.locator('text=/\\d+x rejected/').first();
```

### Example 4: CSV Fixture File Format
```csv
date,amount,description,vendorName,accountCode,receiptUrl
2026-03-01,75000,E2E Office supplies March,Toko Alat Tulis,6500,
2026-03-02,150000,E2E Internet bill March,Telkom Indonesia,6200,
2026-03-03,25000,E2E Grab to meeting,Grab,6300,
2026-03-04,350000,E2E Software subscription,Figma,6700,
2026-03-05,45000,E2E Team lunch,Warung Makan,6900,
invalid-date,50000,E2E Bad date row,Test Vendor,6500,
2026-03-06,,E2E Missing amount row,Test Vendor,6500,
2026-03-07,30000,E2E Unknown GL code,Test Vendor,9999,
```

### Example 5: Permission Guard Test Pattern
```typescript
// Source: Based on existing income-statement-uat.spec.ts UAT-13 pattern
test("Kitchen role cannot access /expenses/approve", async ({ page }) => {
  await loginAsRole(page, "kitchen");
  await page.goto("/expenses/approve", { waitUntil: "networkidle" });

  // ProtectedRoute redirects to role landing page (kitchen -> /kitchen)
  await page.waitForURL((url) => url.pathname === "/kitchen", { timeout: 10_000 });
  await screenshot(page, "expense-access-kitchen-blocked-approve");
});
```

### Example 6: Approval Queue Card Selectors
```typescript
// Source: src/pages/ExpenseApproval.tsx
// Page header: "Expense Approvals" with count: "{N} expense(s) pending review"
// Empty state: ClipboardCheck icon + "No pending expenses to review"
// Cards: Each pending expense is a <Card> with:
//   - ExpenseStatusBadge (status text)
//   - Amount (formatCurrency)
//   - Description text
//   - FraudFlags badges (if any)
//   - ApprovalActions: Approve (green), Reject (destructive), Void (outline, admin only)
//
// Approve button selector:
page.locator("button").filter({ hasText: "Approve" }).first();
// Reject dialog opens with textarea[placeholder="Rejection reason (required)"]
// Approve dialog (for >= 500K): textarea with comment field
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single-role E2E (loginAsManager) | Multi-role E2E (loginAsRole) | Phase 53 | Tests permission guards for 4 roles across 9 pages |
| No expense E2E coverage | Full lifecycle E2E + P&L verification | Phase 53 | Catches regressions in submit->approve->reimburse->P&L chain |

**Current infrastructure:**
- Playwright ^1.58.2 with sequential execution
- 12 existing spec files, all using loginAsManager pattern
- global-setup.ts with ConvexHttpClient for user preparation
- helpers.ts with login, navigation, wait, screenshot utilities

## Open Questions

1. **Logout Mechanism**
   - What we know: No `/logout` route exists. Auth uses session tokens in localStorage/AuthContext.
   - What's unclear: Exact key name in localStorage for session token.
   - Recommendation: Use `page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); })` to force logout, then navigate to `/login`. This is the most reliable approach. Alternatively, find the logout button in the UI (if header/menu has one).

2. **P&L Period Mode for Verification**
   - What we know: /financials page supports week/month/custom period modes. Expense test data uses specific dates.
   - What's unclear: Whether the default period mode (monthly) will include the test expense dates.
   - Recommendation: After approving a test expense, switch /financials to "Custom Range" mode covering the test expense date range, then verify amounts.

3. **Test File Organization Recommendation (Claude's Discretion)**
   - Multiple focused specs recommended over one large file. Reasons:
     - Playwright reports show per-file results clearly
     - Access tests (permission guards) are independent from lifecycle tests
     - CSV import is self-contained
     - If one spec fails, others still run and report
   - Use `test.describe.serial()` within lifecycle spec (order matters: submit before approve before reimburse)
   - Separate files don't need `serial()` -- Playwright runs files sequentially due to `workers: 1`

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | @playwright/test ^1.58.2 |
| Config file | `playwright.config.ts` (exists) |
| Quick run command | `npx playwright test tests/e2e/expense-lifecycle.spec.ts` |
| Full suite command | `npx playwright test` |

### Phase Requirements -> Test Map
| Behavior | Test Type | Spec File | Notes |
|----------|-----------|-----------|-------|
| Multi-role auth setup (4 E2E users) | smoke | global-setup.ts extension | Verified by all tests running |
| Permission guards (9 routes x 4 roles) | e2e | expense-access.spec.ts | Admin sees all, kitchen sees /expenses only |
| Expense submit + approve lifecycle | e2e | expense-lifecycle.spec.ts | Role switching: order_staff -> admin |
| Self-approval block (EXP-10) | e2e | expense-approval.spec.ts | Submit as X, try approve as X: not in queue |
| DoA threshold (EXP-08/09) | e2e | expense-approval.spec.ts | Manager can't approve > 500K |
| Fraud flags visibility (FRAUD-01/03/04) | e2e | expense-approval.spec.ts | Duplicate, late, rejection badges |
| Rejection + resubmit flow (EXP-13) | e2e | expense-approval.spec.ts | Reject, edit, resubmit |
| Reimbursement batch workflow (RMB-01..06) | e2e | expense-lifecycle.spec.ts | Create batch, confirm, verify P&L |
| CSV import with valid/invalid rows | e2e | expense-csv-import.spec.ts | Fixture file, error display, success |
| P&L verification (PNL-01) | e2e | expense-lifecycle.spec.ts or csv-import | Amount appears in OpEx breakdown |
| Analytics dashboard (XANL-01..06) | e2e | expense-analytics.spec.ts | Page loads, charts render, period nav |
| Payroll entry + void (PAY-01..03) | e2e | expense-analytics.spec.ts | Create entry, verify JE, void |
| Bank accounts CRUD (RMB-07) | e2e | expense-analytics.spec.ts | EntityManager pattern |
| Chart of Accounts view (COA-01) | e2e | expense-analytics.spec.ts | Table with codes, types |

### Sampling Rate
- **Per task commit:** Run the specific spec file being developed
- **Per wave merge:** `npx playwright test` (full E2E suite)
- **Phase gate:** Full E2E suite green + `npm run test` (690+ unit tests green)

### Wave 0 Gaps
- [ ] `tests/e2e/fixtures/test-expenses.csv` -- CSV import test data
- [ ] `tests/e2e/helpers.ts` -- needs `loginAsRole()` and `logout()` additions
- [ ] `tests/e2e/global-setup.ts` -- needs multi-user creation loop
- [ ] No new framework install needed -- Playwright already configured

## Route and Permission Matrix

This is the definitive map of routes, permissions, and expected behavior per role:

| Route | Permission | kitchen | order_staff | manager | admin |
|-------|-----------|---------|-------------|---------|-------|
| `/expenses` | canSubmitExpenses | OK | OK | OK | OK |
| `/expenses/new` | canSubmitExpenses | OK | OK | OK | OK |
| `/expenses/approve` | canApproveExpenses | BLOCKED | BLOCKED | OK | OK |
| `/expense-analytics` | canAccessExpenseAnalytics | BLOCKED | BLOCKED | OK | OK |
| `/reimbursements` | canManageReimbursements | BLOCKED | BLOCKED | BLOCKED | OK |
| `/bank-accounts` | canManageReimbursements | BLOCKED | BLOCKED | BLOCKED | OK |
| `/payroll` | canManageReimbursements | BLOCKED | BLOCKED | BLOCKED | OK |
| `/accounts` | canManageReimbursements | BLOCKED | BLOCKED | BLOCKED | OK |
| `/import` | canManageReimbursements | BLOCKED | BLOCKED | BLOCKED | OK |

**BLOCKED redirect targets:**
- kitchen -> `/kitchen`
- order_staff -> `/orders`
- manager -> `/home`

## Seeded GL Accounts for Test Data

OpEx accounts available for expense tests (all are `isSystem: true`, seeded by `accounts:seedDefaults`):

| Code | Name | Use in Tests |
|------|------|-------------|
| 6100 | Salaries & Wages | Payroll tests only |
| 6200 | Rent & Utilities | Expense lifecycle, CSV import |
| 6300 | Transportation (Local) | Small expense tests |
| 6350 | Travel & Visa | -- |
| 6400 | Marketing & Promotion | -- |
| 6500 | Office & Supplies | Expense lifecycle, CSV import |
| 6600 | Equipment & Maintenance | -- |
| 6700 | Software & Subscriptions | CSV import |
| 6800 | Professional Services | -- |
| 6900 | Meals & Entertainment | CSV import |
| 6990 | Miscellaneous OpEx | -- |

## Key Business Constants for Tests

| Constant | Value | Impact on Tests |
|----------|-------|-----------------|
| DOA_ADMIN_ONLY_THRESHOLD | Rp 500,000 | Manager can't approve above this |
| COMMENT_REQUIRED_THRESHOLD | Rp 500,000 | Approve dialog required for >= this |
| RECEIPT_THRESHOLD | Rp 50,000 | Receipt warning for > this (soft) |
| LATE_SUBMISSION_DAYS | 14 | Late flag shown if expense date > 14 days ago |
| DUPLICATE_WINDOW_DAYS | 7 | Duplicate flag if same amount within 7 days |

## Sources

### Primary (HIGH confidence)
- `playwright.config.ts` -- Playwright configuration (workers: 1, fullyParallel: false, timeout: 60s)
- `tests/e2e/global-setup.ts` -- Existing global setup pattern with ConvexHttpClient
- `tests/e2e/helpers.ts` -- Existing helpers (loginAsManager, navigateTo, waitForDataLoad, screenshot)
- `tests/e2e/order-lifecycle.spec.ts` -- Reference lifecycle test implementation
- `tests/e2e/income-statement-uat.spec.ts` -- Reference UAT test with P&L verification
- `src/App.tsx` (lines 260-342) -- All 9 expense route definitions with permission guards
- `src/pages/ExpenseSubmit.tsx` -- Form structure with HTML ids on inputs
- `src/pages/ExpenseApproval.tsx` -- Approval queue with FraudFlags and ApprovalActions
- `src/components/expenses/FraudFlags.tsx` -- Badge selectors for duplicate, late, rejection
- `src/components/expenses/ApprovalActions.tsx` -- Approve/Reject/Void button and dialog structure
- `convex/expenses/helpers.ts` -- DoA constants and validation logic
- `convex/auth/mutations.ts` -- createUser, resetPin, unlockUser mutations
- `convex/auth/queries.ts` -- getActiveUsers query (used in global-setup)
- `src/components/auth/AvatarGrid.tsx` -- Avatar grid button structure (name + role badge)
- `src/components/auth/PinPad.tsx` -- PIN pad grid layout (3-column)
- `src/lib/csvImportValidation.ts` -- CSV format: date, amount, description, vendorName, accountCode, receiptUrl
- `src/pages/HistoricalImportPage.tsx` -- Wizard states: upload, validating, review, importing, complete, error
- `convex/accounts/mutations.ts` (lines 47-82) -- Seeded GL accounts with codes
- `src/lib/types.ts` (lines 724-807) -- ROLE_PERMISSIONS per role for all 4 expense permissions

### Secondary (MEDIUM confidence)
- `src/pages/FinancialStatement.tsx` -- P&L page structure for amount verification (OpEx section uses journal aggregation)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all tools already installed and configured
- Architecture: HIGH -- extending existing patterns, form selectors verified from source code
- Pitfalls: HIGH -- identified from direct code reading (session persistence, Convex timing, Select interaction, logout flow)
- Route/permission matrix: HIGH -- verified from App.tsx route definitions + types.ts ROLE_PERMISSIONS

**Research date:** 2026-03-15
**Valid until:** 2026-04-15 (stable -- E2E infrastructure unlikely to change)
