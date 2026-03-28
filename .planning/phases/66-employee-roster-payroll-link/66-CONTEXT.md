# Phase 66: Employee Roster & Payroll Link - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Create a new employee roster system and replace the free-text `recipientName` input in payroll with a roster-based dropdown picker. Employees store bank details that auto-populate in both payroll and reimbursement workflows. The roster is a standalone page following the Asset Register pattern.

</domain>

<decisions>
## Implementation Decisions

### Employee Data Model
- **D-01:** New `employees` table (separate from `users` table). Optional `userId: v.optional(v.id("users"))` link for employees who have app accounts. Supports contractors without app logins.
- **D-02:** Extended field set:
  - `name: v.string()` — full name
  - `role: v.string()` — free text (e.g., "Kitchen Staff", "Driver", "Designer")
  - `employeeType: v.union(v.literal("contractor"), v.literal("staff"))` — matches existing payroll type
  - `frequency: v.optional(v.union(v.literal("weekly"), v.literal("monthly")))` — default pay frequency
  - `bankName: v.optional(v.string())` — bank name (e.g., "BCA", "Mandiri")
  - `bankAccountNumber: v.optional(v.string())` — account number
  - `bankAccountHolder: v.optional(v.string())` — name on account (may differ from employee name)
  - `phone: v.optional(v.string())` — contact phone
  - `email: v.optional(v.string())` — contact email
  - `joinDate: v.optional(v.number())` — employment start date (epoch ms)
  - `monthlySalary: v.optional(v.number())` — base monthly salary in IDR
  - `notes: v.optional(v.string())` — free-text notes
  - `isActive: v.boolean()` — soft-delete pattern (consistent with Phase 65 decision)
  - `userId: v.optional(v.id("users"))` — link to app user account
  - `createdBy: v.id("users")`
  - `updatedAt: v.number()`

### Roster UI & Management
- **D-03:** Standalone `/employees` page accessible from navbar. Admin-only access (like Users page).
- **D-04:** Follow Asset Register pattern: table list view with search/filter + centered Dialog (not Sheet/slide-out) for create/edit. User specifically requested pop-out modal, not slide-out — "it's too far to the right."
- **D-05:** Table columns: Name, Role, Type (staff/contractor), Bank, Status (active/inactive). Search by name, filter by type and status.

### Payroll Picker Behavior
- **D-06:** Roster-only picker — no free-text fallback. All payroll recipients must be in the employee roster first. Enforces clean data.
- **D-07:** Auto-fill on employee selection: `employeeType`, `frequency` (if set), and display bank details in the JE confirmation dialog. Less manual entry, fewer errors.
- **D-08:** New payroll entries store both `employeeId: v.id("employees")` AND `recipientName: v.string()` (snapshot of name at time of entry). The `recipientName` field stays for backward compatibility and as an immutable record.
- **D-09:** Existing payroll entries with free-text `recipientName` display as-is. No migration or best-effort linking. Clean separation between old and new entries.

### Bank Details & Reimbursements
- **D-10:** When processing a reimbursement for a user who has a linked employee record (`employees.userId` matches the reimbursement submitter's user ID), auto-populate bank details from the employee record into the reimbursement payment flow.
- **D-11:** Bank details are stored on the `employees` table, not on `users`. This keeps auth data (users) separate from HR data (employees).

### Claude's Discretion
- Index design for the `employees` table (by_active, by_userId, by_type_active)
- Whether the employee picker uses a Select/Combobox or a searchable dropdown pattern
- Navigation placement in the navbar (under which section header)
- Whether `monthlySalary` shows in payroll form as a default amount suggestion

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Payroll System (existing)
- `convex/schema.ts` lines 1879-1903 — `payrollEntries` table definition (has `recipientName`, `employeeType`, `frequency`)
- `convex/payroll/mutations.ts` — `create` mutation (lines 35-46 args, free-text `recipientName`)
- `convex/payroll/queries.ts` — Payroll list/detail queries
- `convex/payroll/helpers.ts` — Validation helpers

### Payroll Frontend
- `src/pages/PayrollManager.tsx` — Main payroll page (recipientName Input at line 208, create form, history list)
- `src/hooks/convex/usePayroll.ts` — Payroll hooks

### Reimbursement System (for bank detail integration)
- `convex/reimbursements/mutations.ts` — Reimbursement processing
- `convex/reimbursements/queries.ts` — Reimbursement queries
- `src/pages/ReimbursementManager.tsx` — Reimbursement page
- `src/hooks/convex/useReimbursements.ts` — Reimbursement hooks

### Pattern References
- `src/pages/AssetRegister.tsx` — UI pattern to follow (table + Dialog, not Sheet)
- `src/components/assets/CreateAssetDialog.tsx` — Dialog pattern for create/edit
- `src/pages/CustomersManager.tsx` — Alternative table CRUD pattern reference
- `convex/lib/auth.ts` — `requireRole()` for admin-only access

### Analytics (employee data consumer)
- `src/components/expenseAnalytics/SpendByEmployeeCard.tsx` — Groups spending by recipientName (could benefit from employee linkage in future)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `protectedMutation` from `convex/lib/functions` — standard pattern for admin-only mutations
- `getNextNumber` from `convex/lib/counter` — auto-number generation (PAY-MMDD-NNN pattern)
- `Select/SelectContent/SelectItem` from shadcn/ui — dropdown picker components
- `AlertDialog` — used for JE preview confirmation in payroll, reuse for employee delete confirmation
- `VoidReasonDialog` from shared components — reuse pattern for deactivation reason
- `CreateAssetDialog` pattern — Dialog-based create/edit form to follow

### Established Patterns
- CRUD pages follow: PageHeader + Card with form + Table with history (PayrollManager, CustomersManager, IngredientsManager)
- Auth: `protectedMutation({ roles: ["admin"] })` for admin-only operations
- Soft-delete: `isActive` boolean with filter (confirmed in Phase 65 decisions)
- Journal engine integration: payroll create auto-generates JE (DR 6100, CR 1100)

### Integration Points
- `PayrollManager.tsx` create form — replace `<Input>` at line 208 with employee picker
- `payroll/mutations.ts` create args — add `employeeId` field alongside existing `recipientName`
- `schema.ts` — add new `employees` table definition
- `App.tsx` — add route for `/employees` page
- `Header.tsx` — add navigation link for Employees page
- `reimbursements/` — add bank detail lookup when processing payouts for linked employees

</code_context>

<specifics>
## Specific Ideas

- User wants the same UX pattern as Asset Register (table + detail dialog) — specifically pop-out centered Dialog, NOT a slide-out Sheet ("it's too far to the right")
- Bank details should flow from employee roster into BOTH payroll confirmation AND reimbursement processing — single source of truth for payment info
- Roster-only picker enforces data hygiene — no more free-text names in payroll
- Extended fields (phone, email, joinDate, monthlySalary, notes) give the roster more long-term value beyond just payroll

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. The reimbursement bank detail auto-populate (D-10) was confirmed as in-scope since employee bank details are part of EMP-01.

</deferred>

---

*Phase: 66-employee-roster-payroll-link*
*Context gathered: 2026-03-28*
