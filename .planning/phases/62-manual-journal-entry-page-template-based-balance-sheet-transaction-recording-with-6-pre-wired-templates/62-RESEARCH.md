# Phase 62: Manual Journal Entry Page - Research

**Researched:** 2026-03-18
**Domain:** Template-based manual journal entry for balance sheet transactions (Convex backend + React frontend)
**Confidence:** HIGH

## Summary

Phase 62 adds a template-based manual journal entry page that enables admins and managers to record balance sheet transactions (equipment purchases, loan repayments, dividends, capital injections, loan receipts, tax payments) through 6 pre-wired templates. Each template maps to a specific debit/credit account pair, eliminating double-entry bookkeeping risk.

The implementation is well-constrained by existing infrastructure. The journal engine (`convex/lib/journalEngine.ts`) already supports `sourceType: "manual"` and provides `createJournalEntryWithLines` with full balance validation, sequential numbering (JE-MMDD-NNN), and integer enforcement. The period controls pattern from Expense Analytics (`src/lib/expenseAnalyticsPeriod.ts`) can be reused verbatim for the recent entries table. The hub page (`HubPage.tsx`) uses a simple `HUB_AREAS` array that needs restructuring to split Financials into Financials + Accounting.

**Primary recommendation:** This is a straightforward CRUD page with minimal architectural risk. Use `protectedMutation` / `protectedQuery` from `convex/lib/functions.ts`, the existing `createJournalEntryWithLines` engine, and the established period controls pattern. The only schema change is adding `templateType` to `journalEntries.metadata`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Route: `/journal`, file: `src/pages/ManualJournalEntry.tsx`
- Access: `canManageReimbursements` (admin + manager)
- Layout top to bottom: PageHeader, template cards grid, inline accordion form, recent entries table
- Template cards: 6 cards in responsive grid (3x2 desktop, 2x3 tablet, 1x6 mobile)
- Only one template form open at a time -- clicking another collapses current
- 6 templates with specific Lucide icons and debit/credit account pairs:
  1. Equipment Purchase (Wrench) -- DR 1500 Fixed Assets / CR 1100 Cash
  2. Loan Repayment (Coins) -- DR 2500 Loans Payable / CR 1100 Cash
  3. Dividend Payment (Users) -- DR 3200 Retained Earnings / CR 1100 Cash
  4. Capital Injection (Building) -- DR 1100 Cash / CR 3100 Owner's Capital
  5. Receive a Loan (Landmark) -- DR 1100 Cash / CR 2500 Loans Payable
  6. Tax Payment (FileCheck) -- DR 2400 Tax Payable / CR 1100 Cash
- PT entity: dividends from Retained Earnings (3200), not owner draws from Owner's Capital (3100)
- Inline form fields: Date (default today WIB), Amount (integer IDR), Description (required free text)
- Read-only accounting preview: "DR {debit account name} / CR {credit account name}"
- Save creates JE and collapses form; Cancel collapses without saving
- Schema: add `templateType: v.optional(v.string())` to `journalEntries.metadata` object
- Also update `CreateJournalEntryParams.metadata` in `convex/lib/journalEngine.ts`
- New `convex/manualJournal/mutations.ts` -- `create` mutation (admin + manager)
- New `convex/manualJournal/queries.ts` -- `listByPeriod` query
- Template type union: `"equipment_purchase" | "loan_repayment" | "dividend_payment" | "capital_injection" | "receive_loan" | "tax_payment"`
- New `src/hooks/convex/useManualJournal.ts`
- Period controls reuse `ExpensePeriodMode` pattern from `src/lib/expenseAnalyticsPeriod.ts`
- Table columns: Entry # (JE-MMDD-NNN blue text, no navigation), Date, Type (color badge), Description, Amount (IDR)
- Type badge colors: Equipment=Blue, Loan Repayment=Green, Dividend=Yellow, Capital Injection=Purple, Receive Loan=Violet, Tax Payment=Pink
- Empty state: "No manual journal entries for {month}. Use the templates above to create one."
- Hub navigation: split Financials into Financials + Accounting sections
  - Financials: Income Statement, Expenses, Exp. Analytics, Reimburse, Payroll
  - Accounting (NEW): Manual Journal Entry, Chart of Accounts, Bank Accounts, Historical Import
- Manual entries are non-reversible (`NON_REVERSIBLE_TYPES` includes "manual")

### Claude's Discretion
- Accordion animation style (Framer Motion or CSS transitions)
- Form validation feedback UX (inline errors, toast, or both)
- Save confirmation feedback (toast vs inline success)
- Table loading skeleton design
- Mobile form layout details within the accordion
- Card hover/selected state styling

### Deferred Ideas (OUT OF SCOPE)
- Void/correction UI for manual journal entries -- future phase if needed
- Phase 60: Asset Register & Depreciation -- tracks fixed assets purchased via Equipment Purchase template
- Additional template types (e.g., prepaid expenses, depreciation) -- future phases as needed
</user_constraints>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Convex | ^1.31.7 | Backend (real-time DB + serverless functions) | Project standard |
| React | ^19.2.0 | UI framework | Project standard |
| TypeScript | ~5.9 | Type safety | Project standard |
| convex-helpers | (installed) | `protectedMutation`, `protectedQuery`, `useSessionQuery`, `useSessionMutation` | Project auth pattern |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Lucide React | (installed) | Template card icons (Wrench, Coins, Users, Building, Landmark, FileCheck) | Template card rendering |
| Framer Motion | (installed) | Accordion expand/collapse animation | Discretionary -- recommended for accordion |
| Sonner | (installed) | Toast notifications for save/error feedback | Post-save feedback |
| shadcn/ui | (installed) | Card, Button, Badge, Input components | All UI elements |
| date-fns | (installed) | Date formatting with Indonesian locale | Table date display |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Framer Motion accordion | CSS transitions (`max-height` + `overflow: hidden`) | Simpler but less smooth; Framer Motion already used elsewhere in project |
| Inline form errors | Toast-only errors | Inline is better UX for form validation; toast for server errors |

**Installation:** No new packages required. All dependencies already installed.

## Architecture Patterns

### Recommended Project Structure
```
convex/
  manualJournal/
    mutations.ts           # create mutation
    queries.ts             # listByPeriod query
src/
  pages/
    ManualJournalEntry.tsx # Full page component
  hooks/convex/
    useManualJournal.ts    # Query + mutation hooks
```

### Pattern 1: protectedMutation with Journal Engine
**What:** Backend mutation that validates input, resolves account IDs via `by_code` index, and delegates to `createJournalEntryWithLines`.
**When to use:** For the `create` mutation in `convex/manualJournal/mutations.ts`.
**Example:**
```typescript
// Source: convex/journalImport/mutations.ts (existing pattern)
import { protectedMutation } from "../lib/functions";
import { createJournalEntryWithLines } from "../lib/journalEngine";

export const create = protectedMutation({
  roles: ["manager", "admin"],
  args: {
    templateType: v.string(),
    date: v.number(),
    amount: v.number(),
    description: v.string(),
  },
  handler: async (ctx, args) => {
    // 1. Validate templateType against TEMPLATES constant
    // 2. Validate amount > 0 && Number.isInteger(amount)
    // 3. Look up debit/credit account IDs via by_code index
    // 4. Call createJournalEntryWithLines with sourceType: "manual"
    //    and metadata: { templateType: args.templateType }
  },
});
```

### Pattern 2: protectedQuery with Index Prefix Scan + Post-Filter
**What:** Query that uses `by_source` index for sourceType="manual" prefix scan, then post-filters by date range and `metadata.templateType` presence.
**When to use:** For the `listByPeriod` query in `convex/manualJournal/queries.ts`.
**Key detail:** The `by_source` index is on `["sourceType", "sourceId"]`. Querying with just `eq("sourceType", "manual")` performs a prefix scan returning ALL manual entries. Post-filtering by date range and `metadata.templateType` presence is acceptable because manual template entries will be low-volume.
**Example:**
```typescript
// Source: journalEntries schema index definition
export const listByPeriod = protectedQuery({
  roles: ["manager", "admin"],
  args: {
    periodStart: v.number(),
    periodEnd: v.number(),
  },
  handler: async (ctx, args) => {
    const entries = await ctx.db
      .query("journalEntries")
      .withIndex("by_source", (q) => q.eq("sourceType", "manual"))
      .collect();

    // Post-filter: date range + templateType present (excludes CSV imports)
    const filtered = entries.filter(
      (e) =>
        e.date >= args.periodStart &&
        e.date < args.periodEnd &&
        e.metadata?.templateType
    );

    // Join with journalEntryLines + accounts for display
    // Sort by date descending
  },
});
```

### Pattern 3: useSessionQuery + createMutationHook Hook Pattern
**What:** Frontend hooks wrapping Convex query/mutation endpoints with session auth.
**When to use:** For `src/hooks/convex/useManualJournal.ts`.
**Key detail:** Queries use `useSessionQuery` for protectedQuery endpoints. Mutations use `createMutationHook` factory for toast integration.
**Example:**
```typescript
// Source: src/hooks/convex/useExpenseAnalytics.ts + useAccounts.ts (existing patterns)
import { useSessionQuery } from "convex-helpers/react/sessions";
import { createMutationHook } from "./createMutationHook";
import { api } from "../../../convex/_generated/api";

export function useManualJournalEntries(periodStart: number, periodEnd: number) {
  return useSessionQuery(api.manualJournal.queries.listByPeriod, {
    periodStart,
    periodEnd,
  });
}

export const useCreateManualJournalEntry = createMutationHook(
  api.manualJournal.mutations.create,
  { successMessage: "Journal entry created", errorMessage: "Failed to create journal entry" }
);
```

### Pattern 4: Period Controls (Reuse from Expense Analytics)
**What:** Monthly/Custom period selector with month navigation chevrons and "Today" reset.
**When to use:** For the recent entries table period filter.
**Key detail:** Import `computePeriodRange`, `prevMonth`, `nextMonth`, `isCurrentOrFutureMonth`, `getCurrentWibMonth` from `src/lib/expenseAnalyticsPeriod.ts`. Render exactly like `ExpenseAnalytics.tsx` lines 99-160.

### Pattern 5: Hub Area Card Definition
**What:** `HUB_AREAS` array in `HubPage.tsx` defines nav cards with title, description, icon, color, links, and visibility callback.
**When to use:** Restructuring Financials into Financials + Accounting.
**Key detail:** Split the existing Financials card. The Accounting card needs a NEW icon (use `BookMarked` or `Calculator` from Lucide), new links array, and `visible: (hp) => hp("canManageReimbursements")`. Bank Accounts moves from Financials to Accounting.

### Pattern 6: Lazy Loading Route Registration
**What:** New pages use `lazyWithPreload` in `App.tsx` for code splitting.
**When to use:** Registering `/journal` route.
**Example:**
```typescript
const ManualJournalEntry = lazyWithPreload(() =>
  import('./pages/ManualJournalEntry').then(m => ({ default: m.ManualJournalEntry }))
);
// Route: <Route path="journal" element={<ProtectedRoute requiredPermission="canManageReimbursements"><ManualJournalEntry /></ProtectedRoute>} />
```

### Anti-Patterns to Avoid
- **Direct ctx.db.insert on journalEntries/journalEntryLines:** ALWAYS use `createJournalEntryWithLines` (JE-06 rule). The journal engine enforces balance validation, sequential numbering, and integer amounts.
- **Querying accounts by name instead of by_code index:** Account codes are stable identifiers (1100, 1500, etc.). Names could change. Always use `by_code` index.
- **Calling hooks after conditional returns:** React hooks must be called before any early return. All `useSessionQuery` / `useCreateManualJournalEntry` calls must appear before loading checks.
- **Using `requireRole` directly instead of `protectedMutation`/`protectedQuery`:** The project uses `protectedMutation`/`protectedQuery` wrappers from `convex/lib/functions.ts` which handle session validation + role checking. Only old code uses raw `requireRole`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Journal entry creation | Custom `ctx.db.insert` on journalEntries | `createJournalEntryWithLines` from `convex/lib/journalEngine.ts` | Enforces balance validation, sequential numbering, integer amounts, date denormalization |
| Sequential numbering | Custom counter logic | `getNextNumber` from `convex/lib/counter.ts` (called internally by journal engine) | Handles WIB timezone, OCC atomicity, PREFIX-MMDD-NNN format |
| Period range calculation | Custom date math | `computePeriodRange`, `prevMonth`, `nextMonth` from `src/lib/expenseAnalyticsPeriod.ts` | WIB-aligned period boundaries already battle-tested |
| WIB date conversion | Manual UTC+7 offset | `wibMidnightToUtc`, `getCurrentWibMonth`, `utcToWibDateStr` from `src/lib/dateUtils.ts` | Canonical WIB helpers used across the project |
| Auth + role checking | Manual session/role validation | `protectedMutation` / `protectedQuery` from `convex/lib/functions.ts` | Automatic session extraction, role enforcement, ctx.user injection |
| Mutation toast handling | Manual try/catch + toast | `createMutationHook` from `src/hooks/convex/createMutationHook.ts` | Standardized success/error toast pattern across all mutations |
| Currency formatting | Custom number formatting | `formatCurrency` from `src/lib/utils.ts` | Consistent IDR formatting across the app |

**Key insight:** This phase is primarily integration work. Nearly every building block already exists in the codebase. The journal engine, period controls, auth wrappers, and hook patterns are all established and tested. The new code is mostly glue connecting these pieces.

## Common Pitfalls

### Pitfall 1: CSV Import Entries Also Use sourceType "manual"
**What goes wrong:** The `listByPeriod` query returns CSV bulk import entries mixed with template-based entries, polluting the recent entries table.
**Why it happens:** Historical CSV import (`convex/journalImport/mutations.ts`) creates JEs with `sourceType: "manual"` but without `metadata.templateType`. Both share the same sourceType.
**How to avoid:** Post-filter query results to only include entries where `metadata?.templateType` is present (truthy). CSV imports have either no metadata or metadata with only `receiptUrl`.
**Warning signs:** Entries appearing in the table with no Type badge or unexpected descriptions starting with "[Historical Import]".

### Pitfall 2: Account Codes Must Exist Before Templates Work
**What goes wrong:** Template save fails with "Account not found" error.
**Why it happens:** Templates reference specific account codes (1100, 1500, 2400, 2500, 3100, 3200) that must be seeded via `accounts:seedDefaults`.
**How to avoid:** The `create` mutation should look up accounts by code using the `by_code` index and throw a clear error if not found. All 6 required accounts exist in `DEFAULT_ACCOUNTS` (verified in `convex/accounts/mutations.ts`).
**Warning signs:** During development, if running against a fresh database without seeded accounts.

### Pitfall 3: Schema Metadata Field Must Be Optional
**What goes wrong:** Existing journal entries without `templateType` in metadata fail schema validation.
**Why it happens:** Adding a required field to an existing optional object breaks backward compatibility.
**How to avoid:** The metadata object is already `v.optional(v.object({...}))`, and `templateType` within it must also be `v.optional(v.string())`. The design spec correctly specifies this.

### Pitfall 4: Date Field Is Business Date, Not Timestamp
**What goes wrong:** Journal entries get the wrong date, causing period filter mismatches.
**Why it happens:** The `date` field on `journalEntries` is a business date (accounting period), not `Date.now()`. The frontend date picker provides a WIB date that must be converted to UTC epoch ms at WIB midnight.
**How to avoid:** Use `wibMidnightToUtc` or `wibDateStrToUtcMs` to convert the user's selected date to the correct UTC epoch value. The journal engine uses this date for sequential numbering and period filtering.

### Pitfall 5: Hub Card Visibility Logic
**What goes wrong:** Users who should see the new Accounting card cannot see it, or the Financials card visibility breaks.
**Why it happens:** Changing the `visible` callback on the Financials card while splitting it.
**How to avoid:** Financials visibility stays: `hp("canAccessDashboard") || hp("canSubmitExpenses") || hp("canManageReimbursements")`. Accounting visibility is: `hp("canManageReimbursements")` (admin + manager only). Bank Accounts moves from Financials links to Accounting links.

### Pitfall 6: Accordion State Management
**What goes wrong:** Multiple template forms appear open simultaneously, or form state persists across template switches.
**Why it happens:** Not properly resetting form state when switching between templates.
**How to avoid:** Use a single `selectedTemplate: TemplateType | null` state. When selecting a different template, reset form fields (date, amount, description) to defaults. When the same card is clicked again, toggle it closed (set to null).

## Code Examples

### Template Constant Map (Backend)
```typescript
// Source: Design spec template definitions
const TEMPLATE_TYPES = [
  "equipment_purchase",
  "loan_repayment",
  "dividend_payment",
  "capital_injection",
  "receive_loan",
  "tax_payment",
] as const;

type TemplateType = typeof TEMPLATE_TYPES[number];

const TEMPLATES: Record<TemplateType, { debit: string; credit: string }> = {
  equipment_purchase: { debit: "1500", credit: "1100" },
  loan_repayment:     { debit: "2500", credit: "1100" },
  dividend_payment:   { debit: "3200", credit: "1100" },
  capital_injection:  { debit: "1100", credit: "3100" },
  receive_loan:       { debit: "1100", credit: "2500" },
  tax_payment:        { debit: "2400", credit: "1100" },
};
```

### Template Card Config (Frontend)
```typescript
// Source: Design spec template cards section
import { Wrench, Coins, Users, Building, Landmark, FileCheck } from "lucide-react";

interface TemplateCardConfig {
  type: TemplateType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  debitLabel: string;
  creditLabel: string;
  badgeColor: string; // Tailwind class for badge
}

const TEMPLATE_CARDS: TemplateCardConfig[] = [
  { type: "equipment_purchase", label: "Equipment Purchase", icon: Wrench,
    debitLabel: "1500 Fixed Assets", creditLabel: "1100 Cash",
    badgeColor: "bg-blue-100 text-blue-700" },
  { type: "loan_repayment", label: "Loan Repayment", icon: Coins,
    debitLabel: "2500 Loans Payable", creditLabel: "1100 Cash",
    badgeColor: "bg-green-100 text-green-700" },
  { type: "dividend_payment", label: "Dividend Payment", icon: Users,
    debitLabel: "3200 Retained Earnings", creditLabel: "1100 Cash",
    badgeColor: "bg-yellow-100 text-yellow-700" },
  { type: "capital_injection", label: "Capital Injection", icon: Building,
    debitLabel: "1100 Cash", creditLabel: "3100 Owner's Capital",
    badgeColor: "bg-purple-100 text-purple-700" },
  { type: "receive_loan", label: "Receive a Loan", icon: Landmark,
    debitLabel: "1100 Cash", creditLabel: "2500 Loans Payable",
    badgeColor: "bg-violet-100 text-violet-700" },
  { type: "tax_payment", label: "Tax Payment", icon: FileCheck,
    debitLabel: "2400 Tax Payable", creditLabel: "1100 Cash",
    badgeColor: "bg-pink-100 text-pink-700" },
];
```

### Account Lookup Pattern (Backend)
```typescript
// Source: convex/journalImport/mutations.ts (existing pattern for account lookup)
const debitAccount = await ctx.db
  .query("accounts")
  .withIndex("by_code", (q) => q.eq("code", template.debit))
  .first();
if (!debitAccount) {
  throw new Error(`System account ${template.debit} not found. Run accounts:seedDefaults.`);
}
```

### Period Controls JSX Pattern
```typescript
// Source: src/pages/ExpenseAnalytics.tsx lines 99-160 (verified)
// Copy the period selector row verbatim from ExpenseAnalytics:
// - Mode toggle badges (Monthly / Custom Range)
// - Month navigation (ChevronLeft, month label, ChevronRight, Today button)
// - Custom date inputs
// State: periodMode, monthYear, monthIndex, customStart, customEnd
// Computed: periodStart, periodEnd via computePeriodRange()
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Raw `requireRole(ctx, args.token, ...)` | `protectedMutation` / `protectedQuery` wrappers | Phase 44+ | Session auto-injected; ctx.user available; cleaner code |
| CSV bulk import only for manual JEs | Template-based single-entry UI | Phase 62 (this phase) | Users can record individual balance sheet transactions without CSV |
| Single "Financials" hub section | Split into Financials + Accounting | Phase 62 (this phase) | Cleaner navigation; ledger operations separated from reports |

**Deprecated/outdated:**
- Raw `requireRole` with explicit `token: v.string()` arg: Still works but `protectedMutation`/`protectedQuery` is the standard. New code should use the wrappers.

## Open Questions

1. **Query performance for manual entries prefix scan**
   - What we know: The `by_source` index on `["sourceType", "sourceId"]` supports prefix scan for `sourceType === "manual"`. Post-filtering by date range and `metadata.templateType` is needed.
   - What's unclear: If many CSV imports accumulate with `sourceType: "manual"`, the prefix scan returns them all before post-filtering.
   - Recommendation: Acceptable for now. Manual entries (both template and CSV) are low-volume compared to automated entries. If performance becomes an issue in the future, a dedicated index `by_sourceType_date` could be added.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^4.0.18 |
| Config file | `vitest.config.ts` |
| Quick run command | `npm run test` |
| Full suite command | `npm run test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MJE-01 | Template type validation (6 valid types) | unit | `npx vitest run convex/manualJournal/__tests__/mutations.test.ts -t "template" -x` | No - Wave 0 |
| MJE-02 | Amount validation (positive integer) | unit | `npx vitest run convex/manualJournal/__tests__/mutations.test.ts -t "amount" -x` | No - Wave 0 |
| MJE-03 | Account lookup by code resolves correctly | unit | `npx vitest run convex/manualJournal/__tests__/mutations.test.ts -t "account" -x` | No - Wave 0 |
| MJE-04 | ListByPeriod filters by date range and templateType | unit | `npx vitest run convex/manualJournal/__tests__/queries.test.ts -x` | No - Wave 0 |
| MJE-05 | Schema templateType field accepted by journal engine | unit | Covered by existing `convex/lib/__tests__/journalEngine.test.ts` | Yes |
| MJE-06 | Hub card split (Financials + Accounting) | manual-only | Visual verification | N/A |
| MJE-07 | Route registration and lazy loading | manual-only | `npm run build` (catches import errors) | N/A |

### Sampling Rate
- **Per task commit:** `npm run test`
- **Per wave merge:** `npm run test && npm run build`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `convex/manualJournal/__tests__/mutations.test.ts` -- covers MJE-01, MJE-02, MJE-03
- [ ] `convex/manualJournal/__tests__/queries.test.ts` -- covers MJE-04 (if pure function extraction allows)
- Note: Backend tests for mutations with ctx dependency may be limited to pure validation function tests. The `protectedMutation` pattern makes full integration tests require `convex-test` runtime.

## Sources

### Primary (HIGH confidence)
- `convex/lib/journalEngine.ts` -- Full journal engine source code, `createJournalEntryWithLines` API, `CreateJournalEntryParams` interface, `NON_REVERSIBLE_TYPES`
- `convex/schema.ts` lines 1763-1787 -- `journalEntries` table schema with `metadata` object and `by_source` index definition
- `convex/schema.ts` lines 1637-1656 -- `accounts` table schema with `by_code` index
- `convex/accounts/mutations.ts` lines 30-83 -- `DEFAULT_ACCOUNTS` array confirming all 6 required account codes exist (1100, 1500, 2400, 2500, 3100, 3200)
- `convex/journalImport/mutations.ts` -- Existing pattern for manual journal entries with `sourceType: "manual"` and metadata
- `convex/lib/functions.ts` -- `protectedMutation` / `protectedQuery` wrappers with session/role auth
- `src/lib/expenseAnalyticsPeriod.ts` -- Period calculation helpers (`computePeriodRange`, `prevMonth`, `nextMonth`, etc.)
- `src/pages/ExpenseAnalytics.tsx` -- Period controls rendering pattern (lines 36-88 state, 92-160 JSX)
- `src/pages/HubPage.tsx` -- `HUB_AREAS` array structure, `AreaCard` interface, `LINK_ICONS` map
- `src/App.tsx` -- Route registration pattern with `lazyWithPreload` and `ProtectedRoute`
- `src/hooks/convex/useAccounts.ts` -- Hook pattern: `useQuery` for public queries, `createMutationHook` for mutations
- `src/hooks/convex/useExpenseAnalytics.ts` -- Hook pattern: `useSessionQuery` for protected queries
- `src/hooks/convex/createMutationHook.ts` -- Mutation hook factory with toast notifications
- `docs/superpowers/specs/2026-03-16-manual-journal-entry-design.md` -- Authoritative design spec

### Secondary (MEDIUM confidence)
- None needed -- all findings verified from primary codebase sources

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already installed and used throughout the project
- Architecture: HIGH -- follows exact patterns from existing journal import, expense analytics, and hub page code
- Pitfalls: HIGH -- identified from direct code analysis of `journalImport/mutations.ts` (sourceType collision), schema definition (metadata optionality), and `HubPage.tsx` (visibility logic)

**Research date:** 2026-03-18
**Valid until:** 2026-04-18 (stable -- no external dependencies, all patterns internal to codebase)
