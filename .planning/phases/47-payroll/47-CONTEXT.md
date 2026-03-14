# Phase 47: Payroll - Context

**Gathered:** 2026-03-14
**Status:** Ready for planning
**Source:** PRD Express Path (docs/superpowers/specs/2026-03-12-expense-accounting-system-design.md + docs/superpowers/plans/2026-03-12-expense-accounting-system.md + Phase 44-46 plans)

<domain>
## Phase Boundary

Phase 47 delivers admin-only payroll entry CRUD: create payroll entries that auto-generate journal entries (DR 6100 Salaries & Wages, CR 1100 Cash), void entries with reversing JEs, list/filter by period and employee type, and a frontend page for managing payroll records.

This is the simplest financial entry type — no approval workflow, no batching, no fraud controls. Admin enters, system journals, done.
</domain>

<decisions>
## Implementation Decisions

### Schema
- `payrollEntries` table already exists in schema with: employeeType (contractor/staff), frequency (weekly/monthly), amount, periodStart, periodEnd, description, attachmentFileId, status (active/voided), voidedBy, voidedAt, voidReason, journalEntryId, createdBy, createdAt
- Indexes: `by_period` (periodStart), `by_employee_type` (employeeType)
- No schema changes needed — table is ready

### Journal Entry Pattern
- On creation: DR 6100 Salaries & Wages, CR 1100 Cash (per design spec Section 4)
- On void: reversing JE via `createReversalEntry` (same as expense/reimbursement void pattern)
- sourceType: "payroll" for creation, "payroll_void" for reversal (already defined in journalEngine.ts)
- JE date = periodEnd (business date for the pay period, NOT Date.now())
- Look up accounts by code via `by_code` index (NEVER hardcode IDs)

### Mutations
- `create` — admin only, validates amount > 0, generates JE, sets status: "active"
- `void` — admin only, validates status === "active", creates reversing JE, sets status: "voided"
- `generateUploadUrl` — admin only, for payroll attachment upload (follow expense pattern)
- Use `protectedMutation` from `convex/lib/functions.ts` (session-based auth, not token-based)

### Queries
- `list` — admin only, filterable by period range and employee type
- `getById` — admin only, returns enriched payroll entry with JE details

### Frontend
- New page: PayrollManager at `/payroll`
- Admin-only access (allowedRoles={["admin"]})
- Two sections: Create Form + History List
- Create form: employee type select, frequency select, amount input, period start/end date pickers, description textarea, optional attachment upload
- History list: filterable by employee type and period, shows payroll entries with void action for active entries
- Void dialog: reason textarea (required) + confirm button
- Navigation: add to Header admin dropdown

### Patterns to Follow (from Phases 44-46)
- Pure helper functions in `convex/payroll/helpers.ts` with TDD
- Use `getNextNumber(ctx, "PAY")` for payroll entry numbers (PAY-MMDD-NNN format)
- Follow `createMutationHook` pattern for frontend hooks
- Follow EntityManager or list+form page pattern from BankAccountsManager/ReimbursementManager
- Use `formatCurrency` for amounts, `utcToWibDateStr` for dates

### Claude's Discretion
- Whether to add a payroll entry number (PAY-MMDD-NNN) — design spec doesn't mention one, but all other entries (EXP, RMB, JE) have sequential numbers. Include for consistency.
- Whether to show JE preview before creation — nice UX from ConfirmBatchDialog pattern, include it
- Helper function structure — keep it minimal since there's no approval/fraud logic
- Amount validation helpers — inline or extract to helpers.ts (extract for TDD consistency)
- Period display format — use month/year grouping in list view
</decisions>

<specifics>
## Specific Ideas

### From Design Spec (Section 4: Payroll Entries)
- Admin-only, no approval pipeline
- Fields: employee type (contractor/staff), frequency (weekly/monthly), amount, period covered, optional attachment
- Direct journal entry generation: DR 6100, CR 1100
- Void generates reversing JE (CR 6100, DR 1100) and marks entry as voided
- Corrections require creating a new entry (no editing voided entries)

### From Implementation Plan (Task 10)
- TDD approach: write failing tests first
- Test cases: admin-only, correct JE lines, amount > 0, void creates reversing JE, cannot void already-voided
- Mutations: `create` (admin only, creates entry + JE), `void` (admin only, creates reversing JE)
- Queries: `list` (by period, optional employee type filter), `getById` (single entry with JE details)

### Account Codes
- DR 6100: Salaries & Wages (OpEx)
- CR 1100: Cash (Asset)
- Both are system accounts seeded by `accounts:seedDefaults`

### Integration Points
- `convex/lib/journalEngine.ts` — createJournalEntryWithLines, createReversalEntry, buildDebitLine, buildCreditLine
- `convex/lib/counter.ts` — getNextNumber for PAY-MMDD-NNN
- `convex/lib/functions.ts` — protectedMutation, protectedQuery
- P&L extension (Phase 48+) will read payroll JEs via journalEntryLines aggregation
</specifics>

<deferred>
## Deferred Ideas

- Payroll analytics dashboard (spend by employee type, frequency analysis) — future milestone
- Individual employee salary tracking — design spec explicitly states payroll records total amounts per period, not individual salaries
- Recurring payroll auto-generation — design spec lists as "Nice-to-Have" future extension
- Monthly budget caps for salary category — future milestone
- Payroll approval workflow — explicitly out of scope (admin-only, no approval)
</deferred>

---

*Phase: 47-payroll*
*Context gathered: 2026-03-14 via PRD Express Path*
