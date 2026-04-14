# Staff Review: Phase 80 — Task 4b Cross-Channel Unification Addendum

**Date:** 2026-04-14
**Plan:** `.planning/phases/80-unit-economics-analytics-dashboard/80-01-PLAN.md` (Task 4b + R5/R6), `80-CONTEXT.md` (cross-channel section + SC 11/12 + tests 11-15), `80-03-PLAN.md` (Task 1 behavior tests 11-15), `.planning/ROADMAP.md` (Phase 80 depends_on, Phase 999.4 cross-ref)
**Scope:** Addendum only. Base plan (commit `bea8c045`) NOT re-reviewed.
**Reviewers:** 10x Staff Developer (Implementation) + 10x Principal Developer (Architecture)

---

## 1. Summary

**Overall Assessment: Revise — 1 Critical, 4 Improvements, 3 Refinements.**

The addendum correctly identifies a real gap (Shopee/TikTok/Tokopedia/consignment bypass `orders`/`orderItems`) and proposes a sensible read-layer merge. However, **the dedup rule in R5 is factually wrong for `gobiz`**: GoJek sales never produce `orders` rows, so skipping source=`gobiz` at the loader would make ~100% of GoJek revenue invisible — exactly the failure mode this task exists to prevent. The rule works correctly for source=`internal` (which IS a projection of every `orders` row, verified via `convex/integrations/internal/adapter.ts:46` + `getRevenueOrders`). Secondary concerns: `by_period` index uses `periodStart` but business date lives on `transactionDate` (for gobiz these diverge); `orders.externalOrderRef` referenced as an alternative dedup key does not exist in the codebase (0 hits across convex/, orders.channel has no gobiz/internal literal either); discount-reconciliation helper contract has a type-safety landmine that needs one line of discipline.

Fix R5's skip list to `{"internal"}` only (and optionally add a stricter same-day transactionId dedup against `internal` rows to be extra safe); switch the external scan to `by_source_period` with proper transactionDate fallback; tighten the revenueHelpers type signature so UnifiedItem can't silently bypass the guard. After those, the addendum is ship-ready.

---

## 2. Critical Issues (Must Fix)

| # | Issue | Category | Location |
|---|-------|----------|----------|
| 1 | R5 skip list includes `gobiz` — wipes ~100% of GoJek revenue | Logic/Data Loss | 80-01-PLAN.md global_execution_rules R5; Task 4b Step 4; CONTEXT.md "Cross-Channel Unification" |

### Issue 1: R5 dedup rule deletes all GoJek revenue

**Evidence from codebase (verified 2026-04-14 at HEAD):**
- `convex/integrations/gobiz/adapter.ts` inserts ONLY into `externalRevenue`. `grep 'db\.insert\("orders"' convex/integrations/gobiz/` returns 0 hits. Gobiz sales have NO `orders` twin.
- `convex/integrations/internal/adapter.ts:46` + `convex/integrations/internal/queries.ts:16-40` show that source=`internal` is a projection of every `orders` row (via `getRevenueOrders` full scan filtered by `REVENUE_COUNTABLE_STATUSES`). Every orders row → one internal externalRevenue row. `internal` IS the twin source.
- `convex/orders/validators.ts:23-35` — the `orders.channel` union has NO `gobiz` literal and NO `internal` literal. GoJek flows arrive as externalRevenue only. Direct-sales flows (whatsapp/instagram/legato_*/bazaar) flow through both orders AND internal mirror.
- `orders.externalOrderRef` does not exist anywhere in convex/ (verified — 0 matches). The "precise" fallback dedup key the plan proposes is phantom. The only existing dedup handle is `gobizOrderNumber` (gobiz-only) + `externalTransactionId` (externalRevenue-side).

**What the plan says (R5):**
> "external rows whose source is `"gobiz"` or `"internal"` must be skipped — those channels ALREADY produce `orders`/`orderItems` entries"

**Why this fails:**
- For `internal`: the statement is correct. Skip is safe. (Double-counting would occur otherwise — every orders row would flow through orderItems AND through its internal twin.)
- For `gobiz`: the statement is **factually wrong**. Gobiz rows have no orders twin. Skipping them means GoJek revenue contributes ZERO units and ZERO net revenue to `kpiSummary`, `skuPareto`, `volumeByType`, `channelEconomics`, etc. — every metric the dashboard exists to show for the GoFood channel would be blank.

**Downstream breakage this introduces if shipped:**
- Test 11 (Shopee contributes) would still pass (source=shopee doesn't hit the skip).
- Test 12 (no double-count) would pass trivially (gobiz+gobiz → skipped).
- But a parallel missing test "Test 12b — gobiz externalRevenue contributes when no orders twin exists" would fail, and no such test is proposed. Production would silently hide GoFood from every widget.

**Recommendation:**

Replace R5 with a corrected rule that only skips rows with actual twins. The correct invariants are:
1. Source=`internal` → every row IS a twin of an orders row. Always skip.
2. Source=`gobiz`/`grabfood`/`shopee`/`tiktok`/`bigseller`/`consignment`/`k3mart` → no orders twin. Always include.

Proposed R5 replacement (paste into `<global_execution_rules>`):

```
**R5 — No cross-channel double-count (external vs internal twins).**
After Task 4b merges `externalRevenueItems` into the unified item stream, rows where `source === "internal"` MUST be skipped. `internal` is a projection of every `orders` row (see `convex/integrations/internal/adapter.ts`), so including it would double-count every direct-sales order through both orderItems AND its externalRevenue twin.
All OTHER externalSource literals (gobiz, grabfood, shopee, tiktok, bigseller, consignment, k3mart) have NO orders twin — these rows MUST be included. GoJek (gobiz) sales in particular exist ONLY in externalRevenue; skipping them would zero out the entire GoFood channel in every widget. The common mistake is assuming "gobiz = GoJek = has an orders row" — it does not; confirmed by `grep 'db\.insert\("orders"' convex/integrations/gobiz/` returning zero hits at HEAD.
Dedup rule: `if (parentRev.source === "internal") continue;`. Do not cross-reference externalTransactionId against any orders field — `orders.externalOrderRef` does not exist in the schema (verified 2026-04-14).
```

Also update:
- **80-CONTEXT.md line 68** (`"Parallel mapping..." block`): change `gobiz/internal sources are skipped` → `internal source is skipped (gobiz kept — no orders twin)`.
- **Success criterion 12** (80-CONTEXT.md line 128): change example from `source === "gobiz"` to `source === "internal"`. Current wording implies gobiz has a twin, which is wrong. Test 12 (80-03-PLAN.md line 154) must be re-specified against `internal`, not `gobiz`.
- **Task 4b Step 4** (80-01-PLAN.md line 520): the sentence "source ∈ {gobiz, internal} (these ALREADY have order twins in the orders table)" is simply false for gobiz. Remove gobiz. Remove the phantom `orders.externalOrderRef` fallback entirely — it adds complexity for a field that doesn't exist.
- **Acceptance criterion** (80-01-PLAN.md line 543): current regex `source === \"(gobiz|internal)\"` → change to `source === \"internal\"`.
- **`externalSourceToDisplayChannel`** (Task 4b Step 1, lines 467-481): the `gobiz` branch returning `"Direct"` is misleading once the skip is removed — gobiz should map to `"GoFood"` (it IS GoFood). Change `case "gobiz": return "GoFood"` and drop the comment about "already produce orders rows". Keep `case "internal": return "Direct"` but note it's vestigial since internal is skipped at the loader — the mapping only matters if some future code iterates internal rows.

**Add a new Test 12b** to 80-03-PLAN.md Task 1 `<behavior>`:
> **Test 12b (cross-channel gobiz contributes)**: insert ONE `externalRevenue` row (source=gobiz, linkedMenuProductId=P, transactionDate in-window) + one `externalRevenueItems` row (qty=2). NO `orders` rows, NO `internal` twin. Assert: `kpiSummary.current.units > 0` AND `channelEconomics.find(c => c.channel === "GoFood").units > 0`. REGRESSION GUARD — catches the "skipped gobiz" bug.

This is non-optional. Without it the same misconception could regress on a future edit.

---

## 3. Improvements (Recommended)

| # | Improvement | Impact | Effort |
|---|-------------|--------|--------|
| 1 | External scan uses `by_period` on `periodStart`, but business date is `transactionDate` — switch index or add transactionDate filter | High | Low |
| 2 | `loadFilteredData` returns BOTH `orderItems` (internal only) AND `unifiedItems` — callers will drift; mandate removing `orderItems` from return | High | Low |
| 3 | `revenueHelpers` generalized to structural type `{ lineTotal: number; discountAmount?: number }` — compiler can no longer catch a caller passing a wrong-shape object | Medium | Low |
| 4 | R6 framed as eternal truth, but Phase 79 follow-ups may add per-item discount — re-phrase as current-phase invariant | Medium | Low |

### Improvement 1: `by_period` index doesn't catch rows whose business date is in-window

**The bug case:** A gobiz sync runs 2026-04-01 with `periodStart = 2026-04-01`, `periodEnd = 2026-04-30`, and each transaction inside carries its true business date in `transactionDate` (e.g., `transactionDate = 2026-04-15`). If the user filters analytics for `[2026-04-10, 2026-04-20]`:

- Using `.withIndex("by_period", q => q.gte("periodStart", fromTs).lte("periodStart", toTs))` → rejects the row (periodStart=2026-04-01 < fromTs=2026-04-10). Row is missed.
- Using `transactionDate` for the actual date check → row is correctly included.

Verified from code: `convex/integrations/gobiz/adapter.ts:383-393` sets `periodStart` = the reporting period start (not the transaction date); `transactionDate` = `txn.transactionTimeMs` (the real business date). For consignment, periodStart = transactionDate (MEMORY.md confirms), so consignment is fine. For gobiz/shopee/tiktok/bigseller, they diverge.

Plan already notes this in Task 4b `<read_first>` ("use `transactionDate ?? periodStart` as the fallback ordering key") for the row-level emit, but the **index-bounded scan itself** still uses `periodStart`. The fallback only works for rows the scan returned — rows rejected by the index are never seen.

**Recommendation:** Two options, executor picks:

A) **Widen the index scan window** and post-filter by transactionDate:
```typescript
// Widen by ~31 days to catch rows whose periodStart is earlier than their transactionDate
const SCAN_BUFFER_MS = 31 * 86400000;
const rows = await ctx.db.query("externalRevenue")
  .withIndex("by_period", q => q.gte("periodStart", fromTs - SCAN_BUFFER_MS).lte("periodStart", toTs))
  .collect();
const inWindow = rows.filter(r => {
  const biz = r.transactionDate ?? r.periodStart;
  return biz >= fromTs && biz < toTs;
});
```

B) **Add a new `by_transactionDate` index** on externalRevenue and scan that instead. Cleaner but adds a migration to Task 2 (schema task).

Option A is the smaller change and keeps Task 2 unchanged. Either way, add an **acceptance criterion**: "A gobiz externalRevenue row with `periodStart = fromTs - 15 days` and `transactionDate = fromTs + 1 day` is included in the filtered scan (regression-guarded — add as Test 12c)."

### Improvement 2: Dual-return `{ orderItems, unifiedItems }` is a landmine

The addendum's Task 4b Step 2e returns both `orderItems` (internal only, preserved for debugging) and `unifiedItems`. Tasks 5–9 are told in R5 to iterate `unifiedItems`. But:

- R5 is enforced by grep ("MUST iterate unifiedItems"), and 80-01 has no grep that specifically forbids `orderItems.` usage in Tasks 5-9.
- Copy-paste from the baseline plan (where Tasks 5-9 iterate `orderItems`) is the natural mistake. The reviewer of the executor's PR cannot easily tell at a glance whether a new `for (const it of orderItems)` loop is intentional (internal-only drill-down) or a bug (missed external merge).
- "Kept for debugging" is the classic foot-gun phrasing. No consumer is named; no test covers debugging usage.

**Recommendation:** Remove `orderItems` from the loader return. Make the change-breaking explicit:

```typescript
return {
  orders,             // kept — needed by orderById downstream
  orderById,          // kept
  unifiedItems,       // single source of truth for item iteration
  unitsPerProduct,
  unitsByTypePerProduct,
  unmatchedExternalItems,
};
```

If a consumer genuinely needs internal-only items, they can filter: `unifiedItems.filter(u => u._source === "internal")`. Add an acceptance criterion on Task 4b:

> `grep -E "loadFilteredData.*orderItems" convex/reports/` returns 0 hits outside the loader itself; `grep -E "for .*orderItems" convex/reports/unitEconomics.ts` returns 0 hits (every iteration must be over `unifiedItems`).

Also add to global rules: **R7 — Post-4b, there is no orderItems array on the returned payload. Tasks 5-9 iterate unifiedItems exclusively.**

### Improvement 3: Structural-typing the revenue helpers loses compile-time safety

Task 4b Step 5 proposes:
> "overload via structural typing — since both `Doc<"orderItems">` and `UnifiedItem` expose `{ lineTotal, discountAmount }`, the existing helpers work if their parameter type becomes `{ lineTotal: number; discountAmount?: number }`."

This works but removes the compiler's ability to catch "caller passed an object that happens to have `lineTotal` but is not an item" (e.g., a summary row, an accumulator, an externalRevenue parent). TypeScript structural subtyping is permissive; a `Doc<"externalRevenue">` with `lineTotal` accidentally attached would type-check.

**Recommendation:** Define a named, exported interface and use nominal-ish branding:

```typescript
// convex/reports/revenueHelpers.ts
export interface RevenueBearing {
  lineTotal: number;
  discountAmount?: number;
}
export function itemNetRevenue(it: RevenueBearing): number { return it.lineTotal; }
export function itemGrossRevenue(it: RevenueBearing): number { return it.lineTotal + (it.discountAmount ?? 0); }
export function itemDiscount(it: RevenueBearing): number { return it.discountAmount ?? 0; }
```

Then in `unitEconomics.ts`, make both adapters explicitly implement `RevenueBearing`:
- Internal adapter: `const ri: RevenueBearing = { lineTotal: it.lineTotal, discountAmount: it.discountAmount };`
- External adapter: `const ri: RevenueBearing = { lineTotal: item.totalPrice, discountAmount: 0 };`

This is near-zero cost, makes the R6 guarantee (external discount = 0) explicit at the adapter boundary, and keeps the `Doc<"orderItems">` type isolated from the analytics layer. Add acceptance grep: `grep -E "interface RevenueBearing" convex/reports/revenueHelpers.ts` returns 1 hit.

### Improvement 4: R6 phrased as eternal truth, but Phase 79 scope may shift

R6 current text: *"External items have no discount data. [...] Do NOT fabricate per-item discounts by prorating parent `externalRevenue.commission`/`adBurn`/`promoBurn` — that is deferred to a future phase."*

This is correct today but uses absolute phrasing. If a future BigSeller API change exposes per-item discount, R6 will be quietly wrong and nobody will notice because it reads as eternal truth.

**Recommendation:** Re-phrase as a phase-scoped invariant:

> **R6 — Current phase treats external item discount as zero.** `externalRevenueItems.totalPrice` is the final per-item amount; Phase 79's BigSeller/Shopee/TikTok sync does NOT capture item-level discount. For Phase 80, external UnifiedItem rows MUST have `discountAmount === 0`. When a future phase (contribution-margin lens v2) starts ingesting per-item discount or prorating parent `commission`/`adBurn`/`promoBurn`, this rule will need a narrow amendment — re-check before changing the adapter. Do NOT prorate parent fields speculatively in this phase.

This keeps the guard but makes the boundary visible to the next editor.

---

## 4. Refinements (Minor Suggestions)

- **N+1 pattern is acceptable but bound it.** Task 4b iterates externalRevenue rows and calls `ctx.db.query("externalRevenueItems").withIndex("by_revenue", ...).collect()` per row. For a 30-day window at current volume (~hundreds of Shopee rows + ~thousands of GoFood rows), this is 2k-ish index scans — fine. But the plan has no explicit ceiling. Add an acceptance criterion: "For a 90-day window at current data volume, `loadFilteredData` completes in <500ms (log via `console.time` in the implementation, remove for merge)." If it ever exceeds, switch to a single `by_revenue` bulk fetch grouped by revenueId.
- **`unmatchedExternalItems` diagnostic has no UI consumer.** The plan surfaces this number in the loader return but Tasks 5-9 don't read it, and Plan 02 (frontend) isn't touched by the addendum. Either (a) drop it from the return and log via `console.warn` if > 0 (dev-only diagnostic), or (b) add a one-liner to Plan 02: "KpiRow shows a small amber badge `{n} unmatched SKUs` when `unmatchedExternalItems > 0`, linking to `/external-data/mapping`". Option (b) is better UX; option (a) is fine for v1.
- **`externalSourceToDisplayChannel("bigseller")` currently returns `"Shopee"`.** Per 79-CONTEXT.md Phase 79 may or may not collapse bigseller→shopee/tiktok/tokopedia. The comment says "if Phase 79 split bigseller→shopee/tiktok/tokopedia, this literal won't appear." That's fine, but add a one-time grep in the executor's Task 4b to measure: `grep -c "source: \"bigseller\"" convex/integrations/` should reveal whether the literal is still written post-79. If zero, the bigseller branch is dead code and can be removed or kept as defensive fallback with a comment "legacy rows pre-Phase 79 only".
- **`case "tokopedia"` missing from `externalSourceToDisplayChannel`.** The `externalSource` schema union (schema.ts:18-27) has NO `tokopedia` literal — only 8: k3mart, gobiz, internal, grabfood, bigseller, consignment, shopee, tiktok. But the CONTEXT.md cross-channel narrative repeatedly says "Shopee/TikTok/**Tokopedia**/consignment sales flow in". Tokopedia is absent from the external source union entirely. Either (a) add `v.literal("tokopedia")` to externalSource in a prior phase (not in scope here), or (b) clarify in CONTEXT.md that Tokopedia currently arrives as `source: "bigseller"` and will remain so until a future phase splits it. Today the plan contains a discrepancy the executor will trip over. Recommend (b) — one-sentence clarification.

---

## 5. Duplication Analysis

### Existing Code Leveraged (correctly)
| Existing Code | Location | How Task 4b uses it |
|---|---|---|
| `externalSource` validator | `convex/schema.ts:18-27` | Task 4b Step 1 references the 8 literals for the switch |
| `by_period`, `by_source_period` indexes | `convex/schema.ts:1133-1134` | Loader scan in Task 4b Step 2d |
| `by_revenue` index on externalRevenueItems | `convex/schema.ts:1157` | Per-parent item fetch |
| `DisplayChannel` type (Phase 80 base) | `convex/reports/channelTaxonomy.ts` (T1) | Extended with second helper — correct reuse |

### Duplication Risk
- `toDisplayChannel(orders.channel)` and `externalSourceToDisplayChannel(externalRevenueItems.source)` are two separate functions. They output the same `DisplayChannel` union, but there's no shared table/map. If a future display channel is added (e.g., `Blibli`), two places must change and a test must catch it. Low risk today (8 channels stable), but add an acceptance criterion: the two switch statements collectively cover every `DisplayChannel` literal (grep both files + diff against `DISPLAY_CHANNELS`). Or unify to one dispatch: `toDisplayChannel({ rawChannel?: string; externalSource?: string })`.

---

## 6. Phase/Wave Accuracy

| Phase | Assessment | Notes |
|---|---|---|
| Task 4b placement (between T4 loader and T5 queries) | Good | Correct ordering — loader extension must land before downstream queries iterate unifiedItems |
| Task 4b inside Wave 1 | Good | Backend-only; parallels with T1-T9 sequence |
| Depends on Phase 79 (frontmatter `depends_on: ["phase-79"]`) | Good | Hard dependency is correctly declared |
| Blocking precondition check (`grep saveRevenueItems convex/integrations/bigseller/`) | Fragile | Phase 79 may not land `saveRevenueItems` in bigseller specifically — it might extend `convex/externalData/mutations.ts saveRevenueItems` only. See Issue below. |

**Ordering/Blocking issue (not Critical, but worth tightening):**
Task 4b Step 0 says:
> `grep -rE "saveRevenueItems" convex/integrations/bigseller/ | head -3` — Must return ≥1 hit.

Per 79-CONTEXT.md §code_context: *"`internal.externalData.mutations.saveRevenueItems` — canonical item insert with match-confidence scoring; call it from the BigSeller sync's `fetchOrders` stage"*. Phase 79 CALLS the existing `saveRevenueItems` from `convex/integrations/bigseller/sync.ts` — it doesn't create a new one. So the grep should be:
```
grep -E "saveRevenueItems|internal\.externalData\.mutations\.saveRevenueItems" convex/integrations/bigseller/sync.ts
```

Or better, test the actual data invariant Phase 79 establishes: a Shopee row in `externalRevenueItems` with `linkedMenuProductId` set. But that requires runtime data. The grep-on-sync.ts is a reasonable proxy — just widen it to cover the call-site, not the definition.

**No missing phases.**

---

## 7. Specialist Agent Recommendations

| Phase | Recommended Agent | Rationale |
|---|---|---|
| Task 4b implementation | `convex-backend` | Same pattern as T1-T9; pure Convex backend work |
| R5 fix + gobiz regression test | `convex-backend` (paired with the Critical Issue 1 fix) | Schema/logic knowledge required |
| Improvement 3 (RevenueBearing interface) | `convex-backend` | Single-file type refactor |
| Test 11-15 validation | `tdd-test-architect` (already assigned in 80-03 Task 1) | Unchanged |

---

## 8. Git Workflow Assessment

| Concern | Status |
|---|---|
| Branch specified (`gsd/phase-80-...`) | Carried from base plan |
| Task 4b creates its own atomic commit | Yes — line 525-528 |
| Commit message is conventional (`feat(analytics):`) | Yes |
| Rollback strategy | Implicit (revert the commit) — adequate for a read-layer merge with no schema change |
| Schema migration needed | No (addendum adds no schema; Task 2 existing indexes cover it) |
| Deployment order | Backend-only; standard flow |

**No git issues with the addendum itself.**

---

## 9. Documentation Checkpoints

The addendum itself correctly updates ROADMAP.md's Phase 80 "Depends on" line and the Phase 999.4 cross-reference. **Missing:**
- `docs/CHANGELOG.md` — 80-03 Task 1 documentation already covers it, but should explicitly mention cross-channel unification as a separate bullet ("Shopee/TikTok/consignment sales now flow into analytics dashboard — closes the gap where marketplace channels were invisible to unit economics queries").
- `docs/SCHEMA.md` — no schema change, so no update needed. Good.
- `docs/API_REFERENCE.md` — `loadFilteredData` return shape changed (now exposes `unifiedItems`, `unmatchedExternalItems`). Add a one-paragraph note under Reports: Unit Economics section.
- `CLAUDE.md` — Pitfall #11 already mentions "Count balls, not product units"; add a new Pitfall #16 (or similar): "External revenue twins — source=`internal` in externalRevenue is a projection of every orders row; always skip at analytics loaders. source=`gobiz` is NOT a twin (GoJek has no orders row) — include it. Don't reverse this."

---

## 10. Testing Plan Assessment

**Overall Testing Verdict: Insufficient (close to Adequate, but one missing test moves it down).**

### Addendum's 5 new tests (11-15)
| # | Test | Verdict |
|---|---|---|
| 11 | Shopee row → units + netRevenue | Adequate — direct happy path |
| 12 | gobiz source double-count skip | **Misspecified** — gobiz has no twin; the test as written would pass only because of the skip bug. After R5 fix, this test must reassert against source=`internal`. |
| 13 | Shopee in skuPareto | Adequate |
| 14 | Shopee collapses to "Shopee" channel | Adequate |
| 15 | unmatchedExternalItems diagnostic | Adequate |

### Missing (MUST ADD)
| # | Missing Test | Why | Approach |
|---|---|---|---|
| 12b | gobiz externalRevenue row contributes units when no orders twin exists | Regression guard for Critical Issue 1 — without it, the `gobiz` skip bug regresses silently | Mirror Test 11 but `source: "gobiz"`; assert units > 0 and channelEconomics.find(c => c.channel === "GoFood").units > 0 |
| 12c | Row with periodStart=fromTs-15d + transactionDate=fromTs+1d is included | Regression guard for Improvement 1 (index-scan-misses-late-transactionDate) | Seed one row with those fields; assert it shows in kpiSummary |
| 16 | External returns (transactionType="return") are excluded | The addendum mentions this exclusion but no test asserts it | Seed externalRevenue with transactionType="return"; assert its items are NOT counted |
| 17 | `internal` twin + orderItems → counted exactly once | Symmetric to Test 12 but correctly specified | Insert orders+orderItems row AND internal externalRevenue+externalRevenueItems row; assert units match the orders quantity once, not twice |

### Fix existing Test 12

Current (80-03-PLAN.md line 154):
> **Test 12**: insert ONE direct `orders`/`orderItems` row (gobiz source, 5 units) AND one `externalRevenue` row (source=gobiz, revenueGross matching the order, transactionDate in-window). Assert: `kpiSummary.current.units === 5` (NOT 10).

Problem: "orders row with gobiz source" is impossible — `orders.channel` has no `gobiz` literal (validators.ts:23-35). The test cannot be seeded as written and would fail at fixture-insert time. Rewrite:

> **Test 12 (cross-channel no double-count — internal twin)**: insert ONE direct `orders`/`orderItems` row (channel="whatsapp", 5 units). The `internal` sync would mirror this row to externalRevenue+externalRevenueItems; simulate that mirror in the fixture by inserting a corresponding `externalRevenue` (source=`internal`, externalTransactionId=orderNumber) + `externalRevenueItems` (linkedMenuProductId=P, quantity=5). Assert: `kpiSummary.current.units === 5` (NOT 10) — the internal row is skipped at the loader. REGRESSION GUARD for R5.

---

## 11. Edge Cases to Address

- [ ] gobiz row with no orders twin → counted (Critical Issue 1 — test 12b)
- [ ] externalRevenue row whose periodStart precedes the filter window but transactionDate is in-window (Improvement 1 — test 12c)
- [ ] externalRevenueItems row with `linkedMenuProductId === undefined` → contributes 0 units but incremented in `unmatchedExternalItems` (addendum Test 15 covers this)
- [ ] externalRevenue with `transactionType === "return"` → items excluded (test 16)
- [ ] Consignment row (periodStart === transactionDate by collapse — handled correctly, no edge case)
- [ ] Shopee row with quantity=0 or totalPrice=0 — should not appear in skuPareto. Not currently tested.
- [ ] Channel filter `["GoFood"]` — must include gobiz AND grabfood externalRevenue rows (both collapse to GoFood). Not currently tested.

---

## 12. Approval Conditions

**For Approval, address:**
1. **Critical:** Remove `gobiz` from R5 skip list; fix Test 12 fixture; add Test 12b (gobiz contributes) + Test 17 (internal skip symmetric). Update CONTEXT.md SC12 and the decisions narrative. Fix `externalSourceToDisplayChannel("gobiz")` to return `"GoFood"`.

**Recommended before implementation:**
1. Widen the external-revenue scan to catch transactionDate-in-window rows whose periodStart is outside (Improvement 1).
2. Drop `orderItems` from the loader return to force all downstream iteration onto `unifiedItems` (Improvement 2).
3. Introduce `RevenueBearing` interface to preserve type safety when helpers now accept both Doc and UnifiedItem shapes (Improvement 3).
4. Re-phrase R6 as a phase-scoped invariant rather than eternal truth (Improvement 4).

**Refinements (optional):**
- Clarify tokopedia storage (likely in `bigseller` source) in CONTEXT.md
- Decide `unmatchedExternalItems` UI surface (drop or add badge)
- Unify `toDisplayChannel` + `externalSourceToDisplayChannel` into one dispatch function (not urgent)

---

## Addendum-Specific Principal Commentary

On the architectural question: *"Should this be a read-time merge in every query, or a nightly cron that writes `unifiedSales` documents?"*

**Read-time merge is the right call for v1.** Rationale:
- 11 queries × 1 loader = 11 reads, but all share `loadFilteredData` and analytics dashboards are low-QPS (manager + admin only, ~canAccessDashboard permission). The 500ms budget is achievable.
- Materializing `unifiedSales` introduces write-path complexity (cron, backfill, re-sync on Phase 79 retroactive cascade, consistency window). Not warranted until read-path hits a ceiling.
- The merge logic is pure and idempotent — easy to evolve. A materialized view would freeze today's business rules (e.g., "skip internal, include gobiz") into stored rows, making R5 corrections invasive.

Revisit materialization IF: (a) dashboard p99 latency exceeds 2s, or (b) the merge needs cross-day windowing (rolling 28d momentum already reloads 56 days twice — if that becomes slow, cache the daily unifiedItems buckets, not the full docs).

On the addendum decision to defer fee proration to v2: **correct call.** BigSeller fees arrive on the parent `externalRevenue.commission/adBurn/promoBurn`, not per-item, and proration rules are policy-laden (pro-rata by line, by quantity, by unit price?). Deferring is the right trade. R6 documents the decision.

---

*Generated by /staffreview skill — scope limited to Task 4b addendum (commit 67f449da)*
*Staff Developer Review + Principal Developer Review*
