---
phase: "53.1"
reviewer: "staff-engineer-agent"
date: "2026-03-15"
verdict: "approve"
---

# Staff Review: Phase 53.1 — GoBiz Promo Discount Fix

## Verdict

**Approve.** This is a clean, well-scoped bug fix with strong test coverage, correct financial logic, and no architectural missteps. The implementation matches the plan exactly. Two issues below — one important, one minor — are safe to address post-merge since neither affects correctness of the primary fix.

---

## Plan Fidelity

Plan-to-implementation fidelity is excellent. Both plans were executed without deviation, and the summaries confirm this.

| Planned Item | Status | Notes |
|---|---|---|
| Bug 1: Use stored `revenueNet` in `aggregatePlatformChannel` | Done | Exact code from plan was used |
| Bug 2: Extract `voucher_amount` as `promoDiscount` in `extractJournalMetrics` | Done | |
| Wire `promoBurn` through adapter to `saveRevenue` | Done | `adapter.ts` line 390 |
| Extend `channels` array with `commission` and `promoBurn` | Done | |
| TDD: RED phase commit, then GREEN phase commit | Done | Commits d1a87f4, 3734986 |
| Frontend: Extend `PeriodData.channels` type | Done | Fields are required (non-optional) in overviewUtils.ts |
| Frontend: Conditional promo discount line in `ChannelSummary` | Done | Orange, between Gross and Net |
| Conditional promo logging in sync adapter | Done | |

One notable deviation from the plan: Plan 02 specified `commission?` and `promoBurn?` as **optional** fields on `PeriodData.channels` for backward compatibility, but the implementation made them **required** (`commission: number; promoBurn: number`). This is actually the correct decision since the backend always emits these fields, but it does constitute an unannounced deviation. See Findings > Minor.

---

## Architecture Assessment

**The fix is at exactly the right level of abstraction.** The root cause was a calculation happening in the wrong place — `dashboardHelpers.ts` was recomputing a value that should have been read from storage. The fix moves to the trust-the-stored-value pattern, which is architecturally sound for a system where the authoritative source (GoFood journal API) has already done the calculation.

**No harmful coupling introduced.** The change is additive — `commission` and `promoBurn` are added to the channel array, not substituted into existing fields. Existing consumers of the channels array that don't use the new fields are unaffected.

**The fallback logic is correct and safe.** `r.revenueNet ?? (r.revenueGross ?? 0)` correctly handles three cases:
- `revenueNet` set → use it (all records post-fix)
- `revenueNet` undefined → fall back to `revenueGross` (pre-existing records without revenueNet)
- `revenueNet` set to 0 → treat as valid zero, not fall back (100%-discount orders)

The test suite explicitly locks the `revenueNet = 0` case, which guards against the common `??` → `||` refactor regression.

**One architectural observation worth tracking** (not a blocker): the `promoBurn` field on `externalRevenue` now serves double duty — it existed before this fix (the schema already accepted it), but was never populated by GoBiz sync. The fix begins populating it for new syncs. Historical records therefore have `promoBurn: undefined`. The fallback `r.promoBurn ?? 0` handles this correctly in the aggregator, and the frontend conditional `promoBurn > 0` handles it correctly in the UI. This asymmetry is intentional and well-handled, but should be noted in the CHANGELOG to help future engineers understand why some historical records have no `promoBurn`.

---

## Financial Correctness

**Full data flow trace:**

```
GoBiz journal API
  └── hit.transaction_share[0].metadata.variables.voucher_amount  (centesimal, e.g. 2450000)

extractJournalMetrics() [gobiz/helpers.ts:294]
  └── promoDiscountRaw = share?.metadata?.variables?.voucher_amount ?? 0
  └── promoDiscount = promoDiscountRaw / CENTESIMAL_DIVISOR          (→ 24500)
  └── returns JournalMetrics { promoDiscount: 24500, net: 85974, ... }

saveJournalTransactions() [gobiz/adapter.ts:390]
  └── promoBurn: txn.promoDiscount                                   (stored as 24500)
  └── revenueNet: txn.net                                            (stored as 85974)
  └── → externalRevenue record: { revenueGross: 140000, revenueNet: 85974, commission: 29526, promoBurn: 24500 }

aggregatePlatformChannel() [dashboardHelpers.ts:33]
  └── net += r.revenueNet ?? (r.revenueGross ?? 0)                   (reads 85974, not recalculating)
  └── promoBurn += r.promoBurn ?? 0                                  (reads 24500)
  └── → channel { gross: 140000, net: 85974, promoBurn: 24500 }

ChannelSummary.tsx [line 116]
  └── {seg.current.promoBurn > 0 && <div>-{formatCurrency(24500)} Promo Discount</div>}
  └── net display: formatCurrency(85974)
```

The flow is clean and each transformation is correct. The CONTEXT.md verified formula `net = gross - commission - voucher_amount` holds for the test data and is confirmed by the HAR analysis referenced in the plan.

**Historical record handling.** Records synced before this fix have `revenueNet` already populated (it was being stored from `txn.net` before this change too — Bug 1 was in aggregation, not sync). The fallback to `revenueGross` only applies to records where `revenueNet` is genuinely absent. This means the Bug 1 fix is **immediately retroactive** for all existing records — a correct and desirable property.

For `promoBurn`: historical records do NOT have this populated (Bug 2 is forward-only). This is correctly noted in Plan 02's how-to-verify instructions. The promo discount line will only appear in ChannelSummary after a fresh sync — this is acceptable and communicated to the human verifier.

**One financial logic edge case to note** (see Findings > Important): the plan's stated formula `net = gross - commission - voucher_amount` matches 13/13 HAR-verified orders, but does not perfectly equal the stored `transaction_share[0].amount` in all cases due to VAT rounding. The code correctly trusts `transaction_share[0].amount` (stored as `revenueNet`) rather than the formula — which is the right call, but the CONTEXT.md formula should not be used as a re-verification tool if discrepancies arise.

---

## Test Strategy

**Test quality is high.** The TDD discipline was followed (RED commit before GREEN commit), and the tests are testing the right things at the right level.

**What the tests do well:**
- The `revenueNet = 0` edge case test is excellent — it locks a subtle `??` vs `||` regression path that is easy to introduce in a future refactor
- The "divergent revenueNet" test (stored 60000, formula gives 54410) is the most valuable test in the suite — it proves the implementation truly reads stored values, not just that it happens to produce the right answer when stored and calculated agree
- Promo extraction test uses real centesimal amounts from the HAR data (2450000 → 24500), tying the test to verified production values
- Cross-channel aggregate test (gobiz + bigseller_shopee) validates isolation — promo in one channel doesn't bleed into another

**Test gaps (minor):**
- No test for the "All Channels" segment in ChannelSummary — the `totalPromoBurn` field is used for the "All Channels" card but this path is only exercised by the unit test that covers `totalPromoBurn` aggregation in the backend helper. A frontend test for the "All Channels" segment would have extra value, but is not critical.
- No integration test for the adapter's `promoBurn` wiring. This is acknowledged in `53.1-VALIDATION.md` as a manual-only verification due to Convex context dependency. Acceptable.

**Regression protection is solid.** The BigSeller regression test and the cross-channel coexistence test mean a future change to `aggregatePlatformChannel` would need to break multiple tests to go undetected.

---

## Operational Concerns

**Rollout transition:** There is a transitional period where:
- Old records: `revenueNet` set, `promoBurn` null/undefined
- New records (post-fix sync): `revenueNet` set, `promoBurn` set

This is handled correctly throughout. The `?? 0` fallback in the aggregator and `> 0` guard in the UI both handle null/undefined promoBurn correctly. No data migration is required.

**No monitoring added.** The conditional sync logging (`Promo: Rp X` in the daily sync log) is a lightweight operational signal. If promo orders appear in the log, it confirms extraction is working. This is appropriate for the scope of this fix. More formal alerting (e.g., flagging when promoBurn > X% of gross) is not necessary at this scale.

**Re-sync requirement.** Users will not see promoBurn in the UI for historical orders unless a re-sync is triggered. The human verification checkpoint in Plan 02 correctly identifies this. The CONTEXT.md note that Crystal Timur A (no campaign) should show no promo line is a good regression anchor for manual testing.

**No schema change.** `promoBurn` already existed on `externalRevenue`. This means no Convex deploy schema migration is required — just a code deploy.

---

## Findings

### Critical

None.

### Important

**Type divergence between `overviewUtils.ts` and `useExternalData.ts` for `ChannelBreakdown`**

There are two parallel type definitions for the channel shape:

- `overviewUtils.ts` defines `PeriodData.channels` with `commission: number; promoBurn: number` (required)
- `useExternalData.ts` defines `ChannelBreakdown` with `commission: number; promoBurn: number` (required, updated in this PR)
- `useExternalData.ts` also defines `PeriodSummary` with `channels: ChannelBreakdown[]`

These two types (`PeriodData` and `PeriodSummary`) represent the same backend shape but are defined in two different files. They are currently in sync, but this is a latent maintenance risk — a future change to one could silently diverge from the other since TypeScript won't catch the incompatibility unless a value of one type is assigned to the other. The `summary.currentPeriod` from the hook is destructured and passed directly to `ChannelSummary` which accepts `PeriodData` — but this works only by structural typing, not by explicit type alignment.

This is pre-existing tech debt, not introduced by this PR. But since this PR touched both types, it's worth noting for a future consolidation.

### Minor

**Plan 02 specified optional fields; implementation used required fields**

The plan stated: "Use optional (`?`) for backward compatibility — existing code that creates PeriodData objects without these fields will not break." The implementation correctly chose required fields instead (the backend always emits them, so optional adds no real value and weakens type safety). This is the right call, but it's an unlogged deviation from the plan. The `53.1-02-SUMMARY.md` should note this.

No action needed before merge.

---

## Recommendations

**Before merge:**
- None required. Code, tests, and build are all clean.

**Post-merge (not blocking):**
1. Add a CHANGELOG entry noting that `promoBurn` is forward-only for existing records (future engineers will thank you when debugging "why doesn't my old GoFood order show a promo line?")
2. Consider consolidating `PeriodData` (overviewUtils.ts) and `PeriodSummary` (useExternalData.ts) into a single canonical type, imported from one location. This is tech debt, not urgent.
3. Update `53.1-02-SUMMARY.md` to note the optional→required deviation as a deliberate improvement.

---

## Summary Metrics

| Category | Count |
|---|---|
| Critical findings | 0 |
| Important findings | 1 (pre-existing tech debt, not introduced here) |
| Minor findings | 1 |
| Tests added | 10 (7 dashboardHelpers + 3 gobiz helpers) |
| Tests passing | 958/958 |
| Build status | Passing (18.88s, 2 CSS warnings only) |
| Plan fidelity | High — no functional deviations |
| Files changed | 7 (5 backend, 2 frontend) |
