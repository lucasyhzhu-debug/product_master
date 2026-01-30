# Roadmap & Development Progress

> **Purpose:** Future plans and development progress for Malo Recipe Master.
> **When to read:** When planning new features or understanding project status.

## Table of Contents
- [Development Progress](#development-progress)
- [Not Yet Implemented](#not-yet-implemented)
- [Future Roadmap](#future-roadmap)

---

## Development Progress

### Phase 1: Backend (Completed)
- [x] SQLite database setup with SQLAlchemy 2.x
- [x] All 7 model files (Ingredient, PackagingMaterial, Tag, Recipe, Packaging, Product)
- [x] All 7 schema files with Pydantic 2.x
- [x] All 7 CRUD modules with eager loading
- [x] Cost calculator service (212 lines)
- [x] All 7 API routers (41 endpoint functions)
- [x] CORS configuration for dev servers
- [x] Database initialization with default tags
- [x] Health check endpoints

### Phase 2: Frontend (Completed)
- [x] Vite + React 19 + TypeScript setup
- [x] Tailwind CSS 4.x with custom theme
- [x] 13 shadcn/ui components
- [x] TanStack Query 5.x with custom hooks
- [x] React Router 7.x with nested routes
- [x] Dashboard with 3 carousels (Products, Recipes, Packaging)
- [x] RecipeEditor with full versioning (648 lines)
- [x] PackagingEditor with material management (607 lines)
- [x] ProductEditor with COGS breakdown (545 lines)
- [x] Shared components (Carousel, VersionNavigator, etc.)
- [x] TypeScript types matching all backend schemas

### Phase 3: Order Management (Completed)
- [x] Customer entity with phone, source tracking
- [x] Order entity with MMDD-NNN format
- [x] Order items with combobox autocomplete
- [x] WhatsApp receipt generation
- [x] CSV export endpoints
- [x] Kitchen View for production
- [x] 10-status order workflow

### Phase 4: Production Deployment (Completed)
- [x] Monolithic restructure for Vercel
- [x] PostgreSQL support (dual database)
- [x] Migration script (SQLite → PostgreSQL)
- [x] Vercel configuration

---

## Not Yet Implemented

### Infrastructure
- [ ] Testing (pytest for backend, Vitest for frontend)
- [ ] Structured logging
- [ ] Error boundaries in React
- [ ] Pagination for large lists

### Order Management Backlog
- [ ] Orders Dashboard carousel on main Dashboard
- [ ] Customer management dedicated page
- [ ] Order editing for Draft status (currently create-only)
- [ ] Bulk status updates
- [ ] Product Integration - link OrderItem to ProductVersion when ready

---

## Future Roadmap

### Priority 1: Authentication & Access Control
- [ ] User authentication (consider Clerk or Auth.js)
- [ ] Role-based visibility:
  - `admin` - Full access (recipes, costs, margins, orders)
  - `kitchen` - Kitchen View only (orders, production status)
  - `sales` - Orders and products (no cost/margin data)
- [ ] Audit trail - track `created_by` and `updated_by` with real user IDs
- [ ] API rate limiting (after auth is in place)

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
- [ ] Message copy improvements (currently copies to clipboard, user pastes to WA/IG)
- [ ] Customer contact channel tracking (WA vs IG vs other)
- [ ] Order templates for repeat customers
- [ ] Bulk order status updates
