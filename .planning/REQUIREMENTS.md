# Requirements: Frollie Recipe Master

**Defined:** 2026-03-02
**Core Value:** Production reliability — single source of truth for recipes, orders, kitchen production, and inventory

## v1.5 Requirements

Requirements for v1.5 Financial Statements milestone. Each maps to roadmap phases.

### Income Statement Backend

- [ ] **IS-01**: System computes weekly gross revenue aggregated per channel from `externalRevenue` + `consignmentSettlements`
- [ ] **IS-02**: System computes revenue deductions (customer discounts, platform commissions, ad/promo burn, consignment rev share) per channel
- [x] **IS-03**: System resolves full BOM COGS (production + packaging) via in-memory map preloading from `menuProductComponents` + `componentTypes`
- [ ] **IS-04**: System computes net revenue, total COGS, gross profit, and gross margin percentage
- [ ] **IS-05**: System classifies every financial figure with confidence level (exact/calculated/inferred/missing)
- [ ] **IS-06**: System identifies data quality gaps inline (unmapped products, zero-cost components, missing channels) in the same query

### Income Statement Frontend

- [ ] **IS-07**: User can view a weekly income statement at `/financials` showing Revenue -> COGS -> Gross Profit with per-channel breakdown
- [ ] **IS-08**: User can navigate between weeks (prev/next) with WIB timezone boundaries (Monday start)
- [ ] **IS-09**: User sees previous week comparison with delta amounts and percentages for every line item
- [ ] **IS-10**: User sees confidence indicators on financial figures (exact = solid, calculated = calc icon, inferred = ~, missing = dash + warning)
- [ ] **IS-11**: User sees a data quality panel listing unmapped products, missing channels, and zero-cost components with actionable guidance

### Export

- [ ] **IS-12**: User can export the current week's income statement as flat-format CSV with line items, amounts, confidence flags, and deltas

### Testing

- [ ] **IS-13**: Backend tests verify BOM COGS accuracy with known-value assertions (production + packaging split)
- [ ] **IS-14**: Backend tests verify multi-channel revenue aggregation, discount correction, and edge cases (empty week, zero revenue margin, negative net)

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Financial Analysis Extensions

- **FIN-01**: User can import bank transactions for operating expense tracking
- **FIN-02**: System computes EBIT (Earnings Before Interest and Taxes) from gross profit minus operating expenses
- **FIN-03**: User can view monthly and quarterly P&L aggregations
- **FIN-04**: User can compare actual vs. budget for each income statement line item
- **FIN-05**: User can view a print-friendly P&L layout for sharing with partners

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Bank transaction import (OpEx) | Separate data source integration; deferred to v1.6 |
| Monthly/quarterly views | Start with weekly; period switching is additive |
| Budget vs. actual | Requires budget input system; after OpEx tracking |
| GrabFood revenue in P&L | Blocked on external OAuth scope grant; auto-populates when unblocked |
| BigSeller COGS cross-validation | External platform config (costFee = 0); BOM COGS used instead |
| Full double-entry accounting | Production system, not accounting; CSV export covers external tools |
| `estimateBallsFromName()` estimation | Honest zero COGS with "missing" flag is better than unreliable name-based estimates |
| Consignment multi-week proration | Simple periodStart-in-week matching; add proration if needed later |
| Print-friendly P&L view | Export to CSV covers external sharing needs for now |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| IS-01 | Phase 32 | Pending |
| IS-02 | Phase 32 | Pending |
| IS-03 | Phase 32 | Complete |
| IS-04 | Phase 32 | Pending |
| IS-05 | Phase 32 | Pending |
| IS-06 | Phase 32 | Pending |
| IS-07 | Phase 33 | Pending |
| IS-08 | Phase 33 | Pending |
| IS-09 | Phase 33 | Pending |
| IS-10 | Phase 33 | Pending |
| IS-11 | Phase 33 | Pending |
| IS-12 | Phase 33 | Pending |
| IS-13 | Phase 34 | Pending |
| IS-14 | Phase 34 | Pending |

**Coverage:**
- v1.5 requirements: 14 total
- Mapped to phases: 14
- Unmapped: 0

---
*Requirements defined: 2026-03-02*
*Last updated: 2026-03-02 after roadmap creation*
