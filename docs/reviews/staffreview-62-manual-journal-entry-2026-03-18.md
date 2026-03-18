# Staff Review: Phase 62 - Manual Journal Entry Page

**Date:** 2026-03-18
**Plans:** `62-01-PLAN.md` (Backend), `62-02-PLAN.md` (Frontend)
**Reviewers:** Staff Developer (Implementation) + Principal Developer (Architecture)

---

## 0. Plan Structure Validation

```
PLAN VALIDATION CHECKLIST (62-01-PLAN.md)
=========================================
[x] Git Workflow section exists? -- Implicit via phase branch config
  -> Branch name: gsd/phase-62-* (from config.json branching_strategy: "phase")
  -> Checkpoint strategy: per-task via verify blocks
[x] Implementation Waves section exists?
  -> Agents: autonomous (auto) tasks
  -> File paths: specified per task
  -> PARALLEL/SEQUENTIAL: Wave 1 (backend), depends_on: []
[!] Documentation Updates section exists?
  -> CHANGELOG.md checkbox: NOT PRESENT (must be added)
[x] Success Criteria section exists?
  -> Type check: yes (npm run type-check)
  -> Build: yes (via verification block)

PLAN VALIDATION CHECKLIST (62-02-PLAN.md)
=========================================
[x] Git Workflow section exists? -- Same as 62-01
[x] Implementation Waves section exists?
  -> Wave 2, depends_on: ["62-01"]
  -> File paths: specified
[!] Documentation Updates section exists?
  -> CHANGELOG.md checkbox: NOT PRESENT (must be added)
[x] Success Criteria section exists?
  -> Build: yes
  -> Test: yes (npm run test)
  -> Human verification gate: yes
```

**Plan Structure Additions:** Both plans are missing explicit Documentation Updates sections. Add:
```markdown
## Documentation Updates
- [ ] CHANGELOG.md
- [ ] SCHEMA.md (templateType addition to journalEntries.metadata)
- [ ] CLAUDE.md Quick File Finder (add Manual Journal row)
```

---

## 1. Summary

**Overall Assessment:** Approve (with minor fixes)

These are well-crafted, low-risk plans for a straightforward CRUD feature that leverages existing infrastructure extensively. The research document is thorough and the plans correctly identify all key integration points. The backend plan (62-01) follows established patterns from `journalImport/mutations.ts` and the journal engine. The frontend plan (62-02) reuses proven period controls from ExpenseAnalytics and follows standard route registration patterns. The main concerns are: (1) a schema/type mismatch between the plan's `metadata` update and how the journal engine actually spreads metadata into the DB insert, (2) missing documentation checkpoints, and (3) the `toast.success` vs `actionToast` style inconsistency inherited from `createMutationHook`.

---

## 2. Critical Issues (Must Fix)

| # | Issue | Category | Location in Plan |
|---|-------|----------|------------------|
| 1 | Journal engine metadata type mismatch | Schema/Logic | 62-01, Task 1 |
| 2 | Query performance: `.collect()` on all manual entries | Performance | 62-01, Task 1 (listByPeriod) |

**Details:**

### Issue 1: Journal engine metadata type mismatch

The plan updates `CreateJournalEntryParams.metadata` to `{ receiptUrl?: string; templateType?: string }`, but the journal engine's `createJournalEntryWithLines` spreads metadata into the DB insert via:

```typescript
...(params.metadata ? { metadata: params.metadata } : {}),
```

This means the metadata object passed as params is inserted directly into the `journalEntries` document. The schema currently defines `metadata` as:
```typescript
metadata: v.optional(v.object({
  receiptUrl: v.optional(v.string()),
})),
```

The plan correctly says to add `templateType: v.optional(v.string())` to the schema metadata object. However, the `CreateJournalEntryParams` interface update is critical -- if the TypeScript type doesn't match, the mutation will pass type checking but Convex runtime validation will accept the new field only because the schema is updated.

**The real issue:** The plan's interface shows `metadata?: { receiptUrl?: string; templateType?: string }` which is correct, but this changes the public API of `createJournalEntryWithLines`. Any existing callers that construct metadata objects need to remain compatible. Verified: existing callers in `journalImport/mutations.ts` pass `{ receiptUrl: row.receiptUrl }` or `undefined`, which is compatible with adding an optional field. The expense/reimbursement/payroll journal creation code does NOT pass metadata at all (`metadata` key is omitted). So this is safe.

**Verdict:** The plan is actually correct here. Downgrading to "verify during implementation" -- ensure the TypeScript interface and schema object stay in sync.

**Recommendation:** Add a verification step: after updating the interface, run `npm run type-check` to confirm no existing callers break.

### Issue 2: Query performance -- `.collect()` on all manual entries

The `listByPeriod` query does:
```typescript
const entries = await ctx.db
  .query("journalEntries")
  .withIndex("by_source", (q) => q.eq("sourceType", "manual"))
  .collect();
```

This loads ALL manual journal entries ever created into memory, then post-filters by date range. The research document acknowledges this but dismisses it as "acceptable for now" since manual entries are "low-volume."

However, the `journalImport` bulk import tool creates entries with `sourceType: "manual"` as well. If the business imports several months of historical data (50 rows per batch, multiple batches), this query could load hundreds of entries just to display one month's worth.

**Recommendation:** Use the `by_date` index instead with date range bounds, then post-filter for `sourceType === "manual" && metadata?.templateType`. This is more selective:
```typescript
const entries = await ctx.db
  .query("journalEntries")
  .withIndex("by_date", (q) =>
    q.gte("date", args.periodStart).lt("date", args.periodEnd)
  )
  .collect();
const filtered = entries.filter(
  (e) => e.sourceType === "manual" && e.metadata?.templateType
);
```

This scans only entries within the date range (typically one month), which is bounded, vs. ALL manual entries across ALL time periods. The tradeoff is that non-manual entries in the date range are also loaded, but for a single month the volume is bounded.

---

## 3. Improvements (Recommended)

| # | Improvement | Impact | Effort |
|---|-------------|--------|--------|
| 1 | Add CHANGELOG/SCHEMA.md documentation checkpoints | Medium | Low |
| 2 | Add CLAUDE.md Quick File Finder entry | Low | Low |
| 3 | Consider extracting period controls into a reusable component | Medium | Medium |
| 4 | Test coverage for listByPeriod query filtering logic | Medium | Low |

**Details:**

### Improvement 1: Documentation checkpoints missing

Both plans lack explicit documentation update sections. After merging to main, CLAUDE.md requires:
- `docs/CHANGELOG.md` (always required)
- `docs/SCHEMA.md` (templateType added to journalEntries.metadata)
- CLAUDE.md Quick File Finder table (add Manual Journal row)

**Recommendation:** Add a Documentation Updates section to 62-02-PLAN.md (the final plan in the wave):
```markdown
## Documentation Updates
- [ ] CHANGELOG.md -- Phase 62 entry
- [ ] SCHEMA.md -- templateType in journalEntries.metadata
- [ ] CLAUDE.md -- Add "Manual Journal" row to Quick File Finder table
```

### Improvement 2: CLAUDE.md Quick File Finder

The plan adds new files (`convex/manualJournal/`, `src/pages/ManualJournalEntry.tsx`, `src/hooks/convex/useManualJournal.ts`) that should be registered in the Quick File Finder table in CLAUDE.md for future discoverability.

### Improvement 3: Period controls component extraction

Plan 62-02 says to "copy ExpenseAnalytics pattern verbatim" for period controls. This creates a second copy of the same ~60 lines of period selector JSX. A shared `<PeriodSelector>` component would be better long-term. However, this is an existing pattern in the codebase (not new debt introduced by this plan), so it's acceptable to defer.

**Recommendation:** Add a tech debt note for future extraction. Not blocking for this phase.

### Improvement 4: Test the query filtering logic

The `listByPeriod` query has non-trivial filtering logic (date range + `metadata?.templateType` presence to exclude CSV imports). The plan only tests pure validation functions (`validateTemplateType`, `validateManualJournalAmount`) but does not test the query filtering. While full `convex-test` integration tests are heavyweight, the filtering logic could be extracted as a pure function and tested:

```typescript
// Pure filter function (testable)
export function isTemplateEntry(entry: { sourceType: string; date: number; metadata?: { templateType?: string } }, periodStart: number, periodEnd: number): boolean {
  return entry.date >= periodStart && entry.date < periodEnd && !!entry.metadata?.templateType;
}
```

---

## 4. Refinements (Minor Suggestions)

- **Toast style:** `createMutationHook` uses `toast.success()` internally, but `CODE_STYLE.md` says to use `actionToast()` instead. This is a pre-existing pattern inconsistency (all existing hooks use `createMutationHook`), not something this plan introduces. No change needed for this phase.

- **Form validation UX:** The plan specifies parsing amount as integer and validating > 0 on the frontend before calling the mutation. Consider also using HTML5 `min="1" step="1"` attributes on the input (already specified) plus an `onSubmit` check. The plan handles this correctly.

- **Accordion animation:** The plan uses Framer Motion `AnimatePresence` + `motion.div` which is the right choice given Framer Motion is already a project dependency. No issue.

- **Entry number display:** The plan says "Entry # (blue text, monospace)" which is good for readability. Consider linking to a future detail view (out of scope for this phase per context).

- **Badge color consistency:** The plan defines 6 badge colors (blue, green, yellow, purple, violet, pink) using raw Tailwind classes like `bg-blue-100 text-blue-700`. Per CODE_STYLE.md, semantic CSS variable tokens are preferred for dark mode support. However, these are decorative template-type badges (not status indicators), so raw colors are acceptable here. Consider adding dark mode variants if needed later.

---

## 5. Duplication Analysis

### Existing Code to Leverage
| Existing Code | Location | How to Use |
|---------------|----------|------------|
| `createJournalEntryWithLines` | `convex/lib/journalEngine.ts` | Journal entry creation (correctly identified) |
| `buildDebitLine` / `buildCreditLine` | `convex/lib/journalEngine.ts` | Line construction helpers (plan references these) |
| `protectedMutation` / `protectedQuery` | `convex/lib/functions.ts` | Auth wrappers (correctly identified) |
| `computePeriodRange`, `prevMonth`, `nextMonth` | `src/lib/expenseAnalyticsPeriod.ts` | Period controls (correctly identified) |
| `utcToWibDateStr`, `wibDateStrToUtcMs` | `src/lib/dateUtils.ts` | Date conversions (correctly identified) |
| `createMutationHook` | `src/hooks/convex/createMutationHook.ts` | Mutation hook factory (correctly identified) |
| `formatCurrency` | `src/lib/utils.ts` | IDR formatting (correctly identified) |
| `MONTH_NAMES` | `src/lib/financialHelpers.ts` | Month labels for period display |

### Potential Duplication Risks
- **Period controls JSX:** Will duplicate ~60 lines from ExpenseAnalytics.tsx. Acceptable for now but should be extracted to a shared component in a future tech debt phase.
- **Template type definitions:** Backend `TEMPLATES` constant and frontend `TEMPLATE_CARDS` config array both encode the 6 template types. This is intentional (backend has account codes, frontend has UI metadata) but the `type` values must stay in sync. No shared constant exists between them.

---

## 6. Phase/Wave Accuracy

| Phase | Assessment | Notes |
|-------|------------|-------|
| 62-01 (Backend) | Good | Schema + mutation + query + tests + hooks. Correct dependency ordering. |
| 62-02 (Frontend) | Good | Page + route + hub restructure + human verification. Correct depends_on: ["62-01"]. |

**Ordering Issues:**
- None. Backend before frontend is correct. Human verification gate at the end is appropriate.

**Missing Phases:**
- No missing phases. The scope is well-contained for 2 plans.

---

## 7. Specialist Agent Recommendations

| Phase | Recommended Agent | Rationale |
|-------|-------------------|-----------|
| 62-01 | `convex-backend` | Schema, mutations, queries, pure helper tests |
| 62-02 Tasks 1-2 | `react-ui-builder` | Page component, route registration, hub restructuring |
| 62-02 Task 3 | Human | Visual verification checkpoint |
| Post-merge | `code-auditor` | Type check + build verification |

---

## 8. Git Workflow Assessment

### Branch Strategy
| Assessment | Status |
|------------|--------|
| Feature branch specified | Implicit via GSD phase branching (config.json) |
| Branch naming convention | Correct (gsd/phase-62-*) |
| Merge strategy documented | Implicit via GSD workflow |

### Commit Strategy
| Phase | Expected Commits | Commit Type | Notes |
|-------|------------------|-------------|-------|
| 62-01 | 1-2 | feat | Schema + backend (atomic) |
| 62-02 | 1-2 | feat | Page + hub restructure |

### Recommended Commit Checkpoints
1. After 62-01 Task 1 (schema + mutation + query + tests): `feat(62): add manual journal backend with template validation`
2. After 62-01 Task 2 (hooks): `feat(62): add manual journal frontend hooks`
3. After 62-02 Task 1 (page + route): `feat(62): add ManualJournalEntry page with template cards`
4. After 62-02 Task 2 (hub restructure): `feat(62): split hub Financials into Financials + Accounting`

### Pre-Push Verification
- [x] Plan includes `npm run build` check
- [x] Plan includes `npm run type-check` verification
- [x] Plan includes test suite run (`npm run test`)

### CI/CD Considerations
| Concern | Assessment |
|---------|------------|
| Rollback strategy | Safe -- schema change is additive (optional field), fully backward compatible |
| Deployment order | Correct -- backend deploy first (Convex), then frontend (Vercel) |
| Data backup needed | No -- additive schema change, no data migration |
| Migration safety | Safe -- no existing data needs modification |

### Git Workflow Issues Found
- Both plans use the GSD execute workflow template which handles branching implicitly. No explicit git commands in the plans, but the GSD framework manages this. Acceptable.

---

## 9. Documentation Checkpoints

| Phase | Documentation Update Required |
|-------|-------------------------------|
| 62-01 | `docs/SCHEMA.md` (templateType in journalEntries.metadata) |
| 62-02 | `docs/CHANGELOG.md`, `CLAUDE.md` Quick File Finder |

### CHANGELOG.md Entry (Draft)
```markdown
## 2026-03-18 - Manual Journal Entry Page (Phase 62)

**Template-based balance sheet transaction recording**

- Added Manual Journal Entry page (`/journal`) with 6 pre-wired templates
- Templates: Equipment Purchase, Loan Repayment, Dividend Payment, Capital Injection, Receive a Loan, Tax Payment
- Each template maps to specific debit/credit account pairs -- no double-entry bookkeeping knowledge needed
- Period-filtered recent entries table with monthly/custom date range controls
- Restructured Hub navigation: split Financials into Financials + Accounting sections
- Schema: added `templateType` to `journalEntries.metadata`

**Files Modified:**
- `convex/schema.ts` (metadata field update)
- `convex/lib/journalEngine.ts` (type update)
- `convex/manualJournal/mutations.ts` (NEW)
- `convex/manualJournal/queries.ts` (NEW)
- `src/pages/ManualJournalEntry.tsx` (NEW)
- `src/hooks/convex/useManualJournal.ts` (NEW)
- `src/App.tsx` (route registration)
- `src/pages/HubPage.tsx` (Financials/Accounting split)
```

---

## 10. Testing Plan Assessment

**Overall Testing Verdict:** Insufficient

### Planned Tests
| Layer | What's Tested | Test Type | Status |
|-------|---------------|-----------|--------|
| Backend | `validateTemplateType` (valid/invalid) | unit (pure) | Planned |
| Backend | `validateManualJournalAmount` (valid/invalid) | unit (pure) | Planned |
| Backend | `TEMPLATES` constant (6 entries, correct codes) | unit (pure) | Planned |
| Backend | `TEMPLATE_TYPES` length check | unit (pure) | Planned |
| Backend | `create` mutation (full integration) | convex-test | Missing |
| Backend | `listByPeriod` query filtering | convex-test | Missing |
| Frontend | `ManualJournalEntry` page rendering | Vitest + RTL | Missing |
| Integration | Full create + list flow | Manual | Planned (Task 3) |

### Missing Test Coverage (Must Add)

| # | Missing Test | Why It Matters | Suggested Approach |
|---|--------------|----------------|-------------------|
| 1 | Query filtering logic (date range + templateType presence) | Core differentiator between template entries and CSV imports; incorrect filtering shows wrong data | Extract filter predicate as pure function, test with known entries that include/exclude CSV imports |
| 2 | Template constant account code correctness | Wrong account codes cause money to be posted to wrong accounts | Already planned -- verify TEMPLATES maps to correct debit/credit codes (this IS covered) |

### Test Execution Checkpoints
1. After 62-01 backend: `npx vitest run convex/manualJournal/__tests__/mutations.test.ts -x`
2. After 62-01 hooks: `npm run type-check`
3. After 62-02 frontend: `npm run build && npm run test`
4. Before merge: `npm run test && npm run build`

### Regression Risk
- Existing journal engine tests should not be affected (additive metadata field only)
- Existing `journalImport` tests should not be affected (no changes to import mutation)
- `HubPage` visual changes (Financials split) should be manually verified -- no existing HubPage tests

---

## 11. Edge Cases to Address

The plan should explicitly handle:

- [x] Empty description submitted (Plan validates "required" on input)
- [x] Amount = 0 or negative (Plan validates via `validateManualJournalAmount`)
- [x] Non-integer amount (Plan validates via `validateManualJournalAmount`)
- [x] Account not seeded (Plan throws clear error with seedDefaults instruction)
- [x] CSV import entries mixed with template entries in query results (Plan filters by `metadata?.templateType`)
- [x] Multiple accordion forms open simultaneously (Plan uses single `selectedTemplate` state)
- [x] Form state persistence across template switches (Plan resets form on template switch)
- [ ] Very long description text (no max length specified -- could overflow table cell. Consider `truncate` class or max length validation)
- [ ] Rapid double-click on Save (Plan has `isSaving` state for button, which handles this)
- [ ] Date in the far future (no upper bound validation on date field -- could create entries with year 2099. The journal engine does not validate date range. Consider adding reasonable bounds)

---

## 12. Approval Conditions

**For Approval, address:**
1. Consider switching `listByPeriod` query to use `by_date` index instead of `by_source` prefix scan for better scalability (Critical Issue 2). If rejected, document the performance tradeoff decision.
2. Add Documentation Updates section to plans (CHANGELOG.md is mandatory per CLAUDE.md).

**Recommended before implementation:**
1. Extract the query filter predicate as a testable pure function
2. Add CLAUDE.md Quick File Finder entry for Manual Journal files after merge
3. Add date validation bounds (reject dates before 2020 or more than 1 year in future) in the create mutation, matching the pattern from `journalImport/mutations.ts`

---

*Generated by /staffreview skill*
*Staff Developer Review + Principal Developer Review*
