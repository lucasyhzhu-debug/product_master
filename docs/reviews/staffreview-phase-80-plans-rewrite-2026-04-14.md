# Staff Review: Phase 80 — Unit Economics Analytics Dashboard (GSD-native plan rewrite)

**Date:** 2026-04-14
**Plans:**
- `.planning/phases/80-unit-economics-analytics-dashboard/80-01-PLAN.md` (Wave 1 Backend — 9 tasks)
- `.planning/phases/80-unit-economics-analytics-dashboard/80-02-PLAN.md` (Wave 2 Frontend — 6 tasks)
- `.planning/phases/80-unit-economics-analytics-dashboard/80-03-PLAN.md` (Wave 3 Verification — 5 tasks)
**Reviewers:** Staff Developer (Implementation) + Principal Developer (Architecture)
**Prior review absorbed:** `docs/reviews/staffreview-unit-economics-analytics-dashboard-2026-04-13.md` (all 4 critical issues closed in addendum and re-reflected here)

---

## 0. Plan Structure Validation

All 4 mandatory CLAUDE.md sections are present across the three plans (distributed, not collocated, which is correct for wave-split GSD format):

| Section | Location | Status |
|---|---|---|
| Git Workflow (branch + checkpoints) | 80-CONTEXT.md line 144 (`gsd/phase-80-unit-economics-analytics-dashboard`, squash-merge) + commits per task in each plan | Present |
| Implementation Waves | 80-01 (Wave 1 SEQUENTIAL), 80-02 (Wave 2 parallelisable), 80-03 (Wave 3 SEQUENTIAL) | Present |
| Documentation Updates | 80-03 Task 4 (CHANGELOG, API_REFERENCE, ROADMAP, CLAUDE.md) | Present (see Critical Issue #1 re: SCHEMA.md gap) |
| Success Criteria | Each plan has its own `<success_criteria>` block + `<verification>` | Present |

Plan structure is adequate. No additions required. Proceed to full review.

---

## 1. Summary

**Overall Assessment:** **Approve with 1 Critical Fix + 3 Improvements**

The plan rewrite is high quality and an order-of-magnitude improvement over what the original prior review was reviewing. Every critical issue from the 2026-04-13 staff review is closed in concrete, grep-verifiable acceptance criteria: (1) index-bounded loader with explicit `.collect()` ban via grep=0, (2) `lineTotal`-derived revenue helpers with `it.quantity * it.unitPrice` forbidden via grep=0, (3) T1.6 dispatchPlanner migration with backward-compat preserved and `ct.code === "BIG_BALL"` forbidden via grep=0, (4) three frontend smoke tests with `tests/frontend/` explicit `git add` step. Critical Rule §3 is enforced mechanically — `grep BIG_BALL|MID_BALL|HAZELNUT` on the helper module is gated at 0. Wave dependencies are correct. Task-level read_first + action + acceptance structure is exemplary.

One documentation gap (docs/SCHEMA.md omitted despite schema change) is the only Critical item. Three improvements would strengthen execution guidance. The "delegate heavy code to canonical via read_first" pattern is appropriate here — the canonical plan is an already-vetted, 1-day-old artifact; duplicating 2000 lines into GSD plans would risk drift without benefit.

---

## 2. Critical Issues (Must Fix)

| # | Issue | Category | Location in Plan |
|---|---|---|---|
| 1 | `docs/SCHEMA.md` update missing despite adding 2 new indexes on orders table | Documentation | 80-03 Task 4 |

### Issue 1: SCHEMA.md update omitted

**Problem.** 80-01 Task 2 adds `by_completed_at` and `by_order_date` indexes on the `orders` table — a real schema change. CLAUDE.md Git Workflow explicitly requires: *"Also update `docs/SCHEMA.md` if schema changed"*. 80-03 Task 4 (Documentation Updates) covers CHANGELOG, API_REFERENCE, ROADMAP, and CLAUDE.md Quick File Finder — but not SCHEMA.md. If SCHEMA.md is the authoritative index list for the orders table, it will go stale on merge.

**Recommendation.** Extend 80-03 Task 4 Step 2 (or add Step 3.5) to update `docs/SCHEMA.md`:

1. Read the orders-table section of SCHEMA.md.
2. Append entries for the two new indexes:
   - `by_completed_at (["completedAt"])` — "Analytics/reporting: bounded date-range scans on completion timestamp. Added Phase 80."
   - `by_order_date (["orderDate"])` — "Analytics legacy fallback: orders that never reached a terminal status lack `completedAt`. Added Phase 80."
3. Add the artifact to `files_modified` in the 80-03 front-matter.
4. Add an acceptance criterion: `grep -E "by_completed_at|by_order_date" docs/SCHEMA.md` returns ≥2 hits.

**Severity:** Critical because it violates an explicit project rule that was called out in the prior staff review as part of the "Documentation" heading. Easy fix (~10 lines of markdown).

---

## 3. Improvements (Recommended)

| # | Improvement | Impact | Effort |
|---|---|---|---|
| 1 | Make `orderById` usage explicit in Tasks 5-9 action blocks | Medium | Low |
| 2 | Add npm ls xlsx-like safety check — confirm node_modules populated before Wave 3 | Medium | Low |
| 3 | Soften Task 5 loader verification acceptance (heuristic grep with OR) | Low | Low |

### Improvement 1: Make `orderById` usage explicit in Tasks 5-9

**Problem.** 80-01 Task 4 correctly builds `orderById: Map<string, Doc<"orders">>` inside `loadFilteredData`. Tasks 5-9 (byWeekday, dayHourHeatmap, channelEconomics, volumeByType, unitsPerTxnByChannel, aovByChannel, skuPareto, skuChannelMatrix, channelMomentum, rollingTrend) all need to resolve each item back to its order to get `channel` / `completedAt`. The plans say "look up its order" but don't explicitly hint to use `orderById.get(it.orderId as string)`. Executor will figure it out, but an inattentive executor could re-query `ctx.db.get(it.orderId)` per item — N+1 anti-pattern.

**Recommendation.** Add one line to each of Tasks 5-9 `<action>`: *"Use `orderById.get(it.orderId as string)` from the loader's return — do NOT call `ctx.db.get(it.orderId)` per item (N+1)."*

Or add a single global note at the top of 80-01-PLAN: *"All queries downstream of `loadFilteredData` MUST access orders via the returned `orderById` map, not via `ctx.db.get`."*

**Impact:** Closes an N+1 risk. Medium impact (Convex charges per read; 5000 items × 11 queries × extra read = measurable). Low effort.

### Improvement 2: Pre-verify node_modules populated in main tree

**Problem.** MEMORY.md lesson `lessons_phase_72_triple_review.md` notes: *"worktree executors don't populate main tree's node_modules"*. Phase 80 spans 3 GSD plans executed sequentially — if a worktree is used for one wave and the next wave runs in the main tree, `npm run build` in Task 3 of 80-03 could fail with missing deps. The plans don't include a guard step.

**Recommendation.** Add Step 0 to 80-03 Task 3:
```bash
test -f node_modules/.package-lock.json || npm install
npm ls xlsx 2>/dev/null | grep -q "0.20.3" || echo "WARN: xlsx not at 0.20.3 — see CLAUDE.md Pitfall #15"
```

This is defensive but cheap insurance. **Not strictly required if all waves run in the main tree.** Flag as optional.

**Impact:** Medium — avoids a stuck-at-build-time failure. Low effort.

### Improvement 3: Soften the `"o.completedAt !== undefined"` grep — allow OR form

**Problem.** 80-01 Task 4 acceptance says: *"grep -E "it\\.completedAt !== undefined" ... returns ≥1 hit OR grep -E "o\\.completedAt !== undefined" ... returns ≥1 hit"*. The addendum code uses `o.completedAt !== undefined` (line 261 of addendum). The `it.` alternative is wrong (dedup is on orders, not items). Harmless as currently written (OR passes), but the `it.` alternative would grep-pass a wrong implementation if an executor mis-coded it on items.

**Recommendation.** Change to: `grep -E "o\.completedAt !== undefined" convex/reports/unitEconomics.ts` returns ≥1 hit. Drop the `it.` alternative — it cannot be correct.

**Impact:** Low (tightens a safety grep). Low effort (1-line edit).

---

## 4. Refinements (Minor Suggestions)

- **80-01 Task 3 Step 2**: The replacement block assumes the variable names `dayPlans`, `orderProductQty`, `plan.plannedQty` match the current dispatchPlanner file. Plan says "adapt only if the local names differ". Consider having executor first `grep -n "dayPlans\|orderProductQty" convex/dispatchPlanner/queries.ts` as a pre-flight check and print the names. Makes the adaptation step more verifiable.
- **80-02 Task 1**: Filter context debounce is guarded by an OR grep `(useDeferredValue|setTimeout|debounce)` — covers all acceptable implementations. Good defensive grep.
- **80-02 Task 5**: `ChannelSparklineTable.tsx` acceptance `grep -E "^.*\bdata\.map\(" ... returns 0 hits` has a regex wart — the `^.*` is redundant. `grep -E "\bdata\.map\("` is cleaner. Cosmetic.
- **80-02 Task 6 Step 5**: Smoke test via `npm run dev` is marked optional ("skip if env doesn't support") — reasonable. Consider adding `npm run build && grep AnalyticsDashboard dist/assets/*.js` as a pure-build smoke alternative.
- **80-03 Task 1 Step 2**: Test 10 scaffold-adaptation is necessary but puts real execution risk on the executor (query signature discovery at test time). Consider having planner pre-research and include `getProductionRequirements` signature in read_first. A quick grep for "export const getProductionRequirements" in dispatchPlanner/queries.ts would collapse this uncertainty.
- **80-03 Task 4 CHANGELOG entry**: Draft entry uses "— " (em-dash) punctuation consistent with existing CHANGELOG style. Good.
- **80-03 Task 5 PR body**: Mentions "9 backend integration tests" but the test count is 10 (9 unitEconomics + 1 dispatchPlanner). Off-by-one in PR body text. Cosmetic.
- **80-02 Task 6**: Route is added via "copy the exact pattern from SalesAnalytics route" — good reuse pattern. Consider having executor `grep -n "SalesAnalytics" src/App.tsx` and paste the 3-5 lines into the plan-summary to document what was copied.

---

## 5. Duplication Analysis

### Existing Code Leveraged (Excellent)

| Existing Code | Location | Reuse Pattern |
|---|---|---|
| `getWibComponents(ts)` | `convex/lib/periodRange.ts` | Used for `jakartaMondayIndex` + `jakartaHour` + `bucketKey` — no inline offset math |
| `PALETTE` + `getPlatformPalette(key)` | `src/lib/platformColors.ts` | Extended (additively) with 8 display-channel aggregates; all channel-colored widgets consume it |
| `by_order` index on orderItems | `convex/schema.ts` | Reused for per-order item fetch — no new index |
| `ProtectedRoute` wrapper | `src/components/auth/` | Reused for `/analytics` route |
| `lazyWithPreload` + `ChunkErrorBoundary` | `src/App.tsx` | Reused (explicit "copy from SalesAnalytics" pattern) |
| `PageHeader` | `src/components/layout/` | Reused on AnalyticsDashboard page |
| `formatCurrency` | `src/lib/utils.ts` | Reused in KPI tiles + chart tooltips |
| shadcn `Card`/`Popover`/`Calendar` | `src/components/ui/` | Reused for filter bar + widget cards |
| vitest + `@testing-library/react` + jsdom | `vitest.config.ts`, `tests/setup.ts` | Reused infra; NO new config needed (verified tests/**/*.test.tsx in include glob) |
| `convex-test` pattern | `tests/convex/*.test.ts` | Reused for integration tests |

### Duplication Risks Avoided (Good)

- `CHANNEL_COLORS` inline records — explicitly banned, replaced with `getPlatformPalette`
- Manual `quantity * unitPrice - discountAmount` — explicitly banned, replaced with `itemGrossRevenue`/`itemNetRevenue`/`itemDiscount`
- Inline `new Date(ts + 7*60*60*1000)` timezone offset — explicitly banned, replaced with `getWibComponents`
- Inline `BIG_BALL`/`MID_BALL` equality checks — explicitly banned (grep=0 acceptance)

### The "Delegate to Canonical via read_first" Pattern — Appropriate

The plans reference `docs/superpowers/plans/2026-04-13-unit-economics-analytics-dashboard.md` and `-ADDENDUM.md` heavily via `<read_first>` rather than duplicating the 2000 lines of code into the GSD plans. **This is correct for Phase 80 specifically** because:

1. The canonical is a 1-day-old, vetted, stable artifact.
2. Duplicating it risks drift (e.g., the addendum's REVISED `loadFilteredData` vs. the original plan's version — plans correctly flag the revised version as authoritative).
3. GSD plans add value via: wave sequencing, grep-verifiable acceptance, deviation notes (11-literal channel union, canAccessDashboard, etc.), and dispatchPlanner scaffold adaptation instructions — all things NOT in the canonical.
4. The plans surface the TWO corrections from RESEARCH.md (11-literal channel union, `canAccessDashboard` vs `canAccessSalesAnalytics`) that the canonical plan got subtly wrong.

**Caveat (not a change request):** If the canonical is deleted or substantially rewritten after plans are approved but before execution runs, the read_first pointers would break. Low risk since both docs are in the same repo and GSD commits plans together.

---

## 6. Phase/Wave Accuracy

| Plan / Wave | Assessment | Notes |
|---|---|---|
| 80-01 Wave 1 Backend (9 tasks, SEQUENTIAL) | Good | Tasks 2-9 all append to `convex/reports/unitEconomics.ts` — sequential is correct, parallel would race on same file |
| 80-02 Wave 2 Frontend (6 tasks, parallelisable within) | Good | Widgets have no file overlap; hooks file is Task 2 before any widgets (correct dependency) |
| 80-03 Wave 3 Verification (5 tasks, SEQUENTIAL) | Good | Tests before quality gate before docs before PR — correct ordering |

### Ordering Issues
None critical. Minor:
- **80-01 Task 2 before Task 4**: Index addition + `npx convex dev --once` regen must complete before Task 4 references `withIndex("by_completed_at", ...)`. Plan 80-01 Task 2 Step 2 explicitly runs the regen. Good.
- **80-01 Task 3 (T1.6 dispatchPlanner)** could run in parallel with Tasks 4-9 (different file, helper-only dependency on Task 1). Plans keep it sequential (Task 3) — not wrong, just slightly slower. No change needed.
- **80-02 Task 2 hooks** must come before Tasks 3-5 widgets. Plan respects this (Task 2 = hooks, Tasks 3-5 = widgets). Good.

### Missing Phases
None. The 3-wave split is the right grain.

---

## 7. Specialist Agent Recommendations

| Wave | Recommended Agent | Rationale |
|---|---|---|
| 80-01 (Wave 1 Backend) | `convex-backend` | Helper files + schema change + query file — core Convex territory |
| 80-02 (Wave 2 Frontend) | `react-ui-builder` | 13 widgets + page + routing + nav — pure React/Recharts work |
| 80-03 Tasks 1-2 (tests) | `convex-backend` (backend tests) + `react-ui-builder` (frontend tests) | Test authoring benefits from the agent that wrote the code |
| 80-03 Task 3 (quality gate) | `code-auditor` | Type check + lint + build + test is the auditor's core job |
| 80-03 Tasks 4-5 (docs + PR) | Bash + manual | No code reasoning needed |

**Note:** 80-CONTEXT.md already specifies these agent recommendations. Execution should follow.

---

## 8. Git Workflow Assessment

### Branch Strategy
| Assessment | Status |
|---|---|
| Feature branch specified | Yes — `gsd/phase-80-unit-economics-analytics-dashboard` (in 80-CONTEXT.md and 80-03 Task 5) |
| Branch naming convention | Correct — GSD convention `gsd/phase-N-slug` |
| Merge strategy documented | Yes — squash-merge per 80-03 Task 5 Step 3 and addendum T16 Step 8 |

### Commit Strategy
| Plan | Expected Commits | Types | Atomic? |
|---|---|---|---|
| 80-01 | 9 commits | feat(analytics), refactor(dispatchPlanner) | Yes — one per file group |
| 80-02 | 6 commits | feat(analytics) | Yes — one per widget cluster |
| 80-03 | 4-5 commits | test(analytics), fix(analytics) (optional), docs(analytics) | Yes |

**Total: ~18-20 commits on phase branch, squash-merged to 1 commit on main.**

### Recommended Commit Checkpoints — All Present
1. Helpers + indexes + dispatchPlanner migration (Wave 1 Tasks 1-3)
2. Each query append (Wave 1 Tasks 4-9 — 6 commits)
3. Filter context + hooks (Wave 2 Tasks 1-2 — 2 commits)
4. Widget clusters (Wave 2 Tasks 3-5 — 3 commits)
5. Page + routing + nav (Wave 2 Task 6 — 1 commit)
6. Backend tests (Wave 3 Task 1 — 1 commit)
7. Frontend tests (Wave 3 Task 2 — 1 commit)
8. Optional fix commit (Wave 3 Task 3 — 0-1 commits)
9. Docs (Wave 3 Task 4 — 1 commit)

### Pre-Push Verification
- [x] `npm run type-check` — 80-03 Task 3 Step 1
- [x] `npm run build` — 80-03 Task 3 Step 4
- [x] `npm run test` (full suite) — 80-03 Task 3 Step 3
- [x] `npm run lint` — 80-03 Task 3 Step 2

### CI/CD Considerations
| Concern | Assessment |
|---|---|
| Rollback strategy | Good — squash-merge = 1 commit to revert. `git revert <squash-commit>` restores pre-phase state |
| Deployment order | Correct — schema change (indexes) lands in same Convex deploy as queries that use them. Convex deploys atomically on push to main |
| Data backup needed | No — read-only additions, no data mutations |
| Migration safety | Safe — new indexes populate in background on Convex; do NOT break existing queries |
| Feature flag? | Not needed — route is permission-gated to manager+admin; internal audience can tolerate bugs |

### Git Workflow Issues Found
None critical. One minor: 80-03 Task 3 Step 5 says "If Steps 1-4 required fixes, commit them" with `git add -A` — the `-A` flag is broad; prefer `git add <specific-files>` per CLAUDE.md git safety protocol. Low risk because this is inside the phase branch, but cleaner to list files.

---

## 9. Documentation Checkpoints

| Doc | Update Required | Covered? |
|---|---|---|
| `docs/CHANGELOG.md` | Phase 80 entry under Added | Yes — 80-03 Task 4 Step 1 |
| `docs/API_REFERENCE.md` | "Reports: Unit Economics" section with 11-query table | Yes — 80-03 Task 4 Step 2 |
| `docs/ROADMAP.md` | Phase 80 checkbox + Complete status | Yes — 80-03 Task 4 Step 3 |
| `CLAUDE.md` Quick File Finder | "Unit economics analytics" row | Yes — 80-03 Task 4 Step 4 |
| **`docs/SCHEMA.md`** | **Two new orders indexes** | **NO — Critical Issue #1** |
| `docs/CODE_STYLE.md` | No changes needed | N/A |
| `docs/WORKFLOW.md` | No changes needed | N/A |

### CHANGELOG.md Entry (Draft — already in plan)
The plan's draft is good. Matches existing format. Calls out the four baked-in critical fixes from prior staff review.

---

## 10. Testing Plan Assessment

**Overall Testing Verdict:** **Adequate**

### Planned Tests

| Layer | What's Tested | Test Type | Status |
|---|---|---|---|
| Backend | kpiSummary Hazelnut regression | convex-test integration | Planned (80-03 T1 Test 1) — **Critical Rule §3 guard** |
| Backend | Draft/Cancelled exclusion | convex-test integration | Planned (T1 Test 2) |
| Backend | WoW delta +100% | convex-test integration | Planned (T1 Test 3) |
| Backend | Channel filter restricts aggregation | convex-test integration | Planned (T1 Test 4) |
| Backend | byWeekday Jakarta-local Monday | convex-test integration | Planned (T1 Test 5) |
| Backend | volumeByType HAZELNUT_REGULAR series | convex-test integration | Planned (T1 Test 6) |
| Backend | channelEconomics takePct math | convex-test integration | Planned (T1 Test 7) |
| Backend | skuPareto Other + monotonic cumulativePct | convex-test integration | Planned (T1 Test 8) |
| Backend | rollingTrend 7d simple moving avg | convex-test integration | Planned (T1 Test 9) |
| Backend | dispatchPlanner unitsByType.HAZELNUT_REGULAR | convex-test regression | Planned (T1 Test 10) — **T1.6 guard** |
| Frontend | KpiRow skeleton + render + null-delta em-dash | vitest + RTL + vi.mock | Planned (80-03 T2 Test 1) |
| Frontend | AnalyticsFilterBar URL sync on 7d preset | vitest + RTL + MemoryRouter | Planned (T2 Test 2) |
| Frontend | WeekdayDualAxisChart SVG render + skeleton | vitest + RTL + vi.mock | Planned (T2 Test 3) |

### Test Coverage Assessment
- **Happy path:** Covered (KPI with Hazelnut, byWeekday Monday, etc.)
- **Error/edge cases:** Draft/Cancelled exclusion (Test 2), WoW with prior=0 would be null — not explicitly tested but T3 tests +100% case. Consider adding an explicit prior=0 → null delta test.
- **Regression guards:** Hazelnut appearance in kpiSummary (Test 1) + volumeByType (Test 6) + dispatchPlanner (Test 10). These three tests form a safety net for Critical Rule §3.
- **Performance:** No explicit benchmark test. Index-bounded scan correctness is verified structurally (grep-forbidden full-table scans), not via timing.
- **Security:** Route-level permission gate is verified in plan-02 acceptance via `canAccessDashboard` grep. No backend auth test — matches existing analytics pattern (route-gated, not query-gated).

### Missing Test Coverage
Small gap (Refinement, not blocker):

| # | Missing Test | Why It Matters | Suggested Approach |
|---|---|---|---|
| 1 | WoW delta when prior=0 → null | Frontend renders "—" for null; backend test for null boundary | Add as Test 3.1 in 80-03 T1: seed only current-period order, assert `delta.units === null` |
| 2 | URL params malformed (`from=abc`) fallback | Plan-02 Task 1 acceptance requires `Number.isFinite` guard but no runtime test | Add as Test 2.1 in 80-03 T2: MemoryRouter `/analytics?from=abc&to=xyz` → provider initialises with defaults, no throw |

Both are nice-to-haves. Current 13 tests cover the critical risks.

### Regression Risk
- **dispatchPlanner consumers** (5 UI files per RESEARCH line 104): backward-compat is asserted in Test 10 via `typeof result.bigBalls === "number"` / `typeof result.midBalls === "number"`. 
- **No existing tests break** — no changes to `convex/orders/`, `convex/inventory/`, etc. Phase 80 is purely additive.

---

## 11. Edge Cases to Address

The plan already addresses most edge cases explicitly. Confirmed coverage:

- [x] Null `completedAt` — `by_order_date` legacy fallback with dedup
- [x] Empty channels array — `channels: f.channels.length ? f.channels : undefined` in buildArgs (treated as "all")
- [x] Malformed URL params — `Number.isFinite` guard (80-02 Task 1)
- [x] Products with no BOM — `unitsForOrderItem` returns 0 via `Map.get ?? 0`
- [x] WoW delta prior=0 — `deltaPct` returns null, KPI renders em-dash
- [x] Pareto with exactly topN SKUs — "Other" row with cumulativePct=100 (tested)
- [x] Recharts dual-axis — verified supported (RESEARCH Gotcha #5)
- [x] DayHourHeatmap fragment key — addendum fix applied (80-02 Task 3 acceptance)
- [x] Calendar continuous input flooding Convex — debounced (80-02 Task 1 acceptance)
- [x] fromTs >= toTs — loader returns empty immediately

Remaining unaddressed edges (minor):
- [ ] Very long date ranges (5+ years) — loader will still scan, just slower. RESEARCH recommends UI warning chip; plan defers to v2. Acceptable.
- [ ] Hazelnut componentType absent in prod — widgets degrade gracefully (empty series). Follow-up seed noted in 80-03 output requirements.
- [ ] Permission mismatch: route uses `canAccessDashboard` but the existing "Sales" link uses `canAccessSalesAnalytics` — users who can access Sales but NOT Dashboard will see the Sales nav entry but not the new Analytics entry. Correct per spec (stricter), but could confuse users. Not a plan issue — plan correctly notes the distinction.

---

## 12. Approval Conditions

### For Approval, address:
1. **Critical Issue #1** — Add `docs/SCHEMA.md` update to 80-03 Task 4 (new orders indexes documentation). ~10 lines of markdown.

### Recommended before implementation:
1. **Improvement #1** — Add one-line hint in Tasks 5-9 action blocks: "use `orderById` map from loader, not `ctx.db.get` per item" (avoids N+1 risk).
2. **Improvement #3** — Remove the `it.completedAt !== undefined` alternative from 80-01 Task 4 acceptance; only `o.completedAt !== undefined` is correct.

### Optional (executor discretion):
- Improvement #2 (node_modules safety check)
- Refinement suggestions (see Section 4)

### Execution-ready signal:
Once the SCHEMA.md gap is closed, the plan set is **approved for execution**. Recommend the `convex-backend` agent for Wave 1, `react-ui-builder` for Wave 2, and a mix of backend/frontend agents + `code-auditor` + Bash for Wave 3 per 80-CONTEXT.md guidance.

---

## Reviewer Notes

### What the plan rewrite does exceptionally well
1. **Critical Rule §3 is mechanically enforced.** `grep -E "BIG_BALL|MID_BALL|HAZELNUT"` in the helper module returns 0. `grep -cE "ct\.code === \"(BIG_BALL|MID_BALL)\""` in dispatchPlanner returns 0. These are the two checks that matter, and they're baked into acceptance criteria.
2. **Backward-compat preserved carefully.** Plan 80-01 Task 3 Step 2 returns both `{bigBalls, midBalls}` (via `unitsByType[CODE] ?? 0` lookup) AND the new `unitsByType` record. No consumer breakage. The acceptance criteria distinguish "equality checks forbidden" from "field name allowed" — precise.
3. **Performance is structurally enforced.** `ctx.db.query("orders").collect` banned via grep=0 in the query file. `withIndex("by_completed_at"|"by_order_date"|"by_order")` required via grep≥3.
4. **Test directory creation + git add is explicitly flagged.** MEMORY.md lesson "untracked files break CI deploy" is reflected in 80-03 Task 2 Step 5.
5. **Permission distinction called out.** `canAccessDashboard` vs `canAccessSalesAnalytics` is flagged 3+ times across plans and acceptance criteria.
6. **Commit-per-task granularity.** Each task has its own commit with a conventional-commits message. Bisection-friendly on the phase branch before squash.

### The "delegate to canonical via read_first" pattern — revisited
This is unusual for a GSD plan. Typically a plan inlines the code or pseudocode it's asking an executor to write. The rewritten plans point to the canonical plan/addendum for the full code blocks, using the GSD plan to add:
- Wave sequencing
- Grep-verifiable acceptance criteria
- Deviation notes (corrections to canonical)
- Commit boundaries
- Agent recommendations

**This is appropriate here** because (a) the canonical is 1 day old and won't drift, (b) duplication would invite divergence between the two artifacts, (c) the GSD plan's incremental value is in the sequencing + acceptance gates, not the code itself. Don't generalise this to other phases where the "canonical plan" is older or lives outside the repo.

### Confidence assessment
| Area | Confidence | Rationale |
|---|---|---|
| Plan correctness | HIGH | Every claim cross-referenced to live files (verified during review) |
| Executor-friendliness | HIGH | Read_first sections eliminate discovery cost; actions are concrete; accepts are grep-verifiable |
| Risk of silent bugs | LOW | Critical Rule §3 guards + WoW edge + dispatchPlanner regression collectively close the loop |
| Risk of merge blockers | LOW | Structure + docs all covered except SCHEMA.md gap |

---

*Generated by /staffreview skill*
*Staff Developer Review (implementation focus) + Principal Developer Review (architecture focus)*
