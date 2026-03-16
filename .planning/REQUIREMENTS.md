# Requirements: v1.8 Support & Quality of Life

**Defined:** 2026-03-16
**Core Value:** Production reliability — single source of truth for recipes, orders, kitchen production, and inventory

## v1.8 Requirements

### Help Center

- [ ] **HELP-01**: Any authenticated user can access the Help Center landing page at `/help`
- [ ] **HELP-02**: Landing page displays guide cards in a responsive grid (1/2/3 cols) with search functionality
- [x] **HELP-03**: Search filters guides and FAQ questions (case-insensitive `String.includes` across titles, section headings, FAQ text)
- [x] **HELP-04**: Guide registry (`helpGuides.ts`) allows adding new guides with one component + one registry entry
- [ ] **HELP-05**: "Coming Soon" guide cards are visually dimmed (opacity 0.5) and non-interactive
- [ ] **HELP-06**: GuideRouter renders guide by `guideId` param or shows "Guide not found" state for invalid IDs
- [ ] **HELP-07**: Help Center linked from Header nav (desktop + mobile) and HubPage card
- [ ] **HELP-08**: Staggered fade-up animation on page load (Framer Motion)

### Help Components

- [ ] **HCMP-01**: WorkflowDiagram renders fixed-layout SVG flowcharts with color-coded status nodes and directional arrows
- [x] **HCMP-02**: StepCard renders numbered steps with icon, title, description, optional tip/warning, connected by vertical dotted line
- [x] **HCMP-03**: CalloutBox renders styled callouts: tip (green), warning (amber), important (orange) with appropriate icons
- [x] **HCMP-04**: FaqAccordion renders grouped collapsible Q&A sections using shadcn Accordion
- [x] **HCMP-05**: RoleTag shows small badge for step roles: "All Staff" (gray), "Manager+" (blue), "Admin Only" (orange)
- [x] **HCMP-06**: GuideSection provides anchor ID with scroll-margin-top for deep linking from TOC and search
- [ ] **HCMP-07**: GuideLayout provides sticky sidebar TOC on desktop, horizontal scroll tabs on mobile, active section tracking via Intersection Observer

### Expense Guide

- [ ] **EGUIDE-01**: Full expense/reimbursement/payroll guide at `/help/expenses` with 8 sections
- [ ] **EGUIDE-02**: Overview section with lifecycle flowchart (Draft → Submitted → Approved → Reimbursed, with Rejected/Voided branches) and role summary table
- [ ] **EGUIDE-03**: Submitting section with 4 step cards, 3 callout boxes, and mini FAQ (GL categories, receipts, duplicates)
- [ ] **EGUIDE-04**: Approving section with DoA workflow diagram, 3 step cards, 3 callout boxes
- [ ] **EGUIDE-05**: Reimbursement section with batch workflow diagram, 6 step cards, 2 callout boxes
- [ ] **EGUIDE-06**: Payroll section with 4 step cards, 3 callout boxes, and 4 FAQ items
- [ ] **EGUIDE-07**: Expense Analytics section with dashboard card descriptions, fraud flags explanation
- [ ] **EGUIDE-08**: P&L connection section with journal entry diagram showing DR/CR flow to financial statement
- [ ] **EGUIDE-09**: Full FAQ accordion covering General (4), Submission (3), Approval (3), Reimbursement (3), Payroll (3) questions

### Invoice — Business Settings

- [ ] **BSET-01**: Admin can access Business Settings page at `/settings/business`
- [ ] **BSET-02**: Admin can set business name, address, phone, email, NPWP
- [ ] **BSET-03**: Admin can upload company logo (Convex file storage)
- [ ] **BSET-04**: Admin can select default bank account for invoices (from existing `bankAccounts` table)
- [ ] **BSET-05**: Live invoice header preview shows how seller info will appear on invoices

### Invoice — Generation

- [ ] **INV-01**: Manager/admin can generate an invoice from Order Detail for orders in PaymentReceived status or later
- [ ] **INV-02**: Invoice form auto-fills from order data + customer data + business settings
- [ ] **INV-03**: Field color coding: blue (auto-filled), yellow (needs input), white (user-edited)
- [ ] **INV-04**: Draft auto-saves on every field change (debounced 2 seconds)
- [ ] **INV-05**: Draft persists across page navigation and browser refresh
- [ ] **INV-06**: Preview mode shows clean read-only render without finalizing
- [ ] **INV-07**: Finalize assigns sequential invoice number (`INV-YYMM-NNN`) via race-safe counter
- [ ] **INV-08**: Finalize snapshots all seller/buyer/order data (immutable record)
- [ ] **INV-09**: Customer record updated with company/NPWP/billing address on finalize (write-back)
- [ ] **INV-10**: Multiple finalized invoices allowed per order (revision pattern)
- [ ] **INV-11**: Order Detail sidebar shows invoice card with 3 states (none/draft/final)

### Invoice — Print

- [ ] **IPRNT-01**: Print view renders finalized invoice cleanly via `window.print()`
- [ ] **IPRNT-02**: `@media print` stylesheet hides navigation, sidebar, action buttons, colored backgrounds
- [ ] **IPRNT-03**: Indonesian date format (e.g., "Senin, 16 Maret 2026")
- [ ] **IPRNT-04**: Standard invoice layout: header, bill-to, order details, items table, totals, payment info, signature area, notes, footer

### Invoice — Data Model

- [ ] **IDAT-01**: `businessSettings` singleton table with seller identity fields
- [ ] **IDAT-02**: `invoiceCounters` table for race-safe sequential numbering per month
- [ ] **IDAT-03**: `invoices` table with status (draft/final), seller/buyer/order snapshots, and items array
- [ ] **IDAT-04**: `customers` table extended with optional `companyName`, `npwp`, `billingAddress` fields

## Future Requirements (v1.9+)

- **HELP-F01**: Kitchen & Production guide
- **HELP-F02**: Orders & Shipping guide
- **HELP-F03**: Inventory & Restock guide
- **HELP-F04**: Recipes & Products guide
- **HELP-F05**: Sales & Analytics guide
- **HELP-F06**: Contextual `?` buttons per page deep-linking to guide sections
- **INV-F01**: Invoice listing/search page
- **INV-F02**: Email/WhatsApp invoice sharing
- **INV-F03**: Bulk invoice generation
- **INV-F04**: PDF generation library (replace browser print)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Faktur pajak / e-Faktur integration | PKP only — Frollie is non-PKP UMKM |
| PDF generation library | Browser print-to-PDF sufficient for v1 |
| Invoice listing/search page | v1 accesses invoices from their order |
| Guide versioning / CMS | Hardcoded in React components, versioned by git |
| Print/PDF export of help guides | Web-only; browser print if needed |
| Contextual ? help buttons | Good future enhancement, not v1 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| HELP-01 | Phase 55 | Pending |
| HELP-02 | Phase 55 | Pending |
| HELP-03 | Phase 55 | Complete |
| HELP-04 | Phase 55 | Complete |
| HELP-05 | Phase 55 | Pending |
| HELP-06 | Phase 55 | Pending |
| HELP-07 | Phase 55 | Pending |
| HELP-08 | Phase 55 | Pending |
| HCMP-01 | Phase 55 | Pending |
| HCMP-02 | Phase 55 | Complete |
| HCMP-03 | Phase 55 | Complete |
| HCMP-04 | Phase 55 | Complete |
| HCMP-05 | Phase 55 | Complete |
| HCMP-06 | Phase 55 | Complete |
| HCMP-07 | Phase 55 | Pending |
| EGUIDE-01 | Phase 56 | Pending |
| EGUIDE-02 | Phase 56 | Pending |
| EGUIDE-03 | Phase 56 | Pending |
| EGUIDE-04 | Phase 56 | Pending |
| EGUIDE-05 | Phase 56 | Pending |
| EGUIDE-06 | Phase 56 | Pending |
| EGUIDE-07 | Phase 56 | Pending |
| EGUIDE-08 | Phase 56 | Pending |
| EGUIDE-09 | Phase 56 | Pending |
| BSET-01 | Phase 57 | Pending |
| BSET-02 | Phase 57 | Pending |
| BSET-03 | Phase 57 | Pending |
| BSET-04 | Phase 57 | Pending |
| BSET-05 | Phase 57 | Pending |
| IDAT-01 | Phase 57 | Pending |
| IDAT-02 | Phase 57 | Pending |
| IDAT-03 | Phase 57 | Pending |
| IDAT-04 | Phase 57 | Pending |
| INV-01 | Phase 58 | Pending |
| INV-02 | Phase 58 | Pending |
| INV-03 | Phase 58 | Pending |
| INV-04 | Phase 58 | Pending |
| INV-05 | Phase 58 | Pending |
| INV-06 | Phase 58 | Pending |
| INV-07 | Phase 58 | Pending |
| INV-08 | Phase 58 | Pending |
| INV-09 | Phase 58 | Pending |
| INV-10 | Phase 58 | Pending |
| INV-11 | Phase 58 | Pending |
| IPRNT-01 | Phase 58 | Pending |
| IPRNT-02 | Phase 58 | Pending |
| IPRNT-03 | Phase 58 | Pending |
| IPRNT-04 | Phase 58 | Pending |

**Coverage:**
- v1.8 requirements: 39 total
- Mapped to phases: 39
- Unmapped: 0

---
*Requirements defined: 2026-03-16*
*Last updated: 2026-03-16 after initial definition*
