# Requirements: Frollie Recipe Master

**Defined:** 2026-03-03
**Core Value:** Production reliability — single source of truth for recipes, orders, kitchen production, and inventory

## v1.6 Requirements

Requirements for v1.6 Operational Simplification & Resilience. Each maps to roadmap phases.

### Backend Shared Helpers

- [x] **BSH-01**: Confidence types and `worstConfidence()` have a single source of truth in `convex/lib/confidence.ts`
- [x] **BSH-02**: WIB timezone helpers consolidated into `convex/lib/periodRange.ts` (no duplicates in externalData or k3martCockpit)
- [x] **BSH-03**: `sourceToPlatform()` lives in a shared module (`convex/lib/externalSource.ts`), not duplicated across query files

### Backend File Splits

- [ ] **BFS-01**: `externalData/queries.ts` slimmed to under 1,400 LOC (from 1,832) via pure helper extraction
- [ ] **BFS-02**: `k3martCockpit/queries.ts` slimmed to under 750 LOC (from 985) via pure helper extraction
- [ ] **BFS-03**: `reports/incomeStatement.ts` imports shared confidence + WIB from lib modules (no local duplicates)
- [ ] **BFS-04**: `orders/queries.ts` slimmed to under 800 LOC (from 1,279) via helper extraction
- [ ] **BFS-05**: `orders/mutations/orderCrud.ts` slimmed to under 700 LOC (from 1,085) via validation extraction
- [ ] **BFS-06**: `dispatchPlanner/queries.ts` slimmed to under 800 LOC (from 1,228) via simulation extraction

### Frontend File Splits

- [ ] **FFS-01**: `OverviewTab.tsx` slimmed to under 400 LOC (from 1,273) via sub-component extraction
- [ ] **FFS-02**: `GrabFoodManager.tsx` slimmed to under 600 LOC (from 1,486) via tab extraction
- [ ] **FFS-03**: `FinishedGoodsTab.tsx` slimmed to under 600 LOC (from 1,474) via dialog/table extraction
- [ ] **FFS-04**: `VouchersManager.tsx` slimmed to under 600 LOC (from 1,285) via form extraction

### Schema Review

- [x] **SCH-01**: Expert audit of all 59 Convex tables identifies data duplication, denormalization waste, and unused/redundant tables
- [x] **SCH-02**: Identified schema inefficiencies documented with specific remediation recommendations
- [x] **SCH-03**: Quick-win schema cleanups executed (remove unused fields/tables, add missing indexes) where safe

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
| New feature tables or schema additions | This milestone is pure refactoring + resilience — schema cleanup (field/table removal, index additions) is in scope via Phase 35, but no new feature tables |
| Order form component splits | Forms are complex but self-contained; splitting risks regression in critical path |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SCH-01 | Phase 35 | Complete |
| SCH-02 | Phase 35 | Complete |
| SCH-03 | Phase 35 | Complete |
| BSH-01 | Phase 36 | Complete |
| BSH-02 | Phase 36 | Complete |
| BSH-03 | Phase 36 | Complete |
| BFS-01 | Phase 36 | Pending |
| BFS-02 | Phase 36 | Pending |
| BFS-03 | Phase 36 | Pending |
| BFS-04 | Phase 37 | Pending |
| BFS-05 | Phase 37 | Pending |
| BFS-06 | Phase 37 | Pending |
| FFS-01 | Phase 38 | Pending |
| FFS-02 | Phase 38 | Pending |
| FFS-03 | Phase 38 | Pending |
| FFS-04 | Phase 38 | Pending |
| RES-01 | Phase 39 | Pending |
| RES-02 | Phase 39 | Pending |
| RES-03 | Phase 39 | Pending |
| RES-04 | Phase 39 | Pending |

**Coverage:**
- v1.6 requirements: 20 total
- Mapped to phases: 20
- Unmapped: 0

---
*Requirements defined: 2026-03-03*
*Last updated: 2026-03-05 after Plan 36-01 completion (BSH-01, BSH-02, BSH-03)*
