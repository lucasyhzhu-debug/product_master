# Staff Review: Phase 80.1 — Analytics Dashboard Perf & Chart Primitives Consolidation

**Date:** 2026-04-18
**Plans reviewed:**
- `.planning/phases/80.1-analytics-perf-consolidation/80.1-01-PLAN.md` (Wave A — backend)
- `.planning/phases/80.1-analytics-perf-consolidation/80.1-02-PLAN.md` (Wave B — frontend)
- `.planning/phases/80.1-analytics-perf-consolidation/80.1-03-PLAN.md` (Wave C — Nivo + cleanup + docs)

**Reviewers:** Staff Developer (implementation pragmatism) + Principal Developer (architecture + deployment safety)

**Context assumed good (already resolved by plan-checker iteration 1):** DI snapshot pattern, Precomputed widening, reducer file location, wrapper preservation contract, expanded safety grep, schema-correct seed fixtures, HUMAN-UAT timing, bundle-cap chunk-split preference, build log path. Those are NOT re-flagged.

---

## 1. Summary

**Overall Assessment:** **Revise**

The plans are structurally mature — all four mandatory sections present, 24 TDD-paced tasks, locked decisions D-01 through D-19, threat models per wave. The plan-checker revision pass closed the major foot-guns (DI, schema correctness, expanded grep). However, the plans were authored against a PRD that assumes a codebase shape that **does not match the current live `unitEconomics.ts`**. There are four Critical findings that would cause RED tests to assert against impossible shapes, make two "NEW" reducers redundant-or-contradictory with existing data, and silently reshape at least one widget's business meaning. These are not new-bug risks — they are pre-existing drift between the PRD and the actual code that neither the plan-checker nor any automated gate can catch.

Fix the four Criticals below and the phase is ready to execute. The three Improvement items raise sustainability but are not merge blockers.

---

## 2. Critical Issues (Must Fix)

| # | Issue | Category | Location in Plan |
|---|-------|----------|------------------|
| 1 | RED tests in Plan 01 Tasks 1 & 2 assert shapes that don't match the EXISTING query returns — GREEN impl cannot simultaneously preserve D-19 (wrapper shape preservation) and pass these tests | Logic / test-contract mismatch | Plan 01 Tasks 1, 2 |
| 2 | `typeMixOverTime` is listed as an existing query in 3 places (Plan 01 Task 2 Category A, Plan 01 Task 7 wrappers, Plan 03 Task 23 deletions) but it does NOT exist as a query in the current codebase — it's a CLIENT-SIDE pct transform inside `TypeMixOverTime.tsx` using `useVolumeByType("week")` | Factual error / scope | Plan 01 Tasks 2, 7; Plan 03 Task 23 |
| 3 | `reduceRevPerUnit` (NEW in Plan 01 Task 2) is product-keyed, but `RevPerUnitChart.tsx` currently consumes CHANNEL-keyed data via `useChannelEconomics()` (`r.channel`, `r.revPerUnit`, `r.gross`, `r.net`, `r.takePct`). Plan 02 Task 16 would silently change the widget from channel-bars to product-bars | Functional regression | Plan 01 Task 2; Plan 02 Task 16 |
| 4 | `UnitsByTypeStackedBars.tsx` currently shows TIME-BUCKETED stacked bars (X-axis = day bucket). Plan 02 Task 15 rewrites X-axis to `productName` — a completely different chart semantically (per-product stacked bars). The "LOCKED shape" acceptance criterion hides a scope change the user did not approve | Functional regression | Plan 01 Task 2; Plan 02 Task 15 |

**Details:**

### Critical 1: RED test shapes don't match live query shapes (Plan 01 Tasks 1 & 2)

Plan 01 Task 1 writes the RED test first:
```ts
expect(result.revenue.current).toBe(80000);
expect(result.orderCount.current).toBe(2);
expect(result.aov.current).toBe(40000);
```
So `reduceKpi` must return `{ revenue: {current, prior, delta}, orderCount: {current, prior, delta}, aov: {current, prior, delta} }`.

But the live `kpiSummary` query (convex/reports/unitEconomics.ts:425-447) returns:
```
{ current: { grossRevenue, netRevenue, discount, units, orderCount, aovGross, aovNet, revPerUnit, unitsPerTxn },
  prior:   { …same fields… },
  delta:   { netRevenue, units, aovNet, revPerUnit, orderCount, unitsPerTxn } }
```

The `KpiRow.tsx` widget consumes `data.current.netRevenue`, `data.current.aovNet`, `data.current.revPerUnit`, `data.current.units`, `data.current.orderCount`, `data.current.unitsPerTxn` and `data.delta.<same>`. `tests/frontend/analytics/KpiRow.test.tsx:25-60` mocks exactly this shape.

**Two mutually exclusive paths:**
- **Path A — follow the test:** reducer returns `{revenue, orderCount, aov}`. The thin wrapper at Plan 01 Task 7 Step 7.1 says `kpiSummary → (await kpiAndChannelSnapshot._handler(ctx, args)).kpi` — a passthrough. The wrapper would return `{revenue, orderCount, aov}` to the frontend. `KpiRow.tsx` breaks. `KpiRow.test.tsx` breaks. D-19 (wrapper preserves existing shape) is violated.
- **Path B — follow D-19:** reducer returns the live `{current, prior, delta, grossRevenue/netRevenue/...}` shape. The RED test fails as written. Plan 01 Task 1 Step 1.4 "Confirm PASS" never happens.

Similar drift across Plan 01 Task 2 RED tests:
- `reduceChannelEconomics` test asserts `result.find(r => r.channel === "DIRECT").aov` — but live `channelEconomics` returns rows with fields `{channel, orders, gross, net, discount, units, aov, revPerUnit, takePct, unitsPerTxn}`. The test happens to pick a field that exists (`aov`) but does not verify the other 8 fields the frontend depends on.
- `reduceSkuTop` test asserts ordering `[B, A, C]` by revenue desc — the live `skuPareto` handler (line 739) may sort by a different metric (e.g. `units`) or include a cumulative field. Executor must read-first before writing the RED test.
- `reduceVolumeByType` test asserts `result.buckets.length >= 2` — live `volumeByType` returns `{buckets, series}` with `series[].values[]` parallel-arrays. This one happens to match, but the test is so loose it doesn't catch shape drift.

**Recommendation:**
Rewrite Plan 01 Task 1 and Task 2 RED tests to:
1. **Read the current live handler body first** (explicit `<read_first>` already says this — make the RED test follow `executor discovers shape`, not `executor writes test to a PRD-assumed shape`).
2. Assert on the ACTUAL live-query shape fields by name. Use `toMatchObject` with the exact field list the live query returns. The test's job in this phase is to LOCK D-19 preservation, not to design a new shape.
3. Add an explicit acceptance criterion: `grep -cE 'current.netRevenue|current.orderCount|current.units' src/components/analytics/*.tsx` returns >=2, proving at least one frontend consumer's field names survive.

Alternatively, accept Path A as a deliberate shape redesign and write Plan 02 Task 18 to also migrate `KpiRow.tsx` + `KpiRow.test.tsx` + every other consumer. This turns Phase 80.1 into a breaking API change, not the "zero-downtime thin-wrapper" D-02 promises. If that is the intent, CONTEXT.md D-02 and D-19 need to be edited first.

This is the single biggest risk in the phase.

### Critical 2: `typeMixOverTime` does not exist as a query

The current codebase has 11 queries (exactly, verified by `grep -cE "^export const [a-zA-Z]+ = query" convex/reports/unitEconomics.ts` = 11). They are: `kpiSummary, byWeekday, dayHourHeatmap, channelEconomics, volumeByType, unitsPerTxnByChannel, aovByChannel, skuPareto, skuChannelMatrix, channelMomentum, rollingTrend`.

`typeMixOverTime` is NOT there. The `TypeMixOverTime.tsx` component uses `useVolumeByType("week")` and does client-side percent/absolute transform with a local `useState` toggle.

But Plan 01 Task 2 Category A says "for EACH of the 10 existing queries (…, `typeMixOverTime`, …)"; Plan 01 Task 7 includes `typeMixOverTime` in its 11-wrapper list; Plan 03 Task 23's delete-list includes `typeMixOverTime`; the expanded-safety-grep in Task 23.1 searches for the string. This is three consecutive false-anchor errors that will confuse the executor.

**Ripple effect:**
- Plan 01 Task 2 will succeed for 9 extractions and fail for `typeMixOverTime` — executor will likely either (a) create a reducer from whole cloth (contradicting "extract from existing" contract) or (b) stall.
- Plan 01 Task 7 wrapper list becomes 10 not 11; downstream grep acceptance criterion "all 11 legacy queries still registered" will not be reachable.
- Plan 03 Task 23 delete-count should be 11 not 12. The acceptance criterion loop over 12 names will pass (because none of them will still exist) but for the wrong reason.
- The filter context's `TypeMixOverTime` widget (frontend) still needs to be migrated to snapshot data, but Plan 02 Task 15 rewrites it to consume `useTypeMixOverTime(granularity)` — a hook that doesn't exist in the current useAnalytics.ts (Critical 3's flavor).

**Recommendation:**
Strike `typeMixOverTime` from the "existing queries" list in Plan 01 Tasks 2 & 7 and Plan 03 Task 23 delete-list. Instead:
- Plan 01 Task 2: Add `reduceTypeMixOverTime(current, pre, granularity)` as a CREATED reducer (bringing the Category-B-created count from 2 to 3: `reduceChannelSparklines`, `reduceRevPerUnit`, `reduceTypeMixOverTime`). Acknowledge it was previously a client-side computation we are moving server-side for D-17.
- Plan 01 Task 7: Remove `typeMixOverTime` wrapper. It didn't exist pre-phase; can't wrapper-preserve what wasn't there.
- Plan 03 Task 23: Remove `typeMixOverTime` from delete-list; update all three grep scripts.
- Plan 02 Task 15: Confirm the `useTypeMixOverTime(granularity)` hook is a NEW selector, not a rewrite — it was never in the 11 listed hooks either.

### Critical 3: `reduceRevPerUnit` would silently reshape RevPerUnitChart from channel→product

Current `RevPerUnitChart.tsx:49` consumes `useChannelEconomics()` and maps per channel: `{channel, value=r.revPerUnit, gross, net, takePct}`. The chart's title is "Revenue per unit by channel". The X-axis is channel; colors are per-channel via `getPlatformPalette(r.channel).hex`.

Plan 01 Task 2 defines `reduceRevPerUnit` as: `Array<{productName, revenuePerUnit, units, revenue}>` — per-product, sorted by revenuePerUnit desc.

Plan 02 Task 16 Step-specific note: `RevPerUnitChart: consumes useSkuSnapshot()?.revPerUnit. The Wave A reducer returns Array<{productName, revenuePerUnit, units, revenue}> (per Plan 01 Task 2 — NEW reducer). Y-axis is currency → formatCurrencyCompact. X-axis is productName (string — apply X_AXIS_STRING_LABEL_PROPS + truncateWithTooltip if names are long).`

That is a **different chart**. Revenue per unit BY CHANNEL is a take-rate comparison tool (which platform pays best per ball). Revenue per unit BY PRODUCT is a product-mix-margin tool (which product earns most per ball). The plan treats them as the same name and silently swaps them.

**Recommendation:**
Decide intent before executing. Two paths:
- **Path A — preserve existing channel-based chart:** Delete `reduceRevPerUnit` from Plan 01 Task 2 Category B. The chart stays on `useChannelEconomics` (snapshot-sourced via the selector from `kpiAndChannelSnapshot`). Remove the `skuSnapshot.revPerUnit` field from D-03. Update Plan 02 Task 16 to keep `RevPerUnitChart` consuming `useChannelEconomics()` post-migration.
- **Path B — add the new product chart:** Keep `reduceRevPerUnit` and add a new `ProductRevPerUnitChart.tsx` component. The existing channel-based widget stays. Update Plan 02 Task 16 to add-not-replace.

Path A is lower-risk and matches the phase's "perf + polish" framing. Path B is a feature addition and belongs in a separate phase.

### Critical 4: `UnitsByTypeStackedBars` — time-series → per-product reshape hidden behind "LOCKED shape" criterion

Current `UnitsByTypeStackedBars.tsx:15-16` consumes `useVolumeByType("day")` returning `{buckets, series}` where `buckets` is an array of DATE strings (daily bucket labels) and `series[].values[i]` is parallel arrays — a TIME-STACKED-BARS chart titled "Units sold by production type" with X-axis = daily bucket.

Plan 01 Task 2 says `reduceUnitsByTypeStackedBars` returns `{rows, series: Array<{code, name}>}` — no explanation of what `rows` keys are.

Plan 02 Task 15 Step 15.2 code:
```tsx
<XAxis dataKey="productName" {...X_AXIS_STRING_LABEL_PROPS} />
...
{series.map((s) => <Bar key={s.code} dataKey={s.code} name={s.name} stackId="a" ... />)}
```

So `rows[i] = { productName, BIG_BALL: N, MID_BALL: M }` — a PER-PRODUCT stacked bar showing how many Big/Mid balls each product contributed. This is a different question from "how did daily Big/Mid ball volume trend". Acceptable maybe, but the user didn't ask for it.

The plan's acceptance criterion `grep -q "data.rows" … && grep -q "data.buckets" … returns EXIT 1` enforces the shape swap but doesn't reveal the semantic swap. The PATTERNS.md "Caution — UnitsByTypeStackedBars data source change" footnote mentions it but frames it as a shape alignment, not a chart-meaning swap.

**Recommendation:**
Same fork as Critical 3:
- **Path A (preferred for perf phase):** Keep `UnitsByTypeStackedBars` on daily-buckets. Replace `useVolumeByType("day")` with the snapshot-sourced selector that preserves `{buckets, series[].values[]}` shape. Remove `unitsByTypeStackedBars` from `skuSnapshot` D-03 grouping; it stays derived from `timeSeriesSnapshot.volumeByType.day`.
- **Path B:** Treat as deliberate new chart — rename component to `UnitsByProductStackedBars` or similar, add a separate task in Plan 02 to add it and deprecate the old widget, extend CHANGELOG to call out the semantic change.

Either way, the CONTEXT.md D-03 line `skuSnapshot → { skuTop, skuChannelMatrix, revPerUnit, unitsByTypeStackedBars }` should be edited to reflect the decision.

---

## 3. Improvements (Recommended)

| # | Improvement | Impact | Effort |
|---|-------------|--------|--------|
| 1 | `reduceChannelSparklines` is redundant with existing `channelMomentum` output | Medium | Low |
| 2 | Plan 03 Task 19 Step 19.4 does not capture the pre-install baseline vendor-chunk size | Medium | Low |
| 3 | No parity/golden-file test comparing OLD wrapper output vs NEW snapshot-thru-wrapper output | High (regression safety) | Medium |
| 4 | Convex query runtime budget for `kpiAndChannelSnapshot` not measured — 2× `loadFilteredData` at 6-month prod scale is not verified against Convex handler timeout | Medium | Low |
| 5 | HUMAN-UAT item 6 (lazy-load verification) is duplicative with Plan 03 Task 22 dev-env verification; items 2 and 9 require prod volume to exercise meaningfully | Low | Low |

### Improvement 1: `reduceChannelSparklines` is redundant

`channelMomentum` already returns `channels: [{channel, revenueSpark: number[], unitsSpark: number[], aovSpark: number[], totalRevenue, priorRevenue, wowPct}]` (convex/reports/unitEconomics.ts:945-963). `ChannelSparklineTable.tsx` already consumes it.

Plan 01 Task 2 Category B creates `reduceChannelSparklines` returning `Array<{channel, series: Array<{bucketTs, revenue, units}>}>` — a different shape with the same information. No consumer is identified for this new shape. The `kpiAndChannelSnapshot` D-03 grouping already gets `channelSparklines` from this reducer but nothing in Plan 02 consumes it.

**Recommendation:** Drop `reduceChannelSparklines`. Use `reduceChannelMomentum`'s existing sparkline arrays in the `kpiAndChannelSnapshot` D-03 return as-is (already grouped). Remove the `channelSparklines` field from D-03.

### Improvement 2: Capture pre-install vendor-chunk size

Plan 03 Task 19 jumps from `npm install` straight to `npm run build` and then branches on cap-hit. There's no baseline measurement. If the cap was set at 600 kB and Nivo lands at 550+450 kB page chunk, a naive "bump by minimum" might land at 700 kB without anyone noticing the cap grew 17%.

**Recommendation:** Insert Step 19.3b: `ls -lS dist/assets/vendor-*.js | head -5` BEFORE install. Record the top two vendor chunk sizes in the commit body. After install+build, show the delta. Target: total vendor size increase ≤ 25%; flag for discussion if over.

### Improvement 3: No parity/golden-file test between OLD wrappers and NEW snapshot-thru-wrappers

D-19 says the wrappers MUST preserve field names that pre-existing frontend + tests consume. The phase relies on existing tests passing to prove this. But the existing `tests/convex/unitEconomics.test.ts` tests probably mostly call the queries and assert high-level properties — not shape deep-equals.

A single `describe("D-19 shape parity")` block in `unitEconomics.test.ts` that:
1. Seeds a known fixture
2. Calls the wrapper
3. Calls the snapshot and extracts the equivalent field
4. Asserts `expect(wrapperResult).toEqual(snapshotField)` for each of the 11 wrappers

...would give strong parity guarantees with one test addition. Cheap insurance against silent shape drift.

**Recommendation:** Add "Task 7.5 — D-19 parity test" between Plan 01 Task 7 and Task 8. Roughly 15 LOC per wrapper × 11 wrappers, but with factored helpers it's ~120 LOC total. Ensures wrapper deletion in Task 23 is provably safe.

### Improvement 4: Convex query runtime budget not measured

`kpiAndChannelSnapshot` handler runs `precomputeBomMaps` (2 table scans) + `loadFilteredData` (window of orders/items + externalRevenue) × 2 (current + prior) + 4 pure reducers. At 6 months of prod data (~50K orders plus externalRevenue rollups), this is a non-trivial handler.

Convex has a handler-duration soft limit (~1s for queries before performance degrades; 10s hard limit). The plan has no pre-flight estimate, no step to run `npx convex logs --prod` after a test query, no safety net if the snapshot is slower than the 11 wrappers were individually (each wrapper loaded less).

**Recommendation:** Add a brief check in Plan 01 Task 8 or a new Task 8.5:
1. In dev, call `kpiAndChannelSnapshot` with 6-month range against seeded fixtures that mirror prod scale (even 5K orders).
2. Time it via `console.time()` wrapped in the Impl.
3. Document the result in `80.1-01-SUMMARY.md`.
4. If the handler takes >500ms, flag to owner before merging; consider splitting `kpiAndChannelSnapshot` further or adding a `by_completedAt` index if not already present.

### Improvement 5: HUMAN-UAT items need pre-vs-post-merge triage

10 items in Plan 03 Task 24. The Wave C plan says "items 1, 4, 5, 7, 8 are dev-env-safe; 2, 3, 6, 9, 10 run post-merge on production data". But:
- Item 2 (channel filter re-render) is trivially exercisable on dev-seeded data.
- Item 3 (granularity toggle) same.
- Item 6 (lazy-load check) is ALREADY Task 22 dev verification — duplicative.
- Item 9 (mobile/narrow viewport) is exercisable on dev via browser resize — no prod dependency.
- Item 10 (DevTools accessibility contrast inspector) works on dev.

Only item 1 (filter latency on PROD volume) and perhaps item 8 (every chart tooltip readable at prod-colored data values) genuinely need post-deploy execution.

**Recommendation:** Retag the UAT: pre-merge items vs post-deploy items. Run pre-merge before PR approval. Saves a round-trip.

---

## 4. Refinements (Minor)

- Plan 01 Task 3 Step 3.0 names `orders.completedAt` as optional; the seed fixture sets it. Good. But the SCHEMA READ lists `subtotal` as "optional/absent" — that field is NOT on orders in the current schema at all (it's been renamed or never existed). Double-check and remove the stray reference.
- Plan 02 Task 15 Step 15.3 code uses `(data as any).buckets ?? (data as any).rows ?? []` fallback — that's exactly the "no fallback shapes" rule Critical 4 is enforcing on the OTHER file. Pick one stance and apply uniformly.
- Plan 03 Task 20 code block references `cell.data.x` inside the Nivo tooltip — Nivo's tooltip cell type is `ComputedCell<HeatMapDatum>` where `data.x` is the column accessor. The code spells it `String(cell.data.x)` in one place and `cell.data.x` in another. Consistency helps.
- Plan 03 Task 24 acceptance criterion `grep -qE "^- \[x\]" .planning/ROADMAP.md | head` has a shell bug — `grep | head` here is always exit 0 regardless of match. Either drop `| head` or use `grep -c "^- \[x\]" … -gt 0` semantics.
- Plan 02 Task 18 ("Sweep KpiRow + ChannelSparklineTable + TakeRateTable for defects") is intentionally vague ("apply ONLY defects"). If the executor follows Critical 1 Path B (redesign kpi shape), KpiRow requires non-trivial migration here. Task 18 should either flag "if kpi shape changed in Wave A, this task absorbs the KpiRow migration" or stay conservative with existing shape.
- Plan 01 Task 2 acceptance criterion grep uses a long regex `^export function reduce(ChannelEconomics|…)\b` — the `\b` end-anchor is fine in rg but can misbehave in bash grep on Windows. Consider using rg-explicit or simplifying to per-name greps.

---

## 5. Duplication Analysis

### Existing Code to Leverage
| Existing Code | Location | How to Use |
|---------------|----------|------------|
| `channelMomentum.channels[].revenueSpark/unitsSpark/aovSpark` | `convex/reports/unitEconomics.ts:945-963` | Drop `reduceChannelSparklines`; reuse existing momentum output for KpiRow sparkline strip. See Improvement 1. |
| `computeKpis()` | `convex/reports/unitEconomics.ts:394-423` | This IS the pure function `reduceKpi` should wrap. Plan 01 Task 1 should EXTRACT `computeKpis` (already pure) and pair it with delta computation into `reduceKpi`, not invent a new shape. |
| Time-bucket helper `bucketKey(ts, granularity)` at line 462 | `convex/reports/unitEconomics.ts:462-474` | Reused by whatever time-series reducer migrates from `volumeByType`. Already correct — don't duplicate. |
| `src/lib/platformColors.ts:getPlatformPalette` | `src/lib/platformColors.ts` | Currently used by `RevPerUnitChart`. If Critical 3 Path A is taken, preserves this usage. |

### Potential Duplication Risks
- `reduceChannelSparklines` (NEW) vs `reduceChannelMomentum` (extracted) — same data, two shapes. Pick one.
- `typeMixOverTime` logic being "extracted" when there's no query to extract from — the logic lives client-side in `TypeMixOverTime.tsx:21-29`. Port it to a reducer is FINE; calling it an extraction is confusing.
- `truncateWithTooltip(max=22)` vs existing `SkuParetoChart.truncateLabel(max=14)` — the plan changes the cutoff from 14→22. Verify this is intentional (long SKU names currently clip at 14 — visual spec uses 22). If intentional, mention in CHANGELOG.

---

## 6. Phase/Wave Accuracy

| Wave | Assessment | Notes |
|------|------------|-------|
| Wave A (Plan 01) | **Needs adjustment** | Critical 1, 2, 3, 4 all land here. Re-scope Tasks 1-2, remove `typeMixOverTime` from Task 7, add Task 7.5 parity test, add Task 8.5 runtime-budget measurement. |
| Wave B (Plan 02) | **Needs adjustment** | Task 15/16 consequences of Critical 3/4 must be reconciled before Wave B can execute. If Path A adopted, Wave B tasks simplify (no new widgets). Task 13 hook list correct-once-Wave-A-decisions-are-final. |
| Wave C (Plan 03) | **Mostly sound** | Task 22 verify-not-implement is correct. Task 23 expanded-grep is correct. Task 19 chunk split preferred — fix delete-list in Task 23 after Critical 2. |

**Ordering issues:**
- Tasks 1-9 rely on pre-written tests being RED. If Critical 1 is not fixed, the "RED-then-GREEN" rhythm breaks immediately at Task 1.

**Missing tasks:**
- Task 7.5 — D-19 shape parity test (see Improvement 3).
- Task 8.5 — Runtime budget measurement (see Improvement 4).

---

## 7. Specialist Agent Recommendations

| Wave / Task | Recommended Agent | Rationale |
|-------------|-------------------|-----------|
| Wave A Tasks 1-9 | `convex-backend` | Pure-function extraction + composite query + DI. No schema changes. |
| Wave B Tasks 10-12 | `react-ui-builder` | Primitive library creation. Uses existing shadcn components. |
| Wave B Tasks 13-18 | `react-ui-builder` | Widget migrations. Mechanical application of primitives. |
| Wave C Task 19 | `cto-orchestrator` | Bundle-cap decision spans build config + dependency policy. |
| Wave C Tasks 20-21 | `react-ui-builder` | Nivo is a new library but maps cleanly to existing component patterns. |
| Wave C Tasks 22-23 | `refactor-architect` | Cross-file deletion with consumer safety verification. |
| Wave C Task 24 | `code-auditor` | Docs + grep-level verification fits the auditor role. |

---

## 8. Git Workflow Assessment

### Branch Strategy
| Assessment | Status |
|------------|--------|
| Feature branch specified | Yes — `gsd/phase-80.1-analytics-perf-consolidation` (D-14) |
| Branch naming convention | Correct (`gsd/phase-NN-…`) |
| Merge strategy documented | Yes — "PR after Wave C HUMAN checkpoint" |

**Branching hygiene (CLAUDE.md Pitfall #12):** Phase 74 is merged to main (verified in git log). Branch-from-main is safe. The plan's `<objective>` says "create from main if not already checked out" — good guardrail.

### Commit Strategy
| Wave | Expected Commits | Commit Type | Notes |
|------|------------------|-------------|-------|
| A | 9 | refactor/feat/test | Atomic per task; all prefixed `<type>(80.1):` |
| B | 9 | feat/refactor/fix | Atomic per task |
| C | 6 | feat/chore/refactor/docs | Atomic per task |

Total: 24 commits — matches plan. All prefixed `(80.1):` per D-13.

### Pre-Push Verification
- [x] Plan includes `npm run build` check (Task 22, 24)
- [x] Plan includes `npm run type-check` verification (every task)
- [x] Plan includes local testing before push (every task)

### CI/CD Considerations
| Concern | Assessment |
|---------|------------|
| Rollback strategy | Implicit — each commit is atomic, can revert individual commits. **Missing:** explicit note on what breaks if Wave C Task 23 (wrapper deletion) is rolled back while frontend is already on snapshots. Frontend still works (snapshots untouched). OK to deploy Wave C's wrapper-delete commit late. |
| Deployment order | Correct — backend before frontend; `npx convex deploy` triggered on merge-to-main. Frontend Vercel rebuild follows. No manual step. |
| Data backup needed | No. Pure code refactor, no schema changes. |
| Migration safety | Safe. Zero schema changes; zero data writes introduced. |

**Deployment-safety analysis (the plan's real risk):**
Wave A converts 11 live queries to thin wrappers. Wave C deletes those wrappers. All ship in ONE PR / ONE merge-to-main — so the "stale client on someone's phone hits deleted wrapper" window is:
- Wave A wrappers still exist when the merge commits land (Wave C deletes are in the same merge).
- Frontend is also updated in the same merge to use snapshots.
- Convex deploy + Vercel rebuild are sequential on GitHub Actions.
- Total window: between Convex-deploy-completes (wrappers gone) and Vercel-rebuild-completes (new frontend served) — estimated 30-60s.
- During that window, a cached client bundle on a user's phone would call the deleted wrappers and get a 400 from Convex.

**Mitigation:** Convex's graceful-degrade-on-unknown-function varies. Verify by intentionally deploying Wave C first on dev, then confirming the dev frontend (still on wrapper hooks pre-merge) behavior. If 400s cascade into UI crashes, add a step to defer Task 23 (wrapper deletion) to a SEPARATE PR after the frontend-on-snapshots PR merges. That splits the risk into two smaller windows.

**Recommendation:** Add to Plan 03 Task 23 a pre-flight: "Before deleting wrappers, confirm that during a rolling deploy the previous frontend build would gracefully no-op on missing wrappers, not crash. If it crashes, split this task into a follow-up PR."

### Git Workflow Issues Found
- None critical. Documentation-only planning commits on main are allowed per CLAUDE.md carve-out; all phase PLAN/CONTEXT/PATTERNS/SUMMARY/HUMAN-UAT files fall under `.planning/**` so those commits are fine direct-to-main.

---

## 9. Documentation Checkpoints

| Wave | Documentation Update Required |
|------|-------------------------------|
| A end | `80.1-01-SUMMARY.md` (executor-authored) |
| B end | `80.1-02-SUMMARY.md` |
| C Task 24 | `CHANGELOG.md`, `API_REFERENCE.md`, `ROADMAP.md`, `80.1-HUMAN-UAT.md`, `80.1-03-SUMMARY.md` |

### CHANGELOG.md Entry (Plan draft — Section 24 is well-structured)

The Plan 03 Task 24 CHANGELOG draft is specific and accurate EXCEPT:
- "`orders`-write re-invalidation surface cut by ~73%" — this is plausible but unverified. If measured, keep; if rhetorical, soften to "reduced".
- Lists wrapper removal under "Cleanup" but also calls out M-03 jakartaHour inline — add also the M-02 shared-colors reference for completeness (already addressed, so mention "closed in M-02 already — included here for audit trail").

---

## 10. Testing Plan Assessment

**Overall Testing Verdict: Insufficient → Adequate once Critical 1 is resolved.**

### Planned Tests
| Layer | What's Tested | Test Type | Status |
|-------|---------------|-----------|--------|
| Backend reducers | All 12 reducers, empty input, pure function | vitest unit | Planned — shape-drift issue (Critical 1) |
| Backend snapshots | 3 snapshots return all sub-fields | convex-test integration | Planned |
| Backend DI call-counter | kpi=2, time=1, sku=1, pre=1 | convex-test with DI | Planned |
| Backend precompute | Single-scan invariant | convex-test scan-counter | Planned |
| Primitives helpers | truncate, format, ChartTooltip render, ChartFrame render, WCAG contrast | vitest + RTL | Planned |
| Frontend hooks | 3 snapshot hooks + 12 selectors | (Existing KpiRow test, others) | Partial |
| Frontend widgets | 8 Recharts + 2 Nivo | Manual (HUMAN UAT) | Relies on HUMAN |

### Missing Test Coverage

| # | Missing Test | Why It Matters | Suggested Approach |
|---|--------------|----------------|-------------------|
| 1 | D-19 parity: wrapper-out vs snapshot-field shape identity | This is the whole D-19 contract. Without it, silent drift at Task 7 or Task 23 is undetectable. | Improvement 3 above — add Task 7.5 parity test. |
| 2 | Runtime duration / query-complexity budget | At prod volume, 2× `loadFilteredData` could exceed Convex handler soft limit. | Improvement 4 — measure & document. |
| 3 | R1 enforcement at widget level (not just primitives) | Primitives test proves ChartTooltip renders with WCAG-compliant classes. Doesn't prove every widget USES ChartTooltip. | Add `grep -c "content={<ChartTooltip" src/components/analytics/*.tsx >= 8` to Plan 02 Task 17 acceptance. |
| 4 | Frontend hook loading sentinel contract | Selectors return `undefined` while loading (per PATTERNS.md) — no test verifies consumer doesn't silently treat `undefined` as "empty data". | One vi.mock test per widget that passes `undefined`, asserts ChartFrame loading renders. Cheap. |

### Test Execution Checkpoints
Every task in the plan runs `npm run test` on the new file's scope. Full-suite run is implied by the final checkpoints but not explicit in any task acceptance criterion for Waves A and B mid-waves. Consider adding "full-suite green" to the end-of-each-wave push step.

### Regression Risk
- Existing `tests/convex/unitEconomics.test.ts` — stays green through wrapper phase by D-19. Task 23 prunes — plan already handles.
- Existing `tests/frontend/analytics/KpiRow.test.tsx` — SURVIVES only if Critical 1 Path B (preserve existing shape) is taken. Under Path A, the test breaks.
- Any component/page that imports from `useAnalytics` — migrated hook names preserved (Plan 02 Task 13 asserts 12 selector names), so no ripple expected.

---

## 11. Edge Cases to Address

Plan coverage of edge cases:

- [x] Empty data (orders=[], items=[]) — reducer safety asserted in Task 2 ("reduce* empty-state safety" describe block)
- [x] Divide-by-zero deltas — Task 1 test asserts `revenue.delta === null` for empty prior
- [x] Single-channel filter — implicit via wrapper preservation; not tested directly
- [ ] **Long product names (>100 chars)** — `truncateWithTooltip` tested at 22-char cutoff but not at 100+ char. Edge-case: what if SKU name is 200 chars? `slice(0, max-1) + "…"` handles fine. Could add a test.
- [ ] **Prior-period crossing DST / WIB offset** — WIB is UTC+7 fixed, no DST. Not an issue in this codebase. Acknowledge.
- [ ] **Viewport < 375px** — HUMAN-UAT item 9 says "narrow to ~375px". iPhone SE 1st gen is 320px. Plan says `minWidth={320}` on ResponsiveContainer which covers it. Fine.
- [ ] **Chrome forced-color-scheme overrides** — tooltip color tokens are `--popover` / `--popover-foreground`; in Chrome's forced-colors mode these get overridden. Acknowledge but not fix in this phase.
- [ ] **1-row Pareto chart (only 1 SKU in range)** — cumulative% always 100 for single row. Chart still renders. Plan has no explicit test but logic handles it.
- [ ] **Snapshot returns `undefined` WHILE a selector slice is being displayed** — when filter changes, `useQuery` returns `undefined` briefly. Widgets show loading. Fine.
- [ ] **Two widgets on-page with different topN** — e.g. `SkuParetoChart topN=10` + `SkuChannelHeatmap topN=8`. Both share same `useSkuSnapshot` subscription; each slices client-side. Verify dedup holds when `buildArgs` outputs IDENTICAL args (it does — topN is client-side, not in args).
- [ ] **externalRevenue rows with `transactionCount` aggregation** — already handled in `loadFilteredData`; reducers inherit correctly; no new surface. Acknowledge.
- [ ] **Channel filter that excludes all channels** — `buildArgs` sets `channels: undefined` when length is 0, which the loader treats as "all channels". So "no channels selected" shows everything, not nothing. Existing behavior; preserved.

---

## 12. Approval Conditions

**For Approval, address (Critical — must fix before execution):**
1. Reconcile reducer test shapes with live query shapes (Critical 1) — commit to Path A (preserve existing kpi shape) and rewrite Task 1/2 RED tests accordingly.
2. Remove `typeMixOverTime` from the "existing queries" list in three locations (Critical 2). Optionally add it as a Category-B CREATED reducer.
3. Decide intent on `reduceRevPerUnit` — preserve channel-based semantics (Path A) or add new product-based component (Path B). Update D-03 accordingly (Critical 3).
4. Same decision on `UnitsByTypeStackedBars` — time-buckets (Path A, preserve) or per-product (Path B, rename component) (Critical 4).

**Strongly recommended before implementation:**
1. Drop `reduceChannelSparklines` — reuse existing `channelMomentum.channels[].revenueSpark` (Improvement 1).
2. Add pre-install vendor chunk size baseline capture (Improvement 2).
3. Add Task 7.5 — D-19 shape parity test (Improvement 3).
4. Add Task 8.5 — Convex handler runtime budget measurement (Improvement 4).
5. Re-triage HUMAN-UAT pre-merge vs post-deploy (Improvement 5).

**Refinements at executor discretion:**
See Section 4.

---

## Final verdict

**Revise.** The plans are structurally excellent — DI pattern, expanded safety grep, schema-correct seeds, HUMAN-UAT timing, atomic commits, pre-merge-vs-post-deploy partition are all right. What's missing is **tight alignment between the PRD-assumed shape of `unitEconomics.ts` and the actual live shape**. Three of the four Criticals are variations of the same drift. Fix by either (a) changing the reducer shapes to mirror what exists (preferred — matches D-19 zero-downtime intent) or (b) rescoping the phase to include explicit redesign work for kpi/revPerUnit/unitsByType (acceptable if user wants the new charts, but changes the phase's framing).

Once Criticals are resolved and the 5 Improvements are adopted, this phase is ready to execute. Wave C is essentially ready today — the issues cluster in Waves A and B.

---

*Generated by /staffreview skill*
*Staff Developer Review + Principal Developer Review*
*2026-04-18*
