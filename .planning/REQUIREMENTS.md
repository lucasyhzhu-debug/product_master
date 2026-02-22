# Requirements: Frollie Recipe Master

**Defined:** 2026-02-22
**Milestone:** v1.3 GoFood, Kitchen & Consignment
**Core Value:** Production reliability — single source of truth for recipes, orders, kitchen production, and inventory

## v1.3 Requirements

Requirements for milestone v1.3. Each maps to roadmap phases (19–22).

### GoFood Depot Management

- [ ] **GF-02**: Admin can configure per-outlet product mappings for each GoFood depot (outlet selector in mapping tab; new outlets default to previous depot's mapping)
- [ ] **GF-03**: Each GoFood depot displays current stock level; alert fires when any depot drops below 5 total products remaining
- [ ] **GF-04**: Depot restock suggestion shown per depot: n+1 avg last 3 days; n+2 on Fri/Sat; Monday reset to previous Thursday's total
- [ ] **GF-05**: When `seedFinishedGoodsLocations` has not been run, an admin-visible warning appears on the GoFood depot page instead of a silent skip

### Kitchen Production Targets & Overhaul

- [ ] **KIT-09**: Default daily production target configurable by manager on the kitchen page (default: 110 Original singles + 30 Original triples = 140 total balls)
- [ ] **KIT-12**: Kitchen view displays today's production targets (ball totals by type + packaging breakdown) driven by dispatch plan via BOM; fallback to configured defaults when no plan exists
- [ ] **KIT-13**: Kitchen view simplified: boxing/stickering columns removed; full-screen production-focused layout with collapsible order context toggle
- [ ] **KIT-14**: End-of-shift input records produced units by product type + optional waste by reason (QA/testing, spoilage, waste); submission adds produced quantities to Finished Goods Inventory at Kitchen location
- [ ] **KIT-15**: Two-step end-of-shift confirmation: review summary screen before commit, success summary screen after submit
- [ ] **KIT-16**: Shift production records stored per shift (date, submitted by, produced quantities, waste breakdown); viewable by managers
- [ ] **KIT-17**: Manager can edit past shift records; edit triggers inventory impact confirmation ("this will adjust inventory by N units — confirm?")
- [ ] **KIT-18**: Manager can override today's production targets on the kitchen page (per-day only, does not change configured defaults)

### Consignment Upload

- [ ] **CON-01**: User can upload consignment sales via Excel (bulk summary: product + qty sold + qty returned + revenue per outlet per date range), with row-level validation errors and preview before commit
- [ ] **CON-02**: User can upload consignment sales via Excel (detail format: per-transaction ID with product line items), with row-level validation and preview
- [ ] **CON-03**: User can download a pre-formatted Excel template containing both Bulk Summary and Transaction Detail sheets with example rows and no merged cells
- [ ] **CON-04**: User can view upload history (audit log per outlet: status, row count, date uploaded)
- [ ] **CON-05**: User can delete a past upload batch and system reverses the associated revenue rows

### Sales Analytics

- [ ] **ANLY-01**: Each consignment outlet appears as its own segment in Sales Analytics stacked bar charts; segments only shown when revenue data exists for that outlet
- [ ] **ANLY-02**: Sales Analytics displays a lifetime units sold headline counter with per-product breakdown table across all channels
- [ ] **ANLY-03**: Lifetime totals show per-channel breakdown (GoFood, K3Mart, Direct, and each Consignment outlet separately)

## Future Requirements

Acknowledged but deferred to v1.4+.

### GoFood / API

- **GF-06**: GoFood order acceptance via GoFood Facilitator Model (out of scope — requires partnership)
- **GF-07**: GoBiz official OAuth2 migration (out of scope — GoBiz stopped issuing new client credentials)

### Consignment (v1.4+)

- **CON-06**: Consignment outlet CRUD page with contact info and commission rates (defer — string name sufficient for 2–3 outlets)
- **CON-07**: Period gap indicator per outlet showing missing upload windows (medium complexity; useful but not blocking)
- **CON-08**: Automated settlement reconciliation (explicitly out of scope per PROJECT.md)

### Analytics (v1.4+)

- **ANLY-04**: Pre-aggregated lifetime sales cache table (defer — add at ~50K externalRevenue rows)
- **ANLY-05**: Export Sales Analytics to CSV/Excel (separate reporting page — v1.4)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| GoFood Facilitator Model (order acceptance) | Requires GoFood partnership; massive scope |
| Automated settlement reconciliation | Production system, not accounting; export summaries sufficient |
| Full double-entry accounting for consignment | Out of scope per PROJECT.md |
| Per-unit consignment serialization | Batch tracking sufficient for product at this price point |
| Consignment outlet CRUD page | String name sufficient for Legato + 1–2 others; build when commission rates needed |
| Frontend food ordering platform API integration | Future milestone; manual consignment upload covers current need |
| Sales Analytics export to CSV | v1.4; extend once consignment data is validated |

## Planning Note

All UI phases use the `/frontend-design` skill for holistic UI definition before implementation waves begin.

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| GF-02 | Phase 19 | Pending |
| GF-03 | Phase 19 | Pending |
| GF-04 | Phase 19 | Pending |
| GF-05 | Phase 19 | Pending |
| KIT-09 | Phase 20 | Pending |
| KIT-12 | Phase 20 | Pending |
| KIT-13 | Phase 20 | Pending |
| KIT-14 | Phase 20 | Pending |
| KIT-15 | Phase 20 | Pending |
| KIT-16 | Phase 20 | Pending |
| KIT-17 | Phase 20 | Pending |
| KIT-18 | Phase 20 | Pending |
| CON-01 | Phase 21 | Pending |
| CON-02 | Phase 21 | Pending |
| CON-03 | Phase 21 | Pending |
| CON-04 | Phase 21 | Pending |
| CON-05 | Phase 21 | Pending |
| ANLY-01 | Phase 22 | Pending |
| ANLY-02 | Phase 22 | Pending |
| ANLY-03 | Phase 22 | Pending |

**Coverage:**
- v1.3 requirements: 20 total (GF-02–05, KIT-09/12–18, CON-01–05, ANLY-01–03)
- Mapped to phases: 20
- Unmapped: 0 ✓

---
*Requirements defined: 2026-02-22*
*Last updated: 2026-02-22 — 6 KIT requirements added after Phase 20 context discussion*
