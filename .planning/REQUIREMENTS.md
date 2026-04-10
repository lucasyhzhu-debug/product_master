# Requirements: Frollie Recipe Master

**Defined:** 2026-04-08
**Core Value:** Production reliability -- single source of truth for recipes, orders, kitchen production, and inventory

## v2.0 Requirements

Requirements for milestone v2.0 Financial Management & Data Quality. Each maps to roadmap phases.

### Data Accuracy Foundation

- [x] **DA-01**: Direct sales orders flow into `externalRevenue` bridge so P&L includes all revenue sources (Revenue Recognition Fix)
- [x] **DA-02**: Historical direct sales orders are backfilled into revenue bridge for accurate past-period P&L
- [x] **DA-03**: Manager can set a flat COGS override per menu product that bypasses BOM calculation
- [x] **DA-04**: Employee profile includes hire date, base rate, and bank account holder name fields

### Financial Reporting

- [ ] **FIN-01**: Income Statement extends from Net Income through Depreciation/Amortization, CapEx, to Free Cash Flow
- [ ] **FIN-02**: Per-channel breakdown continues through the full P&L flow (Revenue -> FCF)
- [ ] **FIN-03**: User can export raw financial transactions (revenue + journal entries) as CSV for a date range
- [ ] **FIN-04**: User can export P&L summary as CSV for weekly/monthly/custom range

### Expense Management

- [ ] **EXP-01**: User can bulk upload expenses via CSV that creates actual expense records (not raw journal entries)
- [ ] **EXP-02**: Bulk upload supports auto-approve mode (expenses created as recorded with JEs) for trusted batches
- [ ] **EXP-03**: Bulk upload supports submit-for-approval mode (expenses created as submitted, routed through approval queue)
- [ ] **EXP-04**: Fixed asset disposal supports "Reclassify to Expense" type that reverses capitalization and books as operating expense

### Bank Reconciliation

- [ ] **BANK-01**: User can upload BCA or Mandiri bank statement CSV with format auto-detection
- [ ] **BANK-02**: System auto-matches bank lines to expenses/revenue/reimbursements by amount + date + description
- [ ] **BANK-03**: User can manually match/unmatch bank lines to system records via split-view UI
- [ ] **BANK-04**: Reconciliation status tracked per statement (matched/unmatched/suggested counts)

### Staff Attendance

- [ ] **ATT-01**: Kitchen staff can clock in/out via one-tap PIN-authenticated interface
- [ ] **ATT-02**: Per-staff production tracking shows balls by type and grams from shift records
- [ ] **ATT-03**: Monthly attendance summary with hours worked and production output per staff member
- [ ] **ATT-04**: Manager can correct missed clock-outs with audit trail

### Data Health

- [ ] **DH-01**: Centralized data health page showing automated integrity checks across all data pipelines
- [ ] **DH-02**: Revenue completeness check (all active channels have data for current period)
- [ ] **DH-03**: COGS coverage check (percentage of products with non-zero COGS)
- [ ] **DH-04**: Journal balance validation (sum debits = sum credits across all entries)
- [ ] **DH-05**: Orphaned record detection (expenses without journals, orders without revenue)

## Future Requirements

Deferred to future milestone. Tracked but not in current roadmap.

### P&L Enhancements

- **PNL-01**: Monthly/quarterly P&L period views (currently weekly only)
- **PNL-02**: Print-friendly P&L view
- **PNL-03**: Budget vs. actual comparison

### Platform Integration

- **PLAT-01**: GrabFood orders:read OAuth2 scope (pending partner approval)
- **PLAT-02**: Crystal and Tamtem GrabFood merchantIDs
- **PLAT-03**: BigSeller COGS configuration (BigSeller-side)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Full payroll calculation engine | Indonesian labor law (BPJS, PPh 21, THR) too complex; manual payroll entry sufficient |
| Automated bank statement import via API | Requires corporate banking agreements; CSV upload sufficient for weekly reconciliation |
| AI-powered transaction categorization | Overkill for ~50-100 monthly transactions; rule-based matching sufficient |
| Multi-currency support | All operations in IDR; no foreign suppliers/customers |
| Budget vs. actual comparison | No budget input system exists; future milestone |
| Real-time bank balance tracking | Bank apps provide this; reconciliation shows discrepancies |
| Overtime/leave management | Clock-in/out sufficient for production tracking; HR features deferred |
| Monthly/quarterly P&L auto-generation | Custom date range export covers immediate need |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DA-01 | Phase 70 | Complete |
| DA-02 | Phase 70 | Complete |
| DA-03 | Phase 70 | Complete |
| DA-04 | Phase 70 | Complete |
| FIN-01 | Phase 75 | Pending |
| FIN-02 | Phase 75 | Pending |
| FIN-03 | Phase 76 | Pending |
| FIN-04 | Phase 76 | Pending |
| EXP-01 | Phase 71 | Pending |
| EXP-02 | Phase 71 | Pending |
| EXP-03 | Phase 71 | Pending |
| EXP-04 | Phase 71 | Pending |
| BANK-01 | Phase 72 | Pending |
| BANK-02 | Phase 72 | Pending |
| BANK-03 | Phase 73 | Pending |
| BANK-04 | Phase 73 | Pending |
| ATT-01 | Phase 74 | Pending |
| ATT-02 | Phase 74 | Pending |
| ATT-03 | Phase 74 | Pending |
| ATT-04 | Phase 74 | Pending |
| DH-01 | Phase 77 | Pending |
| DH-02 | Phase 77 | Pending |
| DH-03 | Phase 77 | Pending |
| DH-04 | Phase 77 | Pending |
| DH-05 | Phase 77 | Pending |

**Coverage:**
- v2.0 requirements: 25 total
- Mapped to phases: 25/25
- Unmapped: 0

---
*Requirements defined: 2026-04-08*
*Last updated: 2026-04-08 -- Traceability updated with phase mappings*
