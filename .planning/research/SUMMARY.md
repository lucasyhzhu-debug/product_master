# Project Research Summary

**Project:** Frollie Recipe Master v1.2 "Unified Planning & Revenue"
**Domain:** Multi-channel FMCG dispatch planning, consignment revenue recognition, kitchen production aggregation
**Researched:** 2026-02-16
**Confidence:** HIGH

## Executive Summary

The v1.2 milestone extends Frollie's single-channel production system into a unified multi-channel planning and revenue platform covering 5 key areas: adding a 3rd GoJek outlet (Tamtem), evolving the K3Mart cockpit into a multi-channel dispatch planner, simplifying kitchen targets to aggregate demand across all channels, enabling manual sales entry for non-API platforms (Legato walk-in, Shopee, TikTok), and implementing proper consignment revenue recognition with three timing layers (dispatch, sale, cash collection).

The critical insight from research: **this is a pure feature-build milestone requiring zero new npm dependencies.** The existing architecture (Convex real-time backend, React 19, established integration adapters, `externalRevenue` multi-source data model) already supports all five features. The work is schema evolution (3 new tables, 2 field additions) and feature code built on proven patterns from v1.1. The K3Mart cockpit weekly planner pattern generalizes to all consignment channels. The `externalRevenue` table's `dataOrigin: "manual_entry"` field was designed for exactly this use case. Kitchen simplification is UI-only — the per-order tracking backend stays intact to preserve order status transitions.

The main risk is **conflating revenue recognition timing across direct orders (revenue at payment) vs consignment (revenue at outlet sale, not dispatch).** Direct orders use the `orders` table. Consignment dispatches must NOT — they need separate tracking via `consignmentBatches` to avoid triple-counting revenue across dispatch/sale/cash layers. Second risk: **destroying per-order traceability** when simplifying kitchen UI — the existing `orderItemProduction` records are the bridge from "kitchen made 200 balls" to "order X is ready to ship." Remove them and the order pipeline freezes. Simplify the UI, not the backend data model.

## Key Findings

### Recommended Stack

**No new dependencies required.** All v1.2 features are achievable with the existing stack. The codebase already has: (1) multi-merchant integration architecture (GoBiz supports N outlets via merchant ID array, already proven with 2 outlets), (2) multi-source revenue tracking (`externalRevenue` with `dataOrigin` and `confidence` fields supporting API-synced + manual + inferred data), (3) complete UI component library (shadcn/ui, Recharts, Radix primitives), (4) real-time subscription infrastructure (Convex), (5) established patterns for weekly planning (K3Mart cockpit), production aggregation (`productionProductTargets` with multi-source support), and external data sync (cron jobs with token refresh).

**Core technologies (no changes):**
- **Convex ^1.31.7** — Cron jobs, `"use node"` actions, scheduled functions already power GoBiz/K3Mart sync. Adding 3rd outlet is config-only.
- **React ^19.2.0** — Hooks, context, component model handles all new UI (dispatch planner, manual entry forms, consignment workflow).
- **Recharts ^3.7.0** — Already powers SalesAnalytics stacked bar charts. Cross-channel analytics extends same patterns.
- **date-fns ^4.1.0** — Week number calculation, date ranges, WIB timezone handling already in k3martCockpit/helpers.ts.
- **Native Web Audio API** — Kitchen audio alerts (beep on target achieved) use browser-native `AudioContext` with ~15 lines of code. Do NOT add `howler.js` or `use-sound`.

**What NOT to add:** `howler.js` (overkill for simple alert tones), `papaparse` (CSV parsing for Shopee/TikTok is simple tabular data, native `FileReader` + `split()` handles it), `zustand`/`jotai` (Convex real-time queries already serve as reactive store), `xstate` (4-state consignment workflow doesn't justify state machine library).

### Expected Features

Research identified 3 tiers of features across the 5 key areas:

**Must have (table stakes):**
- **Unified dispatch planner across all channels** — Manager already plans K3Mart dispatches; extending to GoFood/Legato/other consignment is the natural next step. Without it, dispatch remains siloed.
- **Consignment stock-out tracking** — When goods leave for a consignment outlet, they're no longer "in production" but not yet "sold." This in-transit state MUST be tracked or inventory numbers lie. K3Mart already has `k3martStockMovements` — generalize pattern.
- **Sale confirmation from consignment outlets** — System needs to know what sold so it can recognize revenue and calculate restock amounts. K3Mart has API snapshots; non-API outlets need manual entry.
- **Cash collection tracking per consignment partner** — K3Mart pays 2x/month, Legato 1x/week. Manager needs to know: what's owed, what's collected, what's outstanding.
- **Cross-channel revenue dashboard** — Sales analytics already shows GoFood + K3Mart + internal. Adding Legato, Shopee, TikTok data (even manual) to same charts is obvious next step.
- **Manual sales entry for non-API channels** — Shopee, TikTok Shop, Legato have no API. Manager needs to enter daily/weekly sales figures.
- **Aggregate production target from all demand sources** — Kitchen currently sees targets from orders + K3Mart synthetic demand. Adding GoFood + other consignment to same view is expected.

**Should have (competitive advantage):**
- **Demand waterfall visualization** — Show how 200 balls/day capacity is allocated: direct orders (80) + GoFood (50) + K3Mart (40) + Legato (20) = 190, leaving 10 buffer. Makes capacity planning visceral.
- **Settlement reconciliation with variance alerts** — When K3Mart's bi-monthly payment arrives, auto-compare expected vs actual. Flag discrepancies >5%. Saves hours of manual reconciliation.
- **Consignment aging report** — Identify slow-moving consignment stock at outlets (e.g., packages >7 days with no sale). Trigger rotation or recall.
- **Channel profitability comparison** — Side-by-side: "Direct orders: 45% margin. GoFood: 22% after commission. K3Mart: 30% after consignment fees." Informs channel strategy.
- **Per-channel commission configuration** — GoFood ~19% + VAT. Legato Goldfinch 10%. Legato Tamtem 17%. Net revenue requires knowing fee structure.

**Defer (v2+, often problematic):**
- **Full double-entry accounting for consignment** — This is a production system, not an accounting system. Double-entry adds massive complexity at 200 balls/day scale. Export summaries to actual accounting software instead.
- **Automated production scheduling** — At ~200 balls/day with 2-3 staff, kitchen lead makes this call in 30 seconds. Show demand breakdown; let staff decide.
- **Real-time consignment stock via IoT/barcode** — Requires hardware, consignee cooperation. Stock delta inference + periodic counts suffice.
- **Per-unit consignment tracking (serialization)** — Massive overhead for Rp 40-120k snack. Track by batch, not per-package.

### Architecture Approach

The existing architecture already supports multi-channel workflows via a well-designed data model from v1.1. The `externalOutlets` table is channel-agnostic (has `source` field supporting multiple platforms). The `externalRevenue` table supports both API-synced and manual data via `dataOrigin` field. The `k3martDispatchPlans` pattern generalizes to other channels. The key architectural decision: **extend, don't replace.** Do NOT rename `k3martDispatchPlans` to a generic table — K3Mart has API-specific fields (`k3martRequestId`, submission workflow). Instead, create a thin abstraction layer: new `dispatchPlans` table for non-API channels, keep K3Mart table as-is, unify in frontend via a combined query. This avoids breaking existing K3Mart dispatch workflows.

**Major components:**
1. **convex/dispatch/ (NEW)** — Generic multi-channel dispatch planning. Queries unify K3Mart + other channels. Mutations handle generic dispatch CRUD. Confirmation pushes to `productionProductTargets` (same pattern as K3Mart's `confirmDayPlan`).
2. **convex/consignment/ (NEW)** — Consignment batch lifecycle (dispatch -> sale -> cash collection) and settlement reconciliation. Creates `consignmentBatches` when dispatch plans confirm. Updates batches when sales are reported. Tracks cash collection via `consignmentSettlements`.
3. **convex/kitchen/queries.ts (NEW)** — Aggregate daily production summary combining demand from: active orders + K3Mart dispatch + GoFood depot + generic consignment channels. Returns single target number with optional breakdown.
4. **convex/integrations/gobiz/ (EXISTING, config change)** — Add 3rd merchant ID (`G958262444` for Tamtem) to `GOBIZ_CONFIG.merchantIds` array. Existing sync logic already iterates all merchant IDs with single shared token. Auto-seeds outlet via `GOBIZ_OUTLET_SEED`.
5. **convex/externalData/ (EXISTING, extend)** — Add `addManualRevenue` public mutation for non-API channels. Writes to existing `externalRevenue` table with `dataOrigin: "manual_entry"`, `confidence: "manual"`. Add `commissionRate` field to `externalOutlets`.

**Data flow:**
```
Multi-Channel Dispatch Planning:
  Manager plans dispatch -> dispatchPlans (generic) OR k3martDispatchPlans (API-specific)
  -> Confirmation pushes to productionProductTargets (demand signal for kitchen)
  -> Creates consignmentBatch (tracks what's at outlet vs sold vs returned)

Kitchen Production:
  Aggregate query reads: orders + k3martDispatch + dispatchPlans + gofoodDepotStock
  -> Sums to daily target per product -> Converts to ball counts via BOM
  -> Kitchen staff adds balls -> ballDistribution auto-allocates to orders
  -> Per-order tracking (orderItemProduction) stays intact for status transitions

Revenue Recognition (3 timing layers for consignment):
  1. Dispatch: consignmentBatch created (no revenue yet, just location transfer)
  2. Sale: externalRevenue record (API or manual) -> revenue recognized, batch.totalSold updated
  3. Cash: consignmentSettlement record -> tracks payment received vs expected
```

### Critical Pitfalls

1. **Kitchen simplification destroys per-order traceability** — Moving to aggregate targets without preserving `orderItemProduction` records breaks the order pipeline. Orders stuck in "BeingPrepared" forever because nothing triggers `BeingPrepared -> AwaitingDelivery` transition. **Prevention:** Simplify UI only. Show "make 200 balls today" but backend still allocates balls to specific orders via `ballDistribution.ts`. Keep `orderItemProduction` as source of truth.

2. **Consignment revenue triple-counted across timing layers** — If consignment dispatches create `orders` table entries, the same sale appears in internal orders revenue AND `externalRevenue` from K3Mart sync AND potentially again at cash collection. **Prevention:** Consignment dispatches are NOT orders. Use `k3martDispatchPlans` or `consignmentBatches` table. Revenue recognized ONLY when `externalRevenue` record arrives (outlet sale), not at dispatch.

3. **Manual sales entry creates unreconcilable data with API sync** — Someone manually enters "Goldfinch sold 5 Original today" while GoBiz sync also records GoFood sales from Goldfinch. Revenue double-counted. **Prevention:** Enforce channel ownership — each outlet has exactly ONE data source. UI blocks manual entry for API-synced outlets. Manual entry ONLY for non-API platforms (Tamtem, Shopee, TikTok).

4. **Cross-channel analytics comparing apples to oranges** — GoBiz reports `revenueGross` (before commission) and `revenueNet` (after). K3Mart inferred revenue is `quantity * price` with no commission. Direct orders are `finalTotal`. Combining without normalizing creates misleading comparisons. **Prevention:** Standardize on "Net Revenue" metric (what Frollie receives after all commissions). Require `commissionRate` on `externalOutlets`. Always show Gross + Net side by side.

5. **Evolving K3Mart cockpit breaks existing URLs and queries** — `k3martDispatchPlans` table, queries with hardcoded `source: "k3mart"` filters, `/k3mart-cockpit` route all have "k3mart" baked in. Renaming everything breaks bookmarks and muscle memory. **Prevention:** Do NOT rename existing tables/routes. Create NEW multi-channel dispatch view. K3Mart cockpit stays as-is for K3Mart-specific API workflow. Unified planner reads from both.

## Implications for Roadmap

Based on research, suggested phase structure follows dependency order and risk mitigation:

### Phase 1: Foundation — 3rd Outlet & Manual Sales Entry
**Rationale:** Quick wins that enable subsequent phases. 3rd GoJek outlet is config-only (1-2 lines). Manual sales entry unblocks revenue tracking for non-API channels before dispatch planning needs that data.
**Delivers:**
- Tamtem GoFood outlet revenue syncing automatically
- Manual entry UI for Legato walk-in, Shopee, TikTok Shop sales
- Per-outlet commission rate configuration
**Addresses:** GoFood 3rd outlet (from milestone spec), manual sales entry (table stakes feature)
**Avoids:** Pitfall 3 (manual+API conflicts) via channel ownership enforcement in UI
**Research flag:** SKIP research-phase — patterns well-established from v1.1 GoBiz integration and existing `externalRevenue` manual entry support

### Phase 2: Multi-Channel Dispatch Planner
**Rationale:** Builds on existing K3Mart cockpit weekly planner pattern. Needs channels from Phase 1 to plan for. Core workflow for consignment.
**Delivers:**
- Generic `dispatchPlans` table for non-K3Mart consignment channels
- Unified weekly planner UI combining K3Mart + Legato + any other consignment outlets
- Dispatch confirmation pushes demand to kitchen targets (same pattern as K3Mart)
**Addresses:** Unified dispatch planner (table stakes), priority-based allocation (table stakes)
**Avoids:** Pitfall 5 (breaking K3Mart URLs) by creating new generic table alongside existing K3Mart-specific table
**Implements:** convex/dispatch/ component (queries + mutations)
**Research flag:** SKIP research-phase — extends proven K3Mart cockpit pattern from v1.1

### Phase 3: Kitchen Simplification with Aggregate Targets
**Rationale:** Benefits from all dispatch sources (Phase 2) being online. Simplifies kitchen UX while preserving critical backend data model.
**Delivers:**
- Aggregate daily production summary query (all demand sources combined)
- Simplified kitchen dashboard showing single target number with optional breakdown
- Audio alerts using Web Audio API (no dependency)
**Addresses:** Aggregate production targets (table stakes), demand waterfall visualization (differentiator)
**Avoids:** Pitfall 1 (destroying traceability) by keeping `orderItemProduction` backend intact, simplifying UI only
**Uses:** Native Web Audio API (AudioContext) for alert tones
**Research flag:** SKIP research-phase — UI simplification on established data model

### Phase 4: Consignment Revenue Workflow
**Rationale:** Most complex feature. Builds on dispatch planning (Phase 2) and sales data (Phase 1 manual entry). Three-layer tracking requires careful revenue recognition.
**Delivers:**
- `consignmentBatches` table tracking dispatch -> sale -> return lifecycle
- `consignmentSettlements` table for cash collection
- Batch creation on dispatch confirmation (K3Mart + generic channels)
- Settlement reconciliation with variance alerts
- ConsignmentManager.tsx page
**Addresses:** Consignment stock-out tracking, sale confirmation, cash collection tracking (all table stakes), settlement reconciliation (differentiator), consignment aging report (differentiator)
**Avoids:** Pitfall 2 (revenue triple-counting) by separating consignment batches from orders table, recognizing revenue only at outlet sale
**Implements:** convex/consignment/ component (full lifecycle management)
**Research flag:** Needs research-phase — Consignment accounting patterns are well-documented but application to Frollie's multi-partner setup (K3Mart API-driven, Legato manual-entry, different settlement cycles) needs validation. Research scope: revenue recognition timing validation, settlement reconciliation algorithm, batch aging/return handling.

### Phase 5: Cross-Channel Analytics Enhancement
**Rationale:** Summarizes data from all prior phases. Requires manual entry + API sync + consignment batches + commission rates to be accurate.
**Delivers:**
- Unified analytics combining API-synced (GoFood, K3Mart) and manual (Legato, Shopee, TikTok) data
- Channel profitability comparison (net margin after commissions + COGS)
- Cross-channel revenue charts with confidence indicators (exact/inferred/manual)
- Product-level breakdown across all channels
**Addresses:** Cross-channel revenue dashboard (table stakes), channel profitability comparison (differentiator)
**Avoids:** Pitfall 4 (apples to oranges comparison) by standardizing on Net Revenue metric, displaying Gross + Net + Commission side by side
**Extends:** Existing SalesAnalytics.tsx with new data sources
**Research flag:** SKIP research-phase — extends existing Recharts implementation with established patterns

### Phase Ordering Rationale

- **Phase 1 first:** 3rd outlet is minimal-change validation of multi-merchant architecture. Manual sales entry is prerequisite for non-API channel data flowing into later phases. Both are low-risk, high-value.
- **Phase 2 second:** Dispatch planner is the core workflow for consignment. Must come before consignment revenue tracking (Phase 4) since dispatches create the batches that track revenue. Needs Phase 1 channels to plan for.
- **Phase 3 third:** Kitchen simplification benefits from all dispatch sources (K3Mart + generic) being online. Showing aggregate target makes sense only when all demand sources are flowing.
- **Phase 4 fourth:** Most complex. Consignment lifecycle (dispatch -> sale -> cash) requires dispatch plans from Phase 2 and sales data from Phase 1. Settlement reconciliation requires consignment batches to exist.
- **Phase 5 last:** Analytics summarize everything. Needs manual entry (Phase 1), dispatch data (Phase 2), production data (Phase 3), consignment revenue (Phase 4) all flowing to provide complete cross-channel picture.
- **Risk mitigation order:** Start with proven patterns (outlet addition, manual entry), extend to generalizations (multi-channel planner), preserve complexity where needed (kitchen per-order tracking), tackle new complexity last (consignment 3-layer accounting).

### Research Flags

**Needs research-phase:**
- **Phase 4 (Consignment Revenue Workflow)** — Consignment accounting is well-documented but applying three-layer timing (dispatch/sale/cash) to Frollie's specific partner mix (K3Mart API-driven bi-monthly settlements vs Legato manual-entry weekly settlements) needs validation. Research questions: (1) How to auto-match externalRevenue records to consignmentBatches when sale is reported? (2) Settlement reconciliation algorithm for partial payments or returns. (3) Batch aging thresholds and return handling for perishable snacks. (4) Revenue recognition edge cases (returned goods, consignee discounts, damaged inventory).

**Standard patterns (skip research-phase):**
- **Phase 1** — 3rd outlet uses identical GoBiz integration as 1st/2nd outlets. Manual sales entry uses existing `externalRevenue` schema designed for this. Commission rate is simple config field.
- **Phase 2** — Multi-channel dispatch generalizes proven K3Mart weekly planner pattern. Same Radix UI components, same date-fns week utilities, same target-push pattern.
- **Phase 3** — Kitchen UI simplification on established `productionProductTargets` aggregation. Web Audio API is browser-native, well-documented.
- **Phase 5** — Analytics extends existing Recharts stacked bar implementation. Cross-channel aggregation uses established query patterns from v1.1.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Zero new dependencies required. All features achievable with existing stack validated in v1.1. Web Audio API is browser-native. CSV parsing is trivial. Multi-merchant GoBiz architecture already proven. |
| Features | MEDIUM | Domain patterns (MRP, consignment accounting, multi-source analytics) are well-documented. Application to Frollie's specific scale (200 balls/day, 4 channels, mixed API/manual) is custom. MVP definition clear but edge cases (returns, partial settlements, data reconciliation) need validation during implementation. |
| Architecture | HIGH | Direct codebase analysis of all 59 tables, existing integration adapters, K3Mart cockpit, production tracking. Clear component boundaries. Extend-don't-replace strategy preserves v1.1 stability. Schema evolution (3 new tables, 2 field additions) is straightforward. |
| Pitfalls | HIGH | Based on deep analysis of existing data models (orderItemProduction, externalRevenue, k3martDispatchPlans, productionLog). All critical pitfalls derived from actual v1.1 patterns that would break if misapplied in v1.2. Prevention strategies reference specific existing code. |

**Overall confidence:** HIGH

### Gaps to Address

- **Tamtem merchant ID verification** — PROJECT.md mentions "G958262444" but this must be verified against actual GoBiz portal data before Phase 1 implementation. If incorrect, sync will fail silently with console warnings. **Mitigation:** Validate merchant ID in Phase 1 planning before coding.

- **Per-depot sticker tracking for 3rd outlet** — Current `gofoodDepotStock` table has no `outletId` field. Implicitly assumes single depot (Goldfinch). Adding Crystal/Tamtem requires knowing which depot serves which outlet for Phase C sticker deduction. **Mitigation:** Phase 1 must extend `gofoodDepotStock` schema with `outletId` or `depotId` field before 3rd outlet goes live.

- **Cross-source revenue deduplication strategy** — Current dedup is per-source only (`by_source_txn` index). No mechanism to detect if manual entry + API sync both record the same sale. **Mitigation:** Phase 1 manual entry UI must enforce channel ownership (block API-synced outlets from manual entry). Phase 5 analytics should add daily reconciliation check comparing manual totals vs API totals per outlet, flagging >10% discrepancies.

- **Settlement reconciliation algorithm details** — Research identified the 3-layer pattern (dispatch/sale/cash) but didn't specify: (1) How to handle partial payments? (2) What if outlet reports sales for products not in any consignmentBatch? (3) Batch matching when multiple batches are active at same outlet? **Mitigation:** Phase 4 research-phase should prototype settlement reconciliation with real K3Mart data from v1.1 to validate edge case handling.

- **WIB timezone consistency** — v1.1 has scattered WIB offset implementations (+7 * 60 * 60 * 1000) across multiple files. Adding date-dependent features (dispatch plans, manual sales entry with date picker, analytics date ranges) multiplies the bug surface. **Mitigation:** Not blocking for v1.2 but flag for tech debt cleanup. Consider extracting to single `lib/datetime.ts` utility.

## Sources

### Primary (HIGH confidence)
- **Codebase analysis** — `convex/schema.ts` (59 tables, 1340 lines), `convex/k3martCockpit/queries.ts` + `mutations.ts`, `convex/integrations/gobiz/adapter.ts` + `config.ts`, `convex/orders/helpers/ballDistribution.ts` + `statusTransitions.ts`, `convex/externalData/queries.ts` + `mutations.ts`, `convex/productionTargets/queries.ts`, `package.json` (35 dependencies verified current)
- **Convex documentation** — [Cron Jobs](https://docs.convex.dev/scheduling/cron-jobs), [Scheduled Functions](https://docs.convex.dev/scheduling/scheduled-functions) — validated existing v1.1 implementation matches documented patterns
- **Web Audio API** — [MDN Notifications API](https://developer.mozilla.org/en-US/docs/Web/API/Notifications_API), [OurCodeWorld AudioContext guide](https://ourcodeworld.com/articles/read/1627/how-to-easily-generate-a-beep-notification-sound-with-javascript) — browser-native, no dependency needed

### Secondary (MEDIUM confidence)
- **Consignment accounting** — [HubiFi Consignment Revenue Guide](https://www.hubifi.com/blog/consignment-revenue-recognition-guide), [Finale Inventory](https://www.finaleinventory.com/accounting-and-inventory-software/consignment-inventory-accounting), [Stripe Resource](https://stripe.com/resources/more/what-is-consignment-revenue-recognition), [NetSuite](https://www.netsuite.com/portal/resource/articles/inventory-management/consignment-inventory.shtml), [PwC Viewpoint](https://viewpoint.pwc.com/dt/us/en/pwc/accounting_guides/revenue_from_contrac/revenue_from_contrac_US/chapter_8_practical__US/86consignment_arrang_US.html) — 3-layer timing pattern (dispatch/sale/cash) consistent across all sources
- **Production planning** — [FoodReady MRP Guide](https://foodready.ai/blog/material-requirements-planning-mrp/), [Siemens Aggregate Planning](https://www.sw.siemens.com/en-US/technology/aggregate-planning/), [OptiPro MPS Guide](https://www.optiproerp.com/blog/inventory-management-101-master-production-schedule-mps-explained/) — demand aggregation + priority waterfall pattern for small-scale production validated
- **Cross-channel analytics** — [Improvado Guide](https://improvado.io/blog/cross-channel-marketing-analytics) — unified revenue record with data origin tag pattern matches existing `externalRevenue` design

### Tertiary (LOW confidence)
- None — all research backed by either direct codebase analysis or multiple secondary sources

---
*Research completed: 2026-02-16*
*Ready for roadmap: yes*
