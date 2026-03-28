# Requirements: Frollie Recipe Master

**Defined:** 2026-03-27
**Core Value:** Production reliability -- single source of truth for recipes, orders, kitchen production, and inventory

## v1.9 Requirements

Requirements for milestone v1.9 Bugs & Quality of Life. Each maps to roadmap phases.

### K3Mart Cockpit

- [ ] **K3M-01**: Stock-in/stock-out API calls push product price (harga) so outlet inventory shows correct IDR value instead of 0
- [ ] **K3M-02**: History tab loads and displays past stock movements correctly
- [ ] **K3M-03**: Active outlet list refreshed to 4 outlets only (Bintaro, Lippo Puri Mall, SCBD, Old Shanghai)

### Data Quality

- [ ] **DQ-01**: Commission/fee sign convention normalized — all deductions stored as positive values across all platforms (Shopee, TikTok, Tokopedia)

### UI Polish

- [ ] **UI-01**: Navbar "Home" merged into Frollie logo (single clickable element)
- [ ] **UI-02**: "Accounting" section added to navbar navigation
- [ ] **UI-03**: Mobile order modal prevents accidental product additions from stray taps
- [ ] **UI-04**: Mobile order modal delete button is clearly visible and accessible

### Kitchen & Reporting

- [ ] **KIT-01**: Kitchen/production reports show component-level data (Big Ball, Mid Ball counts) alongside product-level data

### Inventory

- [x] **INV-01**: Stock count drift identified and fixed (packaging and product inventory stay accurate)
- [x] **INV-02**: Quick daily stock update UI allows staff to set current stock per product per location

### Employee & Payroll

- [ ] **EMP-01**: Employee roster with name, role, and bank account information
- [ ] **EMP-02**: Payroll entries can select employees from roster instead of free-text

### COGS

- [ ] **COGS-01**: Bulk price update UI for ingredient costs (update multiple prices in one screen)
- [ ] **COGS-02**: Bulk price update UI for packaging material costs

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
| BigSeller auth code fix | 401006 was expired token, not code bug — just needed refresh |
| Automated ingredient cost from supplier invoices | Too complex for this milestone; bulk UI is sufficient |
| Full inventory audit/reconciliation system | Fix drift root cause first; full audit is a separate initiative |
| Employee attendance/scheduling | Simple roster sufficient; HR features deferred |
| Mobile app | Responsive web covers kitchen mobile use |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| K3M-01 | Phase 65 | Pending |
| K3M-02 | Phase 65 | Pending |
| K3M-03 | Phase 65 | Pending |
| DQ-01 | Phase 64 | Pending |
| UI-01 | Phase 64 | Pending |
| UI-02 | Phase 64 | Pending |
| UI-03 | Phase 64 | Pending |
| UI-04 | Phase 64 | Pending |
| KIT-01 | Phase 69 | Pending |
| INV-01 | Phase 67 | Verified |
| INV-02 | Phase 67 | Verified |
| EMP-01 | Phase 66 | Pending |
| EMP-02 | Phase 66 | Pending |
| COGS-01 | Phase 68 | Pending |
| COGS-02 | Phase 68 | Pending |

**Coverage:**
- v1.9 requirements: 15 total
- Mapped to phases: 15
- Unmapped: 0

---
*Requirements defined: 2026-03-27*
*Last updated: 2026-03-28 after Phase 67 verification*
