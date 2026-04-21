# System Architecture & Reference

## 1. High-Level Architecture

**Request Flow:**

```
User Browser
    ↓
React Router (pages/)
    ↓
React Query Hooks (hooks/)
    ↓
Axios API Client (lib/api.ts)
    ↓ HTTP/JSON
FastAPI Routers (routers/)
    ↓
CRUD Operations (crud/)
    ↓
SQLAlchemy Models (models/)
    ↓
SQLite Database (data/malo_recipes.db)
```

**Layer Responsibilities:**

- **Frontend Pages**: Handle routing, data fetching, user interactions
- **React Query Hooks**: Manage server state, caching, mutations
- **API Client**: HTTP requests with axios, centralized error handling
- **FastAPI Routers**: Endpoint definitions, request validation, response formatting
- **CRUD Layer**: Database queries, relationship loading, business logic
- **Models Layer**: ORM definitions, relationships, constraints
- **Services Layer**: Cross-cutting concerns (cost calculations)

## 2. Technology Stack

| Layer | Technology | Version |
|-------|------------|---------|
| Backend | Python + FastAPI | 3.11+ / 0.109.0 |
| Database | SQLite | 3.x |
| ORM | SQLAlchemy | 2.0.25 |
| Validation | Pydantic | 2.5.3 |
| Frontend | React + TypeScript | 19.2.0 |
| Styling | Tailwind CSS | 4.1.18 |
| UI Components | shadcn/ui (Radix) | latest |
| State | TanStack Query | 5.90.20 |
| Routing | React Router | 7.13.0 |
| HTTP Client | Axios | 1.13.3 |
| Icons | Lucide React | 0.563.0 |

## 3. Database Schema

### Visual Schema Diagram

```mermaid
erDiagram
    INGREDIENT {
        int id PK
        string name
        string brand
        string procurement_source
        string unit_type
        decimal volume_purchased
        decimal price_excl_shipping
        decimal shipping_cost
    }

    PACKAGING_MATERIAL {
        int id PK
        string name
        string brand
        string procurement_source
        string unit_type
        decimal volume_purchased
        decimal price_excl_shipping
        decimal shipping_cost
    }

    TAG {
        int id PK
        string name
    }

    RECIPE {
        int id PK
        string name
    }

    RECIPE_VERSION {
        int id PK
        int recipe_id FK
        int version_number
        string version_name
        string description
        decimal estimated_yield_grams
        boolean is_single_component
        boolean is_reusable_component
        int copied_from_version_id FK
    }

    RECIPE_COMPONENT {
        int id PK
        int recipe_version_id FK
        int sort_order
        string component_name
        int linked_recipe_version_id FK
    }

    COMPONENT_INGREDIENT {
        int id PK
        int recipe_component_id FK
        int ingredient_id FK
        int sort_order
        string unit
        decimal quantity
    }

    PACKAGING_RECIPE {
        int id PK
        string name
    }

    PACKAGING_VERSION {
        int id PK
        int packaging_recipe_id FK
        int version_number
        string version_name
        string description
        int copied_from_version_id FK
    }

    PACKAGING_COMPONENT {
        int id PK
        int packaging_version_id FK
        int sort_order
        string component_name
    }

    PACKAGING_COMPONENT_MATERIAL {
        int id PK
        int packaging_component_id FK
        int packaging_material_id FK
        int sort_order
        string unit
        decimal quantity
    }

    PRODUCT {
        int id PK
        string name
    }

    PRODUCT_VERSION {
        int id PK
        int product_id FK
        int version_number
        string version_name
        string description
        int recipe_version_id FK
        int packaging_version_id FK
        decimal retail_price_idr
        int num_pieces
        decimal grams_per_piece
        int copied_from_version_id FK
    }

    CUSTOMER {
        int id PK
        string name
        string phone
        string source
        string notes
    }

    ORDER {
        int id PK
        string order_number
        int customer_id FK
        string status
        string payment_status
        string payment_method
        datetime order_date
        datetime due_date
        float total_amount
        float total_cost
        float total_margin
        string channel
        string sold_by
        string notes
    }

    ORDER_ITEM {
        int id PK
        int order_id FK
        string product_name
        string product_variant
        int quantity
        float unit_price
        float unit_cost
        float discount_amount
        float line_total
        float line_cost
        float line_margin
    }

    RECIPE ||--o{ RECIPE_VERSION : "has versions"
    RECIPE_VERSION ||--o{ RECIPE_COMPONENT : "contains"
    RECIPE_COMPONENT ||--o{ COMPONENT_INGREDIENT : "has ingredients"
    COMPONENT_INGREDIENT }o--|| INGREDIENT : "uses"
    RECIPE_COMPONENT }o--o| RECIPE_VERSION : "links to (reusable)"
    RECIPE_VERSION }o--o| RECIPE_VERSION : "copied from"
    
    PACKAGING_RECIPE ||--o{ PACKAGING_VERSION : "has versions"
    PACKAGING_VERSION ||--o{ PACKAGING_COMPONENT : "contains"
    PACKAGING_COMPONENT ||--o{ PACKAGING_COMPONENT_MATERIAL : "has materials"
    PACKAGING_COMPONENT_MATERIAL }o--|| PACKAGING_MATERIAL : "uses"
    PACKAGING_VERSION }o--o| PACKAGING_VERSION : "copied from"
    
    PRODUCT ||--o{ PRODUCT_VERSION : "has versions"
    PRODUCT_VERSION }o--|| RECIPE_VERSION : "uses recipe"
    PRODUCT_VERSION }o--|| PACKAGING_VERSION : "uses packaging"
    PRODUCT_VERSION }o--o| PRODUCT_VERSION : "copied from"

    CUSTOMER ||--o{ ORDER : "places"
    ORDER ||--o{ ORDER_ITEM : "contains"
```

### Table Definitions (Summarized)

1. **ingredient**: Raw food ingredients (g, kg, ml, l, pcs)
2. **packaging_material**: Raw packaging materials (pcs, m, cm, sheets)
3. **tag**: Categories (Dubai-Snack, etc.)
4. **recipe**: Parent entity for recipes
5. **recipe_version**: Versioned recipe data with yield and lineage
6. **recipe_component**: Components within a recipe (inline or linked)
7. **component_ingredient**: Individual ingredients in a component
8. **recipe_tag**: Junction table
9. **packaging_recipe**: Parent entity for packaging
10. **packaging_version**: Versioned packaging configurations
11. **packaging_component**: Structural components of packaging
12. **packaging_component_material**: Materials used in packaging components
13. **packaging_tag**: Junction table
14. **product**: Parent entity for saleable products
15. **product_version**: Versioned product config linking Recipe + Packaging with COGS
16. **product_tag**: Junction table
17. **customer**: Customer entity for order management
18. **order**: Order entity (standalone, links to customer)
19. **order_item**: Order line items (standalone text-based product link)

---

## Project Structure

```
product_master/
+-- convex/                           # Backend (59 tables)
|   +-- _generated/                   # Auto-generated types & API
|   +-- lib/
|   |   +-- costCalculator.ts         # Cost calculation logic
|   |   +-- auth.ts                   # requireRole() helper
|   +-- auth/                         # Login, sessions, user management
|   +-- channels/                     # Channel usage tracking
|   +-- componentTypes/               # Unified BOM component types
|   +-- customers/                    # Customer CRUD
|   +-- dashboard/                    # Dashboard aggregation queries
|   +-- externalData/                 # External data sync (GoFood, etc.)
|   +-- feedback/                     # Visual feedback overlay
|   +-- gofoodDepot/                  # GoFood depot integration
|   +-- ingredients/                  # Ingredient CRUD
|   +-- integrations/                 # Third-party integrations (GoBiz)
|   +-- integrityChecks/              # Data integrity validation
|   +-- inventory/                    # Inventory batches, stock, transactions
|   +-- k3martCockpit/                # K3Mart cockpit dashboard
|   +-- k3martKitchen/                # K3Mart kitchen operations
|   +-- kitchenConfig/                # Kitchen configuration settings
|   +-- materials/                    # Packaging materials CRUD
|   +-- menuProductComponents/        # Menu product -> component type links
|   +-- menuProducts/                 # Menu product definitions
|   +-- migrations/                   # Data migrations
|   +-- orders/                       # Order management
|   |   +-- queries.ts
|   |   +-- mutations/                # Split: orderCrud, inventoryIntegration
|   |   +-- whatsapp.ts               # WhatsApp message templates
|   |   +-- helpers.ts                # Pure functions (no ctx)
|   |   +-- helpers/                  # Ctx-dependent helpers
|   +-- packaging/                    # Packaging recipes
|   +-- platformCredentials/          # Platform API credentials
|   +-- productionCounts/             # Production counts (archived, read-only)
|   +-- productionLog/                # Production log entries (source of truth)
|   +-- productionTargets/            # Daily production targets
|   +-- productionUnitTypes/          # Production unit types (Big Ball, Mid Ball)
|   +-- products/                     # Product management
|   +-- recipes/                      # Recipe management
|   +-- reports/                      # Report generation
|   +-- restock/                      # Restock planning
|   +-- shipping/                     # Shipping agency tracking
|   +-- storageLocations/             # Storage location CRUD
|   +-- tags/                         # Tag management
|   +-- vouchers/                     # Voucher codes + usage tracking
|   +-- whatsappTemplates/            # Editable WhatsApp templates
|   +-- crons.ts                      # Scheduled jobs
|   +-- http.ts                       # HTTP endpoints
|   +-- schema.ts                     # Database schema
+-- src/                              # Frontend
|   +-- components/
|   |   +-- ui/                       # shadcn/ui primitives
|   |   +-- layout/                   # Header, Layout, PageHeader
|   |   +-- auth/                     # ProtectedRoute, LoginForm
|   |   +-- shared/                   # CostTooltip, ConfirmDialog, FormBuilder, etc.
|   |   +-- (feature folders)
|   +-- pages/                        # Page components
|   +-- hooks/
|   |   +-- convex/                   # Convex query/mutation hooks + index.ts
|   +-- contexts/
|   |   +-- AuthContext.tsx           # Auth state (useAuth)
|   +-- lib/
|   |   +-- types.ts                  # TypeScript interfaces
|   |   +-- utils.ts                  # cn, formatCurrency
|   +-- App.tsx                       # Router setup
|   +-- main.tsx                      # Entry with ConvexProvider
|   +-- index.css                     # Tailwind CSS + theme
+-- docs/                             # Documentation
+-- .claude/agents/                   # Specialized agents
+-- .agent/skills/                    # Custom skills
```

---

## Critical File Paths

**Backend (Convex) — 59 tables in `convex/schema.ts`:**
- `convex/schema.ts` — Database schema definition
- `convex/lib/costCalculator.ts` — Cost calculation logic
- `convex/lib/auth.ts` — `requireRole()` authorization helper
- `convex/orders/whatsapp.ts` — WhatsApp receipt generation
- `convex/orders/helpers.ts` — Pure order calculation helpers (no ctx)
- `convex/orders/helpers/` — Ctx-dependent helpers (ballDistribution, statusTransitions, usageTracking, productionRecords, voucherHandling, batchFetching, statusFetching)
- `convex/orders/mutations/` — Order mutations (split into orderCrud, inventoryIntegration)

**Frontend:**
- `src/App.tsx` — Router setup (all routes use ProtectedRoute)
- `src/main.tsx` — Entry point with ConvexProvider
- `src/contexts/AuthContext.tsx` — Auth state management
- `src/hooks/convex/` — Convex query/mutation hooks
- `src/lib/types.ts` — TypeScript interfaces
- `src/lib/utils.ts` — Utilities (cn, formatCurrency)
- `src/components/auth/ProtectedRoute.tsx` — Route permission guards
