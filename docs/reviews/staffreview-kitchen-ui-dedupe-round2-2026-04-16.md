# Staff Review — Kitchen UI Dedupe Round 2 (4-round fix sequence)

Date: 2026-04-16
Reviewer: Senior Code Reviewer
Branch: `worktree-debug-kitchen-dedupe-round2`
Commit range: `b209ff8a..0d38346f` (4 commits)
Scope: 1,122 insertions / 283 deletions across 14 files
Debug log: `.planning/debug/kitchen-ui-component-duplication-round-2.md`

---

## Summary

Four sequential commits fix a family of kitchen-UI regressions that all share one root pattern: **hardcoded assumptions about a 2-ball world (BIG_BALL/MID_BALL)** colliding with a BOM model that supports N production codes and a dedupe pipeline that soft-deactivates duplicates. The final state is *functionally* coherent and *does* deliver what the user asked for in each round, but it leaves a noticeable trail of schema entropy and one semantic landmine (the payload field `grams` now stores pcs values). Zero Phase 73 bleed — fully isolated.

The iterative nature produced some additive-but-redundant state: `otherBallTargets` (round 2) + `enabledProductionComponents` (legacy) + `enabledKitchenComponents` (legacy) + `componentTracking` (round 5) all coexist in `kitchenConfig`, with round 5 explicitly deriving legacy fields on save for "backward compat". This should be cleaned up in a follow-up migration — I'd call it out as a technical-debt marker, not a blocker.

Verification on every round: `npm run type-check` clean, `npm run build` under 21s. No automated test for the regression — manual UI verification is the only signal of correctness, which is acceptable for a hotfix sequence but worth noting.

Per-round plan fidelity:
- Round 1 (isActive filter) — delivered, survives later rounds unchanged.
- Round 2 (N-code ball targets + dispatch plan) — delivered. The `otherBallTargets` schema field is still authoritative for non-BIG/MID target *numbers* and was not made redundant by round 5.
- Round 3 (dispatch plan dropdown primaryCodeForRow) — delivered. Minor subtotal-accounting wrinkle surfaces in multi-code BOMs (see Refinements).
- Round 4 (`isRecipeChild` — kitchen components from recipe-child set) — delivered. Architecturally the cleanest of the four rounds; replaces a heuristic with a canonical definition.
- Round 5 (`componentTracking` unified config) — delivered, but is the source of most complexity in the final state because it overlaps with legacy fields rather than superseding them.

End-state UX: ✅ Manager Settings → BALL TARGETS (dynamic rows), Component Tracking (unified table), PACKAGING MIX (dynamic sections). ✅ Shift form correctly renders pcs/g units per component. ✅ The doubled-grammage submit bug from round 1 is fixed — `componentProducedList` is built from `visibleKitchenComponents`, which is dedup-by-code in both `useKitchenTargets.kitchenComponents` and `ManagerTargetSettings.kitchenComponentsList`. The explicit `seen.has(c.code)` guards survived every round.

---

## Critical Issues

### C1 — Schema field `grams` now stores pcs values (semantic landmine)

**File:** `convex/schema.ts` lines 1438–1453, `convex/kitchenShiftRecords/mutations.ts` lines 56–71, `convex/kitchenShiftRecords/queries.ts` lines 395–530, `src/pages/StaffPerformance.tsx`, `src/lib/staffPerformanceExport.ts`

Round 4/5 allows managers to tag a component's display/input unit as either `"g"` or `"pcs"` via `kitchenConfig.componentTracking[].unit`, and the shift form now sends that raw number to the backend *in a field still literally named `grams`*. The schema comment even says "Amount produced in grams."

Downstream aggregators add these values as if they're homogeneous grams:
- `kitchenShiftRecords/queries.ts:479` — `staff.totalComponentGrams += c.grams;`
- `StaffPerformance.tsx:99` — renders `totalComponentGrams.toLocaleString() + 'g'`
- `staffPerformanceExport.ts:47,64` — aggregates into the CSV export
- `ShiftHistoryList.tsx:258`, `KitchenViewV2.tsx:296` — display `{componentGrams}g` labels

If a chef reports 50 pcs of Filling Pistachio + 200 g of Butter, the dashboard will show "250 g components" and the CSV export will mislabel. This is not a cosmetic issue — it's a reporting-accuracy bug waiting to be triggered the moment a manager flips a unit toggle to `"pcs"`.

**Recommendation (pick one):**
1. Add a per-entry `unit: "g" | "pcs"` to the `componentProduced` / `componentWaste` schema elements. Make aggregators unit-aware (bucket grams vs pcs separately; or convert pcs → grams via `gramsPerUnit` at read time).
2. Alternatively, hold the line: the *payload* is always grams, and the UI is responsible for converting pcs inputs to grams before submit (multiply by `gramsPerUnit`). This keeps aggregations honest but costs the user some UX fidelity (entering 50 "pcs" means storing 1,400 g if gramsPerUnit is 28).

Option 1 is the more correct fix. Either way, ship before a manager discovers this.

### C2 — `otherBallTargets` target-value semantics are not unit-aware

**File:** `convex/schema.ts` lines 1368–1371, `src/components/kitchen/ManagerTargetSettings.tsx` lines 188–224

`otherBallTargets` stores `{ code, target: number }` as a raw count. The render path in `ballTargetRows` (ManagerTargetSettings.tsx:188) filters `productionComponents.filter(c => c.unit === "pcs")` before building rows, so today every entry implicitly means "pcs of balls." But round 5 removed that assumption elsewhere — a user can now set `componentTracking[HAZELNUT_REGULAR].unit = "g"` while `otherBallTargets` still stores a pcs-semantics integer. The two become inconsistent.

This is subtler than C1 because the filter `unit === "pcs"` in `ballTargetRows` only reads the componentType's native unit, not the `componentTracking` override. So the UI will still render a target input for HAZELNUT_REGULAR even when the manager has set the tracking unit to g. The displayed number is ambiguous.

**Recommendation:** Either (a) prevent mixing — only allow `componentTracking.unit = "pcs"` for rows that appear as ball targets; disable the g toggle for tier-1 balls. Or (b) add a unit field to `otherBallTargets` entries so the target number carries its own semantics. Option (a) is simpler and preserves the mental model "ball targets are always in balls (pcs)."

---

## Important Issues

### I1 — `kitchenConfig` carries 5 overlapping visibility/config fields

**File:** `convex/schema.ts` lines 1355–1380

After 4 rounds, `kitchenConfig` has the following interrelated fields:

| Field | Purpose | Introduced | Still needed? |
|-------|---------|-----------|---------------|
| `showJumbo` | Hide/show BIG_BALL stat card | Phase 21 | Derived at read from `enabledProductionComponents` — effectively deprecated |
| `enabledProductionComponents` | Array of enabled production codes | Phase 21-08 | Now derived from `componentTracking` on save; kept for backward read fallback |
| `enabledKitchenComponents` | Array of enabled kitchen component codes | Phase 69 | Same as above |
| `otherBallTargets` | Target numbers for non-BIG/MID codes | Round 2 | Yes — unique responsibility (target *numbers*, not flags) |
| `componentTracking` | Unified {code, tracked, unit} | Round 5 | Yes — new authoritative source |

The dual-write pattern in `ManagerTargetSettings.handleSaveDefaults` (lines 284–299) writes `componentTracking` AND derives + writes `enabledProductionComponents` + `enabledKitchenComponents` on every save. The dual-read pattern in `queries.ts:getConfig` returns both. This works today because the UI always writes both in lockstep, but any future mutation that updates only one side will cause drift.

**Recommendation:** Schedule a follow-up phase (call it 73.X or slot it into Phase 78.1) to:
1. Backfill `componentTracking` from legacy fields for any config row missing it.
2. Drop the legacy fields from the schema after all reads have been migrated to `componentTracking`.
3. Keep `otherBallTargets` — it has a distinct role (target *quantities*, not toggles).

Leaving the drift surface in place indefinitely invites a future bug report of the form "I turned off Butter in the new UI but it still shows up in some report."

### I2 — Real-time subscription payload grows per kitchen view

**File:** `convex/productionRecipes/queries.ts` lines 121–158

`getComponentsWithTiers` now fetches ALL `productionComponentLinks` on every invocation and builds a Set for the `isRecipeChild` lookup. For the current data size (12 leaves + handful of recipes) this is trivial. At scale, every kitchen-page render across every client re-computes the Set and re-runs `computeTier` with `maxDepth=3` for every component.

Not a blocker today, but worth knowing: on 100+ componentTypes with deep links, this query becomes an O(N × depth) traversal that fires on every subscription update anywhere in the dependency chain. Convex's query cache should make this a one-per-deployment cost, but tier depth beyond 3 requires explicit `maxDepth` bump and will dominate cost.

**Recommendation:** Add a short comment noting the scale expectation in the query handler and flag the `maxDepth=3` as a known limit. Consider caching the `isRecipeChild` on the componentType record itself (computed on parent-link mutation) if you see >100 rows.

### I3 — `ShiftEditDialog` kitchen components list lacks dedup-by-code guard

**File:** `src/components/kitchen/ShiftEditDialog.tsx` lines 91–98

Both `useKitchenTargets.kitchenComponents` and `ManagerTargetSettings.kitchenComponentsList` explicitly dedup by `code` via a `Set`/`seen.has` loop. `ShiftEditDialog.kitchenComponents` does not:

```ts
const kitchenComponents = useMemo(
  () => (componentsWithTiers ?? []).filter((c) => c.isActive && c.isRecipeChild),
  [componentsWithTiers]
);
```

The schema doesn't enforce `code` uniqueness on `componentTypes`, and the round-1 dedupe pipeline works at the data layer, not the schema layer. If a future seed or manual insert creates two active rows with the same code, the edit dialog will surface both while the main form surfaces one — inconsistency.

**Recommendation:** Mirror the Map-based dedup used in the other two consumers. Small change, preserves defensive posture.

### I4 — `ballsUsedByCode` counts from all BOM codes, but rows display in only one group

**File:** `src/components/kitchen/PackagingMixEditor.tsx` lines 340–359

When a product's BOM uses multiple production codes (e.g., a hypothetical bundle using both BIG_BALL and HAZELNUT_REGULAR), the row is assigned to exactly one group via `primaryCodeForRow` (correct — prevents duplicate rendering). But `ballsUsedByCode` iterates all rows and adds to every code's bucket, so a row in the BIG_BALL section can silently inflate the HAZELNUT_REGULAR "balls used" counter even though no input for that row exists in the HAZELNUT section.

The allocation counter `{ballsUsed} / {ballTarget} balls` in a section can display a value higher than the sum of visible row subtotals. Confusing but not data-corrupting.

**Recommendation:** Either (a) constrain the subtotal display to `rowsByCode[code].reduce(...)` to match what's visible, or (b) add a small note under the counter when cross-group contributions exist. Not urgent; the user hasn't reported seeing this yet because today's BOMs are single-code.

---

## Refinements

### R1 — `enabledComponents` derivation in `KitchenViewV2` duplicates logic with `ManagerTargetSettings`

`KitchenViewV2.tsx:87–108` and `ManagerTargetSettings.tsx:125–128` both derive "enabled tracked production codes" from `componentTracking`. They agree today, but this is two sources of truth for the same computation. Extract to a helper (e.g. `src/hooks/convex/useKitchenTargets.ts` could export `enabledProductionCodes`).

### R2 — `unitByCode` derivation path precedence is subtle

`useKitchenTargets.ts:74–89` reads `componentTracking` when present, else falls back to componentType.unit. This is correct but hidden behind a ternary that's easy to misread. A comment block or a small pure function `resolveUnit(config, componentType)` would help future maintainers.

### R3 — `computeTier` is typed with `any`

`convex/productionRecipes/queries.ts:164` signature:
```ts
async function computeTier(ctx: any, componentTypeId: any, visited: Set<string>, maxDepth: number)
```
Per CLAUDE.md pitfall #11, using `ctx: any` breaks typed APIs. Use `QueryCtx` and `Id<"componentTypes">`. Pre-existing, not introduced by this sequence, but round 4 touched this file and could have cleaned it up.

### R4 — No unit test or integration test added

None of the 4 rounds add a regression test. The doubled-grammage bug and the duplicate-toggle bug are exactly the kind of thing a headless render + submit test would catch cheaply. Given the history (round-1 dedupe → round-2 regression → round-3 + round-4 follow-ups), a single "render kitchen view with a soft-deactivated shadow componentType and assert single row + single submit entry" test is high value.

---

## Architectural Notes

### Round 4 (`isRecipeChild`) is the strongest fix in the sequence

Replacing the `tier === 0 && unit === "g"` heuristic with "referenced as a child in productionComponentLinks" is the right abstraction. It correctly captures the domain concept (kitchen staff produces sub-components of recipes; they do not produce directly-on-menu balls). This is the one round of the four that should have happened first — it makes every downstream filter deterministic and removes an entire class of "heuristic worked for the 2 cases we had" bugs. Worth writing down as a lesson.

### Round 5 (`componentTracking`) design cost vs value

The unified config is UX-positive (one table instead of two toggle groups, per-component unit selector is a new capability the user wanted). But it doubled the schema surface area of `kitchenConfig` and created the dual-read/dual-write pattern in I1. An alternative path would have been: *first* migrate legacy fields to a single `componentTracking` array (dropping `enabledProductionComponents` + `enabledKitchenComponents`), *then* add the unit toggle. That would have cost one more commit but left the schema clean.

Irreversible at this point without a follow-up migration — file as lesson.

### 1.1K LOC for a UI debug sequence — justified

A quarter of the diff is the debug log itself. The actual code delta is ~700 LOC, and of that maybe 350 is ManagerTargetSettings.tsx (the unified Component Tracking table is genuinely new UI). For a 4-round debug sequence that shipped ~6 distinct bug fixes + one new capability (per-component unit), this is proportional. Not bloated.

### Phase 73 safety

Confirmed zero surface area. `grep -rn "BankReconciliation|bankStatements|bankKeywordRules|bankLines"` across every file touched by the 4 commits returns empty. All changes live in `convex/kitchenConfig/`, `convex/productionRecipes/`, `convex/schema.ts` (kitchenConfig table only), and `src/components/kitchen/ + src/hooks/convex/useKitchenTargets.ts + src/pages/KitchenViewV2.tsx`. No accidental import or re-export into bank-reconciliation modules.

---

## Lessons (for future debug sequences)

1. **When you discover a heuristic filter was the wrong abstraction, prefer replacing it over layering more heuristics.** Round 4 did this correctly. Rounds 1–3 were still working within the assumption that the filter was roughly correct.

2. **Don't introduce a new config field before collapsing the fields it supersedes.** Round 5 `componentTracking` should have been a *replacement*, not an *addition*. Backward compat via derivation-on-save creates dual-write drift risk.

3. **A schema field name is a contract.** `componentProduced[].grams` now stores non-gram values in some cases. The payload shape should match the type of data it carries; add `unit` to the schema instead of overloading `grams`.

4. **Dedup-by-code defensive guards belong in a shared helper.** Three consumers independently implement the same Map-based dedup; one missed the implementation (I3). A single `uniqueByCode<T extends { code: string }>(items: T[]): T[]` utility would enforce consistency.

5. **Ball targets are a distinct concept from component tracking.** Round 2's `otherBallTargets` correctly kept its identity when round 5 arrived. Target *numbers* and tracking *flags* should not be conflated.

6. **Debug logs reaching 400+ lines signal the problem grew bigger than planned.** The round-2 log outgrew the round-1 log. When that happens, write a mini-plan for the remaining rounds instead of continuing in the debug log — the four-round sequence would have been cleaner with an explicit checkpoint after round 1.
