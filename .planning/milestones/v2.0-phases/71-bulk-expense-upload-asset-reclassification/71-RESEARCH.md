# Phase 71: Bulk Expense Upload & Asset Reclassification - Research

**Researched:** 2026-04-10
**Domain:** CSV bulk import with editable preview table, expense lifecycle integration, fixed asset disposal extension
**Confidence:** HIGH

## Summary

Phase 71 has two distinct workstreams: (1) evolving the existing HistoricalImportPage into a modern editable-table CSV import that creates actual expense records (not raw JEs), and (2) extending the fixed asset disposal flow with a "Reclassify to Expense" option. Both workstreams are well-constrained by existing patterns -- the codebase already has CSV parsing (Papa Parse), batch processing, expense lifecycle mutations, and asset disposal JE creation.

The core technical challenge is the editable preview table -- the existing import page has a read-only review step with an error table, and this needs to become a full click-to-edit spreadsheet with validation coloring. The existing `editingCogsId` pattern in MenuProductsManager provides the interaction model, but the scale is different (many columns, many rows, different input types per column). A reusable `EditableCell` component and `SearchableSelect` component are needed.

The second workstream (asset reclassification) is a contained backend+dialog change. The existing `disposeAsset` mutation needs a new disposal type literal, and the `DisposeAssetDialog` needs conditional fields when "Reclassify to Expense" is selected. The JE pattern (DR expense, DR accum depr, CR asset cost) is different from existing disposal JEs but uses the same `createJournalEntryWithLines` engine.

**Primary recommendation:** Split into 3-4 plans: (1) backend mutation for `bulkCreateExpenses` + schema change for `reclassify_to_expense`, (2) CSV validation refactor for name-based matching, (3) frontend editable table + wizard refactor, (4) asset reclassification dialog extension.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Frollie-defined CSV template with exact columns: `date`, `amount`, `description`, `category`, `vendor`, `payment_method`, `owner`, `receipt_url` (optional), `asset_category` (asset rows only), `asset_name` (asset rows only)
- **D-02:** `category` column uses account name matching (case-insensitive). Unmatched categories flagged and resolved via searchable dropdown
- **D-03:** `owner` column matches against system user names. Unmatched owners resolved via user-select dropdown
- **D-04:** Bad rows handled via inline fix -- editable preview table where user corrects invalid cells. Error cells highlighted red with tooltips
- **D-05:** Batch-level toggle: "Already paid" ON = auto-approve (recorded + JEs), OFF = submitted status (DoA approval queue)
- **D-06:** Per-row override in preview table for trust mode
- **D-07:** User-friendly toggle labels, not technical jargon
- **D-08:** Admin and Manager can use auto-approve toggle. Other roles = all rows through approval
- **D-09:** Asset reclassification creates expense record (recorded) AND journal entry. NBV becomes expense amount, linked to asset
- **D-10:** Target GL account auto-mapped from asset category with dropdown override
- **D-11:** `reclassify_to_expense` as new disposal type in `disposeAsset` mutation
- **D-12:** Reclassification JE: DR target expense account (NBV), DR accumulated depreciation, CR fixed asset cost
- **D-13:** Evolve existing HistoricalImportPage, same route `/import`, renamed page
- **D-14:** Existing `bulkCreateJournalEntries` is deprecated/legacy. New mutation creates expense records
- **D-15:** Review step = editable spreadsheet table, same pattern as `editingCogsId`
- **D-16:** Keep existing patterns: template download, CoA reference, drag-and-drop, batch progress, error/retry
- **D-17:** Row validation states: green (valid), amber (warning), red (error). Error cells red + tooltip
- **D-18:** `owner` field present in both CSV upload and asset reclassification flow

### Claude's Discretion
- Cell editing UX details (focus behavior, keyboard navigation between cells)
- Exact toggle styling and positioning within the summary bar
- Row selection/multi-select for bulk operations (if useful)
- Whether to keep "By GL Account" and "By Period" summary cards or simplify

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| EXP-01 | User can bulk upload expenses via CSV that creates actual expense records (not raw journal entries) | New `bulkCreateExpenses` mutation creates expense records via `createDraft`/`submitExpense` lifecycle. CSV validation extended for name-based matching. |
| EXP-02 | Bulk upload supports auto-approve mode (expenses created as recorded with JEs) for trusted batches | Trust mode toggle (D-05/D-06). Auto-approved rows: mutation creates expense in `recorded` status with JE via `createJournalEntryWithLines`. Role check: admin/manager only. |
| EXP-03 | Bulk upload supports submit-for-approval mode (expenses created as submitted, routed through approval queue) | Non-trusted rows: mutation creates expense in `submitted` status, enters existing DoA approval workflow. |
| EXP-04 | Fixed asset disposal supports "Reclassify to Expense" type that reverses capitalization and books as operating expense | New `reclassify_to_expense` disposal type in schema + `disposeAsset` mutation. Creates expense record + compound JE. |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **No direct commits to main** -- feature branch required (`feature/71-bulk-expense-upload`)
- **`npm run build` must pass** before merge
- **Plans must have 4 sections**: Git Workflow, Implementation Waves, Documentation Updates, Success Criteria
- **Convex IDs are typed strings** (`Id<"tableName">`)
- **Convex returns undefined while loading** -- always check before rendering
- **All hooks before conditional returns** -- React hooks order rule
- **protectedMutation with role arrays** for auth
- **Auth token via session** -- `protectedMutation` handles session extraction automatically via convex-helpers
- **After merge to main**: update `docs/CHANGELOG.md` (required), `docs/SCHEMA.md` if schema changed, `docs/API_REFERENCE.md` if backend changed

## Standard Stack

### Core (already installed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Convex | ^1.31.7 | Backend mutations, real-time queries | Project backend [VERIFIED: codebase] |
| React | ^19.2.0 | Frontend framework | Project frontend [VERIFIED: codebase] |
| Papa Parse | 5.5.3 | CSV parsing (header mode, skip empty lines) | Already used by `csvImportValidation.ts` [VERIFIED: npm ls] |
| shadcn/ui | Manual | Table, Card, Button, Badge, Input, Switch, Select, Popover, Progress, Tooltip, Skeleton | Project design system [VERIFIED: codebase] |
| Sonner | - | Toast notifications | Project toast system [VERIFIED: codebase] |
| Lucide React | - | Icons (Upload, Download, CheckCircle2, AlertTriangle, XCircle, ArrowLeft, ArrowRight) | Project icon library [VERIFIED: codebase] |

### Supporting (no new packages needed)

No new npm packages required. Everything needed is already installed.

## Architecture Patterns

### Recommended Project Structure (new/modified files)

```
convex/
  expenses/
    bulkMutations.ts              # NEW: bulkCreateExpenses mutation
  fixedAssets/
    mutations.ts                  # MODIFY: add reclassify_to_expense disposal type
    helpers.ts                    # MODIFY: add category-to-expense-account mapping
  schema.ts                       # MODIFY: add reclassify_to_expense to disposalType union
  lib/
    journalEngine.ts              # MODIFY: add asset_reclassification sourceType
src/
  pages/
    HistoricalImportPage.tsx      # MAJOR REFACTOR -> BulkImportPage
  lib/
    csvImportValidation.ts        # MODIFY: new columns, name-based matching
  components/
    shared/
      SearchableSelect.tsx        # NEW: reusable popover + filter + list
    import/
      EditableCell.tsx            # NEW: click-to-edit cell wrapper
    assets/
      DisposeAssetDialog.tsx      # MODIFY: add reclassify option + fields
  hooks/convex/
    useJournalImport.ts           # MODIFY: add hook for bulkCreateExpenses
```

### Pattern 1: Expense Record Creation (not raw JEs)

**What:** The new `bulkCreateExpenses` mutation creates actual `expenses` table records that flow through the existing expense lifecycle, instead of the legacy `bulkCreateJournalEntries` which only created raw journal entries.

**When to use:** All CSV import rows in Phase 71.

**How it works:**
```
For each validated row:
  1. Generate expense number via getNextNumber(ctx, "EXP")
  2. Look up submitter user by name -> get user._id
  3. Look up account by name (case-insensitive) -> get account._id
  4. Insert expense record:
     - If trusted (auto-approve): status = "recorded", create JE immediately
     - If untrusted: status = "submitted", no JE (enters approval queue)
  5. Record audit trail via recordStatusChange
```
[VERIFIED: expense lifecycle from `convex/expenses/mutations.ts`]

### Pattern 2: Trust Mode Branching

**What:** Each row can be "trusted" (already paid, auto-approve) or "untrusted" (needs approval). This maps to different expense statuses and JE creation.

**Trusted rows (auto-approve):**
```typescript
// Status: "recorded" (skips draft/submitted, goes directly to recorded)
// JE: Created immediately (DR expense account, CR 1100 Cash)
// Matches company_paid submit flow in submitExpense
```

**Untrusted rows (needs approval):**
```typescript
// Status: "submitted" (enters DoA approval queue)
// No JE yet (created on approval)
// Matches employee_paid submit flow
```

**Role enforcement:** Only admin/manager can set rows as trusted. Backend must verify role regardless of frontend toggle visibility. [VERIFIED: APPROVER_ROLES from `convex/expenses/constants.ts`]

### Pattern 3: Name-Based Account Matching

**What:** CSV `category` column contains account names (e.g., "Office Supplies") instead of account codes (e.g., "6200"). This is more user-friendly but requires fuzzy matching.

**Implementation:**
```typescript
// Build name-to-account map (case-insensitive)
const nameMap = new Map<string, AccountRef>();
for (const account of accounts) {
  nameMap.set(account.name.toLowerCase(), account);
}

// Match category from CSV
const match = nameMap.get(rawCategory.trim().toLowerCase());
if (!match) {
  // Flag as error -- user resolves via searchable dropdown
  errors.push({ row, column: "category", message: "Not found" });
}
```

There are ~54 accounts in the system. Client-side search is appropriate (no need for server-side). [VERIFIED: `accounts:seedDefaults` seeds 54 accounts]

### Pattern 4: Click-to-Edit Table Cell

**What:** Single `editingCell` state tracks which cell is being edited. Only one cell active at a time.

**State shape:**
```typescript
const [editingCell, setEditingCell] = useState<{
  rowIndex: number;
  column: string;
} | null>(null);
```

**Keyboard handling:** Enter saves + exits. Escape reverts + exits. Tab saves + moves to next editable cell. Blur saves + exits.

This is the `editingCogsId` pattern from MenuProductsManager, scaled to a multi-column table. [VERIFIED: `editingCogsId` in `src/pages/MenuProductsManager.tsx`]

### Pattern 5: Asset Reclassification JE

**What:** Different from standard disposal JE. Standard disposal uses gain/loss accounts (7300/7400). Reclassification uses an operating expense account.

**Standard disposal JE (existing):**
```
DR Accumulated Depreciation (1610-1730)   [full accum amount]
DR Cash (1100) or DR Loss (7400)          [proceeds or loss]
CR Fixed Assets (1500/1700)               [original cost]
CR Gain on Disposal (7300)                [if gain]
```

**Reclassification JE (new -- D-12):**
```
DR Target Expense Account (e.g., 6200)    [NBV = cost - accum depr]
DR Accumulated Depreciation (1610-1730)   [full accum amount]
CR Fixed Assets (1500/1700)               [original cost]
```

The reclassification also creates an expense record (status: `recorded`) with a JE reference. [VERIFIED: decision D-09, D-12 from CONTEXT.md]

### Pattern 6: Category-to-Expense-Account Mapping

**What:** When reclassifying an asset, the target expense GL account is auto-mapped from the asset category.

**Mapping logic (to be added to `fixedAssets/helpers.ts`):**
```typescript
const CATEGORY_TO_EXPENSE_ACCOUNT: Record<string, string> = {
  peralatan_kantor: "6200",   // Office Equipment Expense
  mesin_produksi: "6200",     // Kitchen/Production Equipment -> General Equipment Expense
  mebelair: "6200",           // Furniture -> Equipment Expense
  perkakas: "6200",           // Tools -> Equipment Expense
  kendaraan: "6200",          // Vehicle -> Equipment Expense
  bangunan: "6200",           // Building -> Equipment Expense
  perbaikan_sewa: "6200",     // Leasehold -> Equipment Expense
  merek_dagang: "6200",       // Trademark -> General Expense (intangible)
  hak_paten: "6200",          // Patent -> General Expense (intangible)
  perangkat_lunak: "6200",    // Software -> General Expense (intangible)
  tanah: "6200",              // Land (unlikely reclassification)
};
```

**Note:** The exact mapping depends on the Chart of Accounts codes. The default should be overrideable via a searchable dropdown in the dialog (D-10). The planner should verify the exact account codes against the seeded accounts. [ASSUMED]

### Anti-Patterns to Avoid

- **Creating raw JEs instead of expense records:** The legacy `bulkCreateJournalEntries` creates JEs directly. Phase 71 must create expense records that flow through the lifecycle. JEs are only created for auto-approved rows.
- **Skipping audit trail:** Every expense status transition must call `recordStatusChange`. Bulk operations must not skip this.
- **Client-side trust mode without backend verification:** The backend mutation MUST verify the user's role before creating auto-approved expenses. Never trust the client-side toggle alone.
- **Mutating all rows in a single Convex transaction:** Keep the existing MAX_BATCH_SIZE=50 pattern. Convex transactions have time limits. Sequential batching with retry-from-failure is the proven pattern.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CSV parsing | Custom parser | Papa Parse 5.5.3 (`parseAndValidateCsv`) | Already used, handles edge cases (quoted fields, newlines in values, BOM) [VERIFIED: codebase] |
| Journal entry creation | Direct `ctx.db.insert("journalEntries", ...)` | `createJournalEntryWithLines` from `journalEngine.ts` | JE-06 rule: single entry point. Validates balance, generates number, inserts lines [VERIFIED: codebase] |
| Expense number generation | Manual counter | `getNextNumber(ctx, "EXP")` from `lib/counter.ts` | Atomic counter with MMDD-NNN format, handles concurrency [VERIFIED: codebase] |
| Depreciation calculation | Manual math | `calculateMonthlyDepreciation` from `fixedAssets/helpers.ts` | Handles salvage value, useful life, integer rounding [VERIFIED: codebase] |
| Session auth | Manual token check | `protectedMutation` wrapper from `lib/functions.ts` | Auto-extracts session, validates, provides `ctx.user` [VERIFIED: codebase] |
| Toast notifications | Custom notification system | Sonner `toast.success`/`toast.error` | Project-wide pattern [VERIFIED: codebase] |
| Searchable dropdown | Custom from scratch | shadcn `Popover` + `Input` + filtered list | Components already available, just needs composition [VERIFIED: UI-SPEC] |

## Common Pitfalls

### Pitfall 1: Schema Migration for disposalType Union

**What goes wrong:** Adding `reclassify_to_expense` to the `disposalType` union in schema.ts requires a Convex deploy before any mutation can write that value.
**Why it happens:** Convex validates all document writes against the current schema. Writing a new literal before deploying the schema causes a runtime error.
**How to avoid:** Schema change must be deployed first (or in the same deploy). The plan's Wave 1 should include the schema change alongside the mutation changes. Since `npx convex dev` hot-reloads schema, this is seamless in development.
**Warning signs:** "Invalid value for field disposalType" errors in Convex logs.

### Pitfall 2: Journal Entry sourceType Union

**What goes wrong:** If the reclassification JE uses a new sourceType (e.g., `asset_reclassification`), the schema's `sourceType` union must be updated AND `journalEngine.ts` must accept it.
**Why it happens:** The `JournalSourceType` type in `journalEngine.ts` is a union of literals. Adding a new type requires updating both the schema and the type.
**How to avoid:** Evaluate whether to reuse existing `manual` sourceType (simpler) or add a new `asset_reclassification` type (cleaner traceability). The existing `disposeAsset` uses `manual` sourceType for disposal JEs, so using `manual` for reclassification is consistent. Recommend using `manual` to avoid schema change for sourceType.
**Warning signs:** TypeScript compilation errors on sourceType literal.

### Pitfall 3: User Lookup by Name Ambiguity

**What goes wrong:** If two users have the same display name, name-based matching is ambiguous.
**Why it happens:** The `users` table does not enforce unique names.
**How to avoid:** Use case-insensitive exact match. If multiple matches found, treat as error and require manual resolution via dropdown. The system is small (~5-10 users), so this is unlikely but must be handled.
**Warning signs:** CSV owner column matches multiple users.

### Pitfall 4: Account Name Case Sensitivity

**What goes wrong:** CSV category "office supplies" does not match account name "Office Supplies" because comparison is case-sensitive.
**Why it happens:** Account names in the database use title case.
**How to avoid:** Always `.toLowerCase()` both sides of the comparison. Trim whitespace too.
**Warning signs:** Valid account names showing as "not found" errors in preview.

### Pitfall 5: Expense Record Fields Missing

**What goes wrong:** The bulk mutation creates expense records that are missing required fields from the schema.
**Why it happens:** The `expenses` table has many required fields: `expenseNumber`, `submittedBy`, `amount`, `accountId`, `expenseDate`, `description`, `vendorName`, `paymentMethod`, `status`, `lateSubmission`, `createdAt`.
**How to avoid:** Map every CSV column to the corresponding expense field. Use sensible defaults where the CSV does not provide data (e.g., `lateSubmission: false` for bulk import, `vendorName: ""` if not provided). Cross-reference the schema definition at lines 1719-1777. [VERIFIED: schema.ts]
**Warning signs:** "Missing required field" errors from Convex at mutation time.

### Pitfall 6: Batch ID for Traceability

**What goes wrong:** No way to trace which expenses came from a single CSV upload.
**Why it happens:** Individual expense records don't have a batch reference.
**How to avoid:** Generate a `batchId` (UUID) on the client before import starts. Pass it to every batch call. Store as metadata or in the expense description. The existing pattern uses `importBatchId` as `sourceId` on JEs -- the new mutation should do similar. Consider adding a field or using the `sourceId` on the JE.
**Warning signs:** Cannot audit "which expenses came from this import session."

### Pitfall 7: Concurrent Expense Number Generation

**What goes wrong:** Multiple expenses in the same batch try to generate sequential numbers and collide.
**Why it happens:** `getNextNumber` uses atomic counters, but if called rapidly in a loop within the same transaction, it works correctly because Convex transactions are serializable.
**How to avoid:** The existing batch pattern (sequential loop within a single mutation call) is safe because Convex mutations are transactional. Do NOT parallelize expense creation within a batch.
**Warning signs:** Duplicate expense numbers.

## Code Examples

### Example 1: New bulkCreateExpenses Mutation Skeleton

```typescript
// Source: Pattern derived from existing bulkCreateJournalEntries + createDraft
// File: convex/expenses/bulkMutations.ts

export const bulkCreateExpenses = protectedMutation({
  roles: [...ALL_ROLES],
  args: {
    importBatchId: v.string(),
    rows: v.array(v.object({
      date: v.number(),
      amount: v.number(),
      description: v.string(),
      vendorName: v.optional(v.string()),
      accountId: v.id("accounts"),    // Resolved on client from name match
      submitterId: v.id("users"),     // Resolved on client from owner name match
      paymentMethod: v.union(
        v.literal("employee_paid"),
        v.literal("company_paid"),
        v.literal("payment_request")
      ),
      receiptUrl: v.optional(v.string()),
      trusted: v.boolean(),           // Auto-approve flag
      // Asset fields (optional, for asset rows)
      assetCategory: v.optional(v.string()),
      assetName: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args) => {
    // 1. Validate batch size
    // 2. Verify role for trusted rows (admin/manager only)
    // 3. For each row:
    //    a. Generate expense number
    //    b. Insert expense record (status based on trusted flag)
    //    c. Record audit trail
    //    d. If trusted: create JE via createJournalEntryWithLines
    // 4. Return { created, autoApproved, submitted }
  },
});
```
[VERIFIED: Pattern matches existing `bulkCreateJournalEntries` and `createDraft` mutation structures]

### Example 2: Reclassification JE Lines

```typescript
// Source: Pattern derived from existing disposeAsset JE + D-12 decision
// JE for reclassifying an asset to expense

const nbv = asset.cost - asset.accumulatedDepreciation;
const lines: JournalLine[] = [];

// DR Target Expense Account (NBV)
lines.push(buildDebitLine(targetExpenseAccountId, nbv, `Reclassified: ${asset.name}`));

// DR Accumulated Depreciation (full accumulated amount, if > 0)
if (asset.accumulatedDepreciation > 0 && accumAccountId) {
  lines.push(buildDebitLine(accumAccountId, asset.accumulatedDepreciation, "Remove accumulated depreciation"));
}

// CR Fixed Assets (original cost)
lines.push(buildCreditLine(fixedAssetAccountId, asset.cost, "Remove asset cost"));
```
[VERIFIED: Follows double-entry balance: NBV + AccumDepr = Cost]

### Example 3: Name-Based CSV Validation

```typescript
// Source: Extension of existing parseAndValidateCsv pattern
// New column validation for category (name-based) and owner (user name)

interface AccountNameRef {
  _id: string;    // account._id for backend
  code: string;
  name: string;
  type: string;
  isActive: boolean;
}

interface UserRef {
  _id: string;    // user._id for backend
  name: string;
}

// Build lookup maps
const accountNameMap = new Map<string, AccountNameRef>();
for (const account of accounts) {
  accountNameMap.set(account.name.toLowerCase(), account);
}

const userNameMap = new Map<string, UserRef>();
for (const user of users) {
  userNameMap.set(user.name.toLowerCase(), user);
}

// Per-row validation
const categoryMatch = accountNameMap.get(rawCategory.trim().toLowerCase());
if (!categoryMatch) {
  cellErrors.push({ column: "category", message: `Category '${rawCategory}' not found` });
}

const ownerMatch = userNameMap.get(rawOwner.trim().toLowerCase());
if (!ownerMatch) {
  cellErrors.push({ column: "owner", message: `User '${rawOwner}' not found` });
}
```
[VERIFIED: Pattern extends existing `parseAndValidateCsv` in `csvImportValidation.ts`]

### Example 4: SearchableSelect Component

```typescript
// Source: Composition of existing shadcn Popover + Input
// File: src/components/shared/SearchableSelect.tsx

interface SearchableSelectProps {
  items: Array<{ value: string; label: string }>;
  value: string | null;
  onSelect: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
}

// Uses: Popover, PopoverTrigger, PopoverContent, Input
// Client-side filter: items.filter(item => item.label.toLowerCase().includes(query))
// ~54 accounts or ~10 users -- no virtualization needed
```
[VERIFIED: All shadcn components available in codebase]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `bulkCreateJournalEntries` (raw JEs) | `bulkCreateExpenses` (expense records) | Phase 71 | Expenses appear in analytics, approval queue, audit trail |
| Account code in CSV (`accountCode`) | Account name in CSV (`category`) | Phase 71 | More user-friendly, less error-prone |
| `submitterName` as free text | `owner` matched to system users | Phase 71 | Expense `submittedBy` points to real user ID |
| Read-only review table | Editable preview table | Phase 71 | Users can fix errors inline instead of re-uploading |
| 3 disposal types (sold/scrapped/written_off) | 4 disposal types (+reclassify_to_expense) | Phase 71 | Assets can be reclassified to operating expenses |

**Deprecated/outdated:**
- `bulkCreateJournalEntries` in `convex/journalImport/mutations.ts`: Legacy mutation that creates raw JEs. Phase 71 replaces it for expense import. The legacy mutation should remain for backward compatibility but the UI will no longer call it.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Category-to-expense-account mapping defaults all categories to account code "6200" | Architecture Pattern 6 | Low -- the dropdown override (D-10) provides fallback. Exact codes should be verified against seeded accounts. |
| A2 | Using `manual` sourceType for reclassification JE (instead of new sourceType) | Pitfall 2 | Low -- consistent with existing disposal JEs. If traceability needs differ, a new sourceType can be added but requires schema + journalEngine changes. |
| A3 | No virtualization needed for the editable table (< 500 rows typical) | Architecture Patterns | Medium -- if users upload very large CSVs (1000+ rows), the editable table could be slow. The existing batch limit of 50 rows per mutation call is the real bottleneck, not rendering. |

## Open Questions

1. **Exact category-to-expense-account mapping**
   - What we know: D-10 says auto-map from asset category with dropdown override
   - What's unclear: Which specific GL account code maps to each asset category. Currently all categories could map to a generic expense account (6200) but there may be more specific ones (e.g., 6150 for depreciation expense, 6160 for amortization)
   - Recommendation: Use a sensible default (generic expense account) with override. The exact mapping can be refined based on the seeded Chart of Accounts. For reclassification, the typical target is a general operating expense account (not depreciation/amortization accounts, since the asset is being expensed as an operating cost, not depreciated further).

2. **Legacy bulkCreateJournalEntries cleanup**
   - What we know: D-14 says it's deprecated/legacy
   - What's unclear: Should it be deleted, or kept for backward compatibility?
   - Recommendation: Keep it but mark with `@deprecated` JSDoc. The UI will stop calling it. A future phase can remove it.

3. **New sourceType for reclassification JE**
   - What we know: Existing disposal uses `manual` sourceType. A new `asset_reclassification` type would be cleaner.
   - What's unclear: Whether the traceability benefit justifies the schema + journalEngine change
   - Recommendation: Use `manual` for now (matches existing disposal pattern). If needed later, adding a sourceType is a small schema migration.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^4.0.18 + convex-test |
| Config file | `vitest.config.ts` |
| Quick run command | `npm run test` |
| Full suite command | `npm run test:coverage` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| EXP-01 | bulkCreateExpenses creates expense records from CSV rows | unit | `npm run test -- convex/expenses/__tests__/bulkMutations.test.ts -x` | Wave 0 |
| EXP-02 | Trusted rows create recorded expenses with JEs | unit | `npm run test -- convex/expenses/__tests__/bulkMutations.test.ts -x` | Wave 0 |
| EXP-03 | Untrusted rows create submitted expenses without JEs | unit | `npm run test -- convex/expenses/__tests__/bulkMutations.test.ts -x` | Wave 0 |
| EXP-04 | disposeAsset with reclassify_to_expense creates expense + correct JE | unit | `npm run test -- convex/fixedAssets/__tests__/reclassify.test.ts -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npm run test`
- **Per wave merge:** `npm run test:coverage`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `convex/expenses/__tests__/bulkMutations.test.ts` -- covers EXP-01, EXP-02, EXP-03
- [ ] `convex/fixedAssets/__tests__/reclassify.test.ts` -- covers EXP-04
- [ ] `src/lib/__tests__/csvImportValidation.test.ts` -- may need updates for new column validation

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | `protectedMutation` wrapper validates session automatically |
| V3 Session Management | yes | Existing session system via convex-helpers SessionIdArg |
| V4 Access Control | yes | `protectedMutation({ roles: [...] })` -- admin/manager for auto-approve, ALL_ROLES for submit |
| V5 Input Validation | yes | Papa Parse + custom validation for all CSV fields; backend re-validates |
| V6 Cryptography | no | No crypto operations in this phase |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Privilege escalation via trust mode | Elevation of Privilege | Backend verifies role for trusted rows regardless of client toggle [VERIFIED: protectedMutation pattern] |
| CSV injection (formula injection) | Tampering | Papa Parse escapes formulas. Amounts validated as positive integers. Descriptions are plain text displayed in table. |
| Batch ID spoofing | Spoofing | Client-generated UUID for traceability only. No security decisions based on batchId. |
| Mass expense creation DoS | Denial of Service | MAX_BATCH_SIZE=50 per mutation call. Sequential batching prevents transaction timeout. |

## Sources

### Primary (HIGH confidence)
- `convex/expenses/mutations.ts` -- expense lifecycle (createDraft, submitExpense, approveExpense)
- `convex/expenses/helpers.ts` -- fraud controls, DoA validation
- `convex/expenses/auditTrail.ts` -- recordStatusChange
- `convex/expenses/constants.ts` -- ALL_ROLES, APPROVER_ROLES
- `convex/fixedAssets/mutations.ts` -- disposeAsset, resolveAccount, getNextAssetNumber
- `convex/fixedAssets/helpers.ts` -- ASSET_CATEGORIES, calculateDisposalGainLoss, getAssetAccountCode
- `convex/lib/journalEngine.ts` -- createJournalEntryWithLines, buildDebitLine, buildCreditLine
- `convex/journalImport/mutations.ts` -- legacy bulkCreateJournalEntries (reference)
- `src/pages/HistoricalImportPage.tsx` -- existing wizard shell to evolve
- `src/lib/csvImportValidation.ts` -- existing CSV parse + validate
- `src/components/assets/DisposeAssetDialog.tsx` -- existing disposal dialog
- `convex/schema.ts` -- expenses table (lines 1719-1777), fixedAssets table (lines 1975-2003), accounts table (lines 1697-1717), journalEntries sourceType union (line 1832)
- `convex/auth/queries.ts` -- getActiveUsers, listUsers for owner dropdown data
- `.planning/phases/71-bulk-expense-upload-asset-reclassification/71-CONTEXT.md` -- all user decisions
- `.planning/phases/71-bulk-expense-upload-asset-reclassification/71-UI-SPEC.md` -- complete UI design contract

### Secondary (MEDIUM confidence)
- `src/pages/MenuProductsManager.tsx` -- editingCogsId inline edit pattern (verified by grep)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new libraries, all patterns verified in codebase
- Architecture: HIGH -- all integration points verified, mutation patterns clear
- Pitfalls: HIGH -- common Convex pitfalls well-documented from 69 prior phases

**Research date:** 2026-04-10
**Valid until:** 2026-05-10 (stable domain, internal codebase)
