# Pitfalls Research: v1.7 Expense & Accounting System

**Domain:** Employee expense management, double-entry accounting, and P&L extension -- added to an existing Convex + React 19 production system (65 tables, 150 indexes, ~131K LOC TypeScript)
**Researched:** 2026-03-12
**Confidence:** HIGH (Convex-specific pitfalls from 40 phases of direct production experience documented in CLAUDE.md; accounting pitfalls from design spec and staff review analysis; integration pitfalls from existing incomeStatement.ts code inspection)

---

## Critical Pitfalls

Mistakes that cause incorrect financial reporting, unbalanced books, data corruption, or a rewrite of the journal entry system.

---

### Pitfall 1: Reversal Journal Entries Using `Date.now()` Instead of Original Business Date

**What goes wrong:**
When voiding an expense or reimbursement batch, the reversing journal entry is dated with `Date.now()` (the current timestamp) instead of the original entry's business date. A reversal created on March 15 for an expense dated March 5 shows the reversal in the March 15 period. The P&L for March 5-11 still shows the expense as if it were valid, while March 12-18 shows a phantom credit. Period-correct P&L is broken.

**Why it happens:**
`Date.now()` is the Convex pattern for timestamping events (used in `logOrderEvent`, `logStatusTransition`, session creation). Developers apply the same pattern to journal entries without recognizing that accounting reversals have different date semantics than audit log timestamps. The staff review (C1) flagged this exact bug in the implementation plan.

**How to avoid:**
Accept a `reversalDate` parameter in `createReversingEntry()`. Set the default policy: "Reversals post to the same period as the original entry." For expense voids, use `originalExpense.expenseDate`. For batch voids, use `originalBatch.transferDate` (or the original confirmation journal entry's date). Document this as an explicit accounting policy comment in the code. Write a unit test: create a JE on March 5, void on March 15, assert `reversalEntry.date === originalEntry.date`, NOT `Date.now()`.

**Warning signs:**
- P&L for a closed period changes after a void in a later period
- `journalEntryLines` with `entryDate` in a period that has no corresponding expense submissions
- OpEx totals going negative in a period (reversal without matching original)

**Phase to address:** Backend foundation (journal entry helper implementation) -- the `createReversingEntry` function design.

---

### Pitfall 2: `_creationTime` Used for Period Filtering Instead of `entryDate`

**What goes wrong:**
The P&L extension queries `journalEntryLines` to aggregate OpEx for a selected period. If the query filters by `_creationTime` instead of the denormalized `entryDate` field, entries appear in the wrong period. An expense from March 1 approved and journaled on March 8 shows in the March 8 period instead of the March 1 period. This is the most common accounting data error in Convex apps.

**Why it happens:**
Convex's `_creationTime` is the default timestamp developers reach for. The project has an explicit documented lesson: "`_creationTime` is insertion time, NOT business event time -- use `completedAt` for filtering" (CLAUDE.md Common Pitfalls). But this lesson refers to orders, not journal entries. The accounting system introduces a new table where the same trap applies with higher stakes.

**How to avoid:**
The spec already mandates `entryDate` denormalization on `journalEntryLines`. Enforce this in three places:
1. The `createJournalEntry` helper MUST copy `journalEntries.date` into every `journalEntryLines.entryDate` field. Write a unit test asserting they match.
2. The `getOpExByPeriod` query MUST use `.withIndex("by_account_entryDate", ...)` or the recommended `by_entryDate` index -- never `_creationTime`.
3. Add a comment at the top of `convex/journal/queries.ts`: "ALL period filters use entryDate (business date), never _creationTime (insertion time)."

**Warning signs:**
- Any `.filter(q => q.gte(q.field("_creationTime"), ...))` pattern in journal query files
- Period totals that change depending on when the approval mutation ran rather than when the expense occurred
- Tests using `Date.now()` as the period boundary instead of explicit business dates

**Phase to address:** Backend foundation (journal entry queries) and P&L integration wave.

---

### Pitfall 3: N+1 Query Pattern in OpEx Period Aggregation

**What goes wrong:**
The `getOpExByPeriod` query fetches all 11 OpEx accounts, then loops through each one issuing a separate indexed query per account against `journalEntryLines`. With 11 OpEx accounts plus 3 Other Income/Expense accounts, this is 14 sequential database round-trips per P&L render. Combined with the existing income statement's ~10 parallel reads for revenue/COGS, the total query count approaches 25. The P&L page becomes noticeably slow, especially on mobile (the primary access device for this SME).

**Why it happens:**
The `by_account_entryDate` compound index requires the `accountId` as the first key. Without a `by_entryDate` index, there's no way to fetch all journal lines in a period in a single query. The N+1 pattern feels natural: "for each account, get its entries." The staff review (C2) flagged this.

**How to avoid:**
Add a `by_entryDate` index to `journalEntryLines`. Fetch ALL journal lines in the period in one indexed query, then group by `accountId` in memory. This reduces 14 DB round-trips to 1. The in-memory grouping is trivial for the expected volume (dozens of entries per week at current scale).

```typescript
// GOOD: Single query, in-memory grouping
const allLines = await ctx.db.query("journalEntryLines")
  .withIndex("by_entryDate", q => q.gte("entryDate", periodStart).lt("entryDate", periodEnd))
  .collect();
const byAccount = new Map<string, typeof allLines>();
for (const line of allLines) {
  const existing = byAccount.get(line.accountId) ?? [];
  existing.push(line);
  byAccount.set(line.accountId, existing);
}

// BAD: N+1 per-account queries
for (const account of opexAccounts) {
  const lines = await ctx.db.query("journalEntryLines")
    .withIndex("by_account_entryDate", q => q.eq("accountId", account._id).gte("entryDate", start))
    .collect();
}
```

**Warning signs:**
- P&L page taking >2 seconds to render (visible in Convex dashboard function execution time)
- `getOpExByPeriod` query showing 11+ database reads in Convex logs
- Mobile users complaining about Financial Statement page being slow

**Phase to address:** Schema phase (add `by_entryDate` index) and P&L integration wave (query implementation).

---

### Pitfall 4: Unbalanced Journal Entries Silently Committed

**What goes wrong:**
A journal entry is created where total debits do not equal total credits. The unbalanced entry corrupts the general ledger. Every downstream report (P&L, future Balance Sheet, Cash Flow) produces incorrect figures. The error compounds with every subsequent entry because GL balances are running totals.

**Why it happens:**
The `createJournalEntry` mutation inserts the header and line items as separate DB writes. If the balance check is performed on the input arguments but a rounding error or off-by-one produces mismatched amounts, the entry is committed before validation. Floating-point arithmetic in JavaScript is the root cause: `0.1 + 0.2 !== 0.3`. IDR amounts are whole numbers (no decimals) so this is less risky, but any future extension to non-IDR currencies reintroduces the problem.

**How to avoid:**
Validate `Math.abs(totalDebits - totalCredits) < 1` (1 IDR tolerance for rounding) as the first step in `createJournalEntry`, before any `ctx.db.insert`. Throw a hard error if unbalanced. This is non-negotiable -- every accounting system enforces this invariant. Write a unit test that attempts to create a JE with debits=100000 and credits=99999 and expects it to succeed (within tolerance), and another with debits=100000 and credits=98000 that throws. Also write a periodic integrity check query: scan all `journalEntries`, join to their lines, and flag any where `sum(debits) !== sum(credits)`.

**Warning signs:**
- Trial balance (sum of all account balances) not equaling zero
- OpEx total not matching the sum of individual GL account totals
- Any `journalEntryLines` rows with both `debitAmount > 0` AND `creditAmount > 0` on the same line

**Phase to address:** Backend foundation (journal mutation implementation) -- must be the first validation in `createJournalEntry`.

---

### Pitfall 5: Receipt Upload Race Condition -- File Stored but Expense Mutation Fails

**What goes wrong:**
The receipt upload flow is a two-step process: (1) call `generateUploadUrl`, upload file to `_storage`, get `storageId`; (2) call `submitExpense` mutation with the `storageId`. If step 2 fails (validation error, network timeout, user navigates away), the file is orphaned in `_storage` with no referencing document. Over time, orphaned files accumulate, consuming storage quota. More critically, if the user retries the submission without re-uploading, the `storageId` from the previous attempt might have expired or been garbage-collected, and the expense is submitted without a receipt.

**Why it happens:**
Convex file upload is inherently a two-phase operation (get URL + upload to storage, then reference in a document). This is not transactional -- the file upload and the document write cannot be atomically linked. The staff review (I5) flagged the missing upload flow documentation. The existing codebase has two `generateUploadUrl` implementations (feedback, grabfoodMenu) but neither handles orphan cleanup.

**How to avoid:**
1. Compute SHA-256 hash client-side BEFORE uploading (using `crypto.subtle.digest`).
2. Upload file to `_storage` and receive `storageId`.
3. Pass both `storageId` and `receiptImageHash` to the `saveDraft` or `submitExpense` mutation.
4. If the mutation fails, show a clear retry button that does NOT re-upload the file -- it reuses the existing `storageId`.
5. For orphan cleanup: add a scheduled job (or manual admin action) that queries `_storage` for files not referenced by any `expenses.receiptFileId`. This is a "nice to have" -- at current scale (5-10 expenses/week), orphans are negligible.

Do NOT delete receipt files after expense void -- the spec explicitly states "Receipt files linked to journal entries, not deletable after approval."

**Warning signs:**
- `_storage` growing faster than expected
- Expenses submitted without `receiptFileId` despite the user uploading a file
- Console errors during the upload-then-submit flow

**Phase to address:** Frontend expense form implementation and backend expense mutation -- the upload flow must be designed as an atomic-feeling UX even though it is technically two steps.

---

### Pitfall 6: Expense Approval Mutation Not Checking Current Status (Concurrency)

**What goes wrong:**
Two managers both see the same expense in their approval queue. Both click "Approve" within seconds. The first approval creates a journal entry. The second approval creates a DUPLICATE journal entry for the same expense. The expense amount is double-counted in OpEx.

**Why it happens:**
Convex mutations have optimistic concurrency control (OCC) -- if two mutations read and write the same document, the second one is retried. BUT the retry only triggers if the mutations conflict on the same document fields. If the approval mutation reads the expense, checks status, writes the JE, and patches the expense status -- the second mutation's read happens AFTER the first's write because of OCC. This should work correctly IF the status check (`expense.status === "submitted"`) is a hard guard that throws before creating the JE.

The pitfall is writing the approval mutation as: (1) create JE, (2) THEN check status. If the JE creation is done before the status check, the OCC retry still creates the JE before discovering the expense is already approved.

**How to avoid:**
Structure the approval mutation as:
1. Read expense document
2. Check `expense.status === "submitted"` -- throw "Expense already processed" if not
3. ONLY THEN create the journal entry
4. Patch expense status to `approved` / `awaiting_payment`

The read-check-write pattern within a single Convex mutation is atomic because of OCC. The key is: check BEFORE write. Write a unit test that simulates concurrent approval: call the approve mutation twice for the same expense -- second call must throw, and only ONE journal entry exists.

**Warning signs:**
- Two journal entries with the same `sourceId` and `sourceType: "expense_approval"`
- Expense amount appearing doubled in OpEx totals
- `expenseStatusHistory` showing two `submitted -> approved` transitions for the same expense

**Phase to address:** Backend expense lifecycle (approval mutation implementation).

---

### Pitfall 7: Existing P&L Query Timeout After Adding OpEx Aggregation

**What goes wrong:**
The existing `fetchAndAggregate` function in `convex/reports/incomeStatement.ts` already performs ~10 parallel database reads for revenue and COGS data. Adding OpEx aggregation (14 more queries if the N+1 pattern is used, or at minimum 2 more queries with the recommended approach) pushes the total query complexity beyond Convex's query execution limits. The P&L page fails to load or times out intermittently.

**Why it happens:**
The existing income statement query is already near its complexity budget. Each new data source added to the query compounds the I/O. The `fetchAndAggregate` function was designed for revenue + COGS only. Extending it with journal entry aggregation without restructuring creates a monolithic query that does too much.

**How to avoid:**
Two options (both acceptable):
1. **Extend `fetchAndAggregate`** with the single-query approach (using `by_entryDate` index): fetch all journal lines for the period in one query, group in memory. This adds exactly 2 database reads (current period + previous period) instead of 28 (14 accounts x 2 periods).
2. **Separate query**: Create a new `getOpExData` query that returns OpEx/Other data independently. The frontend calls both `getIncomeStatement` and `getOpExData` in parallel. This is cleaner but requires coordinating two reactive subscriptions.

Option 1 is recommended for simplicity -- the existing `fetchAndAggregate` pattern handles the previous-period comparison logic that OpEx also needs.

**Warning signs:**
- `getWeeklyIncomeStatement` or `getIncomeStatement` queries exceeding 5 seconds in Convex dashboard
- Intermittent "Query timed out" errors on the Financial Statement page
- P&L page showing a spinner for >3 seconds on desktop

**Phase to address:** P&L integration wave -- must be addressed in the same phase as the OpEx query implementation, not deferred.

---

### Pitfall 8: `seedDefaults` Not Run After Deployment -- All Expense Mutations Fail

**What goes wrong:**
The expense approval mutation looks up system accounts by code ("2200" for Employee Reimbursements Payable, "1100" for Cash). If `accounts:seedDefaults` has not been run in the Convex dashboard, these accounts do not exist. The mutation throws a cryptic "Cannot read properties of null" error instead of a clear "Run seedDefaults" message. Every expense that reaches the approval stage fails silently.

**Why it happens:**
The deployment sequence requires a manual step (running `seedDefaults` from the Convex dashboard Functions tab) between schema deployment and feature activation. This is consistent with existing patterns (`tags:seedDefaults`, `menuProducts:seedDefaults`) but the existing seed functions are nice-to-haves -- missing tags don't break core functionality. Missing CoA accounts break ALL accounting operations.

**How to avoid:**
1. In the approval mutation, add an explicit guard: `if (!cashAccount) throw new ConvexError("System account 1100 not found. Run accounts:seedDefaults from the Convex dashboard.")`.
2. Add `seedDefaults` to the deployment checklist in the plan (Task 20 or equivalent).
3. Consider making `seedDefaults` idempotent AND adding an auto-seed pattern: the first expense-related mutation checks if accounts exist and creates them if missing. This follows the `DEPOT_CONFIG` auto-seed pattern from Phase 40 (Tamtem depot).

**Warning signs:**
- First expense approval after deployment failing with null reference error
- `accounts` table showing 0 documents after deployment
- No accounts visible in the GL account dropdown on the expense form

**Phase to address:** Schema + CoA foundation phase AND deployment verification.

---

### Pitfall 9: WIB Timezone Boundary Mismatch Between Revenue and OpEx Period Filters

**What goes wrong:**
The existing income statement uses `periodStart` (WIB-aligned epoch ms) to filter `externalRevenue` and `consignmentSettlements`. The new OpEx section uses `entryDate` to filter `journalEntryLines`. If `entryDate` is stored as WIB midnight but the period filter uses raw UTC boundaries (or vice versa), revenue and OpEx end up in different periods. The P&L shows Revenue for one week and OpEx for a different (overlapping but shifted) week.

**Why it happens:**
The existing `calculateWeekRange` and `calculatePeriodRange` functions in `convex/lib/periodRange.ts` use WIB-adjusted boundaries (`wibMidnightToUtc`). The spec says `expenseDate` is a timestamp, but doesn't specify whether it should be WIB-normalized. If expense submission uses `Date.now()` for `expenseDate` (user's local time converted to UTC) while the period query uses WIB boundaries, a 7-hour offset mismatch occurs.

**How to avoid:**
Normalize `expenseDate` to WIB midnight on submission: when the user picks "March 5, 2026" as the expense date, store it as `wibMidnightToUtc(2026, 2, 5)` (March 5, 00:00 WIB = March 4, 17:00 UTC). This ensures expense dates align with the same WIB day boundaries used by revenue queries. Import and use `wibMidnightToUtc` from `convex/lib/periodRange.ts` in the expense submission mutation. Since `entryDate` is denormalized from `journalEntries.date`, and `journalEntries.date` comes from `expenses.expenseDate`, the entire chain is WIB-consistent.

Write a test: create an expense with date "March 5 WIB", query the period "March 3-9 WIB" (a week), assert the expense appears. Query "Feb 24 - March 2 WIB", assert it does NOT appear.

**Warning signs:**
- Expenses appearing in the wrong week on the P&L
- OpEx totals that don't match when switching between weekly and monthly views
- Expense dated "Monday" showing up in the previous week's P&L

**Phase to address:** Backend expense submission mutation AND P&L integration -- both must use the same WIB normalization.

---

### Pitfall 10: Missing Auth Permission Gaps -- Kitchen/Order Staff Accessing Admin Expense Features

**What goes wrong:**
The spec defines 4 new permissions: `canSubmitExpenses` (all roles), `canApproveExpenses` (manager, admin), `canManageReimbursements` (admin), `canAccessExpenseAnalytics` (manager, admin). If these permissions are added to `ROLE_PERMISSIONS` in `src/lib/types.ts` but the `ProtectedRoute` type definition is not extended, the TypeScript type for `requiredPermission` does not include the new values. The route renders but the permission check silently passes because the type mismatch causes a string comparison that always fails (or always succeeds, depending on the fallback logic).

**Why it happens:**
The `ROLE_PERMISSIONS` object and the `ProtectedRoute` component use the same type system but are defined in different files. Adding a permission to the object without updating the type union creates a silent type-widening issue. The existing codebase has 12 permission flags that all work -- the 13th-16th can easily be missed because the developer assumes "just adding to the object is enough."

**How to avoid:**
1. Add all 4 new permissions to `ROLE_PERMISSIONS` for all 4 roles.
2. Verify the `ProtectedRoute` component type accepts the new permission strings (it should if the type is derived from `keyof typeof ROLE_PERMISSIONS[UserRole]`).
3. Backend mutations MUST independently enforce auth via `requireRole()` -- never rely on frontend-only guards. Every expense mutation must check: `requireRole(ctx, args.token, ["kitchen", "order_staff", "manager", "admin"])` for submission, `requireRole(ctx, args.token, ["manager", "admin"])` for approval, `requireRole(ctx, args.token, ["admin"])` for reimbursements.
4. Write a test: call the approve mutation with a `kitchen` role token -- expect "Not authorized" error.

**Warning signs:**
- New expense routes accessible without login (missing `ProtectedRoute` wrapper)
- Kitchen staff able to access the reimbursement manager page
- No TypeScript error when using a non-existent permission name in a route

**Phase to address:** Frontend foundation wave (permissions + routes) -- must be verified before frontend pages are built.

---

### Pitfall 11: Self-Approval Check Only on Frontend -- Backend Mutation Allows It

**What goes wrong:**
The DoA rules specify that the submitter cannot approve their own expense. If this check exists only in the frontend (hiding the "Approve" button when `expense.submittedBy === currentUser._id`), a direct mutation call via the Convex dashboard or a crafted API request bypasses the check. The admin approves their own expense, creating a journal entry with no oversight.

**Why it happens:**
Frontend-only validation is the common pattern for UX controls. But financial controls MUST be backend-enforced because they are fraud prevention mechanisms, not UX conveniences. The spec explicitly states "Backend mutation rejects `approvedBy === submittedBy` regardless of frontend guards."

**How to avoid:**
In the approve mutation:
```typescript
const user = await requireRole(ctx, args.token, ["manager", "admin"]);
const expense = await ctx.db.get(args.expenseId);
if (expense.submittedBy === user._id) {
  throw new ConvexError("Cannot approve your own expense");
}
```
This must be a hard throw, not a soft return. Write a test: seed an admin user, create an expense as that admin, attempt to approve as the same admin -- expect error. Also test the edge case: single admin in the system submits an expense > 500K -- the mutation must throw "No eligible approver" because the only admin is the submitter.

**Warning signs:**
- `expenseStatusHistory` showing `approvedBy === submittedBy` on any record
- The approve mutation not checking the user identity at all
- Frontend hiding the button but no backend guard

**Phase to address:** Backend expense lifecycle (approval mutation) -- the self-approval check must exist in the backend, not just the frontend.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Skip `by_entryDate` index, accept N+1 pattern | Fewer schema changes, simpler queries | 14 sequential DB reads per P&L render; compounds with Balance Sheet queries | Never -- add the index from day one; it costs nothing |
| Store `expenseDate` as raw `Date.now()` without WIB normalization | Simpler submission code | Period boundary mismatches between revenue (WIB-aligned) and OpEx (UTC-aligned) | Never -- WIB normalization is a 1-line change with high correctness impact |
| Use `v.string()` for `sourceId` on `journalEntries` | Avoids discriminated union complexity | No type safety on source references; `sourceId` could be any string | Acceptable -- Convex doesn't support discriminated union IDs natively |
| Use `v.string()` for `expenseStatusHistory.fromStatus/toStatus` | Simpler schema, avoids repeated union type | Any string can be stored; no validation on history entries | Fix -- use the `expenseStatus` validator for type safety |
| Skip Should-Have fraud controls (split detection, approver concentration) | Reduces scope, faster shipping | No detection of expense splitting or rubber-stamp approval patterns | Acceptable for v1 -- defer to future phase with explicit backlog item |
| Hardcode account codes ("2200", "1100") in mutations | Faster to write than lookup-by-code queries | Breaks if account codes change; magic strings scattered across codebase | Acceptable temporarily -- extract to constants file (e.g., `SYSTEM_ACCOUNTS.CASH = "1100"`) |
| Counter table rows never cleaned up | No maintenance code needed | ~1,095 rows/year (3 prefixes x 365 days) | Acceptable -- negligible at this scale for years |

---

## Integration Gotchas

Common mistakes when integrating the accounting system with existing Frollie features.

| Integration Point | Common Mistake | Correct Approach |
|-------------------|----------------|------------------|
| P&L extension | Adding OpEx data as a separate `useQuery` subscription instead of extending `fetchAndAggregate` | Extend the existing `fetchAndAggregate` function; single reactive subscription = single re-render |
| P&L extension | Modifying `WeekData` type in a breaking way | Add new fields (`opex`, `totalOpEx`, `ebit`, `netIncome`) alongside existing fields; never remove or rename existing fields |
| Revenue/COGS data | Attempting to move revenue data from real-time aggregation to stored journal entries | Revenue (4xxx) and COGS (5xxx) remain "virtual" -- sourced from `externalRevenue` + BOM. Only OpEx (6xxx) uses stored journal entries |
| File storage | Not gating `generateUploadUrl` with auth | The existing `feedback/mutations.ts` has NO auth on `generateUploadUrl`. The expense version MUST have auth (`requireRole`) because receipts are financial documents |
| User bank details | Adding required fields to existing `users` table | `bankAccountNumber` and `bankName` MUST be `v.optional()` -- existing user documents don't have these fields |
| Permission system | Adding permissions to `ROLE_PERMISSIONS` but not to the TypeScript type union | Both the runtime object AND the type definition must be updated in sync |
| Existing FIFO inventory | Expense system touching inventory tables | Expense system has ZERO interaction with inventory. If a future "petty cash from inventory" feature is added, it must go through the existing `inventory/` module, not the expense module |

---

## Performance Traps

Patterns that work at small scale but fail as expense volume grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| N+1 per-account journal queries | P&L page slow (>2s); 14 sequential DB reads visible in Convex logs | Add `by_entryDate` index; single query + in-memory grouping | Immediately at 11+ OpEx accounts -- this is a day-one issue, not a scale issue |
| Reactive subscription on `journalEntryLines` without index bounds | P&L re-renders on every JE insert across ALL periods | Use `.withIndex("by_entryDate", ...)` with tight period bounds; Convex only re-fires for documents matching the index range | When journal entries exceed ~100 (2-3 months of operations) |
| Duplicate detection scanning all expenses for 7-day window | Slow submission as expense count grows | Index `by_amount_date_submitter` enables efficient duplicate lookup without full table scan | When expenses exceed ~500 (6-12 months) |
| Approval queue query scanning all expenses | Manager sees all expenses, not just pending | Index `by_status` with `status === "submitted"` filter at index level | When total expenses exceed ~200 |
| Receipt image stored at original resolution | `_storage` quota consumed by 5+ MB phone photos | Client-side image compression before upload (canvas resize to 1024px max width) | When receipt count exceeds ~100 |

---

## Security Mistakes

Domain-specific security issues for financial data.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Self-approval check only in frontend | Admin can approve own expense via direct mutation call; zero oversight on admin spending | Backend mutation MUST check `approvedBy !== submittedBy`; throw hard error |
| No receipt hash dedup enforcement | Same receipt image used for multiple expense claims (fraud) | SHA-256 hash computed client-side, stored in `receiptImageHash`; backend blocks submission if hash exists on any expense |
| `generateUploadUrl` without auth | Unauthenticated users can upload files to `_storage`; storage quota abuse | Add `requireRole(ctx, args.token, [...allRoles])` to the expense `generateUploadUrl` mutation |
| Journal entries mutable after creation | Approved expense amounts can be silently changed; audit trail meaningless | No `update` mutation for `journalEntries` or `journalEntryLines`; only void + new entry pattern |
| Expense amount editable after approval | GL entries show one amount, expense shows a different (edited) amount | No update mutation for approved expenses; immutability enforced by absence of mutation, not just UI hiding |
| `seedDefaults` callable without auth | Any unauthenticated client can call `accounts:seedDefaults`; creates 36 accounts | Acceptable (consistent with existing seed patterns); seed is idempotent with existence checks; document as dashboard-only |

---

## UX Pitfalls

Common user experience mistakes in expense management for an SME with 5-10 staff.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No confirmation before expense submission | User accidentally submits a draft with missing fields | Show a confirmation dialog with expense summary before calling `submitExpense`; validate all fields including receipt requirement |
| Receipt upload failure with no retry | User uploads a 5 MB photo, network drops, no way to retry without re-filling the entire form | Store form state in component state; only upload receipt on submit; show retry button on upload failure; preserve all other fields |
| Rejection reason not visible on resubmission | Employee resubmits without knowing why the original was rejected; rejected again for the same reason | Show full rejection chain with reasons in the expense form when `previousExpenseId` is set; make rejection reason prominent, not hidden in a collapsible |
| Approval queue showing all expenses at once | Manager with 20 pending expenses cannot prioritize; no sorting or filtering | Sort by submission date (oldest first); filter by amount range, late flag, duplicate warning; show count badge in navigation |
| Reimbursement confirmation with no bank detail preview | Admin confirms batch transfer without seeing the employee's bank name/number; sends to wrong account | Show employee bank details prominently in the batch confirmation form; warn if bank details are missing |
| Company card expenses appearing in reimbursement queue | Admin tries to batch company card expenses that don't need reimbursement | Filter reimbursement queue to only show `personal_cash` and `personal_transfer` expenses; company card expenses go to `approved` as terminal |

---

## "Looks Done But Isn't" Checklist

- [ ] **Journal balance:** Every `createJournalEntry` call validates `sum(debits) === sum(credits)` before inserting -- verify no code path skips the check
- [ ] **`entryDate` denormalization:** Every `journalEntryLines` insert copies `date` from the parent `journalEntries` -- verify no lines have `entryDate` differing from their parent's `date`
- [ ] **WIB normalization:** `expenseDate` stored as WIB midnight, not raw `Date.now()` -- verify an expense dated "March 5" stores as `wibMidnightToUtc(2026, 2, 5)`
- [ ] **Self-approval backend guard:** `approvedBy !== submittedBy` check exists in the BACKEND approve mutation, not just the frontend -- verify with a test calling the mutation directly
- [ ] **Receipt requirement enforcement:** `receiptFileId` required for amount > Rp 50,000 enforced in the BACKEND submit mutation, not just the frontend -- verify with a test
- [ ] **Reversal date:** `createReversingEntry` uses the original entry's date, not `Date.now()` -- verify with a test that creates and voids in different periods
- [ ] **`seedDefaults` run:** After deployment, `accounts` table has 36 documents -- verify before testing any expense flow
- [ ] **Permission gating:** Reimbursement manager page returns "Not authorized" for manager role, not just admin -- verify the `ProtectedRoute` uses `canManageReimbursements`
- [ ] **Company card accounting:** Company card approval creates JE with `CR 1100 Cash` (not `CR 2200 Reimbursements Payable`) -- verify with a unit test
- [ ] **Void cascade:** Voiding a reimbursement batch returns all linked expenses to `awaiting_payment` status -- verify the batch void mutation patches all linked expenses
- [ ] **Counter atomicity:** Two concurrent expense submissions produce different `EXP-MMDD-NNN` numbers (no duplicates) -- verify with Convex mutation serialization test
- [ ] **Existing P&L unbroken:** After adding OpEx section, the existing Revenue and Gross Profit figures remain identical to before -- verify by comparing output with and without the extension
- [ ] **No `by_entryDate` index:** If the `by_entryDate` index on `journalEntryLines` is missing from the schema, the OpEx aggregation falls back to the N+1 pattern -- verify the index exists before deploying

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Unbalanced journal entries (P4) | HIGH | Identify all unbalanced entries via integrity query; create correcting entries to re-balance; add balance validation to prevent recurrence; this is an accounting audit event |
| Reversal in wrong period (P1) | MEDIUM | Identify reversals where `date !== originalEntry.date`; create new reversing entries with correct dates; void the incorrect reversals; re-run P&L for affected periods |
| Duplicate journal entries from concurrent approval (P6) | MEDIUM | Query for duplicate `sourceId` + `sourceType` combinations; void the duplicate entry; add concurrency guard to prevent recurrence |
| `_creationTime` used for period filter (P2) | MEDIUM | Replace all `_creationTime` references with `entryDate` in journal queries; existing data is fine (the entries themselves are correct, only the query was wrong) |
| `seedDefaults` not run (P8) | LOW | Run `accounts:seedDefaults` from Convex dashboard; existing expenses in `draft` or `submitted` status are unaffected; only approval mutations need accounts |
| WIB timezone mismatch (P9) | MEDIUM | Identify expenses with non-WIB-normalized dates; write a migration to normalize `expenseDate` to WIB midnight; update `journalEntries.date` and `journalEntryLines.entryDate` to match |
| Self-approval in production (P11) | LOW | Void the self-approved expense's journal entry; resubmit the expense for proper approval by a different approver; add backend guard to prevent recurrence |
| Orphaned receipt files (P5) | LOW | At current scale (5-10 expenses/week), orphan files are negligible; run a cleanup query if storage quota becomes an issue; never delete files referenced by approved expenses |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Reversal date bug (P1) | Backend foundation: journal helper | Test: void in different period, assert reversal date matches original |
| `_creationTime` vs `entryDate` (P2) | Backend foundation: journal queries | Grep: zero `_creationTime` references in `convex/journal/` files |
| N+1 query pattern (P3) | Schema phase (add index) + P&L integration | Convex dashboard: `getOpExByPeriod` shows 1-2 DB reads, not 14 |
| Unbalanced JE (P4) | Backend foundation: journal mutation | Test: unbalanced entry throws; integrity check finds zero violations |
| Receipt upload race (P5) | Frontend expense form implementation | Manual test: upload receipt, close browser, resubmit -- receipt still attached |
| Concurrent approval (P6) | Backend expense lifecycle | Test: two approve calls for same expense; second throws; 1 JE exists |
| P&L query timeout (P7) | P&L integration wave | Convex dashboard: `getIncomeStatement` executes in <3 seconds |
| `seedDefaults` not run (P8) | Deployment verification step | `accounts` table shows 36 documents after deployment |
| WIB timezone mismatch (P9) | Backend expense submission + P&L integration | Test: expense dated "March 5 WIB" appears in "March 3-9 WIB" period query |
| Auth permission gaps (P10) | Frontend foundation: permissions + routes | Test: kitchen role token → approve mutation → "Not authorized" |
| Self-approval bypass (P11) | Backend expense lifecycle: approve mutation | Test: admin submits and approves own expense → error thrown |

---

## Sources

- Staff review: `docs/reviews/staffreview-expense-accounting-plan-2026-03-12.md` (4 critical, 6 important findings -- C1, C2, C3, C4, I1-I6)
- Design spec: `docs/superpowers/specs/2026-03-12-expense-accounting-system-design.md` (10 tables, 36 accounts, full lifecycle)
- Existing income statement: `convex/reports/incomeStatement.ts` (687 lines -- `fetchAndAggregate` pattern, `WeekData` type)
- Existing period range helpers: `convex/lib/periodRange.ts` (WIB timezone utilities)
- Existing auth: `convex/lib/auth.ts` (`requireRole` pattern), `convex/lib/functions.ts` (`protectedMutation` wrapper)
- Existing file upload patterns: `convex/feedback/mutations.ts` (no-auth `generateUploadUrl`), `convex/grabfoodMenu/mutations.ts` (auth-gated `generateUploadUrl`)
- Project accumulated lessons: CLAUDE.md Common Pitfalls section (12 documented pitfalls including `_creationTime` lesson, React hooks order, Convex OCC)
- Session memory: 40 phases of production experience, `_creationTime` vs business date lesson, auto-seed depot pattern

---
*Pitfalls research for: v1.7 Expense & Accounting System (double-entry accounting, expense management, P&L extension)*
*Researched: 2026-03-12*
