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
- [x] 10-status order workflow

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

---

## Not Yet Implemented

### Infrastructure
- [ ] Testing (Vitest for frontend, Convex testing utilities)
- [ ] Structured logging
- [ ] Error boundaries in React
- [ ] Pagination for large lists

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
- [ ] CSV/Excel export for reports
- [ ] Sales analytics dashboard
- [ ] Cost trend analysis
- [ ] Inventory forecasting based on orders

---

## Version History

| Version | Date | Major Changes |
|---------|------|---------------|
| 3.0 | 2026-01-30 | Convex migration complete |
| 2.0 | 2026-01-30 | Order management, Kitchen View |
| 1.0 | 2025-01-27 | Initial release (FastAPI + React) |
