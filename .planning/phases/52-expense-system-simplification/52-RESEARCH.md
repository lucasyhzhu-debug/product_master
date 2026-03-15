# Phase 52: Expense System Simplification - Research

**Researched:** 2026-03-15
**Domain:** Refactoring / Code Consolidation (TypeScript, Convex, React)
**Confidence:** HIGH

## Summary

Phase 52 is a pure refactoring phase with zero behavior changes. The SIMPLIFICATION-REPORT.md (produced by a 3-agent review) identifies 17 findings across v1.7 expense code (phases 41-50), with F1-F14 in scope and F15-F17 deferred. All 14 in-scope findings have been verified against the current codebase -- every pattern/code issue described in the report still exists and the proposed fixes are valid.

The findings fall into four categories: (1) backend consolidation -- parallel DB reads, shared validators, threshold constant unification; (2) frontend shared components -- extract VoidReasonDialog, ActionDialog, MarginRow; (3) utility cleanup -- consolidate wibMidnightToUtc copies, fix any types, add useMemo; (4) verification. Test coverage exists for the pure helper functions and the analytics integration tests, but the tests do NOT assert on specific error messages for void/reject reasons, so F3's error message change is safe.

**Primary recommendation:** Execute the 14 findings in 3 implementation waves (backend, frontend, utilities) plus a verification wave. Each wave is independent of the others and can run in parallel, but sequential execution is safer for a refactoring phase since changes compound.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- F1: `getFraudFlags` MUST query 4 statuses x 1 window (90 days) in single `Promise.all`, then slice in memory for 7d/30d subsets. Extract `toExpenseForFraud()` helper. Target: 10 DB reads to 4.
- F2: All sequential `for...of` + `await ctx.db.get()` loops in payroll/reimbursement files MUST be replaced with `Promise.all` parallel fetches (6 call sites).
- F3: `rejectExpense` and `voidExpense` in `convex/expenses/mutations.ts` MUST use `validateRequiredReason` from `convex/lib/validation.ts`.
- F4: `DOA_ADMIN_ONLY_THRESHOLD` and `COMMENT_REQUIRED_THRESHOLD` MUST be unified to `EXPENSE_HIGH_VALUE_THRESHOLD = 500_000` with aliases. Frontend `ApprovalActions.tsx` must use `formatCurrency(COMMENT_REQUIRED_THRESHOLD)` instead of hardcoded "500K".
- F5: `convex/bankAccounts/mutations.ts` referential integrity check MUST run both reimbursement batch queries with `Promise.all`.
- F6: Extract `VoidReasonDialog` from `PayrollManager.tsx` and `ReimbursementManager.tsx` into `src/components/shared/VoidReasonDialog.tsx`.
- F7: Extract `ActionDialog` from `ApprovalActions.tsx` with specified props.
- F8: Extract `MarginRow` component from `FinancialStatement.tsx` for the 3 repeated margin percentage rows.
- F9: Add `className?: string` prop to `ExpenseCard.tsx`, merge with `cn()`. Remove wrapper `<div>` in `MyExpenses.tsx`.
- F10: Consolidate `wibMidnightToUtc` into `src/lib/dateUtils.ts`. Delete copies from `src/lib/expenseAnalyticsPeriod.ts`, `src/hooks/convex/useFinancials.ts`, `src/pages/FinancialStatement.tsx`.
- F11: Consolidate `fmtDelta` and `formatDeltaPct` in `src/lib/csvExport.ts` into one function.
- F12: Replace `any` types in `ReimbursementManager.tsx` (lines 222, 329) with proper types.
- F13: Initialize `getCurrentWibMonth()` once in `ExpenseAnalytics.tsx`, not 3-4 times.
- F14: Add `useMemo` for `accountMap` in `ExpenseApproval.tsx`.

### Claude's Discretion
- Internal naming of extracted components (e.g., `ActionDialog` vs `ConfirmActionDialog`)
- Whether F13 collapses to single state object or just deduplicates the init call
- Import organization and barrel export decisions for new shared components
- Whether `MarginRow` is a local component or shared component

### Deferred Ideas (OUT OF SCOPE)
- F15: Payroll file upload reimplements ReceiptUpload pattern
- F16: csvExport.ts interface drift risk
- F17: Seed function sequential lookups (39 accounts)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| F1 | Consolidate fraud flag queries: 10 to 4 DB reads | Verified: `getFraudFlags` at lines 212-353 in analyticsQueries.ts has 3 sequential `Promise.all` blocks (3+3+4 = 10 queries). 90-day window IS a superset. Three identical `.map(e => ({...}))` casts confirmed. |
| F2 | Sequential user/entity fetches to Promise.all (6 locations) | Verified: Sequential `for...of` loops confirmed in payroll/queries.ts:71-76, reimbursements/queries.ts:60-65, reimbursements/mutations.ts:60-95 (createBatch), 219-238 (confirmBatch), 301-318 (voidBatch). Payroll/mutations.ts:60-68 has sequential account lookups. |
| F3 | Use shared validateRequiredReason in expense mutations | Verified: Lines 449-453 (rejectExpense) and 496-500 (voidExpense) do inline trim+check. NOTE: rejectExpense throws "Rejection reason is required" vs validateRequiredReason throws "Void reason is required" -- need parameterized message or separate validator. |
| F4 | Consolidate identical threshold constants | Verified: helpers.ts lines 13-14 have `DOA_ADMIN_ONLY_THRESHOLD = 500_000` and `COMMENT_REQUIRED_THRESHOLD = 500_000`. ApprovalActions.tsx lines 162, 169 have hardcoded "Rp 500,000" strings. |
| F5 | Optimize bankAccounts referential integrity check | Verified: bankAccounts/mutations.ts lines 106-113 run two sequential indexed queries. |
| F6 | Extract shared VoidReasonDialog component | Verified: PayrollManager.tsx:576-641 and ReimbursementManager.tsx:354-420 have near-identical dialog implementations. |
| F7 | Consolidate ApprovalActions triple dialog | Verified: ApprovalActions.tsx lines 152-252 have 3 Dialog blocks with identical structure. |
| F8 | Extract MarginRow component for FinancialStatement | Verified: FinancialStatement.tsx has 3 identical `<tr className="bg-muted/20">` blocks at lines 542-578, 625-661, 706-742. |
| F9 | Pass className to ExpenseCard | Verified: MyExpenses.tsx lines 258-267 wraps each ExpenseCard in a div solely for conditional ring styling. ExpenseCard.tsx has no className prop. |
| F10 | Consolidate wibMidnightToUtc (3 copies to 1) | Verified: Copies in expenseAnalyticsPeriod.ts:26-28, useFinancials.ts:39-41. FinancialStatement.tsx:46-50 has `wibDateStrToUtc` (equivalent). Also found local `utcToWibDateStr` and `getCurrentWibMonth` in useFinancials.ts that duplicate dateUtils.ts and expenseAnalyticsPeriod.ts. |
| F11 | Consolidate csvExport.ts delta formatters | Verified: csvExport.ts lines 101-111 have `fmtDelta` and `formatDeltaPct` that produce identical output (format percentage to 1 decimal). |
| F12 | Fix ReimbursementManager any types | Verified: Line 222 `groups.map((group: any)` and line 329 `batches.map((batch: any)`. |
| F13 | Simplify ExpenseAnalytics month state | Verified: Lines 41-52 call `getCurrentWibMonth()` 4 times (monthYear init, monthIndex init, customStart init, customEnd init) and later at line 79. |
| F14 | Add useMemo for accountMap in ExpenseApproval | Verified: Lines 49-54 build accountMap on every render without memoization. |
</phase_requirements>

## Standard Stack

No new libraries needed. This is pure refactoring of existing code.

### Core (Already in Use)
| Library | Version | Purpose | Relevant to Phase |
|---------|---------|---------|-------------------|
| Convex | ^1.31.7 | Backend queries/mutations | F1, F2, F3, F5 |
| React | ^19.2.0 | UI components | F6, F7, F8, F9, F13, F14 |
| TypeScript | ~5.9 | Type safety | F12 |

### Supporting
| Library | Purpose | Used In |
|---------|---------|---------|
| `cn()` from utils.ts | Class name merging | F9 (ExpenseCard className) |
| `formatCurrency` from utils.ts | Currency formatting | F4 (replace hardcoded "500K") |
| `useMemo` from React | Memoization | F14 |

## Architecture Patterns

### Pattern 1: Parallel DB Fetch (F1, F2, F5)

**What:** Replace sequential `for...of` + `await ctx.db.get()` with `Promise.all(ids.map(id => ctx.db.get(id)))`.
**When to use:** Any loop that sequentially awaits independent DB reads.
**Established pattern:** Already used in `getExpenseMetrics` (lines 163-164 of analyticsQueries.ts).

```typescript
// BEFORE (sequential)
const userMap = new Map<string, string>();
for (const userId of userIds) {
  const user = await ctx.db.get(userId as Id<"users">);
  if (user) userMap.set(userId, user.name ?? "Unknown");
}

// AFTER (parallel)
const users = await Promise.all(
  [...userIds].map((id) => ctx.db.get(id as Id<"users">))
);
const userMap = new Map<string, string>();
for (const user of users) {
  if (user) userMap.set(user._id as string, user.name ?? "Unknown");
}
```

### Pattern 2: Shared UI Component Extraction (F6, F7, F8)

**What:** Extract duplicated dialog/row markup into reusable components with callback props.
**When to use:** Two or more locations have structurally identical JSX differing only in labels and callbacks.
**Established pattern:** `ConfirmDialog` already exists in `src/components/shared/ConfirmDialog.tsx`.

```typescript
// VoidReasonDialog pattern
interface VoidReasonDialogProps {
  title: string;
  description: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => Promise<void>;
}
```

### Pattern 3: Utility Consolidation (F10)

**What:** Move duplicated pure functions to their canonical location and re-export.
**When to use:** Same function implemented in 2+ files.
**Established pattern:** `src/lib/dateUtils.ts` is already the canonical WIB timezone utility file (per MEMORY.md).

### Anti-Patterns to Avoid
- **Changing error messages in shared validators without checking tests:** The `validateRequiredReason` function throws "Void reason is required". If used in `rejectExpense`, the error message changes from "Rejection reason is required" to "Void reason is required". This could break user-facing error handling. Solution: either parameterize the validator or accept the message change (tests don't assert on this specific string).
- **Breaking barrel exports:** When adding `VoidReasonDialog` to `src/components/shared/`, update the barrel `index.ts` to re-export it.
- **Removing exports used by tests:** `wibMidnightToUtc` is heavily used in `src/lib/__tests__/expenseAnalyticsPeriod.test.ts` (imported from `expenseAnalyticsPeriod.ts`). When consolidating to `dateUtils.ts`, either re-export from `expenseAnalyticsPeriod.ts` or update the test imports.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| WIB midnight conversion | Local `wibMidnightToUtc` | `src/lib/dateUtils.ts` export | Already 3 copies; 4th would be worse |
| Reason validation | Inline trim+check | `convex/lib/validation.ts` `validateRequiredReason` | Already used by payroll and reimbursements |
| Class merging | Manual string concatenation | `cn()` from `@/lib/utils` | Handles undefined, conditional classes |

## Common Pitfalls

### Pitfall 1: F3 Error Message Mismatch
**What goes wrong:** `validateRequiredReason` throws "Void reason is required" but `rejectExpense` currently throws "Rejection reason is required". Switching to the shared validator changes the user-facing error message.
**Why it happens:** The shared validator was written for void operations. Rejection has a different semantic label.
**How to avoid:** Either (a) parameterize `validateRequiredReason` to accept a custom label, e.g., `validateRequiredReason(reason, "Rejection reason")`, or (b) accept the generic message since the UX impact is minimal (toast shows the error but the user already knows they need a reason because the field is required in the UI). Option (a) is cleanest.
**Warning signs:** Integration test `reimbursementBatch.test.ts:65` asserts on "Void reason is required" string -- if the shared function signature changes, this test must be updated.

### Pitfall 2: F10 Test Import Breakage
**What goes wrong:** `src/lib/__tests__/expenseAnalyticsPeriod.test.ts` imports `wibMidnightToUtc` from `../expenseAnalyticsPeriod`. Removing it from that file breaks 15+ test assertions.
**Why it happens:** Test was written importing from the local module.
**How to avoid:** After moving `wibMidnightToUtc` to `dateUtils.ts`, re-export it from `expenseAnalyticsPeriod.ts`: `export { wibMidnightToUtc } from "@/lib/dateUtils";`. This preserves backward compatibility. Alternatively, update the test imports. The re-export approach is safer.
**Warning signs:** Test failures in `expenseAnalyticsPeriod.test.ts` after the move.

### Pitfall 3: F10 Backend vs Frontend wibMidnightToUtc
**What goes wrong:** Confusing the backend `convex/lib/periodRange.ts:wibMidnightToUtc` with the frontend copies. The backend version must NOT be touched -- it's the canonical backend implementation.
**Why it happens:** Same function name exists in both frontend and backend.
**How to avoid:** F10 only consolidates the 3 FRONTEND copies into `src/lib/dateUtils.ts`. The backend `convex/lib/periodRange.ts` export is a separate, correct implementation and is out of scope.

### Pitfall 4: F1 Query Result Type Mismatch After Consolidation
**What goes wrong:** The 90-day superset query includes `submitted` status (used by split detection for 7d) but concentration detection needs `approved`, `awaiting_payment`, `reimbursed` (30d). Slicing incorrectly could mix statuses.
**Why it happens:** Each fraud detector needs different status subsets.
**How to avoid:** Query all 4 statuses (`submitted`, `approved`, `awaiting_payment`, `reimbursed`) in the 90-day window. Filter by status AND date in memory for each detector. The `toExpenseForFraud()` helper can be applied once to the full result set, then filtered.

### Pitfall 5: F2 Mutation Loop Cannot Be Fully Parallelized
**What goes wrong:** In `reimbursements/mutations.ts:createBatch`, the `for...of` loop at lines 60-95 validates each expense AND checks double-batching. This loop has a sequential dependency: each iteration may throw on invalid state.
**Why it happens:** The validation includes a guard (`if (expense.status !== "awaiting_payment")`) that should short-circuit.
**How to avoid:** Parallelize the `ctx.db.get()` calls but keep the validation loop sequential. Collect all expenses via `Promise.all`, then iterate synchronously for validation. The double-batching check (`ctx.db.query(...).collect()`) can also be parallelized per expense.

### Pitfall 6: F12 Type Inference from Hook Returns
**What goes wrong:** The `any` types exist because TypeScript cannot infer the return type of Convex hooks through barrel exports.
**Why it happens:** `useAwaitingPayment()` and `useBatches()` return Convex query results whose types are complex.
**How to avoid:** Define explicit type aliases in the hook file or use `NonNullable<ReturnType<typeof useAwaitingPayment>>[number]` for the element type. Check what types are already exported from the hooks file.

## Code Examples

### F1: Consolidated Fraud Flag Queries

```typescript
// Query all 4 statuses x 1 window (90 days) in single Promise.all
const [submitted90, approved90, awaiting90, reimbursed90] = await Promise.all([
  ctx.db.query("expenses")
    .withIndex("by_status_expenseDate", (q) =>
      q.eq("status", "submitted").gte("expenseDate", ninetyDaysAgo)
    ).collect(),
  ctx.db.query("expenses")
    .withIndex("by_status_expenseDate", (q) =>
      q.eq("status", "approved").gte("expenseDate", ninetyDaysAgo)
    ).collect(),
  ctx.db.query("expenses")
    .withIndex("by_status_expenseDate", (q) =>
      q.eq("status", "awaiting_payment").gte("expenseDate", ninetyDaysAgo)
    ).collect(),
  ctx.db.query("expenses")
    .withIndex("by_status_expenseDate", (q) =>
      q.eq("status", "reimbursed").gte("expenseDate", ninetyDaysAgo)
    ).collect(),
]);

// Extract toExpenseForFraud helper (replaces 3 identical .map blocks)
function toExpenseForFraud(e: Doc<"expenses">): ExpenseForFraud {
  return {
    _id: e._id as string,
    submittedBy: e.submittedBy as string,
    accountId: e.accountId as string,
    amount: e.amount,
    expenseDate: e.expenseDate,
    approvedBy: e.approvedBy as string | undefined,
    approvedAt: e.approvedAt,
    vendorName: e.vendorName,
    status: e.status,
  };
}

// Slice in memory for different time windows
const all90 = [...submitted90, ...approved90, ...awaiting90, ...reimbursed90];
const allFraud = all90.map(toExpenseForFraud);

// Split detection: submitted/approved/awaiting in last 7 days
const splitInput = allFraud.filter(
  (e) => e.expenseDate >= sevenDaysAgo &&
    ["submitted", "approved", "awaiting_payment"].includes(e.status)
);

// Concentration detection: approved/awaiting/reimbursed in last 30 days
const concInput = allFraud.filter(
  (e) => e.expenseDate >= thirtyDaysAgo &&
    ["approved", "awaiting_payment", "reimbursed"].includes(e.status)
);
```

### F3: Parameterized Reason Validation

```typescript
// convex/lib/validation.ts -- add label parameter with backward-compatible default
export function validateRequiredReason(reason: string, label = "Void reason"): void {
  if (!reason.trim()) {
    throw new Error(`${label} is required`);
  }
}

// Usage in rejectExpense:
validateRequiredReason(args.reason, "Rejection reason");

// Usage in voidExpense:
validateRequiredReason(args.reason); // defaults to "Void reason"
```

### F6: VoidReasonDialog Shared Component

```typescript
// src/components/shared/VoidReasonDialog.tsx
interface VoidReasonDialogProps {
  title: string;
  description: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => Promise<void>;
  confirmLabel?: string; // default: "Void Entry"
  confirmingLabel?: string; // default: "Voiding..."
}
```

### F10: dateUtils.ts Addition

```typescript
// Add to src/lib/dateUtils.ts
/** Convert WIB midnight (year, month, day) to UTC epoch ms. WIB 00:00 = UTC -7h. */
export function wibMidnightToUtc(year: number, month: number, day: number): number {
  return Date.UTC(year, month, day, -7, 0, 0, 0);
}
```

## Verification Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^4.0.18 + convex-test |
| Config file | vitest.config.ts |
| Quick run command | `npm run test` |
| Full suite command | `npm run test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| F1 | getFraudFlags returns same results with fewer queries | integration | `npx vitest run tests/convex/expenseAnalytics.test.ts -x` | Yes |
| F2 | Payroll/reimbursement queries return same results | integration | `npx vitest run tests/convex/payroll.test.ts tests/convex/reimbursementBatch.test.ts -x` | Yes |
| F3 | Reject/void throw on empty reason | unit | `npx vitest run convex/expenses/__tests__/helpers.test.ts -x` | Partial (helpers tested, mutation-level not directly) |
| F4 | Threshold constants match | unit | `npx vitest run convex/expenses/__tests__/helpers.test.ts -x` | Yes (asserts constant values) |
| F5 | Bank account delete guards work | manual-only | N/A | No test file |
| F6-F9 | UI components render correctly | manual-only | `npm run build` (type check) | No test files |
| F10 | wibMidnightToUtc works from dateUtils | unit | `npx vitest run src/lib/__tests__/expenseAnalyticsPeriod.test.ts -x` | Yes (tests the function, import path needs updating) |
| F11 | CSV delta formatting works | manual-only | `npm run build` (type check) | No test file |
| F12 | No any types | static | `npm run type-check` | N/A (compiler check) |
| F13-F14 | React state/memo patterns | manual-only | `npm run build` | No test files |

### Sampling Rate
- **Per task commit:** `npm run type-check && npm run test`
- **Per wave merge:** `npm run build && npm run test`
- **Phase gate:** Full suite green + `npm run build` before verification

### Wave 0 Gaps
None -- existing test infrastructure covers all phase requirements. No new test files needed (this is a zero-behavior-change refactoring; existing tests must pass unchanged).

## Critical Implementation Details

### F1: Status Sets Per Detector

| Detector | Statuses Needed | Time Window | Source in 90d Superset |
|----------|----------------|-------------|----------------------|
| Split (FRAUD-06) | submitted, approved, awaiting_payment | 7 days | Filter by date >= 7dAgo AND status in set |
| Concentration (FRAUD-07) | approved, awaiting_payment, reimbursed | 30 days | Filter by date >= 30dAgo AND status in set |
| Unfamiliar Vendor (FRAUD-08) | submitted, approved, awaiting_payment, reimbursed | 90 days (30d recent vs 30-90d historical) | Use full set, split by date threshold |

### F2: Call Sites and Parallelization Strategy

| File | Location | Current Pattern | Fix |
|------|----------|----------------|-----|
| payroll/queries.ts:71-76 | `list` handler | `for (userId of userIds) { await ctx.db.get() }` | `Promise.all([...userIds].map(id => ctx.db.get(id)))` |
| reimbursements/queries.ts:60-65 | `listAwaitingPayment` handler | `for (group of byEmployee) { await ctx.db.get() }` | `Promise.all` on unique user IDs |
| reimbursements/mutations.ts:60-95 | `createBatch` handler | `for (expenseId of expenseIds) { await ctx.db.get() }` | `Promise.all` for fetches, then sequential validation |
| reimbursements/mutations.ts:219-238 | `confirmBatch` handler | `for (item of batchItems) { await ctx.db.get(); await patch; await audit }` | Fetch all expenses via `Promise.all`, validate, then sequential patch+audit (writes MUST be sequential in Convex) |
| reimbursements/mutations.ts:301-318 | `voidBatch` handler | Same pattern as confirmBatch | Same fix as confirmBatch |
| payroll/mutations.ts:60-68 | `create` handler | Two sequential account lookups by code | `Promise.all([debitQuery, creditQuery])` |

**Important Convex constraint:** `ctx.db.patch()` and `ctx.db.insert()` are writes and should remain sequential -- only the reads can be parallelized.

### F3: validateRequiredReason Parameterization

The shared `validateRequiredReason` in `convex/lib/validation.ts` currently has a hardcoded error message "Void reason is required". To use it for rejection, add an optional label parameter:

- `rejectExpense` calls: `validateRequiredReason(args.reason, "Rejection reason")`
- `voidExpense` calls: `validateRequiredReason(args.reason)` (default "Void reason")
- Existing callers in payroll/reimbursements are unaffected (they use void semantics)

Test impact: `convex/reimbursements/__tests__/helpers.test.ts:65` asserts `"Void reason is required"` -- still passes since default label is unchanged.

### F10: Import Dependency Chain

After consolidation:
1. `src/lib/dateUtils.ts` -- exports `wibMidnightToUtc` (canonical)
2. `src/lib/expenseAnalyticsPeriod.ts` -- re-exports from dateUtils (backward compat for tests + ExpenseAnalytics.tsx import)
3. `src/hooks/convex/useFinancials.ts` -- imports from dateUtils (delete local copy)
4. `src/pages/FinancialStatement.tsx` -- imports from dateUtils (delete local `wibDateStrToUtc` and `utcToWibDateStr`)

Note: `FinancialStatement.tsx` has a LOCAL `utcToWibDateStr` (line 37) that differs from `dateUtils.ts` export -- the dateUtils version is simpler. The local copy in FinancialStatement.tsx also has a local `wibDateStrToUtc` (line 46) which is equivalent to `wibDateStrToUtcMs` from dateUtils. Both local copies should be deleted and replaced with dateUtils imports.

Also: `useFinancials.ts` has a local `getCurrentWibMonth` (line 32) that is identical to the one in `expenseAnalyticsPeriod.ts`. This can be imported from `expenseAnalyticsPeriod.ts` or moved to `dateUtils.ts`. Since `dateUtils.ts` is the canonical WIB helper file, moving `getCurrentWibMonth` there is cleanest.

### F4: Threshold Constant Consolidation

```
Current:
  helpers.ts:13  DOA_ADMIN_ONLY_THRESHOLD = 500_000
  helpers.ts:14  COMMENT_REQUIRED_THRESHOLD = 500_000

After:
  helpers.ts:13  EXPENSE_HIGH_VALUE_THRESHOLD = 500_000
  helpers.ts:14  DOA_ADMIN_ONLY_THRESHOLD = EXPENSE_HIGH_VALUE_THRESHOLD  // alias
  helpers.ts:15  COMMENT_REQUIRED_THRESHOLD = EXPENSE_HIGH_VALUE_THRESHOLD  // alias
```

Aliases preserve all existing imports. Tests in `convex/expenses/__tests__/helpers.test.ts` import both `DOA_ADMIN_ONLY_THRESHOLD` and `COMMENT_REQUIRED_THRESHOLD` -- aliases keep them working.

Frontend impact: `ApprovalActions.tsx` already imports `COMMENT_REQUIRED_THRESHOLD` from helpers. Lines 162 and 169 have hardcoded `"Rp 500,000"` strings that should use `formatCurrency(COMMENT_REQUIRED_THRESHOLD)`.

### F8: MarginRow Decision -- Local vs Shared

The MarginRow component is only used in `FinancialStatement.tsx`. Recommendation: keep it as a local component within the same file (or in `src/components/financials/MarginRow.tsx` co-located with `PLRow` and `ChannelRow`). No need to put it in `shared/` since it's domain-specific to the P&L table.

## File Impact Map

| File | Findings | Changes |
|------|----------|---------|
| `convex/expenses/analyticsQueries.ts` | F1 | Major refactor of getFraudFlags |
| `convex/expenses/mutations.ts` | F3 | Replace inline validation with shared helper |
| `convex/expenses/helpers.ts` | F4 | Add EXPENSE_HIGH_VALUE_THRESHOLD, alias existing |
| `convex/lib/validation.ts` | F3 | Add optional label parameter |
| `convex/bankAccounts/mutations.ts` | F5 | Wrap two queries in Promise.all |
| `convex/payroll/queries.ts` | F2 | Parallel user fetch in list |
| `convex/payroll/mutations.ts` | F2 | Parallel account lookup in create |
| `convex/reimbursements/queries.ts` | F2 | Parallel user fetch in listAwaitingPayment |
| `convex/reimbursements/mutations.ts` | F2 | Parallel fetches in createBatch, confirmBatch, voidBatch |
| `src/components/shared/VoidReasonDialog.tsx` | F6 | **NEW FILE** |
| `src/components/shared/index.ts` | F6 | Add VoidReasonDialog export |
| `src/pages/PayrollManager.tsx` | F6 | Replace VoidPayrollDialog with VoidReasonDialog |
| `src/pages/ReimbursementManager.tsx` | F6, F12 | Replace VoidDialog with VoidReasonDialog, fix any types |
| `src/components/expenses/ApprovalActions.tsx` | F7, F4 | Extract ActionDialog, use formatCurrency for threshold |
| `src/pages/FinancialStatement.tsx` | F8, F10 | Extract MarginRow, remove local wib helpers |
| `src/components/expenses/ExpenseCard.tsx` | F9 | Add className prop |
| `src/pages/MyExpenses.tsx` | F9 | Remove wrapper div, pass className |
| `src/lib/dateUtils.ts` | F10 | Add wibMidnightToUtc export |
| `src/lib/expenseAnalyticsPeriod.ts` | F10 | Delete local wibMidnightToUtc, re-export from dateUtils |
| `src/hooks/convex/useFinancials.ts` | F10 | Delete local wibMidnightToUtc, import from dateUtils |
| `src/lib/csvExport.ts` | F11 | Consolidate fmtDelta and formatDeltaPct |
| `src/pages/ExpenseAnalytics.tsx` | F13 | Deduplicate getCurrentWibMonth calls |
| `src/pages/ExpenseApproval.tsx` | F14 | Wrap accountMap in useMemo |

**Total files changed:** 21 (20 modified + 1 new)

## Open Questions

1. **F3 error message approach:**
   - What we know: `validateRequiredReason` throws "Void reason is required"; rejectExpense needs "Rejection reason is required"
   - What's unclear: Whether changing the error message matters for UX
   - Recommendation: Parameterize with `label` parameter (backward compatible, cleanest)

2. **F10 getCurrentWibMonth consolidation scope:**
   - What we know: `getCurrentWibMonth` exists in both `expenseAnalyticsPeriod.ts` and `useFinancials.ts` (identical implementation)
   - What's unclear: Whether to move it to `dateUtils.ts` or just import from `expenseAnalyticsPeriod.ts`
   - Recommendation: Move to `dateUtils.ts` (canonical WIB helper file), re-export from `expenseAnalyticsPeriod.ts`

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection of all 21 affected files
- SIMPLIFICATION-REPORT.md (3-agent review output)
- Existing test files confirming test coverage boundaries

### Secondary (MEDIUM confidence)
- N/A (pure refactoring, no external dependencies)

### Tertiary (LOW confidence)
- N/A

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new dependencies, pure refactoring
- Architecture: HIGH - all patterns already established in codebase
- Pitfalls: HIGH - every finding verified against current source code with line numbers

**Research date:** 2026-03-15
**Valid until:** No expiry (codebase-specific findings, not library-version dependent)
