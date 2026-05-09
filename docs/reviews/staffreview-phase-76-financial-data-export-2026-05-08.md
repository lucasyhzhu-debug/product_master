# Staff Review: Phase 76 — Financial Data Export

**Date:** 2026-05-08
**Plans:** `.planning/phases/76-financial-data-export/76-{01..05}-PLAN.md` (on branch `gsd/phase-76-financial-data-export`, commit `a33fa627`)
**Reviewers:** Staff Developer (Implementation) + Principal Developer (Architecture)
**Codebase verified at:** `main` HEAD `264d9e13` (2026-05-08)

---

## 1. Summary

**Overall Assessment: Revise**

The plans are well-researched and exceptionally well-cited — every decision traces to CONTEXT.md / RESEARCH.md / UI-SPEC.md, schema-name corrections are verified by direct read, and acceptance criteria use both positive and negative grep gates. Phase 76 is correctly framed as a thin layer over Phase 75's aggregator with zero new indexes / dependencies.

That said, there are **3 build-breaking issues** (one missing export, one unimplemented helper, one self-acknowledged signature drift between plans 01 and 03) and several smaller correctness/UX issues that will surface as wasted execution cycles if not fixed before code starts. The build-breakers are mechanical and easy to address — a 30-minute revision pass closes them.

Counts: **3 Critical · 7 Improvements · 6 Refinements**

---

## 2. Critical Issues (Must Fix)

| # | Issue | Category | Location in Plan |
|---|-------|----------|------------------|
| 1 | `WIB_OFFSET_MS` is not exported from `convex/lib/periodRange.ts` — plan 02 import will fail tsc | Build break | 76-02-PLAN §Task 2.2 line 365 |
| 2 | `buildIncomeStatementRows` `deltas` arg is contradictory between plan 01 (required) and plan 03 (passes `null`) | Self-acknowledged plan inconsistency | 76-01 §Task 1.3 vs 76-03 §Task 3.2 (lines 437-473) |
| 3 | `aggregateRangeGap` field names are unverified placeholders — risks silently emitting all-zero footer | Logic correctness (D-08) | 76-02-PLAN §Task 2.2 lines 463-492 |

### Issue 1 — `WIB_OFFSET_MS` not exported from `convex/lib/periodRange.ts`

Plan 02 task 2.2 (line 365) imports:

```typescript
import { wibMidnightToUtc, WIB_OFFSET_MS } from "../lib/periodRange";
```

Verified in repo: `convex/lib/periodRange.ts:218` declares `const WIB_OFFSET_MS = WIB_OFFSET_HOURS * 60 * 60 * 1000;` — **no `export` keyword**. The constant is module-private. The plan also uses it inside `buildPeriodBucketsBackend` (lines 378, 388) for the WIB-to-Mon snap math.

`wibMidnightToUtc` IS exported from `periodRange.ts:46` ✓. `WIB_OFFSET_MS` IS exported from `src/lib/dateUtils.ts:12` for the frontend ✓. The issue is only on the backend side.

**Recommendation:** Pick one of:
- **(A)** Add `export const WIB_OFFSET_MS = WIB_OFFSET_HOURS * 60 * 60 * 1000;` in `convex/lib/periodRange.ts:218` (1-line additive change). Cleanest.
- **(B)** Inline the constant inside `buildPeriodBucketsBackend`: `const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;`. Avoids touching `periodRange.ts` but creates a duplicate magic number.
- **(C)** Eliminate the dependency: rewrite the Monday-snap math using `wibMidnightToUtc` directly (compute the WIB date components from `periodStart` then call `wibMidnightToUtc(y, m, d - daysToMonday)`). Most elegant, but requires writing a `wibComponents(periodStart)` helper.

**Recommend (A)** — additive, used by both backend and frontend, parallels the existing `dateUtils.ts` export.

### Issue 2 — `buildIncomeStatementRows` `deltas` argument: required vs null

Plan 01 task 1.3 (lines 244-264) declares:

```typescript
export function buildIncomeStatementRows(
  periodStr: string,
  current: WeekData,
  previous: WeekData | null,
  deltas: IncomeStatementData["deltas"] | null,
  firstInRange: boolean = false
): string[][]
```

The body uses `deltas` for the `delta_pct` cells (cited via "Wherever the existing code emits a `delta_pct` cell ... apply this gate" — so `deltas` is consumed).

Plan 03 task 3.2 (line 441) calls:

```typescript
out.push(...buildIncomeStatementRows(p.label, p.current, prev, null, isFirstInRange));
```

…and adds a self-acknowledged caveat (lines 463-473):

> **CRITICAL — `buildIncomeStatementRows` signature handling:** … If `buildIncomeStatementRows` requires non-null `deltas`, instead compute a fresh deltas object inline … The cleanest path: refactor `buildIncomeStatementRows` (in plan 01) to compute its own deltas from `(current, previous)` so callers don't need to pre-compute. **If that wasn't done in plan 01, do it as part of this task — it's a small, contained change to `csvExport.ts`. Update plan 01's task summary if so.**

This is plan-on-plan drift. Plan 01 already executed will produce a `buildIncomeStatementRows` that takes `deltas` as a regular argument; plan 03 then patches plan 01's helper at execution time and "updates plan 01's task summary." That's a planning anti-pattern — the contract between plans should be locked at plan time, not negotiated mid-execution.

**Recommendation:** Pick the contract NOW and bake it into both plans:

- **Option A (recommended):** Plan 01 makes `buildIncomeStatementRows` compute its own deltas from `(current, previous)`. Signature drops the `deltas` param: `(periodStr, current, previous | null, firstInRange = false)`. Plan 01's existing `generateIncomeStatementCSV` continues to compute deltas ONCE in the wrapper (same as today) and either passes `previous` only OR keeps deltas-from-backend and ignores the helper-computed version. The cleanest split is "helper computes deltas; caller doesn't."
- **Option B:** Plan 01 keeps `deltas` as a real argument; plan 03 must pre-compute deltas inline before calling. Plan 03's "compute fresh deltas object" pseudocode (line 466-471) needs to be a real implementation, not `{ /* ... */ }`. The deltas shape lives at `incomeStatement.ts` near `WeekData` and has ~30 fields after Phase 75.

**Recommend A.** It's smaller and removes the cross-plan handoff hazard. Update plan 01's task 1.3 acceptance grep to match the new signature.

### Issue 3 — `aggregateRangeGap` field names are placeholders

Plan 02 task 2.2 implements `aggregateRangeGap` with this caveat (line 495):

> **IMPORTANT:** The exact field names on `WeekData` (the `currentPeriod` shape) are defined in `convex/reports/incomeStatement.ts` near the `aggregateWeek` return type. Read that file directly. If the field names don't match the placeholders above (`unmappedProductCodes`, `missingChannels`, etc.), use the actual field names from the `WeekData` type.

I verified: `WeekData` is at `convex/reports/incomeStatement.ts:74` (`interface WeekData {` — not exported). The plan's placeholder field names (`unmappedProductCodes`, `missingChannels`, `totalProducts`, `mappedProducts`, `zeroCogsCount`) are speculative. If the actual fields differ:

- TypeScript will catch missing properties **iff** `current` is typed correctly. But `aggregateRangeGap` is declared with `Array<{ current: any }>` (line 463), so the `any` makes the field reads silently produce `undefined`. The `??` fallbacks then leave totals at zero — a green build with a worthless footer. This violates **D-08** (range-aggregated gap analysis is the entire reason this function exists).

**Recommendation:**

1. Plan 01 should **export `WeekData`** from `incomeStatement.ts` (1-line additive change). Plan 01 currently says "Do NOT add any new exports beyond `fetchAndAggregate`" — relax that to also export the type so downstream plans get type safety.
2. Plan 02 should type `aggregateRangeGap` parameter as `Array<{ current: WeekData }>` so TypeScript can verify field names at compile time, not runtime.
3. The plan should enumerate the actual gap-relevant fields from `WeekData` (read once, list them in plan 02) instead of leaving placeholders. Acceptable fields based on Phase 75 D-16 likely include: `unmappedProducts`, `dataQualityFlags`, `productsWithZeroCogs`, etc. — but the planner should verify and bake the names into the plan, not the executor.

If the actual `WeekData` shape has no gap fields at all (Phase 75 may have rolled them up differently), then **D-08 needs a separate query** that reconstructs the gap from raw revenue rows — that's a meaningfully different design.

---

## 3. Improvements (Recommended)

| # | Improvement | Impact | Effort |
|---|-------------|--------|--------|
| 4 | `useDeferredValue` ≠ debounce — preflight will re-fire on every keystroke | High | Low |
| 5 | `WeekData` should be exported from plan 01 to give plan 03 real types | Medium | Low |
| 6 | `formatWeekLabel`/`formatMonthLabel` referenced but not implemented | Medium | Low |
| 7 | Generate handler: empty-Raw with both checked silently downloads only P&L | Medium | Low |
| 8 | `buildPeriodBuckets` is duplicated frontend ⇄ backend (cross-validation only verifies match) | Medium | Medium |
| 9 | "Last week" preset semantics undefined vs UI label expectation | Medium | Low |
| 10 | Plan 05 should use `loginAsRole(page, "kitchen")` (which exists) instead of skipping role-gate test | Medium | Low |

### Improvement 4 — `useDeferredValue` is not a debounce

Plan 04 task 4.1 (lines 381-392) declares:

```typescript
const deferredStart = useDeferredValue(periodStart);
// ... preflight = useQuery(api.reports.financialExport.getExportPreflight, { periodStart: deferredStart, ... })
```

…and the comment says "Debounce preflight subscription (300ms) by deferring the values that drive it."

`useDeferredValue` defers **rendering**, not state changes. It causes React to schedule the re-render at lower priority. Convex `useQuery` recomputes its arguments on every render, and the Convex client deduplicates identical arg payloads — so in practice `useDeferredValue` won't help here, because by the time React commits the deferred value the user has typically stopped typing.

The bigger problem: **this is not a 300ms minimum debounce.** The behavior is "schedule lazily" — under load it could be 50ms or 5s. The plan also doesn't verify the actual Convex behavior under rapid `useQuery` arg changes.

**Recommendation:** Use a real debounce. Either:
- Custom hook: `useDebouncedValue<T>(value: T, ms: number): T` — sets state via `setTimeout` cleared on each new input.
- `lodash.debounce` — extra dep but well-known.
- Inline `useEffect` + `setTimeout(setDeferred, 300)`.

Update plan 04's `<behavior>` Behavior 4 to specify the actual debounce mechanism, and add an acceptance criterion that the debounce delay is configured (e.g., grep for `setTimeout` or the hook name).

### Improvement 5 — `WeekData` should be exported

Tied to Critical #3. `WeekData` is defined as a non-exported interface at `convex/reports/incomeStatement.ts:74`. Plan 03 task 3.2 falls back to `any` for `MultiPeriodPLData.periods[].current`, losing type safety on the most complex object in this phase. Plan 04 then consumes `MultiPeriodPLData` from the Convex query and the `current` field carries no contract at the page layer.

**Recommendation:** Plan 01 task 1.4 should additionally export `WeekData`. Plan 03 task 3.2 should import it: `import type { WeekData } from "../../convex/reports/incomeStatement"`. The cross-tier import is acceptable since the type is structural and the Convex generated `api` types already cross the boundary.

### Improvement 6 — `formatWeekLabel`/`formatMonthLabel` not implemented in plan 02

Plan 02 task 2.2 (lines 446-460) defines `formatBucketLabel` which calls `formatWeekLabel(s, e)` and `formatMonthLabel(s, e)` — but neither is implemented. The plan punts to "Use existing getIsoWeekNumber + check if bucket is full week (7 days)."

For a planner-grade plan this is too vague:
- What's the partial-bucket suffix format? `(partial)` vs full date range vs nothing?
- For monthly: `2026-04` vs `2026-04 (partial)` vs `2026-04-01 to 2026-04-19`?
- Time-zone handling on the boundary check?

**Recommendation:** Add the implementations to the plan body. Suggest:

```typescript
function formatWeekLabel(s: number, e: number): string {
  const isFullWeek = e - s === 7 * 24 * 60 * 60 * 1000;
  const wibYear = new Date(s + WIB_OFFSET_MS).getUTCFullYear();
  const week = getIsoWeekNumber(s);  // returns "W15"
  return isFullWeek ? `${wibYear}-${week}` : `${wibYear}-${week} (partial)`;
}
function formatMonthLabel(s: number, e: number): string {
  const monthStr = utcToWibMonthStr(s);  // "2026-04"
  // Full-month check: bucketStart = month1, bucketEnd = nextMonth1
  const isFullMonth = utcToWibMonthStr(e - 1) === monthStr && /* start-aligned */;
  return isFullMonth ? monthStr : `${monthStr} (partial)`;
}
```

Add a unit test for partial-bucket label format (RESEARCH §"Section 2 — Date-Range Bucketing" line 384-388 already specifies the recommended format; bake it into the plan).

### Improvement 7 — Empty-Raw with both checked silently downloads only P&L

Plan 04 task 4.1 generate handler (lines 411-422):

```typescript
if (includeRaw) {
  const rows = await convex.query(...);
  if (rows.length === 0 && !includePL) {     // ← only errors when P&L NOT also selected
    toast.error("No data in this range...");
    return;
  }
  ...downloadCSV(generateRawTransactionsCSV(rows), filenames.transactions);
  ...
}
```

If both checkboxes are checked AND the raw query returns empty rows AND P&L has data, the handler:
1. Skips the empty-data toast (because `includePL` is true)
2. Calls `downloadCSV` with only the header row → user gets a near-empty CSV
3. Then downloads P&L
4. Toast: "Downloaded transactions and P&L summary CSVs." — **misleading**

User experience: silent partial success. Recommend tracking per-export status:

```typescript
const results = { raw: "skipped" | "downloaded" | "empty", pl: "..." };
// emit a granular toast: "P&L downloaded; no raw transactions in range."
```

Or simpler: download empty-header raw CSV only if user explicitly opts in (e.g., via a checkbox "Always include even if empty"). Default to "skip empty file with toast warning."

### Improvement 8 — `buildPeriodBuckets` duplication across tiers

Plan 02 task 2.2 has `buildPeriodBucketsBackend` in `convex/reports/financialExport.ts`; plan 03 task 3.1 has `buildPeriodBuckets` in `src/lib/financialExportHelpers.ts`. Both are pure functions with identical algorithms. Plan 02 says (line 405): "this function is ALSO replicated in `src/lib/financialExportHelpers.ts` by plan 03. The two implementations MUST stay in sync — they share fingerprints in unit tests."

The cross-validation test (plan 03 task 3.3 line 698) acknowledges that importing across the tier boundary may not be configured: "If it works, do that. Otherwise, embed a duplicate of the backend algorithm inline as a reference function."

This is a DRY violation that the cross-validation test merely papers over. If the functions drift in a future phase (e.g., someone adjusts the snap-to-Monday rule on one tier), the test asserts equality — but the bug is that the spec drifted, not that one side is wrong.

**Recommendation:** Place the helper in a shared location both tiers can import:
- **(A)** `src/lib/financialExportHelpers.ts` exports `buildPeriodBuckets`; `convex/reports/financialExport.ts` re-imports from there. Convex DOES support importing pure utility files from `src/`. Verify `vitest.config.ts` and Convex's `bundler.config` permit this — recent Convex versions allow it. Cleanest if it works.
- **(B)** New shared file: `convex/lib/periodBuckets.ts` — backend imports directly; frontend imports from `convex/lib/periodBuckets.ts` (Convex `convex/lib/` is plain TypeScript and frontend can import it). Existing precedent: nothing in `convex/lib/` is currently dual-imported but there's no architectural reason it can't be.
- **(C)** Stick with duplication but add the cross-validation test as a **CI-blocking** test that runs on every PR. The plan mentions it but doesn't make it a required test.

**Recommend (B).** Most aligned with Convex conventions. Update plan 02 to skip writing `buildPeriodBucketsBackend` and instead import from the shared file; update plan 03 to do the same.

### Improvement 9 — "Last week" preset semantics ambiguous

Plan 03 task 3.1 implements:

```typescript
case "last-week": {
  // Last 7 calendar days ending at today (exclusive end at tomorrow midnight)
  const start = todayWibMidnight - 7 * 24 * 60 * 60 * 1000;
  return [start, tomorrowWibMidnight];
}
```

UI-SPEC label is "Last week." A typical bookkeeper interpretation is "the prior calendar/ISO week (Mon–Sun)" — not "trailing 7 days from today." For a Wed user, plan's semantics return `[Wed prev week 00:00, Thu today 00:00 next-day-exclusive]`. A user expecting "last week" would expect `[Mon prev week, Mon this week)`.

This is bookkeeping-domain ambiguity. The plan acknowledges (line 312): "If the executor finds an existing convention in `FinancialStatement.tsx` that differs, mirror it." But `FinancialStatement.tsx` may have no such convention since Phase 75 used a single-week selector, not presets.

**Recommendation:** Lock the semantics in plan 03 explicitly. Either:
- "Trailing 7 days" — relabel the chip "Last 7 days" for clarity. UI-SPEC will need update.
- "Prior ISO week" — change the implementation: `start = previousMondayWib`, `end = thisMondayWib`. Stays at the "Last week" label.

The bookkeeper-friendly interpretation depends on Frollie's accounting cadence. Default recommendation: **prior ISO week** (Mon–Sun) — matches accounting weekly closing convention. UAT in plan 05 step 2 should explicitly test the semantics.

### Improvement 10 — Plan 05 role-gate skip can be replaced with `loginAsRole`

Plan 05 task 5.1 (lines 236-250) checks for `loginAsKitchen` and falls back to `test.skip`. Verified in repo: `tests/e2e/helpers.ts` has both `loginAsManager` (line 115, "backward-compat") and `loginAsRole(page, role)` (line 31), the latter accepting any `TestRole`. The plan's role-gate test SHOULD use `loginAsRole(page, "kitchen")` directly:

```typescript
import { loginAsRole } from "./helpers";
test("role gate: kitchen role redirects", async ({ page }) => {
  await loginAsRole(page, "kitchen");
  await page.goto("/financials/export");
  await expect(page).not.toHaveURL(/\/financials\/export/, { timeout: 5_000 });
});
```

No skip needed. **Recommendation:** Replace the try/import skip pattern in plan 05 with a direct `loginAsRole` call.

---

## 4. Refinements (Minor Suggestions)

- **R1:** Branch naming asymmetry — plan 01 says "rename or align to `feature/76-financial-data-export`." The actual branch is `gsd/phase-76-financial-data-export`. Decide which is canonical. CLAUDE.md "Branch-per-phase rule" says `feature/{slug}`; recent merged phases (74.5.2, 75) used `gsd/phase-*`. Either pattern works but the plan should reflect the actual convention so the executor doesn't waste time renaming.
- **R2:** Wave 0 `it.todo` is closer to "test outline" than strict TDD. The `tdd="true"` flag on `<task>` blocks is misleading. Either rename the flag or change Wave 0 to write a single failing real test (smoke test asserting the helper exists) per plan, with `it.todo`s for the rest.
- **R3:** Plan 04 RTL filename-preview test (Task 4.3, "filename preview shows correct names") asserts via `getByText(/frollie-transactions-/)`. Default state uses "Last week" preset → date depends on `Date.now()` → flaky CI risk. Recommend `vi.setSystemTime(new Date("2026-05-08T00:00:00Z"))` in `beforeEach`.
- **R4:** Plan 02 task 2.3's "large range warning" test punts seeding 10,001 lines. That's actually a fine threshold to seed in convex-test (~5s overhead is OK in convex-test integration). Make the test concrete.
- **R5:** Plan 04 Generate handler runs `includeRaw` query then `includePL` query sequentially (line 412-435). The 100ms gap is needed between **downloads** (browser pop-up policy) but not between **queries**. Run the queries in parallel via `Promise.all`, then sequence the downloads with the 100ms gap. Saves ~1s on large ranges where the P&L query is the slow one.
- **R6:** Plan 05 task 5.2 UAT setup expects manual JE seeding via "/manual-journal page" — verify that route exists. If it's named differently (e.g., `/journal/new`), the UAT step is a paper cut. Quick `Glob "src/pages/*Journal*"` would confirm.

---

## 5. Duplication Analysis

### Existing Code to Leverage (correctly identified by plans)

| Existing Code | Location | How Plans Use |
|---------------|----------|---------------|
| `escapeCell` | `src/lib/csvExport.ts:723` | Reused verbatim ✓ |
| `downloadCSV` | `src/lib/csvExport.ts:732` | Reused verbatim ✓ |
| `generateIncomeStatementCSV` | `src/lib/csvExport.ts:145` | Refactored to delegate ✓ |
| `fetchAndAggregate` | `convex/reports/incomeStatement.ts:575` | Re-exported with `includePrevious` flag ✓ |
| `journalEntryLines.by_entryDate` | `convex/schema.ts:1989` | Range-scanned ✓ |
| WIB helpers | `src/lib/dateUtils.ts`, `convex/lib/periodRange.ts` | Used (mostly) ✓ |
| `requireRole` | `convex/lib/auth.ts:128` | Standard pattern ✓ |
| `<ProtectedRoute allowedRoles>` | `src/components/auth/ProtectedRoute.tsx:9` | Verified prop name ✓ |
| `loginAsManager` E2E helper | `tests/e2e/helpers.ts:115` | Used ✓ |
| `loginAsRole` E2E helper | `tests/e2e/helpers.ts:31` | **Missed** — should be used for kitchen role-gate test (see Improvement 10) |
| `WeekData` type | `convex/reports/incomeStatement.ts:74` | Not exported; should be (Improvement 5) |

### Potential Duplication Risks

- **`buildPeriodBuckets`** — duplicated across backend + frontend. See Improvement 8.
- **`WIB_OFFSET_MS`** — currently exists in two places (`dateUtils.ts:12` exported, `periodRange.ts:218` private). If both will be exported, fine; otherwise consolidate.
- **CSV header strings** — D-01 raw header (12 cols) and Phase 75 P&L header (8 cols) are repeated as literals. Acceptable since the verbatim grep is the safety net.

---

## 6. Phase/Wave Accuracy

Plans correctly model dependencies:

| Plan | Wave | Depends on | Assessment |
|------|------|------------|------------|
| 76-01 | 1 (refactor) | — | **Good** |
| 76-02 | 2 (backend) | 76-01 | **Good** — `fetchAndAggregate` export must land first |
| 76-03 | 2 (frontend helpers) | 76-01 | **Good** — `buildIncomeStatementRows` export must land first |
| 76-04 | 3 (page + route) | 76-02, 76-03 | **Good** — needs both backend queries + frontend helpers |
| 76-05 | 4 (E2E + docs) | 76-04 | **Good** |

**Ordering issues:** Plans 02 and 03 are both tagged Wave 2 with no inter-dependency. They CAN run in parallel — make this explicit in 76-02 and 76-03 frontmatter (`depends_on: ["76-01"]` only — already correct). Verify the executor doesn't serialize them needlessly.

**Missing phases:**
- No "schema export normalization" pre-wave (Improvements 1, 5). Suggest folding into plan 01 task 1.4 since plan 01 already touches `incomeStatement.ts`. Add: "Export `WeekData` type. Add `export` to `WIB_OFFSET_MS` in `convex/lib/periodRange.ts`."

---

## 7. Specialist Agent Recommendations

| Plan | Recommended Agent | Rationale |
|------|-------------------|-----------|
| 76-01 | `convex-backend` + `frontend-integrator` | Cross-tier refactor; backend exports + frontend helper extraction |
| 76-02 | `convex-backend` | Pure backend query module + integration tests |
| 76-03 | `frontend-integrator` | Pure-TypeScript helpers + Vitest tests, no UI |
| 76-04 | `react-ui-builder` | Page component + route wiring + RTL tests |
| 76-05 | `tdd-test-architect` (E2E) + `general-purpose` (docs) | Playwright spec + manual UAT + 4 docs files |

**Note:** The plans use `code-author` consistently — that's the GSD-native generic. The above mapping aligns with the repo's `.claude/agents/` specialists which usually produce higher-quality work in their domain.

---

## 8. Git Workflow Assessment

### Branch Strategy

| Assessment | Status |
|------------|--------|
| Feature branch specified | ⚠️ Implicit — `feature/76-financial-data-export` named, but actual branch is `gsd/phase-76-financial-data-export` |
| Branch naming convention | ⚠️ Mismatch with existing branch (R1) |
| Merge strategy documented | ✅ Plan 05 Task 5.4 specifies `--no-ff` merge |

### Commit Strategy

| Phase | Expected Commits | Commit Type | Notes |
|-------|------------------|-------------|-------|
| 76-01 | 4 commits (one per task) | refactor / test | Atomic ✓ |
| 76-02 | 3 commits (one per task) | feat / test | Atomic ✓ |
| 76-03 | 3 commits (one per task) | feat / test | Atomic ✓ |
| 76-04 | 3 commits (one per task) | feat / test | Atomic ✓ |
| 76-05 | 3 commits + merge | test / docs / merge | ✓ |

### Pre-Push Verification

- [x] Plan 04 includes `npm run build` (Task 4 Wave 2)
- [x] Plan 04 includes `npm run type-check`
- [ ] Plans 02/03 only run partial suites (`npx vitest run <one file>`) — should also run full `npm run test` per CLAUDE.md after every wave merge

### CI/CD Considerations

| Concern | Assessment |
|---------|------------|
| Rollback strategy | ✅ Plan 05 task 5.4 mentions `gsd-undo` implicitly via standard process |
| Deployment order | ✅ Backend first (plans 01, 02), then frontend (03, 04) — correct order |
| Data backup needed | n/a — read-only feature |
| Migration safety | ✅ Zero schema changes; zero indexes |

### Git Workflow Issues Found

- **G1:** Branch name asymmetry (R1)
- **G2:** Plans 02/03 don't run `npm run test` (full suite) before claiming done — only the targeted file. Phase 75's regression risk (especially around `fetchAndAggregate` re-export) deserves a full-suite gate per CLAUDE.md.
- **G3:** Plan 05 task 5.4 places triple-review AFTER docs sweep. Per CLAUDE.md MEMORY's `feedback_triple_review_mandatory.md`, triple-review should run on the diff between feature branch and main BEFORE the docs commits land. Suggest reordering: E2E pass → triple-review → fix Critical/Important → docs sweep → merge.

---

## 9. Documentation Checkpoints

| Phase | Documentation Update Required |
|-------|-------------------------------|
| 76-05 | CHANGELOG.md, API_REFERENCE.md, ROADMAP.md, FILE_MAP.md |

✅ All four are explicitly specified in plan 05. CLAUDE.md's "After every merge to main" mandate is satisfied.

⚠️ **Missing:** No update to `docs/SCHEMA.md` is needed (no schema changes), so its absence is correct.

⚠️ **Possible addition:** Plan 02 task 1.4 modifies `convex/reports/incomeStatement.ts` (adds `includePrevious` parameter). If `docs/API_REFERENCE.md` documents `fetchAndAggregate` signature, that needs updating too — verify by grepping API_REFERENCE before plan 05 runs.

### CHANGELOG.md Entry (Draft from Plan 05 — looks good)

The draft in plan 05 task 5.3 is comprehensive: Added (FIN-03/FIN-04), Changed (refactor notes), Tests, Security (T-76-01..03), Schema (none). No revisions needed.

---

## 10. Testing Plan Assessment

**Overall Testing Verdict:** Adequate (with refinements)

### Planned Tests

| Layer | What's Tested | Test Type | Status |
|-------|---------------|-----------|--------|
| Backend `getRawTransactionsExport` | range bounds, role gate, reversal inclusion, debit/credit mutex, ordering, empty range | convex-test | ✅ Planned (76-02 task 2.3) |
| Backend `getMultiPeriodPLExport` | COGS override regression (D-07) | convex-test | ✅ Planned |
| Backend `getExportPreflight` | journalLineCount, isLargeRange | convex-test | ⚠️ `isLargeRange` test punted on 10k seeding (R4) |
| Frontend `buildPeriodBuckets` | weekly/monthly/custom + edge cases | Vitest unit | ✅ Planned |
| Frontend `buildExportFilenames` | template match, periodEnd-1, no path separators | Vitest unit | ✅ Planned |
| Frontend `presetToRange` | last-week, last-month, last-quarter, ytd | Vitest unit | ✅ Planned |
| Frontend `generateRawTransactionsCSV` | escapeCell, integer rupiah | Vitest unit | ✅ Planned |
| Frontend `generateMultiPeriodPLCSV` | first-period delta empty, footer-once | Vitest unit | ✅ Planned |
| Page `FinancialExportPage` | granularity hidden, validation tooltip, filename preview, loading state | RTL | ✅ Planned (R3 flakiness risk) |
| E2E happy-path | navigate → form → Generate → download | Playwright | ✅ Planned |
| E2E role-gate redirect | kitchen redirected | Playwright | ⚠️ Skip-able (Improvement 10) |
| Manual UAT — Excel/Sheets | formula injection, IDR integer, filename WIB | UAT.md | ✅ Planned |

### Missing Test Coverage (Should Add)

| # | Missing Test | Why It Matters | Suggested Approach |
|---|--------------|----------------|-------------------|
| M1 | `aggregateRangeGap` field-by-field correctness | D-08 footer must include actual gap data, not zeros (Critical 3) | Seed P&L with known unmapped products; assert footer includes them |
| M2 | `WIB_OFFSET_MS` import test | Catch Critical 1 at compile time | TypeScript build is the test — but plan 02 acceptance grep should add `! grep "Cannot find name 'WIB_OFFSET_MS'"` |
| M3 | Year-boundary `buildPeriodBuckets` (Dec 28 → Jan 4) | Edge case mentioned in Edge Cases #2 but only `it.todo` in stub | Plan 03 Task 3.3 lists this as a behavior; ensure it lands as a real test |
| M4 | `presetToRange` semantic correctness vs UI label | "Last week" interpretation (Improvement 9) | Pin the chosen semantics with a test |
| M5 | RTL: granularity defaults to weekly when P&L re-checked | Edge case for state-reset semantics | Render → uncheck P&L → re-check P&L → assert weekly selected |
| M6 | E2E: filename WIB date matches user selection | Pitfall #4 mentioned in RESEARCH | Pick `2026-04-13` to `2026-04-19` in date inputs; assert filename `20260413-20260419` |

### Test Execution Checkpoints

✅ Plan 04 Wave 2 runs: `npm run type-check`, `npm run lint`, `npm run build`, `npx vitest run src/pages/__tests__/FinancialExportPage.test.tsx`.
⚠️ Plans 02/03 only run targeted vitest. **Recommend** they add full `npm run test` to Wave 2 to catch regressions in upstream `csvExport.test.ts` and any ancillary tests touched by the refactor.

### Regression Risk

- `csvExport.test.ts` (verified to exist) MUST stay green after plan 01 task 1.3 refactors `generateIncomeStatementCSV`. Plan 01 acceptance does include this check ✓.
- `incomeStatement-capex.test.ts` MUST stay green after plan 01 task 1.4's `fetchAndAggregate` re-export ✓.
- Phase 75 D-16 introduced FCF / depreciation rows in P&L; plan 01's row-builder extraction must preserve every push from the current ~600-line block. Snapshot test recommended.

---

## 11. Edge Cases to Address

The plans handle most edge cases (RESEARCH §"Edge Cases & Landmines" enumerates 20). Verify:

- [x] Empty date range
- [x] Date range spanning year boundary
- [x] Indonesia DST (n/a)
- [x] JE description with `=`/`,`/`"`
- [ ] Very large range (>10k lines) — plan 02 task 2.3 punts the actual >10k test (R4)
- [x] User changes role mid-session (server-side `requireRole` re-checks)
- [x] Multiple rapid Generate clicks (button disabled while generating)
- [ ] Browser pop-up blocker on multi-file download — UAT step 9 covers Chrome/Firefox/Safari but no automated coverage
- [x] Deleted user → `<unknown>` in `created_by`
- [x] Empty/whitespace description
- [x] Manual JE with no `sourceId`
- [x] `entryDate` vs `journalEntries.date` drift — out of scope (correct call)
- [x] First bucket no prev → `firstInRange=true` flag
- [x] Single-period range with weekly granularity
- [x] Only-one-type checked
- [x] `_creationTime` debit-credit ordering tiebreaker
- [x] Excessive preflight queries (debounce — but see Improvement 4)
- [x] Partial month bucket at range start

---

## 12. Approval Conditions

**Before implementation, address:**
1. **Critical 1** — Export `WIB_OFFSET_MS` from `convex/lib/periodRange.ts` (or eliminate the import). Add to plan 01 task 1.4 acceptance.
2. **Critical 2** — Lock the `buildIncomeStatementRows` signature contract between plans 01 and 03. Recommend dropping the `deltas` argument and computing internally.
3. **Critical 3** — Verify `WeekData` field names; type `aggregateRangeGap` parameter against the real type (not `any`). Export `WeekData` from plan 01.

**Strongly recommended before merge:**
4. **Improvement 4** — Replace `useDeferredValue` with a real debounce. Add explicit acceptance check.
5. **Improvement 7** — Fix empty-Raw-with-both-checked silent partial download UX.
6. **Improvement 8** — Consolidate `buildPeriodBuckets` to a single shared file (recommend `convex/lib/periodBuckets.ts`).
7. **Improvement 9** — Lock "Last week" preset semantics. UAT covers this implicitly but the plan should be explicit.
8. **Improvement 10** — Use `loginAsRole(page, "kitchen")` directly in plan 05's role-gate test.

**Optional refinements (R1-R6):** address opportunistically.

---

## Summary Checklist for Plan Author

Before kicking off execution, fold these into the PLAN files:

- [ ] Plan 01 task 1.4: add `export` to `WIB_OFFSET_MS` in `convex/lib/periodRange.ts` AND export `WeekData` type from `convex/reports/incomeStatement.ts`
- [ ] Plan 01 task 1.3: drop `deltas` parameter from `buildIncomeStatementRows`; compute deltas inside the helper
- [ ] Plan 02 task 2.2: import path for shared `buildPeriodBuckets` (move to `convex/lib/periodBuckets.ts`)
- [ ] Plan 02 task 2.2: implement `formatWeekLabel`/`formatMonthLabel` in plan body, not punt to executor
- [ ] Plan 02 task 2.2: type `aggregateRangeGap` against real `WeekData`; enumerate actual gap fields
- [ ] Plan 02 task 2.3: seed actual >10k lines in `large range warning` test (or document why a smaller threshold is sufficient)
- [ ] Plan 03 task 3.1: lock "Last week" preset semantics — pick one (recommend prior ISO week) and write the test for it
- [ ] Plan 03 task 3.1: import `buildPeriodBuckets` from shared `convex/lib/periodBuckets.ts`; remove duplicate
- [ ] Plan 03 task 3.2: import `WeekData` type from `convex/reports/incomeStatement` (now exported); replace `current: any`
- [ ] Plan 04 task 4.1: replace `useDeferredValue` with real debounce hook; add acceptance grep
- [ ] Plan 04 task 4.1: fix empty-Raw silent-skip UX in Generate handler
- [ ] Plan 04 task 4.1: parallelize the two queries with `Promise.all`; only sequence the downloads with 100ms gap
- [ ] Plan 04 task 4.3: use `vi.setSystemTime` for deterministic filename test
- [ ] Plan 05 task 5.1: import `loginAsRole` and use it for kitchen role-gate test (drop the skip pattern)
- [ ] Plan 05 task 5.4: re-order — triple-review BEFORE docs sweep; merge AFTER both
- [ ] Plans 02 + 03: add full `npm run test` to Wave 2 verification (not just the targeted file)
- [ ] Branch name: align plan text with actual branch (`gsd/phase-76-financial-data-export`)

---

*Generated by /staffreview skill — 2026-05-08*
*Reviewers: Staff Developer (Implementation focus) + Principal Developer (Architecture focus)*
