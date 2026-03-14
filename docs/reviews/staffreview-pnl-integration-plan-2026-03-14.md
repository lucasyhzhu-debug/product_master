# Staff Review: Phase 49 — P&L Integration

**Date:** 2026-03-14
**Plan:** `.planning/phases/49-pnl-integration/49-01-PLAN.md`
**Reviewers:** Staff Developer (Implementation) + Principal Developer (Architecture)

---

## 0. Plan Validation Checklist

```
PLAN VALIDATION CHECKLIST
=========================

[~] Git Workflow section exists?
  -> Branch name: NOT specified in plan (inferred from branch convention: gsd/phase-49-pnl-integration)
  -> Checkpoint strategy: NOT explicitly defined (relies on task-level verify commands)

[x] Implementation Waves section exists?
  -> Agents: Not named but tasks are self-contained
  -> File paths: Specified in each task
  -> PARALLEL/SEQUENTIAL: Task 1 is backend (TDD), Task 2 is frontend

[~] Documentation Updates section exists?
  -> CHANGELOG.md checkbox: NOT present in plan

[x] Success Criteria section exists?
  -> Type check requirement: Yes (npm run build)
  -> Build requirement: Yes (npm run build, npm run test)

=========================
```

**Assessment:** Plan is PARTIALLY COMPLETE. Missing explicit Git Workflow section and Documentation Updates section. These are addressed as Critical issues below.

---

## 1. Summary

**Overall Assessment:** Approve (with minor revisions)

This is an exceptionally well-researched and well-structured plan. The CONTEXT.md and RESEARCH.md documents are thorough, the architectural decisions are sound, and the plan correctly addresses the earlier staff review recommendations (single-query via `by_entryDate` instead of N+1). The TDD approach for the backend is commendable. The plan has two important gaps: (1) a missing Git Workflow / Documentation section required by project conventions, and (2) an inconsistency between the VALIDATION.md test file name and the plan's test file target. The remaining issues are refinements.

---

## 2. Critical Issues (Must Fix)

| # | Issue | Category | Location in Plan |
|---|-------|----------|------------------|
| 1 | Missing Git Workflow section | Process | Plan top-level |
| 2 | Test file name inconsistency between plan and validation | Testing | Task 1 / VALIDATION.md |

**Details:**

### Issue 1: Missing Git Workflow & Documentation Update Sections

Per CLAUDE.md, every implementation plan MUST include a Git Workflow section (branch name, checkpoints) and a Documentation Updates section (CHANGELOG.md checkbox). The plan has neither.

**Recommendation:** Add to the plan:
```markdown
## Git Workflow
**Branch:** `gsd/phase-49-pnl-integration`
**Checkpoints:**
- After Task 1 (backend + tests): `feat(49-01): extend income statement with OpEx/EBIT/Other/NetIncome`
- After Task 2 (frontend + CSV): `feat(49-01): add OpEx/EBIT/Other/NetIncome to P&L UI and CSV export`

## Documentation Updates
- [ ] CHANGELOG.md
- [ ] docs/SCHEMA.md (no schema changes, skip)
- [ ] docs/API_REFERENCE.md (query return type extended)
```

### Issue 2: Test File Name Inconsistency

The plan (Task 1) specifies adding tests to `tests/convex/incomeStatement.test.ts` (the existing file), but `49-VALIDATION.md` references `tests/convex/pnlIntegration.test.ts` (a new file that does not exist). This creates confusion about where tests should live.

**Recommendation:** Align on a single location. Adding to the existing `incomeStatement.test.ts` (as the plan specifies) is the right call -- the tests are extending the same query function. Update `49-VALIDATION.md` to reference `tests/convex/incomeStatement.test.ts` instead.

---

## 3. Improvements (Recommended)

| # | Improvement | Impact | Effort |
|---|-------------|--------|--------|
| 1 | Zero-balance filtering uses strict equality which may miss floating-point near-zero | Medium | Low |
| 2 | Union-merge logic for OpEx line items should be extracted as a shared helper | Medium | Low |
| 3 | `aggregateJournalLines` return type should be `{ items, total }` consistently in plan text | Low | Low |
| 4 | Consider adding `by_entryDate` query results size guard | Low | Low |

**Details:**

### Improvement 1: Floating-Point Near-Zero Filtering

The plan's `aggregateJournalLines` helper filters zero-balance accounts with `if (total === 0) continue`. Journal entries involve currency arithmetic (debit - credit across multiple entries). While IDR is an integer currency, the plan does not enforce integer types -- Convex stores `v.number()` which is a float. If any journal line has fractional amounts (e.g., from rounding), the strict `=== 0` check could leave near-zero "noise" rows visible.

**Recommendation:** Use a threshold: `if (Math.abs(total) < 0.01) continue`. This is a minor improvement but prevents visual clutter if fractional amounts ever appear.

### Improvement 2: Extract Union-Merge Logic for Line Items

Task 2 describes "iterate over UNION of current and previous period opex items (merged by code)" for both OpEx and Other sections. This identical merge-by-code logic is needed twice (once for opex, once for otherItems). The plan could benefit from specifying a reusable helper like:

```typescript
function mergeLineItems(
  current: Array<{ code: string; name: string; total: number }>,
  previous: Array<{ code: string; name: string; total: number }>
): Array<{ code: string; name: string; currentTotal: number; previousTotal: number }>
```

This avoids duplicating the merge logic inline in the JSX.

### Improvement 3: Consistent `aggregateJournalLines` Return Type

The plan step 4 says the function returns `{ items: Array<{code, name, total}>, total: number }`, but the earlier description in step 4 says it returns just the array. The RESEARCH.md code example returns `{ items, total }`. Ensure the plan text is consistent -- `{ items, total }` is the correct return type (per RESEARCH.md).

### Improvement 4: Query Result Size Guard

The `by_entryDate` single-query approach will return ALL journal entry lines in the period (not just opex/other, but also revenue/cogs/asset/liability lines). For a busy month, this could be thousands of lines. The plan should note that this is acceptable for the expected scale (small business, ~50-200 transactions/month) but flag that if scale grows significantly, the N+1 approach with `by_account_entryDate` would be more efficient (only fetching lines for the 14 relevant accounts).

---

## 4. Refinements (Minor Suggestions)

- The plan could mention that `opex` and `otherItems` arrays should default to `[]` and totals to `0` in the empty-period case, to match the existing WeekData zero-initialization pattern. The test covers this, but the implementation step doesn't explicitly state it.
- Task 2 step 2d mentions building a union of current and previous period items but does not specify the sorting of the merged result. It should sort by account code ascending (consistent with backend).
- The CSV export (Task 2 step 2c) uses `String(-item.total)` for OpEx amounts. The plan should clarify that "Total Operating Expenses" uses `String(-data.current.totalOpEx)` (negated), while EBIT and Net Income are NOT negated (they are positive = profit).
- The plan mentions using `data.deltas.ebit` on the EBIT PLRow, but does not explicitly state that the `deltas` type in the query return must be extended. This is covered in Task 1 step 7 but could be more prominently noted for the frontend implementer.
- Consider adding `confidence: "exact"` to the OpEx/Other data (per RESEARCH.md "OpEx confidence is exact"), since the existing PLRow component accepts a confidence prop.

---

## 5. Duplication Analysis

### Existing Code to Leverage
| Existing Code | Location | How to Use |
|---------------|----------|------------|
| `computeDelta` (backend) | `convex/reports/incomeStatement.ts:82-89` | Already used for existing deltas; extend for new fields |
| `computeDelta` (frontend) | `src/lib/financialHelpers.tsx:73-80` | Used in opexDeltas/otherDeltas memos |
| `SectionHeaderRow` | `src/lib/financialHelpers.tsx:196-238` | Reuse for OpEx and Other sections |
| `PLRow` | `src/components/financials/PLRow.tsx` | Reuse for all new P&L rows |
| `DeltaIndicator` | `src/lib/financialHelpers.tsx:141-192` | Reuse with `unit="pp"` for margin rows |
| `WeekData` (CSV duplicate) | `src/lib/csvExport.ts:46-63` | Must be extended in sync with backend |
| Gross Margin % row pattern | `src/pages/FinancialStatement.tsx:501-537` | Copy pattern for EBIT and Net margin rows |
| `seedExternalRevenue` / `seedMenuProductWithBOM` | `tests/convex/incomeStatement.test.ts` | Reuse for seeding test data |

### Potential Duplication Risks
- **WeekData interface** is duplicated between `convex/reports/incomeStatement.ts` (backend) and `src/lib/csvExport.ts` (frontend). The plan correctly identifies this and includes extension in both locations.
- **`computeDelta`** is duplicated between backend (`incomeStatement.ts:82`) and frontend (`financialHelpers.tsx:73`). Both are simple functions and intentionally duplicated for server/client boundary reasons. No risk here.
- The margin % row JSX will be duplicated 3 times (Gross, EBIT, Net). Consider extracting a `MarginPercentRow` component, though this is a refinement not a blocker.

---

## 6. Phase/Wave Accuracy

| Phase | Assessment | Notes |
|-------|------------|-------|
| Task 1: Backend + Tests | Good | TDD approach, clear test cases, well-defined pure helper |
| Task 2: Frontend + CSV | Good | Reuses existing components, clear section ordering |

**Ordering Issues:**
- None. Task 1 (backend) correctly runs before Task 2 (frontend). Task 2 depends on the extended WeekData type from Task 1.

**Missing Phases:**
- None. The scope is appropriately constrained to extending the existing query + UI + CSV.

---

## 7. Specialist Agent Recommendations

| Phase | Recommended Agent | Rationale |
|-------|-------------------|-----------|
| Task 1: Backend + Tests | `convex-backend` | Schema query patterns, test infrastructure |
| Task 2: Frontend + CSV | `react-ui-builder` | Component composition, state management |
| Verification | `code-auditor` | Type check + pattern compliance |

---

## 8. Git Workflow Assessment

### Branch Strategy
| Assessment | Status |
|------------|--------|
| Feature branch specified | Not in plan (implicit from GSD convention) |
| Branch naming convention | Correct (follows gsd/phase-{N}-{slug} pattern) |
| Merge strategy documented | Not in plan |

### Commit Strategy
| Phase | Expected Commits | Commit Type | Notes |
|-------|------------------|-------------|-------|
| Task 1 | 1 | feat | Backend query extension + tests |
| Task 2 | 1 | feat | Frontend P&L sections + CSV export |

### Recommended Commit Checkpoints
1. After Task 1: `feat(49-01): extend income statement query with OpEx/EBIT/Other/NetIncome`
2. After Task 2: `feat(49-01): add OpEx/EBIT/Other/NetIncome P&L sections to frontend and CSV`

### Pre-Push Verification
- [x] Plan includes `npm run build` check
- [x] Plan includes `npm run test` verification
- [x] Plan includes local testing before push (vitest run)

### CI/CD Considerations
| Concern | Assessment |
|---------|------------|
| Rollback strategy | Not documented (not critical -- no schema changes) |
| Deployment order | Correct (backend extends query return type, frontend consumes new fields) |
| Data backup needed | No (read-only extension, no mutations changed) |
| Migration safety | Safe -- additive field extension to query return type |

### Git Workflow Issues Found
- Missing branch creation step at plan start
- Missing CHANGELOG.md update requirement

---

## 9. Documentation Checkpoints

| Phase | Documentation Update Required |
|-------|-------------------------------|
| Task 1 | `docs/API_REFERENCE.md` (query return type extended) |
| Task 2 | None |
| Post-merge | `docs/CHANGELOG.md` (required) |

### CHANGELOG.md Entry (Draft)
```markdown
## 2026-03-14 - P&L Integration (Phase 49)

**Full P&L: OpEx, EBIT, Other Income/Expense, Net Income**

- Extended income statement query with OpEx (6xxx accounts), EBIT, Other (7xxx), and Net Income
- Added collapsible OpEx and Other Income/Expense sections to P&L UI
- EBIT margin % and Net margin % displayed with period-over-period delta
- CSV export includes all new P&L sections
- Single-query journal aggregation via `by_entryDate` index (PNL-04 compliant)

**Files Modified:**
- `convex/reports/incomeStatement.ts`
- `src/pages/FinancialStatement.tsx`
- `src/lib/csvExport.ts`
- `tests/convex/incomeStatement.test.ts`
```

---

## 10. Testing Plan Assessment

**Overall Testing Verdict:** Adequate

### Planned Tests
| Layer | What's Tested | Test Type | Status |
|-------|---------------|-----------|--------|
| Backend | OpEx aggregation, zero-balance filtering, sort by code | convex-test | Planned |
| Backend | Other Income/Expense with mixed debit/credit normals | convex-test | Planned |
| Backend | Reversed entry cancellation | convex-test | Planned |
| Backend | EBIT = grossProfit - totalOpEx | convex-test | Planned |
| Backend | Net Income = EBIT - totalOther | convex-test | Planned |
| Backend | Margin computations (EBIT %, Net %) | convex-test | Planned |
| Backend | Delta computation for new fields | convex-test | Planned |
| Backend | Empty period returns zeros | convex-test | Planned |
| Frontend | TypeScript compilation (npm run build) | Build | Planned |
| Integration | Full test suite (npm run test) | Vitest | Planned |

### Missing Test Coverage (Should Consider)
| # | Missing Test | Why It Matters | Suggested Approach |
|---|--------------|----------------|-------------------|
| 1 | Large number of journal lines in period (performance) | `by_entryDate` fetches ALL lines, not just opex/other | Not critical at current scale, but worth a comment |
| 2 | Accounts with identical codes in different types | Edge case: 6100 in opex and 6100 in other (unlikely given seed data) | Low priority -- schema/seed prevents this |
| 3 | CSV export output verification | New CSV rows need content verification | Consider a unit test for `generateIncomeStatementCSV` with mock data including new fields |

### Test Execution Checkpoints
1. After Task 1: `npx vitest run tests/convex/incomeStatement.test.ts` (existing + new tests pass)
2. After Task 2: `npm run build` (TypeScript compiles clean)
3. Before merge: `npm run test && npm run build` (full verification)

### Regression Risk
- Existing `incomeStatement.test.ts` tests (11 tests) should continue passing since the query return type is being extended (additive), not modified.
- The `WeekData` interface extension in `csvExport.ts` must match the backend extension exactly, or TypeScript will catch the mismatch at build time.

---

## 11. Edge Cases to Address

The plan should explicitly handle:

- [x] Empty period (no journal lines) -- covered by test case 1
- [x] Zero-balance accounts filtered from display -- covered by test case 2
- [x] Reversed entries cancelling out -- covered by test case 4
- [x] Zero netRevenue (margin = null, not NaN) -- inherited from existing pattern
- [x] Previous-only accounts (exist in previous period but not current) -- covered by union-merge logic
- [ ] **Negative net revenue with positive OpEx** -- Net Income could be deeply negative; verify display formatting handles large negative numbers without overflow
- [ ] **All OpEx accounts have zero balance** -- verify empty `opex` array still renders "Total Operating Expenses" row correctly with 0

---

## 12. Approval Conditions

**For Approval, address:**
1. **Critical #1:** Add Git Workflow and Documentation Updates sections to the plan (or acknowledge they are handled by GSD framework conventions)
2. **Critical #2:** Resolve test file name inconsistency between plan (`incomeStatement.test.ts`) and validation (`pnlIntegration.test.ts`)

**Recommended before implementation:**
1. Consider using `Math.abs(total) < 0.01` instead of `total === 0` for zero-balance filtering
2. Extract union-merge helper for DRY frontend code

---

*Generated by /staffreview skill*
*Staff Developer Review + Principal Developer Review*
