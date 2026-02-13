# Requirements: Frollie Recipe Master — Concerns Cleanup & Refactor

**Defined:** 2026-02-13
**Core Value:** Every concern in CONCERNS.md is resolved or explicitly accepted, the build passes, and no existing features regress.

## v1 Requirements

Requirements for this milestone. Each maps to roadmap phases.

### Test Infrastructure

- [ ] **TEST-01**: Ball distribution algorithm (`ballDistribution.ts`, 342 lines) has comprehensive unit tests covering allocation, multi-product orders, partial fills, and tray exhaustion
- [ ] **TEST-02**: FIFO inventory consumption (`fifo.ts`) has unit tests covering oldest-first selection, partial batch depletion, and batch boundary cases
- [ ] **TEST-03**: Order lifecycle has integration tests covering create → status transitions → inventory reservation → consumption → cancellation rollback
- [ ] **TEST-04**: Voucher handling (`voucherHandling.ts`) has unit tests covering discount calculations and edge cases

### Backend Factories

- [ ] **FACT-01**: `convex-helpers` installed and `customMutation`/`customQuery` auth wrappers created in `convex/lib/functions.ts`
- [ ] **FACT-02**: Simple entity mutations (ingredients, materials, tags, customers) migrated to use `customMutation` auth wrapper (eliminating repeated `requireRole` boilerplate)
- [ ] **FACT-03**: Common query helper functions created for standard list/get/getBy patterns
- [ ] **FACT-04**: Protected mutation wrapper (`protectedMutation`) consistently applied across all 27 mutation files

### BOM Migration

- [ ] **BOM-01**: All backend query files read ball composition from BOM (`menuProductComponents` + `componentTypes`), with fallback to deprecated fields for historical orders only
- [ ] **BOM-02**: All mutation files stop writing `productionType`/`productionUnits` to `menuProducts` and `orderItems`
- [ ] **BOM-03**: All 19 frontend files reading `productionType`/`productionUnits` migrated to use BOM-derived data
- [ ] **BOM-04**: Deprecated fields marked `v.optional()` with DEPRECATED comments in schema (kept for historical data)
- [ ] **BOM-05**: Deprecated `by_production_type` index on `orderItems` removed after migration
- [ ] **BOM-06**: Backfill migration ensures all `menuProducts` have corresponding BOM entries in `menuProductComponents`

### Quick Fixes — Tech Debt

- [ ] **QFIX-01**: Hardcoded `"current-user"` replaced with actual authenticated username from AuthContext in all inventory mutations (LocationsManager, ComponentTypeDialog, ReceiveStockDialog, AdjustStockDialog, TransferStockDialog)
- [ ] **QFIX-02**: Old `KitchenView.tsx` removed entirely — route updated to point to KitchenViewV2
- [ ] **QFIX-03**: `convex/orders/mutations.ts` shim removed — all frontend imports updated to use domain-specific mutation files (`orderCrud.ts`, `kitchen.ts`, etc.)
- [ ] **QFIX-04**: Deprecated order statuses (`ProductionComplete`, `Packaging`) removed from UI status mappings; kept in schema validator for historical data
- [ ] **QFIX-05**: Redundant single-field indexes audited and removed where covered by compound indexes

### Quick Fixes — Bugs

- [ ] **BUG-01**: Stock shortage override dialog has proper UI confirmation step with override option when inventory is insufficient
- [ ] **BUG-02**: All TODO comments in production code resolved or converted to tracked issues (K3MartCockpit missing queries, OrderDetail production query, ingredient/material cost invalidation)

### Quick Fixes — Security

- [ ] **SEC-01**: Environment variable audit complete — sensitive config removed from version control, only `.env.example` template committed
- [ ] **SEC-02**: Token-in-args pattern documented as acceptable for internal tool (no code change)
- [ ] **SEC-03**: PIN hashing documented as acceptable (SHA256 + rate limiting for 6-digit PINs on internal tool)

### Query Optimization

- [ ] **PERF-01**: N+1 query pattern in `orders/queries.ts` fixed — batch fetch items and customers, then merge (reduces 100 orders from 101 queries to 2 queries)
- [ ] **PERF-02**: Large queries in `externalData/queries.ts` paginated with `take()`/offset pattern and date range filters
- [ ] **PERF-03**: Kitchen queries optimized — compound index or denormalized `isKitchenVisible` field to avoid multi-status loop
- [ ] **PERF-04**: COGS cached on `menuProducts.unitCost` field — invalidated on component changes

### Frontend Factories

- [ ] **FHOOK-01**: Generic `createMutationHook` factory created in `src/hooks/convex/` with toast notification wrappers
- [ ] **FHOOK-02**: Simple entity hooks migrated to use factory (ingredients, materials, tags, customers, locations, vouchers) — each hook file shrinks from ~115 lines to ~15 lines
- [ ] **FUI-01**: Generic `EntityManager<T>` component created in `src/components/shared/` with pluggable columns, forms, and validation
- [ ] **FUI-02**: Simple CRUD manager pages migrated to use `EntityManager` (IngredientsManager, MaterialsManager, CustomersManager, LocationsManager)

### Schema Cleanup

- [ ] **SCHEMA-01**: All 167 `v.optional()` fields audited and categorized (legitimately optional / should be required / needs backfill)
- [ ] **SCHEMA-02**: Fields that should be required (all docs have values) made required in schema
- [ ] **SCHEMA-03**: Confirmed unused tables/fields removed (`menuProducts.isFixed`, `kitchenInventory` table)
- [ ] **SCHEMA-04**: Denormalization pattern documented with schema comments (intentional for historical snapshots)

### Infrastructure

- [ ] **INFRA-01**: Automated Convex database backup configured (scheduled export)
- [ ] **INFRA-02**: Dependency compatibility audit complete — all dependencies verified working together
- [ ] **INFRA-03**: Production counts consolidated — `productionCounts` table derived from `productionLog` sums (single source of truth)

## v2 Requirements

Deferred to future milestones. Tracked but not in current roadmap.

### Monitoring & Observability

- **MON-01**: Error monitoring integration (Sentry/LogRocket) for production debugging
- **MON-02**: APM (Application Performance Monitoring) for query performance visibility
- **MON-03**: Convex database size monitoring with alerting

### Additional Testing

- **ETEST-01**: E2E Playwright tests for kitchen workflow (order → production → packaging → shipment)
- **ETEST-02**: E2E tests for critical form submission flows (order creation, recipe editing)
- **ETEST-03**: K3 Mart adapter integration tests for retry logic and error handling

### K3 Mart Cockpit

- **K3MART-01**: Wire production readiness targets from backend (currently uses stickered count as placeholder)
- **K3MART-02**: Enhance outlet stock query with full OutletCardGrid fields (missing variant breakdown, movement data)
- **K3MART-03**: Implement dispatch plan data for outlet product cards (planned qty, plan status)
- **K3MART-04**: Create backend query for inventory sources/destinations (currently hardcoded)
- **K3MART-05**: Create stock movements query for outlet grid (inbound/outbound tracking)
- **K3MART-06**: Implement production bump approval workflow (currently logs to console)

### Code Quality

- **CQ-01**: `useConvex` prefix removal from all hook names (cosmetic, high conflict risk)
- **CQ-02**: `productionUnitTypes` → `componentTypes` migration (bridge works, low value)
- **CQ-03**: Codegen script for generating new entity boilerplate from templates

### Data Management

- **DATA-01**: Archival strategy for old orders (soft delete, archive tables)
- **DATA-02**: File upload size validation for feedback screenshots
- **DATA-03**: Client-side image compression before Convex Storage upload

## Out of Scope

| Feature | Reason |
|---------|--------|
| PIN hash migration to bcrypt/scrypt | SHA256 acceptable for 6-digit PINs with rate limiting on internal tool |
| HTTP-only cookies / Convex Auth migration | Token-in-args acceptable for internal tool |
| New feature development | This milestone is cleanup only |
| React 19 / Tailwind 4 upgrades | Already at latest versions per research |
| `convex-ents` ORM adoption | Too heavy for refactoring initiative |
| Runtime Convex function factories | Breaks type safety — use composition/helpers instead |
| camelCase/snake_case transform layer cleanup | Separate concern, high merge conflict risk |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| TEST-01 | Phase 1: Test Infrastructure | Pending |
| TEST-02 | Phase 1: Test Infrastructure | Pending |
| TEST-03 | Phase 1: Test Infrastructure | Pending |
| TEST-04 | Phase 1: Test Infrastructure | Pending |
| SEC-01 | Phase 2: Security & Docs | Pending |
| SEC-02 | Phase 2: Security & Docs | Pending |
| SEC-03 | Phase 2: Security & Docs | Pending |
| QFIX-01 | Phase 3: Tech Debt | Pending |
| QFIX-02 | Phase 3: Tech Debt | Pending |
| QFIX-03 | Phase 3: Tech Debt | Pending |
| QFIX-04 | Phase 3: Tech Debt | Pending |
| QFIX-05 | Phase 3: Tech Debt | Pending |
| BUG-01 | Phase 4: Bugs | Pending |
| BUG-02 | Phase 4: Bugs | Pending |
| FACT-01 | Phase 5: Backend Factories | Pending |
| FACT-02 | Phase 5: Backend Factories | Pending |
| FACT-03 | Phase 5: Backend Factories | Pending |
| FACT-04 | Phase 5: Backend Factories | Pending |
| BOM-01 | Phase 6: BOM Migration | Pending |
| BOM-02 | Phase 6: BOM Migration | Pending |
| BOM-03 | Phase 6: BOM Migration | Pending |
| BOM-04 | Phase 6: BOM Migration | Pending |
| BOM-05 | Phase 6: BOM Migration | Pending |
| BOM-06 | Phase 6: BOM Migration | Pending |
| PERF-01 | Phase 7: Query Optimization | Pending |
| PERF-02 | Phase 7: Query Optimization | Pending |
| PERF-03 | Phase 7: Query Optimization | Pending |
| PERF-04 | Phase 7: Query Optimization | Pending |
| SCHEMA-01 | Phase 8: Schema Cleanup | Pending |
| SCHEMA-02 | Phase 8: Schema Cleanup | Pending |
| SCHEMA-03 | Phase 8: Schema Cleanup | Pending |
| SCHEMA-04 | Phase 8: Schema Cleanup | Pending |
| FHOOK-01 | Phase 9: Frontend Factories | Pending |
| FHOOK-02 | Phase 9: Frontend Factories | Pending |
| FUI-01 | Phase 9: Frontend Factories | Pending |
| FUI-02 | Phase 9: Frontend Factories | Pending |
| INFRA-01 | Phase 10: Infrastructure & Consolidation | Pending |
| INFRA-02 | Phase 10: Infrastructure & Consolidation | Pending |
| INFRA-03 | Phase 10: Infrastructure & Consolidation | Pending |

**Coverage:**
- v1 requirements: 39 total
- Mapped to phases: 39
- Unmapped: 0

---
*Requirements defined: 2026-02-13*
*Last updated: 2026-02-13 after roadmap phase assignment (39/39 mapped)*
