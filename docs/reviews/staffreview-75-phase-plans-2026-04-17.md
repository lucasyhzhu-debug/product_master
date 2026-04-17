# Staff Review: Phase 75 — Full P&L Extension

**Date:** 2026-04-17
**Plan:** `.planning/phases/75-full-p-l-extension/` (5 plans: 75-00 through 75-04)
**Reviewers:** Staff Developer (Implementation) + Principal Developer (Architecture)

---

## 1. Summary

**Overall Assessment:** ✅ **Approve** (with 3 improvements + 5 refinements recommended)

This is one of the cleanest phase plans I've seen in this repo. The 16 locked decisions in CONTEXT.md are exhaustively covered, the 4-wave TDD structure enforces a meaningful Nyquist sampling rate, and the scope is correctly narrowed to a presentation reorg + one new computation (FCF) — no schema migrations, no new indexes, no new tables. Research rigorously verified that Phase 71's `convertToCapex` already stamps `acquisitionDate = expense.expenseDate` correctly, so D-06 becomes a test guard rather than an implementation fix. The threat models are narrow but realistic. The only non-trivial smell is Plan 01's deliberate mid-plan broken-TypeScript state, which could bite if execution pauses.

---

## 2. Plan Structure Validation (Step 0)

These are GSD-format plans, not the classic CLAUDE.md `## Git Workflow / ## Implementation Waves / ## Docs / ## Success Criteria` template. The GSD frontmatter + XML body covers equivalent content:

| CLAUDE.md requirement | GSD equivalent | Status |
|----------------------|---------------|--------|
| Git workflow / branch | Phase branch implied by CLAUDE.md Rule 12 + GSD `branching_strategy: "phase"` | ✅ (implicit) |
| Implementation waves | `wave:` frontmatter + `depends_on:` | ✅ Explicit (0 → 1 → 2a/2b parallel → 3) |
| Documentation updates | Plan 04 Task 3 explicitly lists 3 docs | ✅ |
| Success criteria | `<success_criteria>` block on every plan + `must_haves.truths` | ✅ |
| Type check requirement | `npm run type-check` in Plan 01/02/03/04 verify | ✅ |
| Build requirement | `npm run build` in Plan 02 T3, Plan 04 T1 | ✅ |

✅ Plan structure validated. No gaps filled.

---

## 2.5 Critical Issues (Must Fix)

**None.** No blocking issues found.

---

## 3. Improvements (Recommended)

| # | Improvement | Impact | Effort |
|---|-------------|--------|--------|
| I1 | Plan 01 leaves TypeScript uncompilable between Task 1 and Task 3 — merge or flag as atomic | Medium | Low |
| I2 | Plan 02 Task 2 has a grep-acceptance conflict with "optional rename" wording | Medium | Low |
| I3 | Plan 04 should document deployment-order dependency (Convex before Vercel) | Low–Medium | Low |

### Improvement I1: Plan 01 Tasks 1–3 leave repo uncompilable mid-plan

**Location:** `75-01-PLAN.md` Task 1 action step 4 (lines 220–221): "will fail because the return objects at lines 484-512 don't set the new fields yet AND gapAnalysis construction at lines 419-425 doesn't set `missingReversals`. This is expected — Task 2 + Task 4 will fix it in one compilation unit."

**Problem:** The plan intentionally leaves TypeScript broken after Task 1 and Task 2. If the execute-phase agent pauses between tasks (context exhaustion, checkpoint, error recovery, user interrupt), the repo is in an uncompilable state. A subsequent `npm run type-check` in between would fail, which could trigger spurious "something broke" diagnostics. More importantly, the `code-auditor` gate after wave 1 would reject this state.

**Why it matters:** GSD plans are designed so that each task can commit atomically. This plan violates that principle internally — Tasks 1–3 must complete as a unit.

**Recommendation:** Either:
- **(a)** Merge Tasks 1, 2, and 3 into a single task with 3 labeled phases (A: interfaces, B: fetch, C: compute) — commit once at the end.
- **(b)** Add a `commit_boundary: wave` note to the three tasks stating "these three tasks share a single commit; execute all three before committing."
- **(c)** Reorder so that Task 1 adds interfaces AND returns placeholder zeros from aggregateWeek's return object (compilable intermediate state) — then Task 2 fills in fetch, Task 3 fills in math. Each task would then compile independently.

Option (c) is the cleanest; option (a) is the fastest to apply.

### Improvement I2: ChannelRow variable-rename acceptance conflict

**Location:** `75-02-PLAN.md` Task 2, action step 2 (lines 274–278) says renames are "optional but keeps code self-describing". But the acceptance criterion (line 291) says:

> `src/components/financials/ChannelRow.tsx` does NOT contain `Gross Margin` anywhere (grep returns 0 matches — critical; if variable renames were skipped, the literal string `"Gross Margin"` in JSX text nodes must be gone)

**Problem:** The grep `grep -c "Gross Margin" src/components/financials/ChannelRow.tsx` will match the identifier `channelGrossMargin` as a substring and return a non-zero count, failing the acceptance criterion even if the JSX label is correctly renamed. The "(optional)" wording and the strict grep conflict.

**Recommendation:** Tighten the acceptance criterion to match JSX text nodes only:

```
grep -cE '>\s*Gross Margin\s*<|"Gross Margin"' src/components/financials/ChannelRow.tsx
```

Returns 0 only when the user-visible string is gone. OR make variable renames mandatory and clarify the acceptance criterion matches both the JSX and variables.

### Improvement I3: Deployment-order note in Plan 04

**Location:** `75-04-PLAN.md` Task 2 (human smoke-check) does not state that Convex backend must deploy BEFORE Vercel rebuild.

**Problem:** If the frontend ships with new rows referencing `data.current.capExAmount` before the backend has added that field, the destructuring returns `undefined` → `formatCurrency(undefined)` = NaN or "Rp NaN". The current CI pipeline on `main` (Convex deploy via GitHub Action → Vercel rebuild) handles this correctly because the Convex deploy blocks the Vercel trigger. But a manual `npx convex deploy` followed by a separate `vercel --prod` could race.

**Recommendation:** Add to Plan 04 Task 2 `<how-to-verify>` step 0:

```
0. **Pre-verification — deployment order:**
   Confirm `npx convex logs --prod | head -5` shows the new query signature
   (`capExAmount` in logs) BEFORE triggering any Vercel rebuild. In normal CI
   pipeline this is automatic; only relevant for manual deploys.
```

Or add a new Plan 04 Task 0 that runs `npx convex logs --prod | grep capExAmount` as a sanity gate.

---

## 4. Refinements (Minor Suggestions)

| # | Refinement |
|---|-----------|
| R1 | Add `confidence="exact"` to CapEx and FCF PLRows (consistency with existing confidence badges) |
| R2 | Document `parseRows` helper in `csvExport.test.ts` as test-only (naive CSV parsing) |
| R3 | Consider a Direction-B reclassification edge-case test (asset → expense) in `incomeStatement-gap-missingReversals.test.ts` — confirm it does NOT flag missingReversals |
| R4 | Plan 04 Task 1 should verify `git branch --show-current` is `gsd/phase-75-full-p-l-extension` per CLAUDE.md Rule 12 |
| R5 | Sanity-check PLRow's rendering of `currentAmount={0}` with `isNegative invertColor` — confirm it shows "Rp 0" (not "-Rp 0" or "(Rp 0)") |

### R1: Confidence prop on new rows

Plan 02 Task 3 adds the D/A, CapEx, FCF rows but does not pass a `confidence` prop. Per RESEARCH.md §11, CapEx sourced from `fixedAssets` is "exact" by construction. D/A is "exact" (journal-sourced). FCF is "calculated" (derived from other confidence values). Passing these props to `PLRow` renders the existing confidence badge consistent with other rows. Minor polish.

### R3: Direction B reclassification

Phase 71 supports BOTH directions: expense→asset (`convertedToAssetId`, creates a reversal JE) AND asset→expense (`sourceAssetId`). The missingReversals check targets Direction A only. Worth a test that seeds a Direction-B reclassification and asserts `missingReversals === []` (i.e., the check doesn't false-positive on the other direction). RESEARCH didn't call this out as a risk, but for a gap-check query it's worth a regression guard.

### R4: Branch verification

CLAUDE.md Rule 12 is strict about branch-per-phase. The session's current branch is `gsd/phase-74-staff-attendance` (phase 74 isn't merged yet), and phase 75 planning ended up on a separate branch via `gsd-tools` auto-routing. Plan 04 Task 1 already runs `npm run build`; a one-line prefix check (`git branch --show-current | grep -q "phase-75"`) would catch any accidental commits on the wrong branch before docs updates ship.

---

## 5. Duplication Analysis

### Existing Code to Leverage (all correctly reused in plans)

| Existing Code | Location | How Plans Use It |
|---------------|----------|------------------|
| D/A filter pattern | `convex/reports/incomeStatement.ts:469-474` | Plan 01 T3 reuses — `depreciationAmortization = depreciationAmount + amortizationAmount` + filter 6150/6160 out of returned `opex` list |
| `aggregateJournalLines` | `convex/lib/journalHelpers.ts` | Already handles OpEx/Other breakdown; no changes needed |
| `computeDelta` | `src/lib/financialHelpers.tsx` | Plan 01 T3 reuses for 5 new delta entries |
| `PLRow` primitive | `src/components/financials/PLRow.tsx` | Plan 02 T1 adds one new prop (`helperText`) — no parallel row component built |
| `MarginRow` | `src/pages/FinancialStatement.tsx:76` (inline) | Plan 02 T3 reuses for FCF Margin % row |
| `SectionHeaderRow` / `SectionFooterRow` | `src/lib/financialHelpers.tsx` | Plan 02 keeps existing section structure |
| `formatPrecomputedDelta` | `src/lib/csvExport.ts` | Plan 03 T2 reuses pipeline for all new rows |
| Formula-injection sanitizer | `src/lib/csvExport.ts:607-623` | Plan 03 T2 threat model confirms automatic coverage |
| convex-test `seedUser` / `seedFixedAsset` patterns | `convex/reports/__tests__/incomeStatement-shopee.test.ts` | Plan 00 T1/T2 mirror pattern exactly |
| DataQualityPanel section visual pattern | `src/components/financials/DataQualityPanel.tsx:135-201` | Plan 02 T4 follows identical structure |

### Potential Duplication Risks

- **`WeekData` typed twice** (once in `convex/reports/incomeStatement.ts`, once in `src/lib/csvExport.ts`) — not introduced by Phase 75; pre-existing client/server split. Plan 01 extends server interface; Plan 03 extends client interface. They MUST stay in sync; the Plan 03 `key_links` correctly flags this as "duplicated client-side type (intentional — client cannot import server types)". Nice catch.
- **`GapAnalysis` typed twice** (server + DataQualityPanel local + csvExport local) — same reason. Plans 01, 02, 03 all touch all three instances of `missingReversals`. All three additions are correct.

No new duplication introduced.

---

## 6. Phase/Wave Accuracy

| Wave | Plans | Assessment | Notes |
|------|-------|------------|-------|
| 0 | 75-00 | ✅ Good | TDD RED state, 4 files, 14 tests. Plan 00 Task 1 explicitly seeds minimal schema-valid fixedAssets rows (assetNumber uses `Math.random()` suffix — tiny parallel-collision risk, acceptable for test isolation via `convexTest(schema)` per-test) |
| 1 | 75-01 | ⚠ See Improvement I1 | 4 tasks on a single file. Tasks 1–3 should commit as one atomic unit to avoid uncompilable mid-state |
| 2 | 75-02, 75-03 | ✅ Good | Zero file overlap confirmed. Both depend only on Wave 1. Can run in parallel |
| 3 | 75-04 | ✅ Good | Verification + docs; Task 2 is a `checkpoint:human-verify` which is correct for the 7 manual smoke checkpoints in VALIDATION.md |

**Ordering Issues:** None (beyond I1 noted above).

**Missing Phases:** None. The plan correctly excludes deferred items (tax-optimized EBITDA, net-CapEx, print view, channel-tagged OpEx) per CONTEXT.md `<deferred>` block.

---

## 7. Specialist Agent Recommendations

| Plan | Recommended Agent | Rationale |
|------|-------------------|-----------|
| 75-00 | `tdd-test-architect` | TDD RED-state test scaffolding is this agent's specialty |
| 75-01 | `convex-backend` | Single-file backend extension (query + gap-check) |
| 75-02 | `react-ui-builder` | 4 UI files — PLRow prop, ChannelRow label, FinancialStatement layout reorg, DataQualityPanel section |
| 75-03 | `frontend-integrator` OR `react-ui-builder` | Pure client-side module extension — csvExport row emission |
| 75-04 Task 1 | `code-auditor` | Runs type-check + lint + test + build gate |
| 75-04 Task 2 | human-verify checkpoint | Correctly flagged `autonomous: false`; cannot automate visual smoke |
| 75-04 Task 3 | General purpose + direct Edit | Docs-only; 3 markdown files |

**Cross-wave coordination:** `cto-orchestrator` may coordinate if multiple waves run in parallel sessions, but the plan's own wave structure + `depends_on` makes coordination largely automatic.

---

## 8. Git Workflow Assessment

### Branch Strategy

| Assessment | Status |
|------------|--------|
| Feature branch specified | ✅ Implicit via GSD `branching_strategy: "phase"` — branch is `gsd/phase-75-full-p-l-extension` |
| Branch naming convention | ✅ Correct (matches `gsd/phase-{N}-{slug}` pattern) |
| Merge strategy documented | ⚠️ Not explicit in plans — follows project convention (PR, review, merge-to-main) |

**Caveat noted:** Session is currently on `gsd/phase-74-staff-attendance`. Phase 75 planning commits went to the `gsd/phase-75-full-p-l-extension` branch via `gsd-tools` auto-routing. Recommend running `git branch --show-current` before each execute-phase session to confirm correct branch (hence Refinement R4).

### Commit Strategy

| Plan | Expected Commits | Type | Atomic? |
|------|------------------|------|---------|
| 75-00 | 1 per test file, ideally | `test:` | Yes — each test file is self-contained |
| 75-01 | Should be 1 (see I1) | `feat:` | ⚠ Currently split across 4 tasks with mid-state broken TS |
| 75-02 | 4 (one per file) OR 1 per logical change | `feat:` / `refactor:` | Yes — each file change is self-contained |
| 75-03 | 1 | `feat:` | Yes |
| 75-04 | 1 for docs + 1 human sign-off (no commit) + optional branch-merge commit | `docs:` | Yes |

### Recommended Commit Checkpoints

1. Wave 0 complete → `test(75): add Wave 0 failing tests for FIN-01/FIN-02 TDD gate`
2. Wave 1 complete → `feat(75): extend income statement with CapEx, FCF, D/A split, missingReversals gap`
3. Wave 2 complete → `feat(75): reorganize P&L layout (EBITDA-first) + rename Gross Margin → Contribution Margin + CSV rows`
4. Wave 3 complete → `docs(75): update CHANGELOG, ROADMAP, API_REFERENCE for Phase 75`

### Pre-Push Verification

- [x] Plan 04 Task 1 includes `npm run build` ✅
- [x] Plan 04 Task 1 includes `npm run type-check` ✅
- [x] Plan 04 Task 1 includes `npm run lint` ✅
- [x] Plan 04 Task 1 includes `npm run test` ✅

### CI/CD Considerations

| Concern | Assessment |
|---------|------------|
| Rollback strategy | ✅ Pure additive change; `git revert` of merge commit is safe. No schema/data migration |
| Deployment order | ⚠ See Improvement I3 — Convex must deploy before Vercel rebuild (normal CI handles this; manual deploys need care) |
| Data backup needed | No — read-only extension, no mutations |
| Migration safety | ✅ No migrations |

### Git Workflow Issues Found

- **I1** (restated): Plan 01 tasks leave TypeScript broken between tasks — if a commit happens at Task 1 end, the commit is broken
- **R4** (restated): No explicit branch-verification step in Plan 04

---

## 9. Documentation Checkpoints

| Phase | Documentation Update Required | Plan Covers? |
|-------|-------------------------------|-------------|
| Wave 0 | Test file paths documented in 75-00-SUMMARY.md | ✅ `<output>` block |
| Wave 1 | Backend field list in 75-01-SUMMARY.md | ✅ `<output>` block |
| Wave 2 | Row-order summary in 75-02-SUMMARY.md | ✅ |
| Wave 2 | CSV label choices in 75-03-SUMMARY.md | ✅ |
| Wave 3 | `docs/CHANGELOG.md`, `docs/ROADMAP.md`, `docs/API_REFERENCE.md` | ✅ Plan 04 Task 3 |

### CHANGELOG.md Entry (Draft already in Plan 04 Task 3 — approved)

The draft in `75-04-PLAN.md` lines 190–227 is good. Covers Added / Changed / Technical / Requirements Closed sections. Flags the non-obvious "opex array no longer contains 6150/6160" breaking change for downstream consumers. No edits needed.

---

## 10. Testing Plan Assessment

**Overall Testing Verdict:** ✅ **Adequate — bordering Exemplary**

### Planned Tests

| Layer | What's Tested | Test Type | Status |
|-------|---------------|-----------|--------|
| Backend query | CapEx aggregation, FCF formula, D-04 reclass inclusion, D-06 original-date guard, zero-CapEx, period boundaries | convex-test (unit) | ✅ Planned (Plan 00 T1, 6 tests) |
| Backend gap check | missingReversals healthy + broken states | convex-test (unit) | ✅ Planned (Plan 00 T2, 2 tests) |
| CSV export | Row presence, row order, D/A extraction, channel-column scope | Vitest pure | ✅ Planned (Plan 00 T3, 4 tests) |
| UI component | ChannelRow label rename + scope limit | Testing Library | ✅ Planned (Plan 00 T4, 2 tests) |
| Integration/smoke | 7 human-verify checkpoints | Manual | ✅ Plan 04 T2 |
| Regression | Existing `incomeStatement-shopee.test.ts` | Vitest | ✅ Plan 01 T4 runs full reports suite |
| Build | Full `npm run build` | CI | ✅ Plan 04 T1 |

### Missing Test Coverage (would add, not blocking)

| # | Missing Test | Why It Matters | Suggested Approach |
|---|--------------|----------------|-------------------|
| 1 | Direction-B reclassification (`sourceAssetId`) does NOT flag missingReversals | Prevent false-positive gap warnings for asset→expense flow | Add seed of expense with `sourceAssetId` set, assert missingReversals is empty (Refinement R3) |
| 2 | CapEx row PLRow rendering at exactly `0` with `isNegative invertColor` flags | Edge case: confirm "Rp 0" renders cleanly, not "-Rp 0" | Add to ChannelRow test file OR a new `PLRow.test.tsx` (optional new file) |
| 3 | Previous-period has null D/A but current has value — `fcfMarginPp` should be `null` (not NaN) | Delta correctness at period boundaries | Add to `incomeStatement-capex.test.ts` |

None are blocking. R3 is the most worthwhile addition.

### Test Execution Checkpoints

The plan correctly runs tests at:
1. After Plan 00 ships → 14 RED tests confirmed (Plan 00 verify commands use `grep "FAIL"`)
2. After Plan 01 T3 → 6 CapEx tests flip GREEN
3. After Plan 01 T4 → 2 missingReversals tests flip GREEN
4. After Plan 02 T2 → 2 ChannelRow tests flip GREEN
5. After Plan 03 T2 → 4 csvExport tests flip GREEN
6. Plan 04 T1 → full suite

### Regression Risk

- `WeekData.totalOpEx` preserved unchanged (inclusive of D/A) → downstream consumers (sales analytics, expense analytics?) that read `totalOpEx` continue working. Plan 01 is explicit about this.
- `WeekData.opex` array now excludes codes 6150/6160 → consumers iterating this array see fewer entries. Plan 04 CHANGELOG flags this. Worth confirming no other page iterates `data.current.opex` expecting D/A to be in it (quick grep should be part of Plan 04 Task 1 verification).

**Suggested add to Plan 04 Task 1 verify:**
```bash
# Regression guard: confirm no other UI reads opex expecting 6150/6160
grep -rn "\.opex\b" src/pages src/components | grep -v "financials/" || echo "No other opex consumers — safe"
```

---

## 11. Edge Cases to Address

The plan explicitly addresses (✅) or implicitly accepts (✔):

- [x] Zero CapEx period — explicit D-14, Plan 02 T3 helperText, Plan 00 T1 test 5
- [x] Zero D/A period — FCF formula degenerates correctly to NI − CapEx; covered by zero-amount arithmetic
- [x] Period with no `fixedAssets` rows at all — `capExAmount = 0` via `.reduce((s,a)=>s+a.cost, 0)` on empty array
- [x] Previous period pre-dating Asset Register — CapEx = 0, FCF = NI + D/A; covered by D-14
- [x] Period boundary: asset at exactly `periodStart` (inclusive) vs `periodEnd` (exclusive) — Plan 00 T1 test 6 guards half-open interval
- [x] Phase 71 converted expenses counted correctly — D-06 test guard
- [x] Reclassified assets (disposalType=reclassify_to_expense) still counted — D-04 test
- [x] `totalGross === 0` → `fcfMarginPercent: null` (not NaN) — explicit ternary in Plan 01 T3
- [x] Null previous-period margins → `fcfMarginPp: null` — pattern matches existing `ebitdaMarginPp`
- [x] XSS on rendered description strings — threat T-75-02-02 mitigated via React auto-escape
- [x] Formula injection in CSV — threat T-75-03-01 mitigated via existing sanitizer
- [x] DoS via unbounded fixedAssets scan — T-75-01-03 accepted at current scale
- [ ] Direction-B reclassification (`sourceAssetId`) — NOT flagged as edge case; add per R3
- [ ] Very long `missingReversals` list breaking CSV download size — T-75-03-03 accepted
- [ ] FCF row with negative value (CapEx > NI + DA) — plan comment at Plan 03 T2 notes "can be negative"; `formatCurrency` in `src/lib/utils.ts` handles negatives correctly — sanity-check during smoke

---

## 12. Approval Conditions

**For Approval (no blockers):**
- None — plan is approved as-is.

**Recommended before implementation (address Improvements I1–I3):**

1. **I1** — Merge Plan 01 Tasks 1–3 into one atomic unit, OR mark them as a shared commit boundary, OR restructure Task 1 to return compilable placeholder zeros.
2. **I2** — Tighten Plan 02 Task 2 acceptance criterion to `grep -cE '>\s*Gross Margin\s*<|"Gross Margin"'` OR mandate variable renames.
3. **I3** — Add deployment-order note to Plan 04 Task 2 (Convex backend before Vercel frontend).

**Nice-to-have (Refinements R1–R5):** See Section 4. None blocking.

---

## 13. Scope Guardrails Verification (locked decisions)

All 16 decisions from CONTEXT.md map to concrete tasks or documented no-new-work acknowledgments:

| D-ID | Coverage | Check |
|------|----------|-------|
| D-01 | Plan 01 T3 CapEx sum formula | ✅ |
| D-02 | Plan 01 objective documents "auto-included via fixedAssets row" | ✅ (no-new-work) |
| D-03 | Plan 01 T3 comment "gross acquisitions only" | ✅ |
| D-04 | Plan 00 T1 test 3 + Plan 01 T3 comment | ✅ |
| D-05 | Plan 01 T3 uses `acquisitionDate` | ✅ |
| D-06 | Plan 00 T1 test 2 (test guard only) | ✅ (no implementation needed per RESEARCH §2) |
| D-07 | Plan 02 T3 full reorg + Plan 03 T2 CSV reorg | ✅ |
| D-08 | Plan 01 T3 filter + Plan 02 T3 UI + Plan 03 T2 CSV | ✅ |
| D-09 | Plan 02 T3 "D/A appears exactly once" + Plan 04 T2 smoke step 1 | ✅ |
| D-10 | Plan 00 T4 test + Plan 02 T2 rename | ✅ |
| D-11 | Plan 00 T4 test 2 + Plan 01 backend scope + Plan 02 T3 + Plan 03 channel rule | ✅ |
| D-12 | Plan 01 objective documents "channel OpEx already upstream" | ✅ (no-new-work) |
| D-13 | Plan 01 T3 FCF formula + Plan 02 T3 UI tooltip | ✅ |
| D-14 | Plan 00 T1 test 5 + Plan 01 backend + Plan 02 T1/T3 helperText | ✅ |
| D-15 | Plan 00 T2 tests + Plan 01 T2/T4 backend + Plan 02 T4 UI + Plan 03 T2 CSV footer | ✅ |
| D-16 | Plan 00 T3 tests + Plan 03 T1/T2 implementation | ✅ |

**Deferred items NOT in scope (confirmed absent):**
- Tax-optimized EBITDA bridge variant ✅ absent
- Channel-tagged direct OpEx with new schema ✅ absent
- Net CapEx (disposal-netted) ✅ absent (D-03 locks gross)
- Print-friendly P&L view ✅ absent
- New `fixedAssets` index ✅ explicitly avoided (RESEARCH §1)

---

## 14. Final Verdict

**APPROVE.** Proceed to `/gsd-execute-phase 75` after applying Improvements I1–I3 (small edits to Plan 01 Task sequencing, Plan 02 Task 2 acceptance criterion, Plan 04 Task 2 deployment note). The refinements (R1–R5) can be addressed during execution at the executor's discretion.

### Strengths worth noting
- Exhaustive coverage of 16 locked decisions
- TDD Wave 0 locks acceptance into failing tests before implementation
- Scope correctly narrowed (no schema changes, no new indexes, no deferred-item scope creep)
- Phase 71 integration correctly identified as "already works" via Research
- Threat models are narrow, realistic, and tied to actual code paths
- Parallel Wave 2 plans have confirmed zero file overlap
- Plan 04 includes human-verify checkpoint for manual-only verifications (D/A tooltip, zero-CapEx helper text, section collapse UX)

### Risks mitigated
- Silent P&L double-count (Phase 71 bug mode) → D-15 gap check
- Fake-precision channel allocation → D-11 explicit no-allocation rule enforced by ChannelRow test 2
- Backend/frontend version skew → Convex+Vercel CI pipeline handles; I3 documents manual case
- Rollback → pure additive, no migrations

---

*Generated by `/staffreview` skill*
*Staff Developer Review + Principal Developer Review*
*Session: Phase 75 planning, 2026-04-17*
