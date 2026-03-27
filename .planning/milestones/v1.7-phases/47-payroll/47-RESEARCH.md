# Phase 47: Payroll - Research

**Researched:** 2026-03-14
**Domain:** Payroll entry CRUD with double-entry journal integration (Convex backend + React frontend)
**Confidence:** HIGH

## Summary

Phase 47 implements admin-only payroll entry management: create, list, filter, and void payroll entries with automatic journal entry generation. This is the simplest financial entry type in the v1.7 milestone -- no approval workflow, no fraud controls, no batching. Admin enters, system journals, done.

The codebase already has all the infrastructure needed. The journal engine (`convex/lib/journalEngine.ts`) already defines `"payroll"` and `"payroll_void"` as valid source types with correct void pairing validated. The counter system (`convex/lib/counter.ts`) is ready for `PAY` prefix. The `payrollEntries` table already exists in the schema with all required fields except `payrollNumber` (a gap that needs addressing). The `protectedMutation`/`protectedQuery` wrappers handle session-based auth with role enforcement.

**Primary recommendation:** Follow the exact patterns from Phase 44-45 (expenses) -- pure helpers in `convex/payroll/helpers.ts` with TDD, mutations/queries using `protectedMutation`/`protectedQuery`, frontend hooks via `createMutationHook`, and a single-page PayrollManager with form + list layout.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- `payrollEntries` table already exists in schema with: employeeType (contractor/staff), frequency (weekly/monthly), amount, periodStart, periodEnd, description, attachmentFileId, status (active/voided), voidedBy, voidedAt, voidReason, journalEntryId, createdBy, createdAt
- Indexes: `by_period` (periodStart), `by_employee_type` (employeeType)
- On creation: DR 6100 Salaries & Wages, CR 1100 Cash (per design spec Section 4)
- On void: reversing JE via `createReversalEntry` (same as expense/reimbursement void pattern)
- sourceType: "payroll" for creation, "payroll_void" for reversal (already defined in journalEngine.ts)
- JE date = periodEnd (business date for the pay period, NOT Date.now())
- Look up accounts by code via `by_code` index (NEVER hardcode IDs)
- `create` -- admin only, validates amount > 0, generates JE, sets status: "active"
- `void` -- admin only, validates status === "active", creates reversing JE, sets status: "voided"
- `generateUploadUrl` -- admin only, for payroll attachment upload (follow expense pattern)
- Use `protectedMutation` from `convex/lib/functions.ts` (session-based auth, not token-based)
- `list` -- admin only, filterable by period range and employee type
- `getById` -- admin only, returns enriched payroll entry with JE details
- New page: PayrollManager at `/payroll`
- Admin-only access (allowedRoles={["admin"]})
- Two sections: Create Form + History List
- Navigation: add to Header admin dropdown
- Pure helper functions in `convex/payroll/helpers.ts` with TDD
- Use `getNextNumber(ctx, "PAY")` for payroll entry numbers (PAY-MMDD-NNN format)
- Follow `createMutationHook` pattern for frontend hooks
- Use `formatCurrency` for amounts, `utcToWibDateStr` for dates

### Claude's Discretion
- Whether to add a payroll entry number (PAY-MMDD-NNN) -- design spec doesn't mention one, but all other entries (EXP, RMB, JE) have sequential numbers. **Recommendation: YES, include for consistency.** This requires adding `payrollNumber: v.string()` to the schema (currently missing).
- Whether to show JE preview before creation -- nice UX from ConfirmBatchDialog pattern. **Recommendation: YES, include a simple confirmation dialog showing DR/CR lines before commit.**
- Helper function structure -- keep it minimal since there's no approval/fraud logic. **Recommendation: `validatePayrollAmount(amount)` and `validateVoidReason(reason)` are sufficient. Both are trivially simple but follow the TDD extraction pattern.**
- Amount validation helpers -- inline or extract to helpers.ts. **Recommendation: extract to helpers.ts for TDD consistency with expense pattern.**
- Period display format -- use month/year grouping in list view. **Recommendation: group by month/year with expandable sections, or simple flat list with period column. Flat list is simpler and sufficient for Phase 47.**

### Deferred Ideas (OUT OF SCOPE)
- Payroll analytics dashboard (spend by employee type, frequency analysis) -- future milestone
- Individual employee salary tracking -- design spec explicitly states payroll records total amounts per period, not individual salaries
- Recurring payroll auto-generation -- design spec lists as "Nice-to-Have" future extension
- Monthly budget caps for salary category -- future milestone
- Payroll approval workflow -- explicitly out of scope (admin-only, no approval)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PAY-01 | Admin can create payroll entries with employee type (contractor/staff), frequency (weekly/monthly), amount, period, and optional attachment | Schema table exists with all fields; `protectedMutation` with `roles: ["admin"]`; `getNextNumber(ctx, "PAY")` for entry number; `generateUploadUrl` for attachment; `createJournalEntryWithLines` for auto-JE |
| PAY-02 | Each payroll entry auto-generates a journal entry (DR 6100 Salaries & Wages, CR 1100 Cash) | `createJournalEntryWithLines` + `buildDebitLine`/`buildCreditLine` already proven in expense approval (Phase 45); account lookup via `by_code` index; sourceType `"payroll"` already defined |
| PAY-03 | Admin can void a payroll entry, generating a reversing journal entry | `createReversalEntry` with `"payroll_void"` sourceType already validated in journalEngine tests; void pairing `payroll -> payroll_void` confirmed working |
| PAY-04 | Payroll entries are viewable by period and employee type | `by_period` and `by_employee_type` indexes already defined in schema; `protectedQuery` with `roles: ["admin"]` for access control |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Convex | ^1.31.7 | Backend: mutations, queries, schema | Project standard -- all backend uses Convex |
| React | ^19.2.0 | Frontend framework | Project standard |
| TypeScript | ~5.9 | Type safety | Project standard |
| convex-helpers | (bundled) | `protectedMutation`, `protectedQuery`, `useSessionQuery`, `useSessionMutation` | Project standard for auth-wrapped functions |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| shadcn/ui | (Tailwind ^4.1.18) | UI primitives (Card, Dialog, Select, Tabs, Input, Button) | All form elements and layout |
| Lucide React | (bundled) | Icons (DollarSign, Users, Calendar, Ban, etc.) | Page header and list item icons |
| Sonner | (bundled) | Toast notifications | Mutation success/error feedback via `createMutationHook` |
| Vitest | ^4.0.18 | Unit testing for pure helpers | TDD for helpers.ts |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Single PayrollManager page | Separate Create + List pages | Single page is simpler for admin-only CRUD with low volume |
| `protectedMutation` | Direct `mutation` + `requireRole` | `protectedMutation` is the established v1.7 pattern; `requireRole` is the legacy v1.0-v1.6 pattern |
| `useSessionQuery` | `useQuery` with manual token | `useSessionQuery` auto-injects sessionId; required for `protectedQuery` endpoints |

## Architecture Patterns

### Recommended Project Structure
```
convex/payroll/
  __tests__/
    helpers.test.ts     # Pure function TDD tests
  helpers.ts            # Pure validation (validatePayrollAmount, validateVoidReason)
  mutations.ts          # create, void, generateUploadUrl
  queries.ts            # list, getById

src/hooks/convex/
  usePayroll.ts         # Query hooks + mutation hooks via createMutationHook

src/pages/
  PayrollManager.tsx    # Admin-only page: create form + history list

src/components/payroll/ # (optional - only if components get complex)
  PayrollForm.tsx       # Create form component (extract if PayrollManager > 300 lines)
```

### Pattern 1: Protected Mutation with Journal Entry (from expense approval)
**What:** Create a payroll entry and auto-generate a journal entry in a single atomic transaction.
**When to use:** Payroll creation (PAY-01, PAY-02)
**Example:**
```typescript
// Source: convex/expenses/mutations.ts (approveExpense) adapted for payroll
export const create = protectedMutation({
  roles: ["admin"],
  args: {
    employeeType: v.union(v.literal("contractor"), v.literal("staff")),
    frequency: v.union(v.literal("weekly"), v.literal("monthly")),
    amount: v.number(),
    periodStart: v.number(),
    periodEnd: v.number(),
    description: v.string(),
    attachmentFileId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    validatePayrollAmount(args.amount);

    // Generate payroll number
    const payrollNumber = await getNextNumber(ctx, "PAY");

    // Look up accounts by code (NEVER hardcode IDs)
    const debitAccount = await ctx.db
      .query("accounts")
      .withIndex("by_code", (q) => q.eq("code", "6100"))
      .unique();
    const creditAccount = await ctx.db
      .query("accounts")
      .withIndex("by_code", (q) => q.eq("code", "1100"))
      .unique();

    if (!debitAccount || !creditAccount) {
      throw new Error("Required accounts not found. Run accounts:seedDefaults.");
    }

    // Create journal entry with periodEnd as business date
    const journalEntryId = await createJournalEntryWithLines(ctx, {
      date: args.periodEnd,  // Business date = period end, NOT Date.now()
      description: `Payroll ${payrollNumber}: ${args.description}`,
      sourceType: "payroll",
      sourceId: undefined,  // Will be set after insert via patch
      createdBy: ctx.user._id,
      lines: [
        buildDebitLine(debitAccount._id, args.amount, args.description),
        buildCreditLine(creditAccount._id, args.amount),
      ],
    });

    // Insert payroll entry
    const payrollId = await ctx.db.insert("payrollEntries", {
      payrollNumber,
      employeeType: args.employeeType,
      frequency: args.frequency,
      amount: args.amount,
      periodStart: args.periodStart,
      periodEnd: args.periodEnd,
      description: args.description,
      status: "active",
      journalEntryId,
      createdBy: ctx.user._id,
      createdAt: Date.now(),
      ...(args.attachmentFileId && { attachmentFileId: args.attachmentFileId }),
    });

    return { payrollId, payrollNumber, journalEntryId };
  },
});
```

### Pattern 2: Void with Reversing Journal Entry (from expense void)
**What:** Void a payroll entry and create a reversing JE in one transaction.
**When to use:** Payroll void (PAY-03)
**Example:**
```typescript
// Source: convex/expenses/mutations.ts (voidExpense) adapted for payroll
export const voidEntry = protectedMutation({
  roles: ["admin"],
  args: {
    payrollId: v.id("payrollEntries"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const entry = await ctx.db.get(args.payrollId);
    if (!entry) throw new Error("Payroll entry not found");

    validateVoidReason(args.reason);

    if (entry.status !== "active") {
      throw new Error("Can only void active payroll entries");
    }

    // Create reversing JE
    if (entry.journalEntryId) {
      await createReversalEntry(
        ctx,
        entry.journalEntryId,
        "payroll_void",
        ctx.user._id
      );
    }

    await ctx.db.patch(args.payrollId, {
      status: "voided",
      voidedBy: ctx.user._id,
      voidedAt: Date.now(),
      voidReason: args.reason.trim(),
    });

    return { success: true };
  },
});
```

### Pattern 3: Query Hook with createMutationHook (from useExpenses)
**What:** Frontend hooks using `useSessionQuery` for reads and `createMutationHook` for writes.
**When to use:** All payroll frontend data access.
**Example:**
```typescript
// Source: src/hooks/convex/useExpenses.ts pattern
import { useSessionQuery, useSessionMutation } from "convex-helpers/react/sessions";
import { api } from "../../../convex/_generated/api";
import { createMutationHook } from "./createMutationHook";

export function usePayrollEntries(employeeType?: "contractor" | "staff") {
  return useSessionQuery(api.payroll.queries.list, { employeeType });
}

export const useCreatePayroll = createMutationHook(
  api.payroll.mutations.create,
  { successMessage: "Payroll entry created", errorMessage: "Failed to create payroll entry" }
);

export const useVoidPayroll = createMutationHook(
  api.payroll.mutations.voidEntry,
  { successMessage: "Payroll entry voided", errorMessage: "Failed to void payroll entry" }
);

export function usePayrollUploadUrl() {
  return useSessionMutation(api.payroll.mutations.generateUploadUrl);
}
```

### Anti-Patterns to Avoid
- **Hardcoding account IDs:** NEVER use `ctx.db.get(someHardcodedId)`. Always look up accounts by code via `by_code` index. Account IDs are environment-specific.
- **Using Date.now() as JE business date:** The JE date MUST be `periodEnd` (the business date for the pay period). `Date.now()` is only for `createdAt` timestamps.
- **Using `requireRole` instead of `protectedMutation`:** The legacy auth pattern uses `requireRole(ctx, args.token, ["admin"])`. Phase 42+ uses `protectedMutation` with session-based auth. Do NOT mix patterns.
- **Using `useQuery` instead of `useSessionQuery`:** `protectedQuery` endpoints require `sessionId` auto-injection via `useSessionQuery`. Using `useQuery` will fail with "Unauthorized: no session token provided".

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Sequential numbering | Custom counter logic | `getNextNumber(ctx, "PAY")` from `convex/lib/counter.ts` | Handles OCC atomicity, WIB timezone, MMDD date format |
| Journal entry creation | Direct `ctx.db.insert` on journalEntries/journalEntryLines | `createJournalEntryWithLines` from `convex/lib/journalEngine.ts` | Enforces balance validation, integer amounts, denormalization, sequential numbering (JE-06) |
| Reversal journal entry | Manual line reversal + insert | `createReversalEntry` from `convex/lib/journalEngine.ts` | Handles original date preservation (JE-03), isReversed flag, void pairing validation |
| Auth wrapper | Manual session/role checking | `protectedMutation` / `protectedQuery` from `convex/lib/functions.ts` | Handles session validation, role checking, `ctx.user` injection |
| Mutation toast hooks | try/catch + toast in each component | `createMutationHook` from `src/hooks/convex/createMutationHook.ts` | Eliminates ~400 lines of duplicated boilerplate |
| File upload URL generation | Custom HTTP endpoint | `ctx.storage.generateUploadUrl()` in a `protectedMutation` | Convex built-in, handles signed URLs automatically |

**Key insight:** Phase 47 is a thin integration layer. Almost all the complex logic (double-entry accounting, sequential numbering, auth, file uploads) is already built and tested. The payroll-specific code should be minimal wiring.

## Common Pitfalls

### Pitfall 1: Missing `payrollNumber` in Schema
**What goes wrong:** The existing `payrollEntries` schema has no `payrollNumber` field. The CONTEXT.md specifies using `getNextNumber(ctx, "PAY")` to generate PAY-MMDD-NNN numbers, but there's nowhere to store them.
**Why it happens:** Schema was defined early (Phase 41) before the payroll number convention was decided.
**How to avoid:** Add `payrollNumber: v.string()` to the schema BEFORE implementing mutations. This is a non-breaking additive change.
**Warning signs:** TypeScript error when trying to insert `payrollNumber` into the table.

### Pitfall 2: Using Date.now() as JE Business Date
**What goes wrong:** Journal entries post to the wrong accounting period. P&L reports show expenses in the wrong month.
**Why it happens:** Natural instinct is to use `Date.now()` as the entry date. But payroll entries represent a specific pay period.
**How to avoid:** Always use `args.periodEnd` as the JE date. This is the business date for the pay period.
**Warning signs:** JE entries with dates that don't match the payroll period.

### Pitfall 3: Status Field is Optional in Schema
**What goes wrong:** If `status` is not explicitly set on creation, it defaults to `undefined` (not `"active"`). Void checks that compare `status !== "active"` will pass for undefined, potentially allowing void of already-undefined entries.
**Why it happens:** Schema defines `status: v.optional(v.union(...))`.
**How to avoid:** ALWAYS set `status: "active"` on creation. Add validation in void mutation: `if (entry.status !== "active")`.
**Warning signs:** Entries without a status field in the database.

### Pitfall 4: Forgetting `sourceId` on Journal Entry
**What goes wrong:** The `by_source` index on `journalEntries` becomes useless for tracing payroll JEs back to payroll entries.
**Why it happens:** `sourceId` is optional in `CreateJournalEntryParams`. Easy to forget.
**How to avoid:** Two approaches: (1) Insert payroll entry first, then create JE with `sourceId: payrollId`, or (2) create JE first (no sourceId), then patch the JE with sourceId after payroll insert. Option 1 has a risk: if JE creation fails, orphan payroll entry exists. Option 2 requires an extra DB write. **Recommendation: Use approach 1 but handle it cleanly -- if JE fails, the whole Convex mutation rolls back automatically (transactions are atomic in Convex).**
**Warning signs:** Journal entries with `sourceId: undefined`.

### Pitfall 5: Account Lookup Failure
**What goes wrong:** Mutation throws "Account 6100 not found" if `accounts:seedDefaults` hasn't been run.
**Why it happens:** Account codes are seeded, not hardcoded. Fresh environments have no accounts.
**How to avoid:** Add clear error message: `"Required accounts (6100, 1100) not found. Run accounts:seedDefaults first."` Same pattern used in expense approval.
**Warning signs:** Errors on first use in a new environment.

### Pitfall 6: Convex Transaction Atomicity
**What goes wrong:** Nothing -- this is actually a benefit, but it's easy to forget. If any part of a Convex mutation throws, ALL database writes in that mutation are rolled back.
**Why it happens:** Convex guarantees transactional consistency within a single mutation.
**How to avoid:** No special handling needed. Just ensure validation happens BEFORE database writes (fail-fast pattern used in journalEngine).
**Warning signs:** N/A -- just be aware that you don't need manual rollback logic.

## Code Examples

Verified patterns from the existing codebase:

### Account Lookup by Code (from expense approval)
```typescript
// Source: convex/expenses/mutations.ts lines 373-382
const creditAccount = await ctx.db
  .query("accounts")
  .withIndex("by_code", (q) => q.eq("code", "1100"))
  .unique();

if (!creditAccount) {
  throw new Error(
    `Account 1100 not found. Run accounts:seedDefaults first.`
  );
}
```

### generateUploadUrl (from expense mutations)
```typescript
// Source: convex/expenses/mutations.ts lines 313-319
export const generateUploadUrl = protectedMutation({
  roles: ["admin"],  // Changed from ALL_ROLES to admin-only for payroll
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});
```

### Frontend Route Registration (from App.tsx)
```typescript
// Source: src/App.tsx lines 271-279 (accounts route pattern)
<Route
  path="payroll"
  element={
    <ProtectedRoute allowedRoles={["admin"]}>
      <PayrollManager />
    </ProtectedRoute>
  }
/>
```

### Header Admin Dropdown Entry (from Header.tsx)
```typescript
// Source: src/components/layout/Header.tsx lines 109-113 (adminItems array)
// Add to adminItems array:
{ path: '/payroll', label: 'Payroll', icon: DollarSign, permission: 'canAccessUsers' },
// Note: Using canAccessUsers (admin-only) since no canAccessPayroll permission exists yet.
// Phase 48 will define proper permissions.
```

### Lazy Page Import (from App.tsx)
```typescript
// Source: src/App.tsx lines 86-88 (AccountsManager pattern)
const PayrollManager = lazyWithPreload(() =>
  import('./pages/PayrollManager').then(m => ({ default: m.PayrollManager }))
);
```

### Hooks Index Export (from src/hooks/convex/index.ts)
```typescript
// Add to index.ts:
// Payroll (Phase 47)
export {
  usePayrollEntries,
  usePayrollEntry,
  useCreatePayroll,
  useVoidPayroll,
  usePayrollUploadUrl,
  type PayrollEntry,
  type PayrollStatus,
} from "./usePayroll";
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `requireRole(ctx, args.token, ["admin"])` | `protectedMutation({ roles: ["admin"], ... })` | Phase 44 (v1.7) | No manual token arg; `ctx.user` auto-injected |
| `useQuery(api.x.y, { token })` | `useSessionQuery(api.x.y, args)` | Phase 44 (v1.7) | SessionId auto-injected by convex-helpers |
| Direct `ctx.db.insert("journalEntries", ...)` | `createJournalEntryWithLines(ctx, params)` | Phase 42 (v1.7) | Enforces JE-01 through JE-06 invariants |
| Manual toast try/catch per mutation | `createMutationHook(ref, config)` | Phase 44 (v1.7) | Eliminates boilerplate, consistent UX |

**Deprecated/outdated:**
- `requireRole` + `token: v.string()` pattern: Still works for legacy code, but new v1.7 code uses `protectedMutation`/`protectedQuery`.
- Direct JE inserts: Banned by JE-06. Must go through `createJournalEntryWithLines`.

## Schema Change Required

The existing `payrollEntries` table is missing the `payrollNumber` field. This needs to be added:

```typescript
// Add to payrollEntries table definition:
payrollNumber: v.string(),
```

This is a non-breaking additive change. No migration needed -- existing data (if any) would need to be checked, but since payroll functionality doesn't exist yet, the table should be empty.

## Open Questions

1. **Permission flag for payroll access**
   - What we know: Phase 48 defines PERM-03 which says "Admin-only access to Reimbursement Manager, bank accounts, payroll entries." No `canAccessPayroll` permission exists yet.
   - What's unclear: Should we use `canAccessUsers` (admin-only existing permission) as a temporary gate, or `allowedRoles={["admin"]}` directly on the route?
   - Recommendation: Use `allowedRoles={["admin"]}` on the route (same as AccountsManager pattern). This is explicit and correct. Phase 48 can add a proper permission flag later.

2. **sourceId circular reference**
   - What we know: `createJournalEntryWithLines` accepts `sourceId` for traceability. But the payroll entry doesn't exist yet when we create the JE.
   - What's unclear: Should we create the JE first (no sourceId) then the payroll entry, or payroll entry first then JE?
   - Recommendation: Create JE first (without sourceId or with a temporary value), insert payroll entry with `journalEntryId`, then optionally patch the JE with the payroll entry ID. In practice, the expense pattern does NOT use sourceId for payroll cross-referencing -- it stores `journalEntryId` on the payroll entry. So `sourceId` can be omitted or set to the payroll entry `_id` string after insert. The simpler approach: just omit `sourceId` for now, since `journalEntryId` on the payroll entry provides the link.

3. **Period date picker format**
   - What we know: `periodStart` and `periodEnd` are `v.number()` (UTC epoch ms).
   - What's unclear: Should the form use two date pickers, or a single "period" selector that auto-fills both?
   - Recommendation: Two date pickers (start and end). Simple and flexible. The frontend converts date strings to UTC epoch ms via `wibDateStrToUtcMs`.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^4.0.18 |
| Config file | `vitest.config.ts` (project root) |
| Quick run command | `npm run test -- convex/payroll/__tests__/helpers.test.ts` |
| Full suite command | `npm run test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PAY-01 | Amount validation (positive integer) | unit | `npm run test -- convex/payroll/__tests__/helpers.test.ts` | Wave 0 |
| PAY-01 | Void reason validation (non-empty) | unit | `npm run test -- convex/payroll/__tests__/helpers.test.ts` | Wave 0 |
| PAY-02 | JE line construction (DR 6100, CR 1100) | unit | Already covered by `convex/lib/__tests__/journalEngine.test.ts` | Exists |
| PAY-02 | JE balance validation | unit | Already covered by `convex/lib/__tests__/journalEngine.test.ts` | Exists |
| PAY-03 | Void pairing (payroll -> payroll_void) | unit | Already covered by `convex/lib/__tests__/journalEngine.test.ts` | Exists |
| PAY-03 | Cannot void already-voided entry | unit | `npm run test -- convex/payroll/__tests__/helpers.test.ts` | Wave 0 |
| PAY-04 | List filtering by employee type | integration | Manual verification (Convex query) | Manual-only |

### Sampling Rate
- **Per task commit:** `npm run test -- convex/payroll/__tests__/helpers.test.ts`
- **Per wave merge:** `npm run test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `convex/payroll/__tests__/helpers.test.ts` -- covers PAY-01 (amount validation), PAY-03 (void reason validation, status check)
- [ ] `convex/payroll/helpers.ts` -- pure functions for TDD

## Sources

### Primary (HIGH confidence)
- `convex/lib/journalEngine.ts` -- JournalSourceType, CreateJournalEntryParams, createJournalEntryWithLines, createReversalEntry, buildDebitLine, buildCreditLine, validateVoidPairing
- `convex/lib/counter.ts` -- getNextNumber with "PAY" prefix support
- `convex/lib/functions.ts` -- protectedMutation, protectedQuery wrappers
- `convex/schema.ts` lines 1776-1803 -- payrollEntries table definition (missing payrollNumber field)
- `convex/expenses/mutations.ts` -- approveExpense (JE creation pattern), voidExpense (reversal pattern), generateUploadUrl
- `convex/expenses/queries.ts` -- protectedQuery patterns
- `convex/expenses/helpers.ts` -- pure validation function pattern
- `convex/expenses/__tests__/helpers.test.ts` -- TDD test pattern
- `src/hooks/convex/useExpenses.ts` -- useSessionQuery + createMutationHook pattern
- `src/hooks/convex/createMutationHook.ts` -- mutation hook factory
- `src/App.tsx` -- route registration and lazy import patterns
- `src/components/layout/Header.tsx` -- admin dropdown navigation pattern
- `src/lib/dateUtils.ts` -- utcToWibDateStr, wibDateStrToUtcMs, formatDateId

### Secondary (MEDIUM confidence)
- None -- all findings verified from codebase source

### Tertiary (LOW confidence)
- None -- no web search needed; this is internal pattern replication

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already in use, no new dependencies
- Architecture: HIGH -- exact patterns established in Phases 44-45, direct replication
- Pitfalls: HIGH -- schema gap (missing payrollNumber) verified by reading schema; all other pitfalls derived from proven patterns

**Research date:** 2026-03-14
**Valid until:** 2026-04-14 (stable -- internal patterns, no external dependency changes)
