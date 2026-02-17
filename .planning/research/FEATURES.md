# Feature Research

**Domain:** Multi-channel dispatch planning, consignment revenue, kitchen simplification, cross-channel analytics for small-scale Indonesian FMCG snack production
**Researched:** 2026-02-16
**Confidence:** MEDIUM (domain patterns well-understood; specifics tailored to Frollie's unique scale and channel mix)

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Unified dispatch planner across all channels** | Manager already plans K3Mart dispatches; extending to GoFood/Legato/other consignment is the natural next step. Without it, dispatch planning remains siloed. | MEDIUM | Extend existing `k3martDispatchPlans` pattern to a generic `dispatchPlans` model covering all channels. K3Mart already has outlet-first weekly planner -- generalize it. |
| **Priority-based production allocation** | With ~200 balls/day capacity, production must satisfy direct orders first (revenue today), then GoFood (revenue in days), then consignment (revenue in weeks). Without explicit priority, kitchen staff guess. | LOW | Priority is a simple ordered enum on channels. Display order in kitchen dashboard reflects priority. No complex optimization needed at this scale. |
| **Consignment stock-out tracking** | When goods leave the kitchen for a consignment outlet, they are no longer "in production" but not yet "sold." This in-transit/at-outlet state MUST be tracked or inventory numbers lie. | MEDIUM | Existing `k3martStockMovements` already tracks this for K3Mart. Generalize to all consignment channels. Revenue is NOT recognized here -- only location transfer. |
| **Sale confirmation from consignment outlets** | Consignment goods sell at the outlet. The system needs to know what sold so it can recognize revenue and calculate what to restock. | MEDIUM | K3Mart has stock snapshots via API. For non-API outlets (Legato), this is manual entry: "X units of Y sold today at outlet Z." |
| **Cash collection tracking per consignment partner** | K3Mart pays 2x/month, Legato 1x/week. Manager needs to know: what's owed, what's collected, what's outstanding. Without this, cash flow is a guessing game. | MEDIUM | New `consignmentSettlements` table. Each settlement links to a date range + outlet + amount expected vs received. Simple ledger, not full accounting. |
| **Aggregate production target from all demand sources** | Kitchen currently sees targets from orders + K3Mart synthetic demand. Adding GoFood demand + other consignment demand to the same view is expected. | LOW | Existing `kitchenConfig` + production targets just need additional demand source inputs. Sum demand across channels, display as single target with breakdown tooltip. |
| **Cross-channel revenue dashboard** | Sales analytics already shows GoFood + K3Mart + internal. Adding Legato, Shopee, TikTok Shop data (even manual) to the same charts is the obvious next step. | MEDIUM | `externalRevenue` table already supports `manual_entry` as `dataOrigin`. Build manual entry UI for non-API channels. Charts already aggregate by source. |
| **Manual sales entry for non-API channels** | Shopee, TikTok Shop, Legato have no API. Manager needs to enter daily/weekly sales figures. Without this, analytics have blind spots. | LOW | Simple form: select channel + outlet, select date, enter product quantities and revenue. Writes to `externalRevenue` with `dataOrigin: "manual_entry"`. |
| **Per-channel commission/fee configuration** | GoFood takes ~19% + VAT. Legato Goldfinch takes 10%. Legato Tamtem takes 17%. Net revenue requires knowing the fee structure per channel. | LOW | Config table: `channelCommissionRates` with channel, outlet, rate, effective date. Applied when calculating net revenue in analytics. |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but valuable.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Demand waterfall visualization** | Show how 200 balls/day capacity is allocated: direct orders (80) + GoFood (50) + K3Mart (40) + Legato (20) = 190, leaving 10 buffer. Makes capacity planning visceral and immediate. | LOW | Stacked bar or waterfall chart in kitchen dashboard header. Data already exists across demand sources. Pure frontend visualization. |
| **Consignment aging report** | "These 30 packages at K3Mart outlet A have been there for 14 days with no sale." Identifies slow-moving consignment stock that should be rotated or recalled. | MEDIUM | Requires tracking dispatch date per batch at each outlet. Compare dispatch date to sale/return date. Flag items exceeding threshold (e.g., 7 days for perishable snacks). |
| **Settlement reconciliation with variance alerts** | When K3Mart's bi-monthly payment arrives, auto-compare expected amount (units sold x price) vs actual payment received. Flag discrepancies. | MEDIUM | Computed from `externalRevenue` (sales) vs `consignmentSettlements` (payment). Alert when variance exceeds threshold (e.g., 5%). Saves hours of manual reconciliation. |
| **Predictive restock suggestions per outlet** | "Based on last 4 weeks, K3Mart outlet A sells 8 Original/day on weekdays and 12 on weekends. Suggest dispatching 40 for this week." | MEDIUM | Already partially implemented in K3Mart cockpit (`suggestedQty`). Extend to use rolling average from `externalRevenue` data. Apply to all consignment outlets. |
| **Channel profitability comparison** | Side-by-side view: "Direct orders: 45% margin. GoFood Goldfinch: 22% margin after commission. K3Mart: 30% margin after consignment fees." Informs channel strategy. | LOW | All data exists: COGS from BOM, revenue from `externalRevenue`, commission rates from config. Pure aggregation query + chart. |
| **Production shortfall early warning** | "At current production rate, you will be 30 balls short for tomorrow's confirmed orders + consignment commitments." Alerts at 2pm for next-day planning. | MEDIUM | Compare cumulative production (from `productionLog`) against cumulative demand (orders + dispatch plans). Cron job checks at configurable time, creates alert. |
| **GoFood 3rd outlet onboarding** | Adding Crystal as 3rd GoFood outlet. The system should make adding outlet N+1 trivial -- just add credentials and mapping. | LOW | Architecture already supports N outlets via `externalOutlets`. Crystal (G347061572) is already syncing revenue. "3rd outlet" is just another `externalOutlets` row + product mappings. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Full double-entry accounting for consignment** | "We need proper accounting!" | This is a production management system, not an accounting system. Double-entry adds massive complexity (chart of accounts, journal entries, trial balance). At 200 balls/day, this is overkill. | Track the 3 timing layers (dispatch, sale confirmation, cash collection) as simple records. Export summaries to actual accounting software (Excel/spreadsheet) for formal books. |
| **Automated production scheduling/optimization** | "System should decide what to produce when" | At ~200 balls/day with 2-3 staff, the kitchen lead makes this call in 30 seconds. Automated scheduling adds complexity for zero value at this scale. | Show demand breakdown by priority. Let kitchen staff decide. The value is in visibility, not automation. |
| **Real-time consignment stock levels via IoT/barcode** | "We should know exactly what's on each shelf" | Requires hardware (scanners/sensors), consignee cooperation, and maintenance. Consignees (K3Mart, cafes) will not install equipment for a small supplier. | Stock delta inference from snapshots (already working for K3Mart) + periodic manual counts for non-API outlets. |
| **Automated payment collection/invoicing** | "System should send invoices and track payments automatically" | Consignment partners have their own payment cycles and processes. Automating this creates friction with partners who have established workflows. | Track expected vs received payments. Generate settlement reports for manual review. Flag overdue amounts. |
| **Per-unit consignment tracking (serialization)** | "Track each individual package from kitchen to outlet to customer" | Massive overhead for a Rp 40-120k snack product. No customer or partner expects this. Scanning each unit slows kitchen and dispatch. | Track by batch: "20 Originals dispatched to K3Mart on Feb 16." FIFO assumption for which ones sold. |
| **Multi-currency support** | "What if we sell internationally?" | Not happening at this scale. All channels are IDR. Adding currency conversion adds complexity everywhere. | Keep everything in IDR. If international expansion happens, it is a v3+ concern. |
| **Complex discount/promotion engine per channel** | "Each channel has different promos" | GoFood/Shopee/TikTok manage their own promotions. Frollie does not control those discounts. | Track commission and ad burn from platform data. Do not try to model platform-specific promotions. |

## Feature Dependencies

```
[Unified Dispatch Planner]
    |-- requires --> [Priority-based channel config]
    |-- requires --> [Consignment stock-out tracking]
    |                    |-- requires --> [Sale confirmation from outlets]
    |                    |                    |-- enables --> [Cash collection tracking]
    |                    |-- enables --> [Consignment aging report]
    |
    |-- feeds into --> [Aggregate production targets]
                           |-- enables --> [Demand waterfall visualization]
                           |-- enables --> [Production shortfall warning]

[Manual sales entry for non-API channels]
    |-- enables --> [Cross-channel revenue dashboard]
    |                    |-- enables --> [Channel profitability comparison]
    |
    |-- requires --> [Per-channel commission config]

[GoFood 3rd outlet onboarding]
    |-- independent (already architected for N outlets)

[Settlement reconciliation]
    |-- requires --> [Sale confirmation from outlets]
    |-- requires --> [Cash collection tracking]
```

### Dependency Notes

- **Dispatch Planner requires Channel Config:** Priority levels and commission rates must be configured before dispatch can be planned intelligently.
- **Cash Collection requires Sale Confirmation:** You cannot know what is owed until you know what sold. Sale confirmation is the trigger for accounts receivable.
- **Cross-channel Dashboard requires Manual Entry:** Without manual entry for non-API channels, the dashboard has blind spots and managers will not trust the data.
- **Aggregate Production requires Dispatch Planner:** Kitchen targets need demand from all channels. Dispatch plans are the demand signal for consignment channels.
- **Settlement Reconciliation requires both Sale Confirmation and Cash Collection:** It is the comparison layer between the two.

## MVP Definition

### Phase 1: Foundation (Build First)

These enable everything else.

- [ ] **Channel configuration with priority levels** -- Define channels (Direct, GoFood, K3Mart, Legato, Shopee, TikTok), priority order, commission rates. Simple config table + admin UI.
- [ ] **Generalized dispatch planner** -- Extend K3Mart weekly planner pattern to cover all consignment channels. Outlet-first view already exists; add channel grouping.
- [ ] **Consignment lifecycle tracking (dispatch -> sale -> cash)** -- Three-layer tracking: (1) goods dispatched to outlet, (2) goods sold at outlet, (3) cash collected from partner. Each is a separate record with timestamps.
- [ ] **Manual sales entry for non-API channels** -- Form for entering daily sales from Shopee, TikTok Shop, Legato outlets. Writes to existing `externalRevenue` table.

### Phase 2: Kitchen Integration (Build After Foundation)

Connect the demand pipeline to production.

- [ ] **Aggregate production target from all sources** -- Kitchen dashboard shows total demand breakdown: orders (priority 1) + GoFood (2) + K3Mart (3) + other consignment (4). Existing synthetic order pattern extended.
- [ ] **GoFood 3rd outlet** -- Add new outlet to `externalOutlets`, configure product mappings, verify sync.
- [ ] **Per-channel commission configuration** -- Admin UI for setting commission rates per channel/outlet. Applied in revenue calculations.

### Phase 3: Analytics and Reconciliation (Build After Data Flowing)

These need data from phases 1-2 to be meaningful.

- [ ] **Cross-channel revenue dashboard enhancement** -- Unified view combining API-synced (GoFood, K3Mart) and manually-entered (Legato, Shopee, TikTok) data. Product-level breakdown.
- [ ] **Channel profitability comparison** -- Net margin per channel after commissions and COGS.
- [ ] **Cash collection tracking and settlement reconciliation** -- Track payments received vs expected. Alert on variances.
- [ ] **Consignment aging report** -- Identify slow-moving stock at outlets.

### Future Consideration (v2+)

- [ ] **Production shortfall early warning** -- Requires stable production data and accurate demand forecasting. Defer until production tracking is reliable across all channels.
- [ ] **Demand waterfall visualization** -- Pure UX enhancement. Build after data is flowing and accurate.
- [ ] **Predictive restock suggestions** -- Requires sufficient historical data (4+ weeks per outlet). Defer until manual process is validated.

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority | Depends On Existing |
|---------|------------|---------------------|----------|---------------------|
| Channel config + priority | HIGH | LOW | P1 | New table, simple CRUD |
| Generalized dispatch planner | HIGH | MEDIUM | P1 | Extends `k3martDispatchPlans` pattern |
| Consignment lifecycle (3 layers) | HIGH | MEDIUM | P1 | New tables: `consignmentDispatches`, `consignmentSales`, `consignmentSettlements` |
| Manual sales entry | HIGH | LOW | P1 | Writes to existing `externalRevenue` |
| Aggregate production targets | HIGH | LOW | P1 | Extends existing `kitchenConfig` + synthetic orders |
| GoFood 3rd outlet | MEDIUM | LOW | P2 | `externalOutlets` + `externalProductMappings` |
| Per-channel commission config | MEDIUM | LOW | P2 | New config table |
| Cross-channel dashboard | HIGH | MEDIUM | P2 | Extends existing `SalesAnalytics.tsx` |
| Channel profitability | MEDIUM | LOW | P2 | Aggregation of existing data |
| Cash collection tracking | MEDIUM | MEDIUM | P2 | New `consignmentSettlements` table |
| Settlement reconciliation | MEDIUM | MEDIUM | P3 | Requires cash collection + sale data |
| Consignment aging | LOW | MEDIUM | P3 | Requires dispatch date tracking |
| Production shortfall warning | MEDIUM | MEDIUM | P3 | Requires reliable all-channel demand |
| Demand waterfall viz | LOW | LOW | P3 | Pure frontend |

**Priority key:**
- P1: Must have -- enables the core workflow
- P2: Should have -- adds significant value once P1 is working
- P3: Nice to have -- polish and optimization

## Domain Pattern Analysis

### 1. Multi-Channel Dispatch Planning

**How production management systems handle this:**

The standard pattern is a **Master Production Schedule (MPS)** that takes demand from all channels and creates a unified production plan. At enterprise scale, this involves complex optimization algorithms. At Frollie's scale (~200 balls/day, 4 channels), the pattern simplifies to:

1. **Demand aggregation**: Sum demand from all channels for each product type
2. **Priority waterfall**: Allocate capacity to highest-priority channels first
3. **Dispatch planning**: Schedule when and how much to send to each outlet

The key insight for Frollie: the K3Mart cockpit already implements the dispatch planning pattern. The generalization is extending that same outlet-first weekly grid to cover Legato outlets and GoFood depot restocking. Direct orders do not need a "dispatch" -- they flow through the existing order pipeline.

**Confidence:** MEDIUM -- Pattern is well-established in MRP literature. Application to Frollie's specific scale and channel mix is custom.

### 2. Consignment Revenue Recognition (3 Timing Layers)

**How accounting systems handle consignment:**

Per IFRS/GAAP and every accounting reference consulted, consignment goods do NOT generate revenue when shipped to the consignee. Revenue is recognized only when the end customer buys the product. The three timing layers are:

| Layer | Event | What Happens in System | Accounting Impact |
|-------|-------|------------------------|-------------------|
| 1. Production/Dispatch | Goods leave kitchen for outlet | Location transfer. Inventory moves from "Kitchen" to "At [Outlet]". No revenue. | Asset reclassification only |
| 2. Sale Confirmation | Outlet reports goods sold | Revenue recognized. COGS recorded. Accounts receivable created for the outlet's share. | Revenue + AR created |
| 3. Cash Collection | Partner pays settlement | Cash received. AR reduced. | Cash in, AR reduced |

For Frollie, this means:
- **K3Mart**: Layer 1 is dispatch plan confirmation. Layer 2 is stock delta from API snapshots (already computed). Layer 3 is bi-monthly payment.
- **Legato**: Layer 1 is manual dispatch entry. Layer 2 is manual sales entry (weekly). Layer 3 is weekly payment.
- **GoFood**: NOT consignment. GoFood is direct sale through platform. Revenue recognized at order completion. Cash collection follows GoFood's settlement cycle.

**Critical distinction:** GoFood is NOT consignment even though payment is delayed. The customer pays GoFood at order time. GoFood is an intermediary, not a consignee. Commission is a cost of sale, not a consignment arrangement.

**Confidence:** HIGH -- Consignment accounting is well-documented. Application to Frollie's specific partners is straightforward.

### 3. Simplified Aggregate Production Targets

**How food production systems handle multi-source demand:**

The standard approach is:
1. Collect demand signals from all sources (orders, forecasts, restock commitments)
2. Aggregate by product type (Original balls, Jumbo balls)
3. Present as a single target with optional breakdown

Frollie's existing kitchen dashboard already does this for orders + K3Mart. The extension is:
- Add GoFood depot restock demand (from `gofoodDepotStock` targets)
- Add other consignment dispatch plans (from generalized dispatch planner)
- Show breakdown: "Target: 200 balls = 80 orders + 50 GoFood + 40 K3Mart + 20 Legato + 10 buffer"

The "absorption" pattern means the kitchen sees ONE number, not four separate targets. Breakdown is available on tap/hover for transparency.

**Confidence:** HIGH -- This is the simplest pattern and already partially implemented.

### 4. Cross-Channel Product Analytics

**How analytics platforms combine API and manual data:**

The standard pattern is a **unified revenue record** with a data origin tag:
- `api_revenue`: Automatically synced from platform API (GoFood, K3Mart)
- `manual_entry`: Manually entered by manager (Legato, Shopee, TikTok)
- `stock_delta`: Inferred from stock level changes (K3Mart fallback)

Frollie's `externalRevenue` table already has this pattern with the `dataOrigin` field. The missing pieces are:
1. **Manual entry UI** for non-API channels
2. **Product mapping** for manual entries (link to `menuProducts`)
3. **Commission rate** per channel for net revenue calculation
4. **Unified charts** that show all sources together with confidence indicators

The key UX principle: data from API sources should be visually distinguished from manual entries. Users need to know which numbers are exact (API) vs approximate (manual). The existing `confidence` field (`exact`, `inferred`, `manual`) on `externalRevenue` supports this.

**Confidence:** MEDIUM -- Architecture exists. Implementation of manual entry UX and unified visualization is custom.

## Sources

- [Consignment Revenue Recognition Guide - HubiFi](https://www.hubifi.com/blog/consignment-revenue-recognition-guide)
- [Consignment Inventory Accounting - Finale Inventory](https://www.finaleinventory.com/accounting-and-inventory-software/consignment-inventory-accounting)
- [What is Consignment Revenue Recognition - Stripe](https://stripe.com/resources/more/what-is-consignment-revenue-recognition)
- [Consignment Inventory - NetSuite](https://www.netsuite.com/portal/resource/articles/inventory-management/consignment-inventory.shtml)
- [Consignment Arrangements - PwC Viewpoint](https://viewpoint.pwc.com/dt/us/en/pwc/accounting_guides/revenue_from_contrac/revenue_from_contrac_US/chapter_8_practical__US/86consignment_arrang_US.html)
- [The Consignment Inventory Dilemma - Bizowie](https://bizowie.com/the-consignment-inventory-dilemma-why-most-erps-cant-handle-it)
- [MRP for Food Manufacturers - FoodReady](https://foodready.ai/blog/material-requirements-planning-mrp/)
- [Aggregate Planning - Siemens](https://www.sw.siemens.com/en-US/technology/aggregate-planning/)
- [Master Production Schedule Guide - OptiPro](https://www.optiproerp.com/blog/inventory-management-101-master-production-schedule-mps-explained/)
- [Food Demand Forecasting - Qaltivate](https://qaltivate.com/blog/food-demand-forecasting-software/)
- [FMCG Supply Chain Planning - SCM Globe](https://www.scmglobe.com/the-particularities-of-supply-chain-planning-in-fmcg/)
- [Cross-Channel Analytics Guide - Improvado](https://improvado.io/blog/cross-channel-marketing-analytics)

---
*Feature research for: Multi-channel dispatch, consignment revenue, kitchen simplification, cross-channel analytics*
*Researched: 2026-02-16*
