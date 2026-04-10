# Phase 51: Bulk Upload of Previously Reimbursed Expenses via Bank Transaction Mapping - Research

**Researched:** 2026-03-14
**Domain:** CSV import tooling, journal engine extension, Convex batch mutations, React wizard UI
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Data Source & JE Treatment**
- Source data is employee expense forms (not bank transactions) — expense forms have per-item granularity
- JE treatment: DR OpEx/expense account, CR 1100 (Cash) — cash already left the company
- One JE per CSV row for maximum traceability
- sourceType: `"manual"` with `[Historical Import]` description prefix
- No expense/reimbursement records created — JEs are sufficient for P&L accuracy
- Import batch traceability via `importBatchId` (UUID) stored as `sourceId` on every JE

**Schema Change**
- Add optional `metadata` field to `journalEntries` table: `metadata: v.optional(v.object({ receiptUrl: v.optional(v.string()) }))`
- Backward-compatible — no existing data affected

**Journal Engine Change**
- Extend `CreateJournalEntryParams` with `metadata?: { receiptUrl?: string }`
- `ctx.db.insert` call spreads metadata conditionally: `...(params.metadata ? { metadata: params.metadata } : {})`

**CSV Template Format**
- Columns: `date` (YYYY-MM-DD, required), `amount` (positive integer IDR, required), `description` (string, required), `vendorName` (optional), `accountCode` (must match active CoA code, required), `receiptUrl` (optional URL)
- CoA reference CSV generated client-side from `accounts.list({ activeOnly: true })`

**Backend Mutation**
- `convex/journalImport/mutations.ts` → `bulkCreateJournalEntries`
- Auth: `protectedMutation({ roles: ["admin"] })` — session-based auth, `ctx.user._id` for createdBy
- Batch size: max 50 rows per call (enforced at mutation level)
- Backend validation (defense in depth): `amount > 0` and `Number.isInteger(amount)` even though client validates
- Per-row: look up accountCode → accountId, look up Cash 1100 → cashAccountId, call createJournalEntryWithLines
- Returns `{ created: number }`
- Fail-fast: if any row fails validation, entire batch rejected with row-level error details
- 350 rows / 50 per batch = 7 mutation calls, ~200 DB ops per batch — within Convex limits

**Frontend Architecture**
- New page: `src/pages/HistoricalImportPage.tsx` — linear wizard
- New hook: `src/hooks/convex/useJournalImport.ts` — uses createMutationHook factory
- Route: `/import` (flat route, admin only via ProtectedRoute)
- Navigation: linked from AccountsManager page
- CSV parsing: Papa Parse (new dependency)

**Wizard Flow**
- States: Upload → Validating → Review → Importing → Complete
- Upload: file drop zone (.csv), template download buttons
- Validating: client-side CSV parsing via Papa Parse, validation against account map
- Review: error table (blocks confirm), warning table (duplicates, informational), summary cards, summary by GL account, summary by period
- Importing: sequential batches of 50, progress bar, resume-from-failure support
- Complete: success message with link to /financials

**Validation Rules**
- Required fields (date, amount, description, accountCode): error if missing
- accountCode not found or inactive: error
- amount <= 0 or non-integer: error
- date not YYYY-MM-DD: error
- Duplicate (same date+amount+description): warning only
- Any errors block confirm button

**Date Conversion**
- Client parses YYYY-MM-DD → WIB midnight epoch ms before sending to mutation
- Use dateToWibEpoch helper function

**Undo & Safety**
- No special undo mechanism — void individual JEs manually using existing infrastructure
- No date boundaries enforced — trust the admin
- Any active account is valid — no type restriction
- No fraud checks (historical, already paid)

### Claude's Discretion
- Exact CSS styling and dark mode tokens for the wizard page
- Error message wording details
- Exact file drop zone interaction pattern
- Whether to use Framer Motion for wizard transitions

### Deferred Ideas (OUT OF SCOPE)
None — spec covers full phase scope. The spec explicitly notes what the feature does NOT do (no expenses table records, no reimbursement batches, no fraud checks, no batch undo, no date boundaries, no account type restrictions).
</user_constraints>

---

## Summary

Phase 51 is a one-off CSV import tool that backfills 350+ historical employee expense records as journal entries in the GL. The design and implementation plan are fully specified in `docs/superpowers/specs/2026-03-14-historical-expense-journal-import-design.md` and `docs/superpowers/plans/2026-03-14-historical-expense-journal-import.md`. A staff review in `docs/reviews/staffreview-phase-51-historical-import-2026-03-14.md` identified and resolved all critical issues; all fixes are already incorporated into the implementation plan.

The primary work is: (1) a backward-compatible schema extension adding an optional `metadata` field to `journalEntries`, (2) extending the journal engine's `CreateJournalEntryParams` interface to accept and spread that metadata, (3) a new `bulkCreateJournalEntries` protectedMutation, and (4) a linear wizard page with Papa Parse CSV parsing and batched mutation calls.

**Primary recommendation:** Follow the implementation plan exactly as written in `docs/superpowers/plans/2026-03-14-historical-expense-journal-import.md`. The plan was written post-review and incorporates all staff review fixes. No alternative approaches are needed.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Convex | ^1.31.7 | Serverless DB + mutations | Project standard |
| React 19 | ^19.2.0 | UI framework | Project standard |
| TypeScript | ~5.9 | Type safety | Project standard |
| Papa Parse | NEW (runtime dep) | CSV parsing | Industry standard; handles quoted fields, BOM, embedded commas safely |
| Vitest | ^4.0.18 | Unit tests | Project standard |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| convex-helpers | ^0.1.112 | `protectedMutation`, `useSessionMutation` | Auth wrappers — use for mutation/query registration |
| sonner | ^2.0.7 | Toast notifications | Use `toast.error` for batch failure; page manages progress UI directly |
| Lucide React | ^0.564.0 | Icons | File upload, check/error icons in wizard |
| `@radix-ui/react-progress` | ^1.1.8 | Progress bar | Already in package.json; use for import progress |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Papa Parse | Manual CSV split | Papa Parse handles edge cases (quoted commas, BOM, CRLF) that hand-rolled parsers miss. Non-negotiable for user-uploaded CSV. |
| Sequential batches | Parallel batches | Sequential is correct here — parallel batch calls would cause JE counter races. Convex mutations are serial within a transaction but `getNextNumber` is called per-JE, so sequential batching is required. |

**Installation:**
```bash
npm install papaparse
npm install -D @types/papaparse
```

Note: Papa Parse must be a **runtime** dependency (not dev), since it runs in the browser at runtime during CSV parsing.

---

## Architecture Patterns

### Recommended Project Structure
```
convex/
├── journalImport/
│   ├── mutations.ts                    # bulkCreateJournalEntries
│   └── __tests__/
│       └── mutations.test.ts           # TDD backend tests
src/
├── lib/
│   ├── csvImportValidation.ts          # Pure parse+validate helpers
│   └── __tests__/
│       └── csvImportValidation.test.ts # Client validation tests
├── hooks/convex/
│   └── useJournalImport.ts             # createMutationHook factory
└── pages/
    └── HistoricalImportPage.tsx        # Linear wizard page
```

### Pattern 1: protectedMutation with ctx.user

The project uses `protectedMutation` from `convex/lib/functions.ts` (backed by `convex-helpers/server/customFunctions`). This wrapper automatically extracts `sessionId` from args (injected by `useSessionMutation` on the frontend), validates the session, and provides `ctx.user` as a typed `Doc<"users">`.

```typescript
// Source: convex/lib/functions.ts (verified)
export const bulkCreateJournalEntries = protectedMutation({
  roles: ["admin"],
  args: {
    importBatchId: v.string(),
    rows: v.array(v.object({ ... })),
  },
  handler: async (ctx, args) => {
    // ctx.user._id is available — no token extraction needed
    await createJournalEntryWithLines(ctx, {
      createdBy: ctx.user._id,
      ...
    });
  },
});
```

**Key difference from legacy auth pattern:** `protectedMutation` does NOT require `token: v.string()` in args (that is the old pattern). It uses `sessionId` (auto-injected). The `ctx.user._id` is directly available.

### Pattern 2: createMutationHook factory

The project uses `createMutationHook` from `src/hooks/convex/createMutationHook.ts` (verified). It wraps `useSessionMutation` with try/catch and toast notifications. Pass empty strings to suppress toasts when the page manages its own feedback.

```typescript
// Source: src/hooks/convex/createMutationHook.ts (verified)
export const useBulkCreateJournalEntries = createMutationHook(
  api.journalImport.mutations.bulkCreateJournalEntries,
  { successMessage: "", errorMessage: "" } // Page handles its own progress UI
);
```

The hook returns `{ mutate, mutateAsync }` — use `mutateAsync` for the sequential batch loop since you need to `await` each batch.

### Pattern 3: lazyWithPreload route registration

All pages in App.tsx use named exports with the `lazyWithPreload` + `.then(m => ({ default: m.PageName }))` pattern:

```typescript
// Source: src/App.tsx (verified)
const HistoricalImportPage = lazyWithPreload(() =>
  import('./pages/HistoricalImportPage').then(m => ({ default: m.HistoricalImportPage }))
);
```

Route uses `canManageReimbursements` permission (admin-only, verified as the permission used for /accounts, /payroll, /reimbursements, /bank-accounts):

```typescript
<Route
  path="import"
  element={
    <ProtectedRoute requiredPermission="canManageReimbursements">
      <HistoricalImportPage />
    </ProtectedRoute>
  }
/>
```

### Pattern 4: WIB Date Conversion

The project already has `wibDateStrToUtcMs` in `src/lib/dateUtils.ts` (verified). However, the spec defines a local `dateToWibEpoch` in `src/lib/csvImportValidation.ts` with the same semantics. The planner should decide whether to import from `dateUtils.ts` or define locally — both are correct. Using `wibDateStrToUtcMs` from `dateUtils.ts` avoids duplication.

```typescript
// Existing pattern in dateUtils.ts (verified)
export function wibDateStrToUtcMs(dateStr: string): number {
  return new Date(dateStr).getTime() - WIB_OFFSET_MS;
}
// WIB_OFFSET_MS = 7 * 60 * 60 * 1000

// Used in ExpenseSubmit.tsx as:
expenseDate: wibDateStrToUtcMs(form.expenseDate),
```

**Important:** The test in the spec checks `getUTCHours() === 17` for WIB midnight, which is correct: 00:00 WIB = 17:00 UTC previous day. The `new Date(dateStr).getTime()` parses YYYY-MM-DD as UTC midnight, then subtracts 7 hours to get WIB midnight.

### Pattern 5: Pure validation exported for testing

The spec exports `validateImportRow` and `MAX_BATCH_SIZE` from `mutations.ts` for unit testing. This follows the existing project pattern seen in `convex/lib/journalEngine.ts` (exports `validateJournalLines`, `validateVoidPairing` as pure functions).

### Pattern 6: WizardState as discriminated union

```typescript
type WizardState =
  | { step: "upload" }
  | { step: "validating" }
  | { step: "review"; result: CsvParseResult }
  | { step: "importing"; total: number; completed: number; batchIndex: number }
  | { step: "complete"; totalCreated: number; totalAmount: number }
  | { step: "error"; message: string; completedSoFar: number };
```

This pattern enforces correct state co-location and prevents impossible states (e.g., accessing `result` when step is not "review").

### Anti-Patterns to Avoid
- **Parallel batch calls:** Do NOT use `Promise.all` across batches. The `getNextNumber` counter in `convex/lib/counter.ts` is called per-JE inside `createJournalEntryWithLines`. Parallel mutation calls would each attempt counter increments in separate Convex transactions — sequential is required.
- **Adding Papa Parse as devDependency:** It runs in the browser at runtime. Must be a runtime `dependency`.
- **Storing session token in mutation args:** `protectedMutation` handles session automatically via `SessionIdArg`. No `token: v.string()` needed.
- **Using `ctx.db.insert` directly on journalEntries:** Rule JE-06 (verified in `journalEngine.ts` header comment): all JE creation must go through `createJournalEntryWithLines`. Never bypass the engine.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CSV parsing | Custom string split | Papa Parse | Quoted fields, embedded commas, BOM, CRLF all handled. Manual parsing breaks on real user data. |
| JE creation | Direct `ctx.db.insert` | `createJournalEntryWithLines` | Enforces balance validation, sequential numbering, line denormalization. Bypassing causes JE-01/JE-04/JE-06 violations. |
| Auth checking | Manual session lookup | `protectedMutation({ roles: ["admin"] })` | Session validation, role check, active status check all included. |
| Mutation with toast | Raw `useSessionMutation` | `createMutationHook` factory | Project standard; avoids 20+ lines of boilerplate per hook. |
| WIB conversion | `new Date(str).getTime() - 25200000` | `wibDateStrToUtcMs` from `src/lib/dateUtils.ts` | Already exists and tested. Use it instead of reinventing. |

**Key insight:** The journal engine is the single gate for all JE creation. All prior phases (42, 45, 46, 47) went through it. This phase must too.

---

## Common Pitfalls

### Pitfall 1: Journal Engine metadata field NOT in insert call
**What goes wrong:** The `CreateJournalEntryParams` interface is extended, but the `ctx.db.insert("journalEntries", {...})` call at line 238 of `convex/lib/journalEngine.ts` still has a fixed set of fields. The metadata would be silently dropped.
**Why it happens:** TypeScript doesn't error on this — the interface allows metadata, but the insert object is constructed manually (not spread from params).
**How to avoid:** The implementation plan step explicitly changes line 238 to add `...(params.metadata ? { metadata: params.metadata } : {})`. This is the staff review's Critical Issue #2. Verify this change is made.
**Warning signs:** Type-check passes but metadata never appears in the DB — this would be invisible without a specific test.

### Pitfall 2: Papa Parse as devDependency
**What goes wrong:** If installed as `-D @types/papaparse` only, or as a devDependency, Papa Parse won't be bundled into the production build.
**Why it happens:** Easy to confuse runtime vs. dev deps.
**How to avoid:** `npm install papaparse` (runtime) + `npm install -D @types/papaparse` (types only). The plan step is correct.

### Pitfall 3: Sequential vs. parallel batching counter races
**What goes wrong:** Using `Promise.all` to fire all 7 batches simultaneously. Each batch creates 50 JEs, each calling `getNextNumber` for sequential JE-MMDD-NNN numbers. Concurrent mutation calls would race on the counter.
**Why it happens:** Natural inclination to parallelize for speed.
**How to avoid:** `for (const batch of batches) { await mutate(batch); }` — sequential loop.
**Warning signs:** Duplicate JE numbers, counter corruption errors from Convex.

### Pitfall 4: dateToWibEpoch vs. wibDateStrToUtcMs semantic mismatch
**What goes wrong:** The spec defines `dateToWibEpoch` locally, but `wibDateStrToUtcMs` already exists in `dateUtils.ts`. They use the same math, but if both exist with slightly different implementations, drift occurs.
**Why it happens:** Duplication from copy-pasting the WIB conversion logic.
**How to avoid:** Prefer importing `wibDateStrToUtcMs` from `src/lib/dateUtils.ts` in `csvImportValidation.ts`. The local implementation in the spec is fine too — just don't have both.
**Warning signs:** WIB date tests passing locally but P&L showing wrong period buckets.

### Pitfall 5: Backend validation skipped (client-only)
**What goes wrong:** Relying solely on client-side validation. A direct API call bypasses it, allowing negative amounts or inactive account codes to create JEs.
**Why it happens:** "The UI validates it anyway."
**How to avoid:** The `validateImportRow` pure function is called from BOTH the test suite AND the `bulkCreateJournalEntries` handler. The handler calls it for each row before any DB write.

### Pitfall 6: Schema optional field failing Convex type narrowing
**What goes wrong:** After adding `metadata: v.optional(v.object(...))` to `journalEntries`, existing code that reads the table may get a TypeScript error if it doesn't handle `undefined`.
**Why it happens:** Existing queries return typed `Doc<"journalEntries">` which now includes the optional field.
**How to avoid:** The field is `v.optional`, so existing reads are unaffected (field is just `undefined` for old records). No existing query needs updating. Type-check after schema change to confirm.

---

## Code Examples

### Journal Engine — Current Insert Call (lines 238-247, verified)
```typescript
// Source: convex/lib/journalEngine.ts (verified by direct read)
const entryId = await ctx.db.insert("journalEntries", {
  entryNumber,
  date: params.date,
  description: params.description,
  sourceType: params.sourceType,
  sourceId: params.sourceId,
  isReversed: false,
  createdBy: params.createdBy,
  createdAt: Date.now(),
  // metadata NOT here yet — Phase 51 adds it
});
```

After Phase 51 modification, the insert must include:
```typescript
...(params.metadata ? { metadata: params.metadata } : {}),
```

### Current CreateJournalEntryParams interface (lines 48-55, verified)
```typescript
// Source: convex/lib/journalEngine.ts (verified by direct read)
export interface CreateJournalEntryParams {
  date: number;
  description: string;
  sourceType: JournalSourceType;
  sourceId?: string;
  createdBy: Id<"users">;
  lines: JournalLine[]; // Min 2, debits must equal credits
  // metadata NOT here yet — Phase 51 adds: metadata?: { receiptUrl?: string }
}
```

### Current journalEntries schema (lines 1729-1750, verified)
```typescript
// Source: convex/schema.ts (verified by direct read)
journalEntries: defineTable({
  entryNumber: v.string(),
  date: v.number(),
  description: v.string(),
  sourceType: v.union(
    v.literal("expense_approval"),
    v.literal("expense_void"),
    v.literal("reimbursement"),
    v.literal("reimbursement_void"),
    v.literal("payroll"),
    v.literal("payroll_void"),
    v.literal("manual")
  ),
  sourceId: v.optional(v.string()),
  isReversed: v.boolean(),
  reversedByEntryId: v.optional(v.id("journalEntries")),
  createdBy: v.id("users"),
  createdAt: v.number(),
  // metadata NOT here yet — Phase 51 adds it after createdAt
})
  .index("by_entry_number", ["entryNumber"])
  .index("by_source", ["sourceType", "sourceId"])
  .index("by_date", ["date"]),
```

Phase 51 adds after `createdAt: v.number(),`:
```typescript
metadata: v.optional(v.object({
  receiptUrl: v.optional(v.string()),
})),
```

### accounts.list query (verified — public query, no auth required)
```typescript
// Source: convex/accounts/queries.ts (verified by direct read)
export const list = query({
  args: { activeOnly: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    // Returns accounts sorted by code ascending
  },
});
// Usage in frontend:
const accounts = useQuery(api.accounts.queries.list, { activeOnly: true });
```

### Route registration pattern (App.tsx, verified)
```typescript
// After lazyWithPreload import block (line ~109):
const HistoricalImportPage = lazyWithPreload(() =>
  import('./pages/HistoricalImportPage').then(m => ({ default: m.HistoricalImportPage }))
);

// After /accounts route (line ~329), inside the Layout element:
<Route
  path="import"
  element={
    <ProtectedRoute requiredPermission="canManageReimbursements">
      <HistoricalImportPage />
    </ProtectedRoute>
  }
/>
```

`canManageReimbursements` is confirmed admin-only in `src/lib/types.ts` (verified) and is the permission used for /accounts, /payroll, /reimbursements, /bank-accounts.

### Template CSV download pattern (client-side, from spec)
```typescript
// Blob + createObjectURL + synthetic anchor click
const templateCsv = "date,amount,description,vendorName,accountCode,receiptUrl\n";
const blob = new Blob([templateCsv], { type: "text/csv" });
const url = URL.createObjectURL(blob);
const a = document.createElement("a");
a.href = url;
a.download = "import-template.csv";
a.click();
URL.revokeObjectURL(url);
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `token: v.string()` in mutation args | `protectedMutation({ roles })` auto-injects sessionId | Phase 44 | No manual token extraction needed |
| Direct `ctx.db.insert` on journalEntries | `createJournalEntryWithLines()` only | Phase 42 (JE-06) | All JEs must go through engine |
| `productionType/productionUnits` for BOM | `menuProductComponents + componentTypes` | Phase 35 | NEVER use deprecated fields |

**Deprecated/outdated:**
- `token: v.string()` in mutation args: Old auth pattern. Use `protectedMutation` instead.
- `productionType`/`productionUnits`: Deprecated fields on menuProducts/orderItems. Not relevant here but documented for completeness.

---

## Open Questions

1. **dateToWibEpoch vs. wibDateStrToUtcMs**
   - What we know: `wibDateStrToUtcMs` exists in `src/lib/dateUtils.ts` and does the same conversion as the spec's `dateToWibEpoch`.
   - What's unclear: Should `csvImportValidation.ts` import from `dateUtils.ts` or define locally?
   - Recommendation: Use `wibDateStrToUtcMs` from `dateUtils.ts` to avoid duplication. The export is already public. Rename the internal helper in `csvImportValidation.ts` to call through to `wibDateStrToUtcMs`, or import it directly.

2. **Test location for backend mutation tests**
   - What we know: The implementation plan puts tests at `convex/journalImport/__tests__/mutations.test.ts`. The existing journal engine tests are at `convex/lib/__tests__/journalEngine.test.ts`.
   - What's unclear: The `validateImportRow` and `MAX_BATCH_SIZE` exports from `mutations.ts` can be tested as pure functions without convex-test. The DB-touching portions require `convex-test`.
   - Recommendation: The implementation plan correctly separates pure function tests (no ctx, in the same test file) from the mutation handler. The TDD approach (write tests first, then implement) is the right sequence.

3. **Navigation placement**
   - What we know: Spec says link from AccountsManager. Staff review draft CHANGELOG mentions `/finance/import` but spec and implementation plan say `/import`.
   - What's unclear: Minor inconsistency between staff review CHANGELOG draft and spec/plan route path.
   - Recommendation: Use `/import` (flat route) as specified in CONTEXT.md locked decisions and implementation plan. The staff review CHANGELOG draft is informational, not authoritative.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^4.0.18 |
| Config file | `vite.config.ts` (Vitest config embedded) |
| Quick run command | `npx vitest run convex/journalImport/__tests__/mutations.test.ts src/lib/__tests__/csvImportValidation.test.ts` |
| Full suite command | `npm run test` |

### Phase Requirements → Test Map

No formal REQUIREMENTS.md IDs are assigned to Phase 51 (it is a one-off import tool supplementing the existing requirement set). Test coverage maps to implementation correctness:

| Behavior | Test Type | Automated Command | File Exists? |
|----------|-----------|-------------------|-------------|
| Valid batch creates correct JEs (5 rows → 5 JEs + 10 lines) | unit (pure validate) | `npx vitest run convex/journalImport/__tests__/mutations.test.ts` | Wave 0 gap |
| Invalid account code rejects entire batch | unit (pure validate) | same | Wave 0 gap |
| Batch size > 50 rejected | unit (pure validate) | same | Wave 0 gap |
| metadata.receiptUrl preserved | unit (pure validate) | same | Wave 0 gap |
| CSV parsing with quoted commas | unit | `npx vitest run src/lib/__tests__/csvImportValidation.test.ts` | Wave 0 gap |
| Date YYYY-MM-DD → WIB epoch conversion | unit | same | Wave 0 gap |
| Duplicate row → warning, not error | unit | same | Wave 0 gap |
| Journal engine backward compat (no metadata param) | regression | `npx vitest run convex/lib/__tests__/journalEngine.test.ts` | Exists |

### Sampling Rate
- **Per task commit:** `npm run type-check` (fast, catches interface mismatches)
- **Per wave merge:** `npm run test` (full suite including regression)
- **Phase gate:** `npm run test && npm run build` before merge to main

### Wave 0 Gaps
- [ ] `convex/journalImport/__tests__/mutations.test.ts` — TDD tests for validateImportRow and MAX_BATCH_SIZE (written BEFORE mutations.ts)
- [ ] `src/lib/__tests__/csvImportValidation.test.ts` — TDD tests for parseAndValidateCsv and dateToWibEpoch (written BEFORE csvImportValidation.ts)
- [ ] Papa Parse install: `npm install papaparse && npm install -D @types/papaparse`

---

## Sources

### Primary (HIGH confidence)
- `convex/lib/journalEngine.ts` — Direct read: current `CreateJournalEntryParams` interface (lines 48-55) and `ctx.db.insert` call (lines 238-247)
- `convex/schema.ts` — Direct read: `journalEntries` table definition (lines 1729-1750), confirmed `metadata` field absent
- `convex/lib/functions.ts` — Direct read: `protectedMutation` wrapper uses `SessionIdArg` + `ctx.user`, no token arg
- `convex/accounts/queries.ts` — Direct read: `list` query is a public `query()`, no auth required
- `src/hooks/convex/createMutationHook.ts` — Direct read: factory returns `{ mutate, mutateAsync }`, `useSessionMutation` backed
- `src/lib/dateUtils.ts` — Direct read: `wibDateStrToUtcMs` exports confirmed, `WIB_OFFSET_MS` exported
- `src/App.tsx` — Direct read: `lazyWithPreload` pattern, route for `/accounts` uses `canManageReimbursements`, insertion point ~line 329
- `src/lib/types.ts` — Direct read: `canManageReimbursements: true` only for `admin` role
- `src/components/auth/ProtectedRoute.tsx` — Direct read: accepts `requiredPermission` or `allowedRoles`
- `package.json` — Direct read: Papa Parse is NOT installed; `papaparse` absent from both dependencies and devDependencies

### Secondary (MEDIUM confidence)
- `docs/superpowers/specs/2026-03-14-historical-expense-journal-import-design.md` — Full design spec; all decisions verified against codebase
- `docs/superpowers/plans/2026-03-14-historical-expense-journal-import.md` — Full implementation plan with TDD sequence, exact code for all new files
- `docs/reviews/staffreview-phase-51-historical-import-2026-03-14.md` — Staff review; all critical issues (metadata insert, sourceId, testing, plan structure) confirmed resolved in the implementation plan
- `.planning/phases/51-bulk-upload-reimbursed-expenses/51-CONTEXT.md` — Locked decisions extracted from design spec

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified directly from package.json and codebase
- Architecture patterns: HIGH — verified from direct source file reads of all integration points
- Pitfalls: HIGH — critical issues identified in staff review, verified against source files
- Implementation plan: HIGH — plan is comprehensive, post-review, and directly executable

**Research date:** 2026-03-14
**Valid until:** 2026-04-14 (stable — no fast-moving dependencies)
