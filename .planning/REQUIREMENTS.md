# Requirements: Frollie Recipe Master

**Defined:** 2026-03-03
**Core Value:** Production reliability — single source of truth for recipes, orders, kitchen production, and inventory

## v1.6 Requirements

Requirements for v1.6 Operational Simplification & Resilience. Each maps to roadmap phases.

### Backend Shared Helpers

- [ ] **BSH-01**: Confidence types and `worstConfidence()` have a single source of truth in `convex/lib/confidence.ts`
- [ ] **BSH-02**: WIB timezone helpers consolidated into `convex/lib/periodRange.ts` (no duplicates in externalData or k3martCockpit)
- [ ] **BSH-03**: `sourceToPlatform()` lives in a shared module (`convex/lib/externalSource.ts`), not duplicated across query files

### Backend File Splits

- [ ] **BFS-01**: `externalData/queries.ts` slimmed to under 1000 LOC (from 1,832) via helper extraction
- [ ] **BFS-02**: `k3martCockpit/queries.ts` slimmed to under 500 LOC (from 985) via helper extraction
- [ ] **BFS-03**: `reports/incomeStatement.ts` imports shared confidence + WIB from lib modules (no local duplicates)
- [ ] **BFS-04**: `orders/queries.ts` slimmed to under 800 LOC (from 1,279) via helper extraction
- [ ] **BFS-05**: `orders/mutations/orderCrud.ts` slimmed to under 700 LOC (from 1,085) via validation extraction
- [ ] **BFS-06**: `dispatchPlanner/queries.ts` slimmed to under 800 LOC (from 1,228) via simulation extraction

### Frontend File Splits

- [ ] **FFS-01**: `OverviewTab.tsx` slimmed to under 400 LOC (from 1,273) via sub-component extraction
- [ ] **FFS-02**: `GrabFoodManager.tsx` slimmed to under 600 LOC (from 1,486) via tab extraction
- [ ] **FFS-03**: `FinishedGoodsTab.tsx` slimmed to under 600 LOC (from 1,474) via dialog/table extraction
- [ ] **FFS-04**: `VouchersManager.tsx` slimmed to under 600 LOC (from 1,285) via form extraction

### Resilience

- [ ] **RES-01**: E2E Playwright test for order lifecycle (create -> confirm -> produce -> complete)
- [ ] **RES-02**: E2E Playwright test for kitchen production flow (tray allocation -> EoS recording)
- [ ] **RES-03**: E2E Playwright test for sales analytics page (period selector, channel breakdown)
- [ ] **RES-04**: Tamtem depot deduction no longer silently skips — error is logged or auto-seed runs

## Future Requirements

Deferred beyond v1.6. Tracked but not in current roadmap.

### Error Monitoring

- **MON-01**: Sentry or LogRocket integration for runtime error reporting
- **MON-02**: Error boundary reporting pipeline to external service

### Extended Simplification

- **EXT-01**: Integration adapter files simplified (gobiz 1,207 LOC, k3mart 1,106 LOC, grabfood 829 LOC)
- **EXT-02**: Generic query factory applied to all query files (currently only simple entities)
- **EXT-03**: Order form components simplified (OrderFormPOS 1,068 LOC, OrderCreate 1,017 LOC)

### Financial Extensions

- **FIN-01**: Monthly/quarterly P&L period views (additive on v1.5 weekly)
- **FIN-02**: Bank transaction import for OpEx tracking
- **FIN-03**: Budget vs. actual comparison system

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Sentry/LogRocket integration | Separate initiative — production stability sufficient without external monitoring |
| Integration adapter refactoring | Adapters are stable, rarely modified; ROI too low for this milestone |
| Monthly/quarterly P&L views | Additive feature, not simplification |
| New features or schema changes | This milestone is pure refactoring + resilience — zero schema changes |
| Order form component splits | Forms are complex but self-contained; splitting risks regression in critical path |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| BSH-01 | — | Pending |
| BSH-02 | — | Pending |
| BSH-03 | — | Pending |
| BFS-01 | — | Pending |
| BFS-02 | — | Pending |
| BFS-03 | — | Pending |
| BFS-04 | — | Pending |
| BFS-05 | — | Pending |
| BFS-06 | — | Pending |
| FFS-01 | — | Pending |
| FFS-02 | — | Pending |
| FFS-03 | — | Pending |
| FFS-04 | — | Pending |
| RES-01 | — | Pending |
| RES-02 | — | Pending |
| RES-03 | — | Pending |
| RES-04 | — | Pending |

**Coverage:**
- v1.6 requirements: 17 total
- Mapped to phases: 0
- Unmapped: 17

---
*Requirements defined: 2026-03-03*
*Last updated: 2026-03-03 after initial definition*
