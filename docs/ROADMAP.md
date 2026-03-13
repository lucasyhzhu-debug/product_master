# Roadmap & Development Progress

> **Purpose:** Future plans and development progress for Frollie Recipe Master.
> **When to read:** When planning new features or understanding project status.

## Table of Contents
- [Development Progress](#development-progress)
- [Not Yet Implemented](#not-yet-implemented)
- [Future Roadmap](#future-roadmap)

---

## Development Progress

### Phase 1: Backend Foundation (Completed)
- [x] Initial FastAPI backend with SQLite
- [x] All model files (Ingredient, PackagingMaterial, Tag, Recipe, Packaging, Product)
- [x] Cost calculator service
- [x] All API routers (41 endpoints)

### Phase 2: Frontend Development (Completed)
- [x] Vite + React 19 + TypeScript setup
- [x] Tailwind CSS with custom theme
- [x] shadcn/ui component library
- [x] React Query for server state
- [x] Dashboard with carousels
- [x] Recipe/Packaging/Product editors with versioning
- [x] Cost calculations and COGS display

### Phase 3: Order Management (Completed)
- [x] Customer entity with phone, source tracking
- [x] Order entity with MMDD-NNN format
- [x] Order items with combobox autocomplete
- [x] WhatsApp receipt generation
- [x] Kitchen View for production
- [x] 11-status order workflow (including InProduction status)
- [x] POS-style order form with template parser
- [x] Order detail accordion stepper UI
- [x] Kitchen ball distribution system
- [x] Production tracking with visual feedback
- [x] Usage-based channel and shipping selectors

### Phase 4: Production Deployment - FastAPI (Completed)
- [x] Monolithic restructure for Vercel
- [x] PostgreSQL support (dual database)
- [x] Migration script (SQLite → PostgreSQL)
- [x] Vercel configuration

### Phase 5: Convex Migration (Completed)
- [x] Full backend migration to Convex
- [x] Schema definition with 19 tables
- [x] All queries and mutations implemented
- [x] Real-time data sync enabled
- [x] Frontend migrated from React Query to Convex hooks
- [x] Removed FastAPI/PostgreSQL dependencies
- [x] Documentation updated for Convex architecture

**Migration Benefits Realized:**
- Real-time updates across all clients
- Simplified architecture (no separate API server)
- Type-safe database operations
- Automatic scaling
- Reduced deployment complexity

### Phase 6: Testing & Quality Assurance (Completed)
- [x] Comprehensive test suite (184 tests across 11 files)
- [x] Backend unit tests (costCalculator, orderHelpers, whatsapp)
- [x] Convex integration tests (recipes, products, orders, tags)
- [x] Frontend tests (utils, components, hooks)
- [x] 100% coverage for critical business logic
- [x] Test infrastructure (Vitest, Testing Library, convex-test)

### v1.5 Financial Statements (In Progress)

#### Phase 32: Income Statement Backend (Completed)
- [x] Weekly income statement query (`getWeeklyIncomeStatement`) with Revenue → COGS → Gross Profit
- [x] Multi-channel revenue aggregation (GoBiz, Shopee, TikTok, GrabFood, BigSeller, Consignment, Internal, K3Mart)
- [x] BOM COGS resolution via `buildProductCOGSMap` (production + packaging split)
- [x] Confidence classification on every figure (exact/calculated/inferred/missing)
- [x] Data quality gap analysis (unmapped products, zero-cost components, missing channels)
- [x] Previous week comparison with delta amounts and percentages
- [x] Backend integration tests (18 new tests: edge cases, COGS accuracy, multi-channel)

#### Phase 33: Income Statement Frontend (Completed)
- [x] Standalone `/financials` page with P&L table (Revenue → Deductions → COGS → Gross Profit)
- [x] Per-channel breakdown with colored dots from platform color system
- [x] Week navigation (prev/next/today) with WIB timezone Monday-start boundaries
- [x] Week-over-week comparison columns with delta indicators
- [x] Confidence indicators: calc icon (calculated), ~ prefix (inferred), -- with warning (missing)
- [x] Collapsible Data Quality Panel: unmapped products, zero-cost components, coverage stat
- [x] CSV export with flat-format output and formula injection sanitization
- [x] Mobile responsive: comparison columns hidden by default with toggle
- [x] Component extraction: PLRow, ChannelRow, ConfidenceIndicator, DataQualityPanel, financialHelpers
- [x] Dark mode using CSS variable tokens (per CODE_STYLE.md)
- [x] E2E UAT: 11 automated tests (page load, navigation, collapsible sections, CSV, permission guard)
- [x] Route: `/financials` with `canAccessDashboard` permission (Manager, Admin)

#### Phase 34: Income Statement Testing (Planned)
- [ ] Multi-channel revenue aggregation integration test (gobiz + consignment + internal)
- [ ] Success criteria audit trail mapping tests to requirements

#### Phase 41: Accounting Schema, Seed & Counters (Completed)
- [x] 10 new accounting tables (accounts, expenses, journalEntries, journalEntryLines, etc.)
- [x] 39 PSAK-aligned default GL accounts seeded via `accounts:seedDefaults`
- [x] Atomic daily counter helper (`convex/lib/counter.ts`) for sequential numbering (JE-MMDD-NNN)

#### Phase 42: Double-Entry Journal Engine (Completed)
- [x] `convex/lib/journalEngine.ts` — single entry point for all journal creation (7 exports, 347 LOC)
- [x] Balance validation (debits = credits), IDR integer enforcement, sequential JE numbering
- [x] Reversal workflow with sourceType pairing and debit/credit swap
- [x] 27 unit tests for validation and builder logic

#### Phase 43: Chart of Accounts Management (Completed)
- [x] Admin-only AccountsManager page at `/accounts` with EntityManager pattern
- [x] CRUD mutations with PSAK code validation, system account protection, dependency checks
- [x] 39 seeded accounts viewable with type-colored badges, search, bulk operations
- [x] EntityManager `canDelete` prop enhancement (reusable for all entity pages)
- [x] Two rounds of triple-review fixes applied

---

## Not Yet Implemented

### Infrastructure
- [ ] Structured logging with error tracking service
- [ ] Error boundaries in React
- [ ] Pagination for large lists
- [ ] Performance monitoring and analytics

### Order Management Backlog
- [ ] Orders Dashboard carousel on main Dashboard
- [ ] Customer management dedicated page
- [ ] Order editing for Draft status (currently create-only)
- [ ] Bulk status updates
- [ ] Product Integration - link OrderItem to ProductVersion when ready

### Technical Debt
- [ ] Update `src/lib/types.ts` to use Convex-generated types
- [ ] Remove legacy comments and unused code
- [ ] Add comprehensive error handling

---

## Future Roadmap

### Priority 1: Authentication & Access Control
- [ ] Add Convex Auth or Clerk integration
- [ ] Role-based visibility:
  - `admin` - Full access (recipes, costs, margins, orders)
  - `kitchen` - Kitchen View only (orders, production status)
  - `sales` - Orders and products (no cost/margin data)
- [ ] Audit trail - track `createdBy` and `updatedBy` with real user IDs
- [ ] Rate limiting (Convex built-in)

### Priority 2: Multi-Location Support
- [ ] Location entity (id, name, address)
- [ ] Assign orders to production location
- [ ] Location-specific Kitchen View
- [ ] Location-based inventory tracking (future)

### Priority 3: Offline/PWA Support
- [ ] Progressive Web App (PWA) configuration
- [ ] Service worker for Kitchen View caching
- [ ] Offline order status updates with sync
- [ ] Add to home screen prompt on mobile

### Priority 4: Enhanced UX
- [ ] Message copy improvements (currently copies to clipboard)
- [ ] Customer contact channel tracking (WA vs IG vs other)
- [ ] Order templates for repeat customers
- [ ] Bulk order status updates
- [ ] Dashboard metrics and charts

### Priority 5: Data & Reporting
- [x] CSV/Excel export for reports (Income Statement CSV export, Phase 33)
- [x] Sales analytics dashboard (K3Mart stock sync + GoBiz revenue sync)
- [x] GoBiz journal-level sync (5-metric revenue: gross, net, commission, ad burn, promo burn)
- [ ] Cost trend analysis
- [ ] Inventory forecasting based on orders
- [ ] Shopee Open Platform adapter (Phase 2)
- [ ] Consignment manual entry + CSV upload (Phase 2)
- [ ] Scheduled cron sync (Phase 2)
- [ ] 90-day snapshot retention cleanup (Phase 2)

---

## Version History

| Version | Date | Major Changes |
|---------|------|---------------|
| 5.0 | 2026-03-13 | Accounting foundation: schema + journal engine + Chart of Accounts UI (v1.7 Phases 41-43) |
| 4.0 | 2026-03-02 | Income Statement: backend query + frontend P&L page + CSV export (v1.5 Phases 32-33) |
| 3.4 | 2026-02-09 | GoBiz journal-level integration (5-metric revenue + item details) |
| 3.3 | 2026-02-07 | Multi-platform sales integration (K3Mart + GoBiz) |
| 3.2 | 2026-02-02 | Production tracking refactor, UX improvements |
| 3.1 | 2026-02-02 | Order System V2 (PRD-0 through PRD-7), Testing suite |
| 3.0 | 2026-01-30 | Convex migration complete |
| 2.0 | 2026-01-30 | Order management, Kitchen View |
| 1.0 | 2025-01-27 | Initial release (FastAPI + React) |
