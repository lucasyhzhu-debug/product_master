# Changelog

> **Purpose:** Version history for Malo Recipe Master.
> **When to update:** After ANY code change is merged to main.

## Update Instructions

After merging any code change, add a new entry with:
- Date and descriptive title
- Summary of what changed
- Files modified (if significant)
- Any migration steps or breaking changes

---

## 2026-02-01 - PRD-3: Order Form POS (Order System V2 Complete)

**Feature: POS-Style Order Form with Template Parsing**

Final phase of Order System V2. Replaces the old order form with a POS-style interface optimized for the WhatsApp copy/paste workflow used by the Frollie team.

**New Components (6 files):**
- `src/components/orders/ProductButtons.tsx` - 2x2 grid of fixed products (tap = +1, long-press = qty dialog)
- `src/components/orders/PasteTemplateBox.tsx` - Textarea with Paste + Parse buttons for WhatsApp templates
- `src/components/orders/DiscountInput.tsx` - Linked Rp/% inputs with >30% warning
- `src/components/orders/DeliveryToggle.tsx` - Pickup/Delivery segmented control
- `src/components/orders/OrderFormPOS.tsx` - 9-section composite form
- `src/components/ui/alert.tsx` - shadcn/ui Alert component for feedback

**Template Parser:**
- `src/lib/orderTemplateParser.ts` - WhatsApp template parsing utility
- Bracket format: `1. Original (80g) - Rp 50.000 [2]`
- Keyword fallback: `2x Original`, `Original: 2`
- Extracts customer info (phone, name, address)
- Returns ParseResult with items, customer, warnings

**Backend Changes:**
- `convex/schema.ts` - Added `finalTotal` field to orders
- `convex/orders/mutations.ts` - Added discount support to `create` mutation, added `updateOrderDiscount` mutation with terminal state protection

**Hook Updates:**
- `src/hooks/convex/useMenuProducts.ts` - Added `FixedProduct` interface and `useConvexFixedProducts` hook
- `src/hooks/convex/useOrders.ts` - Added `useConvexUpdateOrderDiscount` hook
- `src/hooks/convex/index.ts` - New exports

**Type Updates:**
- `src/lib/types.ts` - Added `OrderLineItem`, `OrderFormData` interfaces

**Integration:**
- `src/pages/OrderManager.tsx` - Replaced old `OrderForm` with `OrderFormPOS` in all three responsive layouts

**Order Form POS Sections:**
1. Template (copy/paste workflow with feedback alerts)
2. Products (2x2 buttons + line items with qty controls)
3. Customer (search/create)
4. Delivery (toggle + address input)
5. Dates (order date readonly, due date picker)
6. Notes (textarea)
7. Discount (linked Rp/% with warning)
8. Totals (subtotal, discount, final)
9. Submit (Cancel + Create Order buttons)

**Multi-Agent Implementation:**
- `cto-orchestrator` - Strategic coordination
- `convex-backend` - Backend mutations
- `general-purpose` - Template parser utility
- `react-ui-builder` (x5) - UI components

**Order System V2 Complete:**
- [x] PRD-0: Schema Foundation (unions, fixed products, message tracking)
- [x] PRD-1: Kitchen Core (dashboard, order cards, basic completion)
- [x] PRD-2: Kitchen Gamification (ball buttons, sounds, confetti)
- [x] PRD-3: Order Form POS (product buttons, template parser, discount input)

**Branch:** `feature/order-form-pos`

---

## 2026-01-31 - WhatsApp Template Tabs with Bilingual Support

**Feature: Tabbed WhatsApp Message Templates**

Refactored WhatsApp Messages panel with a tabbed interface for different workflow stages and added Bahasa/English language toggle.

**New Tabs (mapped to order workflow):**
1. **Order Confirmation** (Konfirmasi) - Always visible, for Draft -> AwaitingPayment
2. **Payment Received** (Pembayaran) - Visible after Draft status
3. **Delivery Confirmation** (Pengiriman) - Visible at delivery/pickup stages
4. **Thank You** (Terima Kasih) - Visible at completion, includes social media links

**Features:**
- Language toggle (Bahasa/English) in panel header - Bahasa is default
- Templates auto-generate with order data (customer name, items, totals, etc.)
- Editable text before copying with Reset button
- Conditional tab visibility based on order status
- Clickable social media links in Thank You template:
  - Instagram/TikTok: @Frollie.id
  - Founder journey: @EtengandTJ

**Architecture:** Frontend generation for instant preview and language switching (no API calls)

**Files Modified:**
- `src/lib/types.ts` - Added WhatsAppTemplateTab, WhatsAppLanguage types
- `src/lib/whatsappTemplates.ts` - NEW: Template strings and generator functions
- `src/components/orders/OrderWhatsAppPanel.tsx` - Refactored with tabs and language toggle
- `src/pages/OrderDetail.tsx` - Simplified props to pass order object

---

## 2026-01-31 - Comprehensive Test Suite Implementation

**Multi-Agent Test Implementation (184 tests across 11 files)**

Implemented a complete test suite using a parallel multi-agent approach for maximum efficiency.

**Backend Unit Tests (51 tests):**
- `convex/lib/__tests__/costCalculator.test.ts` - Unit conversion, cost calculations (24 tests)
- `convex/orders/__tests__/orderHelpers.test.ts` - Order number generation, line totals (14 tests)
- `convex/orders/__tests__/whatsapp.test.ts` - Message formatting functions (13 tests)

**Convex Integration Tests (70 tests):**
- `tests/convex/recipes.test.ts` - Creation, versioning, deletion rules, linked costs (28 tests)
- `tests/convex/products.test.ts` - COGS calculation, version pinning (14 tests)
- `tests/convex/orders.test.ts` - Order creation, status transitions (16 tests)
- `tests/convex/tags.test.ts` - Default tag seeding, idempotency (12 tests)

**Frontend Tests (63 tests):**
- `src/lib/__tests__/utils.test.ts` - cn, formatCurrency, formatNumber, formatPercent (25 tests)
- `src/components/shared/__tests__/CostTooltip.test.tsx` - Tooltip rendering, null handling (8 tests)
- `src/components/shared/__tests__/ConfirmDialog.test.tsx` - Dialog interactions, loading states (10 tests)
- `src/hooks/__tests__/useConvexHooks.test.tsx` - Hook behavior, loading states (20 tests)

**Coverage Results:**
- `costCalculator.ts`: 100%
- `utils.ts`: 100%
- `helpers.ts`: 100%

**Business Rules Coverage:**
All 8 business rules from CLAUDE.md have explicit test coverage:
1. Unit conversion (kg→g, l→ml, m→cm)
2. Version immutability
3. Linked components cost inheritance
4. Product pinning to versions
5. Reusable = single component only
6. Deletion blocking rules
7. Default tag seeding
8. Order number MMDD-NNN format

**Infrastructure Added:**
- `vitest.config.ts` - Vitest configuration with jsdom environment
- `tests/setup.ts` - Test setup with jest-dom matchers
- `tests/fixtures/` - Shared test fixtures for ingredients and orders
- `convex/orders/helpers.ts` - Extracted pure functions for testability
- `convex/orders/whatsappHelpers.ts` - Extracted WhatsApp formatting functions

**Dependencies Added:**
- vitest, @vitest/coverage-v8
- @testing-library/react, @testing-library/jest-dom, @testing-library/user-event
- convex-test, jsdom

**Scripts Added:**
- `npm test` - Run all tests
- `npm run test:watch` - Watch mode
- `npm run test:coverage` - Coverage report
- `npm run test:ui` - Vitest UI

---

## 2026-01-30 - Complete Convex Migration & Documentation Update

**Full Backend Migration to Convex**

Migrated the entire backend from FastAPI + PostgreSQL to Convex, a real-time serverless database platform.

**Architecture Changes:**
- Removed FastAPI backend (`api/` directory)
- Removed PostgreSQL/SQLite database dependencies
- Removed React Query for data fetching
- Added Convex as the sole backend (queries, mutations, database)
- Frontend now uses Convex React hooks (`useQuery`, `useMutation`)

**Backend Implementation (convex/):**
- `schema.ts` - 19 tables with indexes and validators
- `lib/costCalculator.ts` - Cost calculation helper functions
- 10 entity folders with queries and mutations:
  - `ingredients/`, `materials/`, `tags/`, `menuProducts/`
  - `recipes/`, `packaging/`, `products/`
  - `customers/`, `orders/`, `dashboard/`
- `orders/whatsapp.ts` - WhatsApp message templates

**Frontend Migration:**
- Replaced all React Query hooks with Convex hooks
- Updated 11 hook files in `src/hooks/convex/`
- Updated all page components to use Convex API
- Removed axios and react-query dependencies

**Documentation Overhaul:**
- Updated `CLAUDE.md` for Convex architecture
- Rewrote `docs/SCHEMA.md` with Convex schema definitions
- Rewrote `docs/CODE_STYLE.md` with Convex patterns (removed Python)
- Rewrote `docs/API_REFERENCE.md` as Convex Functions Reference
- Rewrote `docs/DEPLOYMENT.md` for Convex deployment
- Updated `docs/WORKFLOW.md` for Convex development
- Updated `docs/ROADMAP.md` with Phase 5 (Convex Migration)

**Benefits:**
- Real-time data sync across all connected clients
- Simplified architecture (no separate API server)
- Type-safe database operations end-to-end
- Automatic scaling without server management
- Reduced deployment complexity

**Files Removed:**
- `api/` directory (FastAPI backend)
- `api/scripts/migrate_sqlite_to_pg.py`
- All SQLAlchemy models and Pydantic schemas

**Dependencies Changed:**
- Added: `convex` (^1.31.7)
- Removed: `@tanstack/react-query`, `axios`

**Migration Steps (for existing deployments):**
1. Deploy Convex backend: `npx convex deploy`
2. Set `VITE_CONVEX_URL` environment variable
3. Build and deploy frontend
4. Seed data via Convex dashboard

---

## 2026-01-30 - Production Database Seeding Endpoints

**Admin Endpoints for Vercel/Neon.tech Database Management**

Added three admin endpoints to fix production database seeding issues on Vercel serverless:
- `GET /api/admin/db-check?secret=<ADMIN_SECRET>` - Diagnose database connection and check seed status
- `POST /api/admin/seed-only?secret=<ADMIN_SECRET>` - Seed menu products and tags (for when tables exist but are empty)
- Enhanced `POST /api/admin/init-db?secret=<ADMIN_SECRET>` - Create tables and seed data with detailed error reporting

**Security Improvements:**
- All admin endpoints secured with `ADMIN_SECRET` environment variable (must be set in Vercel)
- Proper HTTP status codes: 403 Forbidden, 503 Service Unavailable, 500 Internal Server Error
- Database credential masking in error responses
- Audit logging for all admin actions

**Code Quality:**
- Extracted reusable `seed_default_data()` function in `api/app/database.py`
- Eliminated code duplication between `init_db()` and admin endpoints
- Added type hints to all admin endpoints
- Consistent FastAPI dependency injection patterns

**Files Modified:**
- `api/app/main.py` - Added 3 admin endpoints (+109 lines)
- `api/app/database.py` - Refactored seeding logic into reusable function
- `.env.example` - Documented `ADMIN_SECRET` configuration

**Why This Was Needed:**
- Vercel serverless uses `lifespan="off"` in `api/index.py`, preventing automatic database seeding on cold starts
- Manual endpoints allow operators to seed production database after deployment

**Migration Steps:**
1. Set `ADMIN_SECRET` environment variable in Vercel dashboard (generate a strong random string)
2. After deployment, call `https://your-app.vercel.app/api/admin/init-db?secret=<your-secret>`
3. Verify seeding with `https://your-app.vercel.app/api/admin/db-check?secret=<your-secret>`

---

## 2026-01-30 - Documentation Refactor

**CLAUDE.md Split into Modular Documentation**
- Refactored monolithic CLAUDE.md (~2,230 lines) into focused documentation files
- Created `docs/` directory with 7 specialized documents:
  - `SCHEMA.md` - Database schema and data flows
  - `API_REFERENCE.md` - API endpoints and response formats
  - `CODE_STYLE.md` - Coding conventions and patterns
  - `WORKFLOW.md` - Git workflow and code review process
  - `DEPLOYMENT.md` - Production deployment guide
  - `CHANGELOG.md` - Version history (this file)
  - `ROADMAP.md` - Future plans and backlog
- CLAUDE.md now serves as concise entry point (~450 lines)

**Benefits:**
- Reduced main documentation from ~25,000 to ~5,000 tokens
- Agents can load only relevant documentation for their task
- Changelog can grow independently without bloating main file
- Clearer organization by concern type

---

## 2026-01-30 - Production Deployment & Migration Infrastructure

**Monolithic Restructure for Vercel Deployment**
- Restructured project from separate frontend/backend to monolithic layout
- Moved `backend/` → `api/` for Vercel serverless functions compatibility
- Moved `frontend/src/` → `src/` and `frontend/` root files to project root
- All imports and paths updated across the codebase
- Benefits: Single deployment, simplified CORS, better cold start performance

**Vercel Configuration**
- Added `vercel.json` with rewrites for SPA routing and API routes
- Added `api/index.py` with Mangum ASGI adapter for FastAPI on Vercel
- Build configuration: `vite build` outputs to `dist/`
- API routes: `/api/*` → serverless functions in `api/`
- SPA fallback: all other routes → `index.html`

**PostgreSQL Support (Dual Database)**
- Added PostgreSQL database support alongside SQLite for production
- Uses `NullPool` for serverless environments (no connection pooling)
- Environment variables:
  - `DATABASE_URL` - PostgreSQL connection string (production)
  - `SQLITE_PATH` - SQLite file path (local dev, default: `api/data/malo_recipes.db`)
- Auto-detects database type from `DATABASE_URL` prefix (`postgresql://`)
- SQLite remains default for local development

**Migration Script (SQLite → PostgreSQL)**
- Created `api/scripts/migrate_sqlite_to_pg.py` - Full data migration tool
- Features:
  - Preserves all data, relationships, and constraints
  - Handles foreign key dependencies with correct insertion order
  - Validates data integrity after migration
  - Dry-run mode for testing
  - Detailed progress logging
- Usage: `python api/scripts/migrate_sqlite_to_pg.py --sqlite-path <path> --postgres-url <url>`
- Documentation: `api/scripts/MIGRATION_README.md`

**Environment Configuration Updates**
- Added `.env.example` with all required variables for production
- Updated `api/database.py` to support both SQLite and PostgreSQL
- Updated `api/main.py` CORS configuration for production domains
- Added production-ready logging configuration

**Files Modified:**
- Project structure: 144 files moved/renamed
- Backend: `api/database.py`, `api/main.py`, `api/requirements.txt` (+3 dependencies)
- Frontend: `vite.config.ts` (proxy configuration), `package.json` (build scripts)
- New files: `vercel.json`, `api/index.py`, `api/scripts/migrate_sqlite_to_pg.py`, `api/scripts/MIGRATION_README.md`

---

## 2026-01-30 - UI/UX Enhancements for Order Management

**OrderDetail Component Refactor (906 → 363 lines)**
- Split monolithic OrderDetail.tsx into focused, reusable components
- Created `components/orders/` directory with 7 specialized components:
  - `OrderHeader.tsx` - Order number, status badge, timestamps (200 lines)
  - `OrderStatusPanel.tsx` - Status transitions with confirmation dialogs (103 lines)
  - `OrderWhatsAppPanel.tsx` - WhatsApp templates with copy buttons (107 lines)
  - `ShippingDialog.tsx` - Shipping info form (agency, tracking) (102 lines)
  - `CancellationDialog.tsx` - Cancellation reason input (60 lines)
  - `ConfirmationDialog.tsx` - Status transition confirmations (187 lines)
  - `OrderItems.tsx` - Order line items table (79 lines)
  - `index.ts` - Barrel export for clean imports

**Component Architecture Improvements**
- Separation of concerns: Each component handles one responsibility
- Reusable confirmation dialogs for all status transitions
- Dedicated shipping dialog with agency dropdown and tracking input
- WhatsApp panel with collapsible sections for each template type
- Empty state component added to `components/shared/EmptyState.tsx`

**UI/UX Enhancements**
- Added accordion component (`components/ui/accordion.tsx`) for collapsible sections
- Improved order items table with better spacing and readability
- Better visual hierarchy with consistent badge colors and spacing
- Simplified OrderDetail main component for better maintainability

**Files Modified:**
- Frontend: `pages/OrderDetail.tsx` (refactored), `pages/OrderManager.tsx` (enhanced), `pages/KitchenView.tsx` (refined)
- New components: 7 files in `components/orders/`
- New shared component: `components/shared/EmptyState.tsx`
- New UI component: `components/ui/accordion.tsx`

---

## 2026-01-30 - Order Workflow Enhancements (3-Phase Implementation)

**Phase 1: WhatsApp Confirmation Prompts**
- Added confirmation dialog for Draft → AwaitingPayment transition
- Requires "WhatsApp sent" checkbox before advancing
- Added contextual WhatsApp templates for each status transition:
  - `format_payment_request()` - Payment request with bank details
  - `format_production_started()` - Production notification
  - `format_delivery_complete()` - Delivery confirmation
- OrderDetail response now includes all template texts

**Phase 2: Kitchen View**
- Created `KitchenView.tsx` - Production-focused order management page
- Status-grouped order cards: To Produce, Production Complete, Packaging, Ready
- Quick-action buttons to advance orders to next status
- Date filter with overdue order highlighting (red)
- Added `GET /api/orders/kitchen` endpoint
- Added navigation link in Header

**Phase 3: AwaitingPayment Status**
- Added AwaitingPayment status between Draft and Confirmed (now 10-status workflow)
- Added `awaiting_payment_since` timestamp column to Order model
- Split confirmation flow:
  - Draft → AwaitingPayment: Only requires "WhatsApp sent" checkbox
  - AwaitingPayment → Confirmed: Only requires "Payment confirmed" checkbox
- Added waiting time indicator with color-coded badges:
  - Green: < 24 hours
  - Yellow: 1-2 days
  - Red: > 2 days
- Kitchen View excludes AwaitingPayment orders (only production-relevant)
- Updated OrderManager.tsx with AwaitingPayment filter and badge

**Files Modified:**
- Backend: `models/order.py`, `schemas/order.py`, `crud/orders.py`, `routers/orders.py`, `services/whatsapp_formatter.py`
- Frontend: `lib/types.ts`, `pages/OrderDetail.tsx`, `pages/OrderManager.tsx`, `pages/KitchenView.tsx` (new), `App.tsx`, `components/layout/Header.tsx`

---

## 2026-01-30 - Order Status Workflow Migration

**Changed:**
- Migrated order statuses from old 9-status workflow to new 9-status workflow
- Old: Draft, Confirmed, Processing, Ready for Pickup, Waiting for Courier, In Transit, Shipped, Completed, Cancelled
- New: Draft, Confirmed, ProductionComplete, Packaging, WaitingShipment, CompleteShipped, WaitingPickup, PickedUp, Cancelled

**Backend:**
- Updated `backend/app/schemas/order.py` - OrderStatusUpdate pattern regex
- Updated `backend/app/crud/orders.py` - Production report active_statuses list (removed "Processing")

**Frontend:**
- Updated `frontend/src/lib/types.ts` - OrderStatus type definition
- Updated `frontend/src/pages/OrderDetail.tsx`:
  - STATUS_COLORS for all 9 new statuses
  - STATUS_OPTIONS array
  - Auto-trigger shipping dialog when selecting WaitingShipment status
  - Updated WhatsApp section visibility conditions
  - Fixed shipping agency list: Grab → GrabSend, added AnterAja
- Updated `frontend/src/pages/OrderManager.tsx`:
  - STATUS_COLORS for all 9 new statuses
  - Status filter dropdown with all 9 statuses

**Shipping Agencies:**
Gojek, GrabSend, JNE, J&T, SiCepat, AnterAja, Paxel, Lalamove, Other

---

## 2026-01-29 - Order Management Module (Complete Implementation)

**Added:**
- Complete Order Management module (standalone, no ProductVersion dependency)
- Customer entity with phone, source, notes tracking
- Order entity with MMDD-NNN format order numbers for bank transfer reference
- Order items with product_name text fields and combobox autocomplete
- WhatsApp receipt generation with bank details (BCA PT Malo Group Bahagia)
- CSV export endpoints for orders and order items
- Product and seller suggestion endpoints for autocomplete
- Sales channel tracking (IG, WA, Shopee, Tokopedia, etc.)
- Sold by field with autocomplete from previous orders

**Backend Implementation (9 files):**
- `backend/app/models/customer.py` (39 lines) - Customer model with relationships
- `backend/app/models/order.py` (104 lines) - Order and OrderItem models with cascade delete
- `backend/app/schemas/customer.py` - Customer Pydantic schemas
- `backend/app/schemas/order.py` (151 lines) - Order/OrderItem schemas with validation
- `backend/app/crud/customers.py` - Customer CRUD (list, get, create, update)
- `backend/app/crud/orders.py` (309 lines) - Order CRUD with totals calculation, suggestions, export
- `backend/app/routers/customers.py` - 4 customer endpoints
- `backend/app/routers/orders.py` (200+ lines) - 10 order endpoints + CSV export + suggestions
- `backend/app/services/whatsapp_formatter.py` - WhatsApp receipt generator

**Frontend Implementation (5 files):**
- `frontend/src/pages/OrderManager.tsx` - Order list with filters + create form
- `frontend/src/pages/OrderDetail.tsx` - Order detail page with WhatsApp copy button
- `frontend/src/components/orders/OrderForm.tsx` (300+ lines) - Complex order form
- `frontend/src/hooks/useOrders.ts` - Order React Query hooks (7 functions)
- `frontend/src/hooks/useCustomers.ts` - Customer React Query hooks

**Key Features:**
- Order number format: `MMDD-NNN` (e.g., 0129-001) for easy bank transfer reference
- Real-time totals calculation (amount, cost, margin)
- Status workflow: Draft → Confirmed → Completed → Cancelled
- Payment tracking: Unpaid → Partial → Paid with method (BCA, QRIS, Cash)
- WhatsApp-ready receipt with bank details for customer communication

---

## 2025-01-28 - Ingredient & Material Management Enhancements

**Added:**
- Edit functionality for ingredients and packaging materials
- Navigation links in header for Ingredients and Materials pages
- Edit buttons on ingredient and material cards
- Form mode switching (create vs. edit) with dynamic UI

**Updated:**
- IngredientsManager.tsx: Added edit mode with cancel button
- MaterialsManager.tsx: Added edit mode with cancel button
- Header.tsx: Added Ingredients and Materials navigation links
- Both managers now use PUT endpoints for updates

---

## 2025-01-27 - Phase 2 Frontend Complete

**Added:**
- Complete React frontend with TypeScript
- Dashboard with carousel navigation
- Recipe/Packaging/Product editors
- Version navigation and copying
- COGS calculations display
- shadcn/ui component library

**Components:**
- 13 UI components (shadcn/ui)
- 3 layout components
- 5 shared utility components
- 3 entity card components
- 4 page components
- 7 React Query hooks

**Technical:**
- React 19.2.0, Tailwind CSS 4.1.18, React Router 7.13.0
- TanStack Query 5.90.20 for server state
- Axios for HTTP client
- Lucide React for icons

---

## 2025-01-27 - Phase 1 Backend Complete

**Added:**
- FastAPI backend with SQLite database
- Full CRUD operations for all entities
- Cost calculator service
- Versioning system for recipes, packaging, products
- 41 API endpoints across 7 routers

**Models:**
- Ingredient, PackagingMaterial, Tag
- Recipe, RecipeVersion, RecipeComponent, ComponentIngredient
- PackagingRecipe, PackagingVersion, PackagingComponent, PackagingComponentMaterial
- Product, ProductVersion
