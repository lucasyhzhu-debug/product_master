# CLAUDE.md

## Project Overview

**Malo Recipe Master** — A local-first recipe and product concept management system for an Indonesian FMCG snack company. Tracks food recipes, packaging recipes, and product concepts with full versioning, cost calculations, and margin analysis.

## 🔍 ARCHITECTURE & SCHEMA REFERENCE

> **⚠️ MANDATORY REFERENCE**: This section MUST be reviewed before starting any planning or implementation work.
> It provides the complete system architecture and database schema that agents need to understand before making changes.

### System Architecture Overview

**Request Flow:**
```
User Browser
    ↓
React Router (src/pages/)
    ↓
React Query Hooks (src/hooks/)
    ↓
Axios API Client (src/lib/api.ts)
    ↓ HTTP/JSON
FastAPI Routers (api/app/routers/)
    ↓
CRUD Operations (api/app/crud/)
    ↓
SQLAlchemy Models (api/app/models/)
    ↓
Database Layer (SQLite dev / PostgreSQL prod)
    ↓
SQLite: api/data/malo_recipes.db (local)
PostgreSQL: Cloud database (production)
```

**Deployment Architecture:**
```
Vercel Edge Network
    ↓
Static Assets (dist/) - Served directly
    ↓
SPA Routes (/*) → index.html
    ↓
API Routes (/api/*) → Vercel Serverless Functions
    ↓
api/index.py (Mangum ASGI Adapter)
    ↓
FastAPI Application (api/app/main.py)
    ↓
PostgreSQL Database (NullPool for serverless)
```

**Layer Responsibilities:**
- **Frontend Pages**: Handle routing, data fetching, user interactions
- **React Query Hooks**: Manage server state, caching, mutations
- **API Client**: HTTP requests with axios, centralized error handling
- **FastAPI Routers**: Endpoint definitions, request validation, response formatting
- **CRUD Layer**: Database queries, relationship loading, business logic
- **Models Layer**: ORM definitions, relationships, constraints
- **Services Layer**: Cross-cutting concerns (cost calculations, WhatsApp formatting)
- **Database Layer**: Auto-detects SQLite (dev) or PostgreSQL (prod) via DATABASE_URL

### Complete Database Schema (19 Tables)

#### 1. `ingredient` - Food Ingredients
```sql
CREATE TABLE ingredient (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(255) NOT NULL,                -- e.g., "Tepung Terigu"
    brand VARCHAR(255),                        -- e.g., "Cakra Kembar"
    procurement_source VARCHAR(255),           -- e.g., "Tokopedia"
    unit_type VARCHAR(10) NOT NULL DEFAULT 'g', -- g, kg, ml, l, pcs
    volume_purchased FLOAT NOT NULL,           -- e.g., 1 (kg)
    price_excl_shipping FLOAT NOT NULL,        -- IDR
    shipping_cost FLOAT NOT NULL DEFAULT 0,    -- IDR
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100) DEFAULT 'admin'
);
CREATE INDEX idx_ingredient_name ON ingredient(name);
CREATE INDEX idx_ingredient_brand ON ingredient(brand);
```

#### 2. `packaging_material` - Packaging Materials
```sql
CREATE TABLE packaging_material (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(255) NOT NULL,                -- e.g., "Plastik PP"
    brand VARCHAR(255),
    procurement_source VARCHAR(255),
    unit_type VARCHAR(10) NOT NULL DEFAULT 'pcs', -- pcs, m, cm, sheets
    volume_purchased FLOAT NOT NULL,
    price_excl_shipping FLOAT NOT NULL,
    shipping_cost FLOAT NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100) DEFAULT 'admin'
);
CREATE INDEX idx_packaging_material_name ON packaging_material(name);
```

#### 3. `tag` - Category Tags
```sql
CREATE TABLE tag (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(100) NOT NULL UNIQUE,         -- e.g., "Dubai-Snack"
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
-- Seeded on init: Dubai-Snack, Extruded-Snack, Sachet, Pouch, Box
```

#### 4. `recipe` - Recipe Parent Entity
```sql
CREATE TABLE recipe (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(255) NOT NULL,                -- e.g., "Choco Crunch Base"
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100) DEFAULT 'admin'
);
CREATE INDEX idx_recipe_name ON recipe(name);
```

#### 5. `recipe_version` - Versioned Recipe Data
```sql
CREATE TABLE recipe_version (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recipe_id INTEGER NOT NULL,                -- FK to recipe
    version_number INTEGER NOT NULL,           -- 1, 2, 3...
    version_name VARCHAR(255) NOT NULL,        -- e.g., "Initial Formula"
    description VARCHAR(1000),
    estimated_yield_grams FLOAT,               -- Used for cost per gram
    is_single_component BOOLEAN DEFAULT FALSE, -- True if only 1 component
    is_reusable_component BOOLEAN DEFAULT FALSE, -- Can be linked by others
    copied_from_version_id INTEGER,            -- FK to recipe_version (lineage)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100) DEFAULT 'admin',
    FOREIGN KEY (recipe_id) REFERENCES recipe(id) ON DELETE CASCADE,
    FOREIGN KEY (copied_from_version_id) REFERENCES recipe_version(id),
    UNIQUE (recipe_id, version_number)
);
CREATE INDEX idx_recipe_version_recipe ON recipe_version(recipe_id);
```

#### 6. `recipe_component` - Components in a Recipe Version
```sql
CREATE TABLE recipe_component (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recipe_version_id INTEGER NOT NULL,        -- FK to recipe_version
    sort_order INTEGER NOT NULL DEFAULT 0,
    component_name VARCHAR(255) NOT NULL,      -- e.g., "Dough Base"
    linked_recipe_version_id INTEGER,          -- FK to recipe_version (for reusable)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (recipe_version_id) REFERENCES recipe_version(id) ON DELETE CASCADE,
    FOREIGN KEY (linked_recipe_version_id) REFERENCES recipe_version(id)
);
CREATE INDEX idx_recipe_component_version ON recipe_component(recipe_version_id);
CREATE INDEX idx_recipe_component_linked ON recipe_component(linked_recipe_version_id);
```

#### 7. `component_ingredient` - Ingredients in a Component
```sql
CREATE TABLE component_ingredient (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recipe_component_id INTEGER NOT NULL,      -- FK to recipe_component
    ingredient_id INTEGER NOT NULL,            -- FK to ingredient
    sort_order INTEGER NOT NULL DEFAULT 0,
    unit VARCHAR(10) NOT NULL DEFAULT 'g',     -- g, kg, ml, l, pcs
    quantity FLOAT NOT NULL,                   -- e.g., 500 (g)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (recipe_component_id) REFERENCES recipe_component(id) ON DELETE CASCADE,
    FOREIGN KEY (ingredient_id) REFERENCES ingredient(id)
);
CREATE INDEX idx_component_ingredient_component ON component_ingredient(recipe_component_id);
```

#### 8. `recipe_tag` - Junction Table (Recipe ↔ Tag)
```sql
CREATE TABLE recipe_tag (
    recipe_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    PRIMARY KEY (recipe_id, tag_id),
    FOREIGN KEY (recipe_id) REFERENCES recipe(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tag(id) ON DELETE CASCADE
);
```

#### 9. `packaging_recipe` - Packaging Parent Entity
```sql
CREATE TABLE packaging_recipe (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(255) NOT NULL,                -- e.g., "Standard Sachet"
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100) DEFAULT 'admin'
);
CREATE INDEX idx_packaging_recipe_name ON packaging_recipe(name);
```

#### 10. `packaging_version` - Versioned Packaging Data
```sql
CREATE TABLE packaging_version (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    packaging_recipe_id INTEGER NOT NULL,      -- FK to packaging_recipe
    version_number INTEGER NOT NULL,
    version_name VARCHAR(255) NOT NULL,
    description VARCHAR(1000),
    copied_from_version_id INTEGER,            -- FK to packaging_version
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100) DEFAULT 'admin',
    FOREIGN KEY (packaging_recipe_id) REFERENCES packaging_recipe(id) ON DELETE CASCADE,
    FOREIGN KEY (copied_from_version_id) REFERENCES packaging_version(id),
    UNIQUE (packaging_recipe_id, version_number)
);
CREATE INDEX idx_packaging_version_recipe ON packaging_version(packaging_recipe_id);
```

#### 11. `packaging_component` - Components in Packaging Version
```sql
CREATE TABLE packaging_component (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    packaging_version_id INTEGER NOT NULL,     -- FK to packaging_version
    sort_order INTEGER NOT NULL DEFAULT 0,
    component_name VARCHAR(255) NOT NULL,      -- e.g., "Inner Sachet"
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (packaging_version_id) REFERENCES packaging_version(id) ON DELETE CASCADE
);
CREATE INDEX idx_packaging_component_version ON packaging_component(packaging_version_id);
```

#### 12. `packaging_component_material` - Materials in Packaging Component
```sql
CREATE TABLE packaging_component_material (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    packaging_component_id INTEGER NOT NULL,   -- FK to packaging_component
    packaging_material_id INTEGER NOT NULL,    -- FK to packaging_material
    sort_order INTEGER NOT NULL DEFAULT 0,
    unit VARCHAR(10) NOT NULL DEFAULT 'pcs',   -- pcs, m, cm, sheets
    quantity FLOAT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (packaging_component_id) REFERENCES packaging_component(id) ON DELETE CASCADE,
    FOREIGN KEY (packaging_material_id) REFERENCES packaging_material(id)
);
CREATE INDEX idx_pcm_component ON packaging_component_material(packaging_component_id);
```

#### 13. `packaging_tag` - Junction Table (PackagingRecipe ↔ Tag)
```sql
CREATE TABLE packaging_tag (
    packaging_recipe_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    PRIMARY KEY (packaging_recipe_id, tag_id),
    FOREIGN KEY (packaging_recipe_id) REFERENCES packaging_recipe(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tag(id) ON DELETE CASCADE
);
```

#### 14. `product` - Product Parent Entity
```sql
CREATE TABLE product (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(255) NOT NULL,                -- e.g., "Choco Crunch 50g"
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100) DEFAULT 'admin'
);
CREATE INDEX idx_product_name ON product(name);
```

#### 15. `product_version` - Product Version with COGS
```sql
CREATE TABLE product_version (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,               -- FK to product
    version_number INTEGER NOT NULL,
    version_name VARCHAR(255) NOT NULL,
    description VARCHAR(1000),
    recipe_version_id INTEGER NOT NULL,        -- FK to recipe_version (pinned)
    packaging_version_id INTEGER NOT NULL,     -- FK to packaging_version (pinned)
    retail_price_idr FLOAT NOT NULL,           -- Selling price
    num_pieces INTEGER NOT NULL DEFAULT 1,     -- Pieces per product
    grams_per_piece FLOAT NOT NULL,            -- Grams per piece
    copied_from_version_id INTEGER,            -- FK to product_version
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100) DEFAULT 'admin',
    FOREIGN KEY (product_id) REFERENCES product(id) ON DELETE CASCADE,
    FOREIGN KEY (recipe_version_id) REFERENCES recipe_version(id),
    FOREIGN KEY (packaging_version_id) REFERENCES packaging_version(id),
    FOREIGN KEY (copied_from_version_id) REFERENCES product_version(id),
    UNIQUE (product_id, version_number)
);
CREATE INDEX idx_product_version_product ON product_version(product_id);
CREATE INDEX idx_product_version_recipe ON product_version(recipe_version_id);
CREATE INDEX idx_product_version_packaging ON product_version(packaging_version_id);
```

#### 16. `product_tag` - Junction Table (Product ↔ Tag)
```sql
CREATE TABLE product_tag (
    product_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    PRIMARY KEY (product_id, tag_id),
    FOREIGN KEY (product_id) REFERENCES product(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tag(id) ON DELETE CASCADE
);
```

#### 17. `customer` - Customer Entity (Order Management)
```sql
CREATE TABLE customer (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(255) NOT NULL,                -- Customer name
    phone VARCHAR(50),                         -- WhatsApp number
    source VARCHAR(100),                       -- 'WhatsApp', 'Instagram', 'Friend'
    notes VARCHAR(1000),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100) DEFAULT 'admin'
);
CREATE INDEX idx_customer_name ON customer(name);
CREATE INDEX idx_customer_phone ON customer(phone);
```

#### 18. `order` - Order Entity (Standalone - No ProductVersion FK)
```sql
CREATE TABLE "order" (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_number VARCHAR(20) NOT NULL UNIQUE,  -- Simple format: "0129-001" (MMDD-seq)
    customer_id INTEGER NOT NULL,

    -- Status workflow: Draft → AwaitingPayment → Confirmed → ... → Terminal
    status VARCHAR(20) NOT NULL DEFAULT 'Draft',      -- Draft|AwaitingPayment|Confirmed|ProductionComplete|Packaging|WaitingShipment|CompleteShipped|WaitingPickup|PickedUp|Cancelled
    awaiting_payment_since DATETIME,           -- Timestamp when order entered AwaitingPayment status

    payment_status VARCHAR(20) NOT NULL DEFAULT 'Unpaid', -- Unpaid|Partial|Paid
    payment_method VARCHAR(50),                -- 'BCA', 'QRIS', 'Cash'

    order_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    due_date DATETIME,

    total_amount FLOAT DEFAULT 0,              -- Sum of line totals
    total_cost FLOAT DEFAULT 0,                -- Sum of line costs
    total_margin FLOAT DEFAULT 0,              -- total_amount - total_cost

    channel VARCHAR(50),                       -- 'IG', 'WA', 'Shopee', 'Tokopedia', etc.
    sold_by VARCHAR(100),                      -- Free-text: salesperson name

    -- Delivery Info
    delivery_type VARCHAR(20) DEFAULT 'Pickup', -- Pickup, Delivery
    pickup_location VARCHAR(100),
    delivery_address VARCHAR(500),
    contact_wa VARCHAR(50),
    contact_ig VARCHAR(100),
    shipping_agency VARCHAR(50),
    shipping_number VARCHAR(100),
    cancellation_reason VARCHAR(255),

    notes VARCHAR(1000),

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100) DEFAULT 'admin',

    FOREIGN KEY (customer_id) REFERENCES customer(id)
);
CREATE INDEX idx_order_number ON "order"(order_number);
CREATE INDEX idx_order_customer ON "order"(customer_id);
CREATE INDEX idx_order_due_date ON "order"(due_date);
CREATE INDEX idx_order_status ON "order"(status);
CREATE INDEX idx_order_channel ON "order"(channel);
```

#### 19. `order_item` - Order Line Items (Standalone - No ProductVersion FK)
```sql
CREATE TABLE order_item (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,

    -- Product info as text (standalone mode with combobox autocomplete)
    product_name VARCHAR(255) NOT NULL,        -- Combobox searches previous entries
    product_variant VARCHAR(255),              -- Optional: "Large", "v2", etc.

    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price FLOAT NOT NULL,                 -- Selling price per unit
    unit_cost FLOAT DEFAULT 0,                 -- Cost per unit (manual entry)
    discount_amount FLOAT DEFAULT 0,

    line_total FLOAT NOT NULL,                 -- (qty * unit_price) - discount
    line_cost FLOAT NOT NULL,                  -- qty * unit_cost
    line_margin FLOAT NOT NULL,                -- line_total - line_cost

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (order_id) REFERENCES "order"(id) ON DELETE CASCADE
);
CREATE INDEX idx_order_item_order ON order_item(order_id);
CREATE INDEX idx_order_item_product ON order_item(product_name);  -- For combobox search
```

### Order Status Workflow

```
Draft
  └─> AwaitingPayment (WhatsApp sent, waiting for payment)
        └─> Confirmed (payment verified)
              └─> ProductionComplete (kitchen: production done)
                    └─> Packaging (kitchen: actively packaging)
                          ├─> WaitingShipment ─> CompleteShipped (delivered)
                          └─> WaitingPickup ─> PickedUp (customer picked up)

Any non-terminal → Cancelled (requires cancellation_reason)
```

**Status Meanings:**
| Status | Description | Next States |
|--------|-------------|-------------|
| Draft | Order created, not confirmed | AwaitingPayment, Cancelled |
| AwaitingPayment | WhatsApp sent, waiting for payment (tracks `awaiting_payment_since`) | Confirmed, Cancelled |
| Confirmed | Payment verified, ready for production | ProductionComplete, Cancelled |
| ProductionComplete | Kitchen finished production | Packaging, Cancelled |
| Packaging | Actively packaging | WaitingShipment, WaitingPickup, Cancelled |
| WaitingShipment | Ready for courier (requires shipping_number + shipping_agency) | CompleteShipped, Cancelled |
| CompleteShipped | Delivered to customer (terminal) | - |
| WaitingPickup | Ready for customer pickup | PickedUp, Cancelled |
| PickedUp | Customer picked up (terminal) | - |
| Cancelled | Order cancelled (requires cancellation_reason, terminal) | - |

**AwaitingPayment Visual Indicator:**
- Green badge: Waiting < 24 hours
- Yellow badge: Waiting 1-2 days
- Red badge: Waiting > 2 days

**Shipping Agencies:**
Gojek, GrabSend, JNE, J&T, SiCepat, AnterAja, Paxel, Lalamove, Other

### Visual Schema Diagram

```
┌──────────────┐
│  Ingredient  │──┐
└──────────────┘  │
                  │  ┌──────────────────────┐      ┌──────────────────┐      ┌─────────┐      ┌────────────┐
                  └─>│ ComponentIngredient  │─────>│ RecipeComponent  │─────>│ RecipeV │─────>│   Recipe   │
                     └──────────────────────┘      └──────────────────┘      │ -ersion │      └─────────────┘
                                                             │                └─────────┘             │
                                                             │                     │                  │
                                                             │(linked_recipe_      │(1:N)             │
                                                             │ version_id)         │                  │
                                                             └─────────────────────┘                  │
                                                                                                      │
┌────────────────────┐                                                                               │
│ PackagingMaterial  │──┐                                                                            │
└────────────────────┘  │                                                                            │
                        │  ┌───────────────────────────┐   ┌──────────────────────┐   ┌───────────┐ │
                        └─>│ PackagingComponentMaterial│──>│ PackagingComponent   │──>│ Packaging │ │
                           └───────────────────────────┘   └──────────────────────┘   │  Version  │ │
                                                                                       └───────────┘ │
                                                                                            │        │
                                                                                            │        │
                                                      ┌─────────────────────────────────────┘        │
                                                      │                                              │
                                                      │        ┌────────────────┐                    │
                                                      └───────>│ ProductVersion │<───────────────────┘
                                                               └────────────────┘
                                                                       │
                                                                       │(1:N)
                                                                       ▼
                                                               ┌───────────────┐
                                                               │    Product    │
                                                               └───────────────┘

┌──────┐     ┌────────────┐     ┌─────────────────┐     ┌─────────┐
│ Tag  │<────│ recipe_tag │────>│     Recipe      │     │ (M:N)   │
│      │<────│ packaging_ │────>│ PackagingRecipe │     │         │
│      │<────│ product_   │────>│     Product     │     │         │
└──────┘     └────────────┘     └─────────────────┘     └─────────┘
```

### Data Flow Patterns

#### Cost Calculation Flow
```
Step 1: Base Cost (Ingredient/PackagingMaterial)
    price_excl_shipping + shipping_cost = total_cost
    normalize(volume_purchased, unit_type) = base_volume
    → cost_per_base_unit = total_cost / base_volume
    Example: 25,000 IDR ÷ 1000g = 25 IDR/g

Step 2: Component Line Cost (ComponentIngredient/PackagingComponentMaterial)
    quantity × ingredient.cost_per_base_unit = line_cost
    Example: 500g × 25 IDR/g = 12,500 IDR

Step 3: Component Total Cost (RecipeComponent)
    IF linked_recipe_version_id EXISTS:
        → get_recipe_version_cost(linked_recipe_version_id)
    ELSE:
        → sum(all component_ingredient line costs)

Step 4: Recipe Version Total Cost
    sum(all recipe_component costs) = total_cost
    IF estimated_yield_grams:
        → cost_per_gram = total_cost / estimated_yield_grams
    Example: 50,000 IDR ÷ 1000g = 50 IDR/g

Step 5: Product COGS Breakdown
    total_grams = num_pieces × grams_per_piece
    recipe_cogs = recipe_cost_per_gram × total_grams
    packaging_cogs = sum(all packaging_component_material costs)
    total_cogs = recipe_cogs + packaging_cogs
    contribution_margin = retail_price_idr - total_cogs
    margin_pct = (contribution_margin / retail_price_idr) × 100
```

#### Version Copy Flow
```
User Action: "Copy Version 3 to new version"
    ↓
1. Get source version (RecipeVersion id=3)
    ↓
2. Calculate next version_number = max(version_number) + 1
    ↓
3. Create new RecipeVersion
    - version_number = 5
    - copied_from_version_id = 3
    - Copy all scalar fields from source
    ↓
4. Deep copy all RecipeComponents
    For each component in source:
        - Create new RecipeComponent
        - Copy component_name, sort_order, linked_recipe_version_id
        ↓
        5. Deep copy all ComponentIngredients
            For each ingredient in component:
                - Create new ComponentIngredient
                - Copy ingredient_id, quantity, unit, sort_order
    ↓
6. Commit transaction
    ↓
Result: Fully independent version that can be edited without affecting source
```

### Quick File Finder

**Note:** Backend files are in `api/app/`, frontend files are in `src/`

| Task | Backend Files | Frontend Files |
|------|---------------|----------------|
| **Add field to Recipe** | `api/app/models/recipe.py`<br>`api/app/schemas/recipe.py`<br>`api/app/crud/recipes.py` | `src/lib/types.ts`<br>`src/hooks/useRecipes.ts` |
| **Modify cost calculation** | `api/app/services/cost_calculator.py` | `src/components/shared/CostTooltip.tsx` |
| **Add Recipe API endpoint** | `api/app/routers/recipes.py` | `src/lib/api.ts`<br>`src/hooks/useRecipes.ts` |
| **Update Recipe UI** | - | `src/pages/RecipeEditor.tsx`<br>`src/components/recipes/RecipeCard.tsx` |
| **Add Packaging field** | `api/app/models/packaging.py`<br>`api/app/schemas/packaging.py`<br>`api/app/crud/packaging.py` | `src/lib/types.ts`<br>`src/hooks/usePackaging.ts` |
| **Update Product COGS** | `api/app/services/cost_calculator.py`<br>`api/app/routers/products.py` | `src/pages/ProductEditor.tsx` |
| **Add new Tag category** | `api/app/database.py` (seed data) | - |
| **Create shared component** | - | `src/components/shared/` |
| **Add validation logic** | `api/app/schemas/[entity].py` | Form components in `src/pages/` |
| **Database schema change** | `api/app/database.py`<br>`api/app/models/[entity].py` | Update `src/lib/types.ts` to match |
| **Fix N+1 query** | `api/app/crud/[entity].py` (add joinedload) | - |
| **Add dashboard stat** | `api/app/routers/dashboard.py`<br>`api/app/crud/[entity].py` | `src/pages/Dashboard.tsx` |
| **Add Order field** | `api/app/models/order.py`<br>`api/app/schemas/order.py`<br>`api/app/crud/orders.py` | `src/lib/types.ts`<br>`src/hooks/useOrders.ts` |
| **Update WhatsApp template** | `api/app/services/whatsapp_formatter.py` | - |
| **Add Order API endpoint** | `api/app/routers/orders.py` | `src/lib/api.ts`<br>`src/hooks/useOrders.ts` |
| **Update Order UI** | - | `src/pages/OrderManager.tsx`<br>`src/pages/OrderDetail.tsx`<br>`src/components/orders/` |
| **Kitchen View (production)** | `api/app/routers/orders.py` (kitchen endpoint)<br>`api/app/crud/orders.py` | `src/pages/KitchenView.tsx` |
| **Database Migration** | `api/scripts/migrate_sqlite_to_pg.py`<br>`api/scripts/MIGRATION_README.md` | - |
| **Deployment Config** | `api/index.py` (Vercel entry)<br>`vercel.json` | `vite.config.ts` |

### Critical File Paths Reference

**Backend Core:**
- `api/app/main.py` - FastAPI app, CORS, router registration (55 endpoints total)
- `api/app/database.py` - Database engine (SQLite/PostgreSQL), session factory, init_db(), seed data
- `api/app/services/cost_calculator.py` - All cost calculation logic (212 lines)
- `api/app/services/whatsapp_formatter.py` - WhatsApp receipt generation
- `api/index.py` - Vercel serverless entry point (Mangum ASGI adapter)

**Backend Models (9 files, 16 classes):**
- `api/app/models/ingredient.py` - Ingredient
- `api/app/models/packaging_material.py` - PackagingMaterial
- `api/app/models/tag.py` - Tag
- `api/app/models/recipe.py` - Recipe, RecipeVersion, RecipeComponent, ComponentIngredient
- `api/app/models/packaging.py` - PackagingRecipe, PackagingVersion, PackagingComponent, PackagingComponentMaterial
- `api/app/models/product.py` - Product, ProductVersion
- `api/app/models/customer.py` - Customer
- `api/app/models/order.py` - Order, OrderItem
- `api/app/models/menu_product.py` - MenuProduct (future)

**Backend Routers (9 files, 55+ endpoint functions):**
- `api/app/routers/ingredients.py` - 5 endpoints (list, get, create, update, delete)
- `api/app/routers/packaging_materials.py` - 5 endpoints
- `api/app/routers/tags.py` - 3 endpoints (list, create, delete)
- `api/app/routers/recipes.py` - 8 endpoints (list, reusable, get, get_version, create, create_version, copy_version, update_tags, delete)
- `api/app/routers/packaging.py` - 7 endpoints
- `api/app/routers/products.py` - 6 endpoints
- `api/app/routers/dashboard.py` - 1 endpoint (stats)
- `api/app/routers/customers.py` - 4 endpoints (list, get, create, update)
- `api/app/routers/orders.py` - 12 endpoints (list, get, kitchen, create, update_status, update_payment, update_shipping, delete, product_suggestions, seller_suggestions, export_orders, export_order_items)
- `api/app/routers/menu_products.py` - 5 endpoints (future)

**Migration & Deployment:**
- `api/scripts/migrate_sqlite_to_pg.py` - SQLite → PostgreSQL migration script
- `api/scripts/MIGRATION_README.md` - Migration guide
- `vercel.json` - Vercel deployment configuration

**Frontend Core:**
- `src/App.tsx` - Router setup (9 routes), React Query provider
- `src/lib/api.ts` - Axios client, 50+ API functions
- `src/lib/types.ts` - TypeScript interfaces matching backend schemas (400+ lines)

**Frontend Pages (9 files):**
- `src/pages/Dashboard.tsx` - 3 carousels (Products, Recipes, Packaging), statistics
- `src/pages/RecipeEditor.tsx` - Recipe version editor (648 lines)
- `src/pages/PackagingEditor.tsx` - Packaging version editor (607 lines)
- `src/pages/ProductEditor.tsx` - Product version editor with COGS breakdown (545 lines)
- `src/pages/IngredientsManager.tsx` - Ingredient list + create/edit form
- `src/pages/MaterialsManager.tsx` - Packaging material list + create/edit form
- `src/pages/OrderManager.tsx` - Order list + filters + create form
- `src/pages/OrderDetail.tsx` - Order detail with WhatsApp copy + status updates (refactored to 363 lines)
- `src/pages/KitchenView.tsx` - Production-focused order view with status groups

**Frontend Components:**
- `src/components/orders/` - 7 order-specific components (OrderHeader, OrderStatusPanel, OrderWhatsAppPanel, OrderItems, ShippingDialog, CancellationDialog, ConfirmationDialog)
- `src/components/shared/` - 9 shared components (Carousel, ConfirmDialog, CostTooltip, EmptyState, etc.)
- `src/components/ui/` - 14 shadcn/ui components (accordion, badge, button, card, etc.)

**Frontend Hooks (9 files):**
- `src/hooks/useIngredients.ts` - Queries + mutations for ingredients
- `src/hooks/useMaterials.ts` - Queries + mutations for packaging materials
- `src/hooks/useTags.ts` - Queries + mutations for tags
- `src/hooks/useRecipes.ts` - Queries + mutations for recipes
- `src/hooks/usePackaging.ts` - Queries + mutations for packaging
- `src/hooks/useProducts.ts` - Queries + mutations for products
- `src/hooks/useCustomers.ts` - Queries + mutations for customers
- `src/hooks/useOrders.ts` - Queries + mutations for orders (includes product/seller suggestions)
- `src/hooks/useMenuProducts.ts` - Queries + mutations for menu products (future)
- Each hook includes: query key factory, list query, detail query, mutations with cache invalidation

## Tech Stack

| Layer | Technology | Version | Notes |
|-------|------------|---------|-------|
| **Backend** | Python + FastAPI | 3.11+ / 0.109.0 | ASGI framework |
| **Database (Dev)** | SQLite | 3.x | Local development |
| **Database (Prod)** | PostgreSQL | 15+ | Production (NullPool for serverless) |
| **ORM** | SQLAlchemy | 2.0.25 | Supports both SQLite & PostgreSQL |
| **Validation** | Pydantic | 2.5.3 | Request/response schemas |
| **Deployment** | Vercel | - | Serverless functions + static hosting |
| **ASGI Adapter** | Mangum | 0.18.0 | FastAPI → AWS Lambda/Vercel adapter |
| **DB Driver (Prod)** | psycopg2-binary | 2.9.9 | PostgreSQL driver |
| **Frontend** | React + TypeScript | 19.2.0 | UI framework |
| **Build Tool** | Vite | 6.2.1 | Fast bundler with HMR |
| **Styling** | Tailwind CSS | 4.1.18 | Utility-first CSS |
| **UI Components** | shadcn/ui (Radix) | latest | Accessible components |
| **State** | TanStack Query | 5.90.20 | Server state management |
| **Routing** | React Router | 7.13.0 | Client-side routing |
| **HTTP Client** | Axios | 1.13.3 | API requests |
| **Icons** | Lucide React | 0.563.0 | Icon library |

## Commands

```bash
# Development (Local - SQLite)
# Backend
cd api
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Frontend (from project root)
npm install
npm run dev

# Production Build
npm run build                    # Builds frontend to dist/

# Linting
npm run lint

# Database Management (SQLite - Local Development)
# Database reset (deletes all data)
rm api/data/malo_recipes.db && cd api && python -c "from app.database import init_db; init_db()"

# Windows database reset
del api\data\malo_recipes.db && cd api && python -c "from app.database import init_db; init_db()"

# Migration (SQLite → PostgreSQL)
cd api/scripts
python migrate_sqlite_to_pg.py --sqlite-path ../data/malo_recipes.db --postgres-url "postgresql://user:pass@host:5432/dbname"

# Deployment (Vercel)
vercel                           # Preview deployment
vercel --prod                    # Production deployment

# Environment Variables (Production)
# Set in Vercel dashboard or use vercel env
DATABASE_URL=postgresql://...    # PostgreSQL connection string
VITE_API_URL=/api               # API base URL (relative for same domain)
```

## Project Structure

**Monolithic Layout (Optimized for Vercel Deployment)**

```
product_master/
├── api/                         # Backend (FastAPI) - Vercel Serverless Functions
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py              # FastAPI app, CORS, routers
│   │   ├── database.py          # DB engine (SQLite/PostgreSQL), session, init
│   │   ├── models/              # SQLAlchemy models (9 files)
│   │   │   ├── __init__.py
│   │   │   ├── ingredient.py
│   │   │   ├── packaging_material.py
│   │   │   ├── tag.py
│   │   │   ├── recipe.py        # Recipe, RecipeVersion, RecipeComponent, ComponentIngredient
│   │   │   ├── packaging.py     # PackagingRecipe, PackagingVersion, PackagingComponent
│   │   │   ├── product.py       # Product, ProductVersion
│   │   │   ├── customer.py      # Customer
│   │   │   ├── order.py         # Order, OrderItem
│   │   │   └── menu_product.py  # MenuProduct (future)
│   │   ├── schemas/             # Pydantic schemas (9 files)
│   │   │   ├── __init__.py
│   │   │   ├── ingredient.py
│   │   │   ├── packaging_material.py
│   │   │   ├── tag.py
│   │   │   ├── recipe.py
│   │   │   ├── packaging.py
│   │   │   ├── product.py
│   │   │   ├── customer.py
│   │   │   ├── order.py
│   │   │   └── menu_product.py
│   │   ├── crud/                # Database operations (9 files)
│   │   │   ├── __init__.py
│   │   │   ├── ingredients.py
│   │   │   ├── packaging_materials.py
│   │   │   ├── tags.py
│   │   │   ├── recipes.py
│   │   │   ├── packaging.py
│   │   │   ├── products.py
│   │   │   ├── customers.py
│   │   │   ├── orders.py
│   │   │   └── menu_products.py
│   │   ├── services/            # Business logic
│   │   │   ├── __init__.py
│   │   │   ├── cost_calculator.py
│   │   │   └── whatsapp_formatter.py
│   │   └── routers/             # API endpoints (9 files, 55 endpoints)
│   │       ├── __init__.py
│   │       ├── ingredients.py
│   │       ├── packaging_materials.py
│   │       ├── tags.py
│   │       ├── recipes.py
│   │       ├── packaging.py
│   │       ├── products.py
│   │       ├── dashboard.py
│   │       ├── customers.py
│   │       ├── orders.py
│   │       └── menu_products.py
│   ├── data/
│   │   └── malo_recipes.db      # SQLite database (local dev only)
│   ├── scripts/                 # Migration & deployment scripts
│   │   ├── migrate_sqlite_to_pg.py
│   │   └── MIGRATION_README.md
│   ├── index.py                 # Vercel serverless entry point (Mangum)
│   └── requirements.txt         # Python dependencies
├── src/                         # Frontend (React + TypeScript)
│   ├── components/
│   │   ├── ui/                  # shadcn/ui components (14 files)
│   │   │   ├── accordion.tsx
│   │   │   ├── badge.tsx
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   ├── checkbox.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── input.tsx
│   │   │   ├── label.tsx
│   │   │   ├── scroll-area.tsx
│   │   │   ├── select.tsx
│   │   │   ├── separator.tsx
│   │   │   ├── skeleton.tsx
│   │   │   ├── sonner.tsx
│   │   │   ├── tabs.tsx
│   │   │   ├── textarea.tsx
│   │   │   └── tooltip.tsx
│   │   ├── layout/              # Layout components
│   │   │   ├── index.ts
│   │   │   ├── Header.tsx
│   │   │   ├── Layout.tsx
│   │   │   └── PageHeader.tsx
│   │   ├── shared/              # Shared utility components
│   │   │   ├── index.ts
│   │   │   ├── Carousel.tsx
│   │   │   ├── ConfirmDialog.tsx
│   │   │   ├── CostTooltip.tsx
│   │   │   ├── EmptyState.tsx
│   │   │   ├── IngredientModal.tsx
│   │   │   ├── LoadingState.tsx
│   │   │   ├── TagFilterBar.tsx
│   │   │   └── VersionNavigator.tsx
│   │   ├── ingredients/
│   │   │   └── IngredientCard.tsx
│   │   ├── materials/
│   │   │   └── MaterialCard.tsx
│   │   ├── recipes/
│   │   │   ├── RecipeCard.tsx
│   │   │   └── IngredientSelector.tsx
│   │   ├── packaging/
│   │   │   └── PackagingCard.tsx
│   │   ├── products/
│   │   │   └── ProductCard.tsx
│   │   └── orders/              # Order components (7 files)
│   │       ├── index.ts
│   │       ├── OrderForm.tsx
│   │       ├── OrderHeader.tsx
│   │       ├── OrderStatusPanel.tsx
│   │       ├── OrderWhatsAppPanel.tsx
│   │       ├── OrderItems.tsx
│   │       ├── ShippingDialog.tsx
│   │       └── CancellationDialog.tsx
│   ├── pages/                   # Page components (9 files)
│   │   ├── index.ts
│   │   ├── Dashboard.tsx
│   │   ├── RecipeEditor.tsx
│   │   ├── PackagingEditor.tsx
│   │   ├── ProductEditor.tsx
│   │   ├── IngredientsManager.tsx
│   │   ├── MaterialsManager.tsx
│   │   ├── OrderManager.tsx
│   │   ├── OrderDetail.tsx
│   │   ├── KitchenView.tsx
│   │   └── ProductionReport.tsx
│   ├── hooks/                   # React Query hooks (9 files)
│   │   ├── index.ts
│   │   ├── useIngredients.ts
│   │   ├── useMaterials.ts
│   │   ├── usePackaging.ts
│   │   ├── useProducts.ts
│   │   ├── useRecipes.ts
│   │   ├── useTags.ts
│   │   ├── useCustomers.ts
│   │   ├── useOrders.ts
│   │   └── useMenuProducts.ts
│   ├── lib/
│   │   ├── api.ts               # Axios API client (40+ functions)
│   │   ├── types.ts             # TypeScript interfaces (400+ lines)
│   │   └── utils.ts             # Utility functions (cn helper)
│   ├── App.tsx                  # Router setup with React Query (8 routes)
│   ├── index.css                # Tailwind CSS + custom theme
│   └── main.tsx                 # React entry point
├── public/
│   └── vite.svg                 # Public assets
├── .claude/                     # Claude Code configuration
│   ├── settings.local.json
│   └── AGENTS_*.md              # Agent documentation
├── dist/                        # Build output (generated by vite build)
├── vercel.json                  # Vercel deployment config
├── vite.config.ts               # Vite bundler config
├── package.json                 # npm dependencies & scripts
├── tsconfig.json                # TypeScript config
├── tsconfig.app.json
├── tsconfig.node.json
├── eslint.config.js             # ESLint config
├── .env                         # Local environment variables (gitignored)
├── .env.example                 # Environment variable template
├── .gitignore
├── CLAUDE.md                    # This file - development guidelines
├── README.md                    # Quick start guide
├── malo_recipe_master_prd.md    # Product requirements document
├── CUSTOM_AGENTS_SETUP.md       # Custom agent setup guide
└── claude_code_prompt.md        # Build instructions
```

**Key Changes from Previous Structure:**
- `backend/` → `api/` (Vercel serverless functions convention)
- `frontend/src/` → `src/` (monolithic single build)
- `frontend/` root files moved to project root
- Added `api/index.py` - Mangum ASGI adapter for Vercel
- Added `api/scripts/` - Migration tools
- Added `vercel.json` - Deployment configuration
- Added `dist/` - Vite build output directory

## Code Style

### Python (Backend)

```python
# Use type hints everywhere
def get_recipe_cost(recipe_version_id: int, db: Session) -> float:
    ...

# Pydantic models for all API I/O
class RecipeVersionCreate(BaseModel):
    version_name: str
    description: str
    estimated_yield_grams: float | None = None

# SQLAlchemy models with relationships
class RecipeVersion(Base):
    __tablename__ = "recipe_version"

    id: Mapped[int] = mapped_column(primary_key=True)
    recipe_id: Mapped[int] = mapped_column(ForeignKey("recipe.id"))

    # Relationships
    recipe: Mapped["Recipe"] = relationship(back_populates="versions")
    components: Mapped[list["RecipeComponent"]] = relationship(back_populates="recipe_version")

# CRUD functions return models, not dicts
def get_recipe(db: Session, recipe_id: int) -> Recipe | None:
    return db.query(Recipe).filter(Recipe.id == recipe_id).first()

# Router dependencies
@router.get("/{recipe_id}")
def read_recipe(recipe_id: int, db: Session = Depends(get_db)):
    ...
```

### TypeScript (Frontend)

```typescript
// Interfaces match backend schemas
interface RecipeVersion {
  id: number;
  recipe_id: number;
  version_number: number;
  version_name: string;
  description: string | null;
  estimated_yield_grams: number | null;
  created_at: string;
}

// Use React Query for all API calls
const { data, isLoading } = useQuery({
  queryKey: ['recipe', recipeId],
  queryFn: () => api.getRecipe(recipeId),
});

// Mutations with cache invalidation
const mutation = useMutation({
  mutationFn: api.createRecipeVersion,
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['recipe', recipeId] }),
});

// Components are functional with explicit prop types
interface RecipeCardProps {
  recipe: RecipeSummary;
  onClick?: () => void;
}

export function RecipeCard({ recipe, onClick }: RecipeCardProps) {
  ...
}
```

## Database Conventions

### Naming
- Tables: `snake_case`, singular (`recipe`, `recipe_version`)
- Columns: `snake_case`
- Foreign keys: `{referenced_table}_id`
- Junction tables: `{table1}_{table2}` alphabetically (`recipe_tag`)

### Unit Types
- Ingredients: `g`, `kg`, `ml`, `l`, `pcs`
- Packaging Materials: `pcs`, `m`, `cm`, `sheets`

### Patterns
```python
# Always use created_at/updated_at
created_at: Mapped[datetime] = mapped_column(default=func.now())
updated_at: Mapped[datetime] = mapped_column(default=func.now(), onupdate=func.now())

# Soft deletes not used — versions are immutable, recipes can be hard deleted with cascade

# Indexes on foreign keys and frequently queried columns
Index("idx_recipe_version_recipe", "recipe_id")
```

### Transactions
```python
# Wrap multi-step operations
def create_recipe_with_components(db: Session, data: RecipeCreate) -> Recipe:
    try:
        recipe = Recipe(name=data.name)
        db.add(recipe)
        db.flush()  # Get ID before adding version

        version = RecipeVersion(recipe_id=recipe.id, ...)
        db.add(version)

        db.commit()
        db.refresh(recipe)
        return recipe
    except Exception:
        db.rollback()
        raise
```

## API Design

### Endpoints (55 total functions across 9 routers)

```
# Dashboard
GET    /api/dashboard/stats              # Dashboard statistics

# Ingredients
GET    /api/ingredients                  # List all with costs
GET    /api/ingredients/{id}             # Get single
POST   /api/ingredients                  # Create
PATCH  /api/ingredients/{id}             # Update
DELETE /api/ingredients/{id}             # Delete

# Packaging Materials
GET    /api/packaging-materials          # List all with costs
GET    /api/packaging-materials/{id}     # Get single
POST   /api/packaging-materials          # Create
PATCH  /api/packaging-materials/{id}     # Update
DELETE /api/packaging-materials/{id}     # Delete

# Tags
GET    /api/tags                         # List all
POST   /api/tags                         # Create
DELETE /api/tags/{id}                    # Delete

# Recipes
GET    /api/recipes                      # List summaries
GET    /api/recipes/reusable             # List reusable components
GET    /api/recipes/{id}                 # Get with all versions
GET    /api/recipes/{id}/versions/{v}    # Get specific version
POST   /api/recipes                      # Create + first version
POST   /api/recipes/{id}/versions        # Create new version
POST   /api/recipes/{id}/versions/copy   # Copy from existing version
PUT    /api/recipes/{id}/tags            # Update tags
DELETE /api/recipes/{id}                 # Delete (blocked if used)

# Packaging (same pattern as recipes)
GET    /api/packaging                    # List summaries
GET    /api/packaging/{id}               # Get with all versions
GET    /api/packaging/{id}/versions/{v}  # Get specific version
POST   /api/packaging                    # Create + first version
POST   /api/packaging/{id}/versions      # Create new version
POST   /api/packaging/{id}/versions/copy # Copy from existing version
PUT    /api/packaging/{id}/tags          # Update tags
DELETE /api/packaging/{id}               # Delete (blocked if used)

# Products
GET    /api/products                     # List with COGS summaries
GET    /api/products/{id}                # Get with all versions
GET    /api/products/{id}/versions/{v}   # Get version with COGS breakdown
POST   /api/products                     # Create + first version
POST   /api/products/{id}/versions       # Create new version
POST   /api/products/{id}/versions/copy  # Copy from existing version
DELETE /api/products/{id}                # Delete

# Customers (Order Management)
GET    /api/customers                    # List with ?q= search
GET    /api/customers/{id}               # Get customer
POST   /api/customers                    # Create customer
PATCH  /api/customers/{id}               # Update customer

# Orders (Order Management)
GET    /api/orders                       # List with filters (status, channel, due_date)
GET    /api/orders/{id}                  # Get detail with WhatsApp text
GET    /api/orders/kitchen               # Kitchen view orders (production statuses only)
GET    /api/orders/production/report     # Production report grouped by date
POST   /api/orders                       # Create order with line items
PATCH  /api/orders/{id}/status           # Update status
PATCH  /api/orders/{id}/payment          # Update payment status/method
PATCH  /api/orders/{id}/shipping         # Update shipping info
DELETE /api/orders/{id}                  # Delete (Draft only)

# Order Autocomplete Suggestions
GET    /api/orders/products/suggestions  # Distinct products from order history
GET    /api/orders/sellers/suggestions   # Distinct sold_by from order history

# CSV Export (Order Management)
GET    /api/orders/export/orders         # Export all orders as CSV
GET    /api/orders/export/order-items    # Export all order items as CSV
```

### Response Format
```python
# List endpoints return summaries
class RecipeSummary(BaseModel):
    id: int
    name: str
    tags: list[str]
    latest_version: int
    latest_version_name: str
    total_cost: float | None
    cost_per_gram: float | None
    created_at: datetime

# Detail endpoints return full objects
class RecipeVersionDetail(BaseModel):
    id: int
    recipe_id: int
    version_number: int
    version_name: str
    description: str | None
    estimated_yield_grams: float | None
    is_single_component: bool
    is_reusable_component: bool
    components: list[RecipeComponentDetail]
    total_cost: float | None
    cost_per_gram: float | None
```

### Error Handling
```python
from fastapi import HTTPException

# Use HTTP exceptions with clear messages
if not recipe:
    raise HTTPException(status_code=404, detail="Recipe not found")

if recipe_in_use:
    raise HTTPException(
        status_code=400,
        detail=f"Cannot delete recipe. Used in products: {product_names}"
    )
```

## Frontend Patterns

### Page Structure
```typescript
// Pages handle routing params and data fetching
export function RecipeEditor() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === 'new';

  const { data: recipe, isLoading } = useRecipe(
    isNew ? undefined : Number(id)
  );

  if (!isNew && isLoading) return <LoadingState />;

  return (
    <div className="space-y-6">
      <PageHeader title={isNew ? 'New Recipe' : recipe?.name || 'Recipe'} />
      {/* Editor content */}
    </div>
  );
}
```

### Component Organization
```
components/
├── ui/                    # shadcn primitives (Button, Input, Dialog, etc.)
├── layout/
│   ├── Header.tsx         # Top navigation with title
│   ├── Layout.tsx         # Outlet wrapper
│   └── PageHeader.tsx     # Page title + back button
├── shared/
│   ├── Carousel.tsx       # Horizontal scrolling with chevrons (300px scroll)
│   ├── VersionNavigator.tsx    # ← Version X → navigation
│   ├── CostTooltip.tsx    # (i) icon with cost info
│   ├── ConfirmDialog.tsx  # Delete warnings
│   └── LoadingState.tsx   # Skeleton cards
├── recipes/
│   └── RecipeCard.tsx     # Recipe summary card
├── packaging/
│   └── PackagingCard.tsx  # Packaging summary card
└── products/
    └── ProductCard.tsx    # Product summary with COGS
```

### State Management
```typescript
// Server state via React Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,  // 30 seconds
      retry: 1,
    },
  },
});

// Local UI state via useState
const [currentVersionNumber, setCurrentVersionNumber] = useState<number | null>(null);
const [components, setComponents] = useState<ComponentDraft[]>([]);
```

### React Query Hooks Pattern
```typescript
// Query key factory
const recipeKeys = {
  all: ['recipes'] as const,
  lists: () => [...recipeKeys.all, 'list'] as const,
  list: () => [...recipeKeys.lists()] as const,
  details: () => [...recipeKeys.all, 'detail'] as const,
  detail: (id: number) => [...recipeKeys.details(), id] as const,
  version: (recipeId: number, versionNumber: number) =>
    [...recipeKeys.detail(recipeId), 'version', versionNumber] as const,
};

// Query hook with enabled flag
export function useRecipeVersion(recipeId: number | undefined, versionNumber: number | undefined) {
  return useQuery({
    queryKey: recipeKeys.version(recipeId!, versionNumber!),
    queryFn: () => recipeApi.getVersion(recipeId!, versionNumber!),
    enabled: recipeId !== undefined && versionNumber !== undefined,
  });
}

// Mutation hook with invalidation
export function useCreateRecipeVersion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ recipeId, version }: { recipeId: number; version: RecipeVersionCreate }) =>
      recipeApi.createVersion(recipeId, version),
    onSuccess: (_, { recipeId }) => {
      queryClient.invalidateQueries({ queryKey: recipeKeys.detail(recipeId) });
      queryClient.invalidateQueries({ queryKey: recipeKeys.lists() });
    },
  });
}
```

### Form Handling
```typescript
// Use controlled components
const [components, setComponents] = useState<ComponentDraft[]>([]);

// Add component
const addComponent = () => {
  setComponents([...components, {
    id: crypto.randomUUID(),
    component_name: `Component ${components.length + 1}`,
    sort_order: components.length,
    ingredients: [],
  }]);
};

// Validate before save
function handleSave() {
  if (components.length === 0) {
    alert("Recipe must have at least one component");
    return;
  }
  if (components.some(c => c.ingredients.length === 0)) {
    alert("All components must have at least one ingredient");
    return;
  }
  mutation.mutate({ ... });
}
```

## Business Logic

### Cost Calculations (services/cost_calculator.py)

```python
def normalize_to_base_unit(quantity: float, unit: str) -> float:
    """Convert kg→g, l→ml, m→cm. Base units: g, ml, pcs, cm, sheets."""
    if unit in ("kg", "l"):
        return quantity * 1000
    if unit == "m":
        return quantity * 100
    return quantity

def get_ingredient_cost_per_base_unit(ingredient: Ingredient) -> tuple[float, str]:
    """Cost per base unit (g, ml, or pcs). Returns (cost, base_unit)."""
    total_cost = ingredient.price_excl_shipping + ingredient.shipping_cost
    base_volume = normalize_to_base_unit(ingredient.volume_purchased, ingredient.unit_type)
    base_unit = get_base_unit(ingredient.unit_type)

    if base_volume <= 0:
        return 0.0, base_unit

    return total_cost / base_volume, base_unit

def get_component_cost(component: RecipeComponent, db: Session) -> float:
    """Sum of ingredient costs for a component."""
    if component.linked_recipe_version_id:
        # Linked component: get cost from source
        return get_recipe_version_cost(component.linked_recipe_version_id, db)

    total = 0.0
    for ci in component.ingredients:
        total += get_ingredient_line_cost(ci)
    return total

def get_recipe_version_cost(version_id: int, db: Session) -> float:
    """Total cost of all components in a recipe version."""
    version = get_recipe_version(db, version_id)
    if not version:
        return 0.0
    return sum(get_component_cost(c, db) for c in version.components)

def get_recipe_cost_per_gram(version_id: int, db: Session) -> float | None:
    """Cost per gram based on estimated yield. None if not set."""
    version = get_recipe_version(db, version_id)
    if not version or not version.estimated_yield_grams:
        return None
    total_cost = get_recipe_version_cost(version_id, db)
    return total_cost / version.estimated_yield_grams

def get_product_cogs(product_version: ProductVersion, db: Session) -> dict:
    """Full COGS breakdown for a product."""
    total_grams = product_version.num_pieces * product_version.grams_per_piece
    cost_per_gram = get_recipe_cost_per_gram(product_version.recipe_version_id, db)

    recipe_cogs = (cost_per_gram * total_grams) if cost_per_gram else None
    packaging_cogs = get_packaging_version_cost(product_version.packaging_version_id, db)

    if recipe_cogs is not None:
        total_cogs = recipe_cogs + packaging_cogs
        contribution_margin = product_version.retail_price_idr - total_cogs
        contribution_margin_pct = (contribution_margin / product_version.retail_price_idr) * 100
    else:
        total_cogs = None
        contribution_margin = None
        contribution_margin_pct = None

    return {
        "total_grams": total_grams,
        "recipe_cogs": recipe_cogs,
        "packaging_cogs": packaging_cogs,
        "total_cogs": total_cogs,
        "retail_price_idr": product_version.retail_price_idr,
        "contribution_margin": contribution_margin,
        "contribution_margin_pct": contribution_margin_pct,
    }
```

### Versioning Logic

```python
def copy_recipe_version(
    db: Session,
    recipe_id: int,
    copy_from_version_id: int,
    version_name: str,
    description: str
) -> RecipeVersion:
    """Create new version by deep copying from any existing version."""

    # Get source version
    source = db.query(RecipeVersion).get(copy_from_version_id)
    if source.recipe_id != recipe_id:
        raise ValueError("Source version belongs to different recipe")

    # Get next version number
    max_version = db.query(func.max(RecipeVersion.version_number))\
        .filter(RecipeVersion.recipe_id == recipe_id).scalar() or 0

    # Create new version
    new_version = RecipeVersion(
        recipe_id=recipe_id,
        version_number=max_version + 1,
        version_name=version_name,
        description=description,
        estimated_yield_grams=source.estimated_yield_grams,
        is_single_component=source.is_single_component,
        is_reusable_component=source.is_reusable_component,
        copied_from_version_id=copy_from_version_id,
    )
    db.add(new_version)
    db.flush()

    # Deep copy components and ingredients
    for src_comp in source.components:
        new_comp = RecipeComponent(
            recipe_version_id=new_version.id,
            sort_order=src_comp.sort_order,
            component_name=src_comp.component_name,
            linked_recipe_version_id=src_comp.linked_recipe_version_id,
        )
        db.add(new_comp)
        db.flush()

        for src_ing in src_comp.ingredients:
            new_ing = ComponentIngredient(
                recipe_component_id=new_comp.id,
                ingredient_id=src_ing.ingredient_id,
                sort_order=src_ing.sort_order,
                unit=src_ing.unit,
                quantity=src_ing.quantity,
            )
            db.add(new_ing)

    db.commit()
    return new_version
```

## Key Business Rules

1. **Unit conversion**: kg→g, l→ml, m→cm. 1 ml = 1 g for liquid calculations.
2. **Version immutability**: Saved versions cannot be edited. Create new version instead.
3. **Linked components**: Recipes can reference other recipe versions as components.
4. **Product pinning**: Products stay on selected recipe/packaging versions. Manual update required.
5. **Reusable components**: Only single-component recipes marked as reusable appear in component selection.
6. **Deletion rules**: Recipes/packaging cannot be deleted if used in products. Error shows blocking products.
7. **Default tags**: System seeds Dubai-Snack, Extruded-Snack, Sachet, Pouch, Box on init.

## Common Pitfalls

1. **Forgetting to flush before accessing ID** — After `db.add()`, call `db.flush()` to get the auto-generated ID before creating child records.

2. **Circular imports in models** — Use `TYPE_CHECKING` and string annotations for forward references.

3. **N+1 queries** — Use `joinedload` or `selectinload` for relationships accessed in loops.

4. **Stale React Query cache** — Always `invalidateQueries` after mutations that affect list views.

5. **Cost calculation with null yield** — Always check `estimated_yield_grams` before dividing. Return `null` if not set.

6. **Version copy depth** — When copying, deep copy components AND ingredients. Shallow copy creates shared references.

7. **React Router v7 changes** — Use object format for `invalidateQueries({ queryKey: [...] })`.

## Environment Variables

```bash
# backend/.env (optional, defaults work for local dev)
DATABASE_URL=sqlite:///./data/malo_recipes.db
CORS_ORIGINS=http://localhost:5173

# frontend/.env
VITE_API_URL=http://localhost:8000/api
```

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

### Not Yet Implemented
- [ ] Testing (pytest for backend, Vitest for frontend)
- [ ] Authentication/Authorization
- [ ] API rate limiting
- [ ] Structured logging
- [ ] Production deployment configuration
- [ ] Error boundaries in React
- [ ] Pagination for large lists

## Changelog

### 2026-01-30 - Production Deployment & Migration Infrastructure

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

**Deployment Checklist:**
1. Set `DATABASE_URL` environment variable in Vercel
2. Run migration script to populate PostgreSQL
3. Deploy to Vercel (`vercel --prod`)
4. Verify API endpoints and frontend routing

### 2026-01-30 - UI/UX Enhancements for Order Management

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

**OrderManager Improvements**
- Enhanced order list with better status indicators
- Improved date filters and channel filters
- Better empty state messaging

**KitchenView Refinements**
- Cleaner production workflow UI
- Better order grouping by status
- Improved quick-action buttons

**Files Modified:**
- Frontend: `pages/OrderDetail.tsx` (refactored), `pages/OrderManager.tsx` (enhanced), `pages/KitchenView.tsx` (refined)
- New components: 7 files in `components/orders/`
- New shared component: `components/shared/EmptyState.tsx`
- New UI component: `components/ui/accordion.tsx`

**Benefits:**
- 60% reduction in OrderDetail component size (906 → 363 lines)
- Improved code maintainability and testability
- Reusable components for future order-related features
- Better user experience with focused, intuitive UI elements

### 2026-01-30 - Order Workflow Enhancements (3-Phase Implementation)

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

### 2026-01-30 - Order Status Workflow Migration
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

### 2026-01-29 - Order Management Module (Complete Implementation)
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
- `frontend/src/components/orders/OrderForm.tsx` (300+ lines) - Complex order form with:
  - Customer selection/creation with dropdown
  - Multiple line items with add/remove
  - Product name autocomplete from history
  - Seller autocomplete from history
  - Real-time totals calculation
- `frontend/src/hooks/useOrders.ts` - Order React Query hooks (7 functions)
- `frontend/src/hooks/useCustomers.ts` - Customer React Query hooks

**API Endpoints (10 endpoints):**
```
GET    /api/orders                      # List with filters (status, channel, due_date)
GET    /api/orders/{id}                 # Detail with WhatsApp text
POST   /api/orders                      # Create with line items
PATCH  /api/orders/{id}/status          # Update status (Draft|Confirmed|Completed|Cancelled)
PATCH  /api/orders/{id}/payment         # Update payment (Unpaid|Partial|Paid)
DELETE /api/orders/{id}                 # Delete (Draft only)
GET    /api/orders/products/suggestions # Product autocomplete from history
GET    /api/orders/sellers/suggestions  # Seller autocomplete from history
GET    /api/orders/export/orders        # CSV export all orders
GET    /api/orders/export/order-items   # CSV export all items
```

**Database Schema (3 tables, 19 columns total):**
- `customer` (7 cols) - id, name, phone, source, notes, created_at, updated_at
- `order` (15 cols) - id, order_number (UNIQUE), customer_id (FK), status, payment_status, payment_method, order_date, due_date, total_amount, total_cost, total_margin, channel, sold_by, notes, created_at, created_by
- `order_item` (12 cols) - id, order_id (FK), product_name, product_variant, quantity, unit_price, unit_cost, discount_amount, line_total, line_cost, line_margin, created_at

**Key Features:**
- Order number format: `MMDD-NNN` (e.g., 0129-001) for easy bank transfer reference
- Real-time totals calculation (amount, cost, margin)
- Status workflow: Draft → Confirmed → Completed → Cancelled
- Payment tracking: Unpaid → Partial → Paid with method (BCA, QRIS, Cash)
- WhatsApp-ready receipt with bank details for customer communication
- Combobox autocomplete for products and sellers from order history
- Validation: min 1 item per order, qty ≥ 1, unit_price > 0

**Bug Fixes:**
- Fixed circular import issue: Customer and Order models not in `models/__init__.py`
- Added proper import order to prevent SQLAlchemy mapper initialization errors

**Testing Notes:**
- Tested with curl: Order creation works end-to-end
- Validates customer_id or new_customer requirement
- Validates minimum 1 item per order
- Calculates line totals and order totals correctly
- WhatsApp text generation works with proper formatting

**Backlog/Roadmap:**
- [ ] Orders Dashboard carousel on main Dashboard
- [ ] Kitchen View page (orders grouped by due date)
- [ ] Customer management dedicated page
- [ ] Order editing for Draft status (currently create-only)
- [ ] Bulk status updates
- [ ] Product Integration - link OrderItem to ProductVersion when ready

### 2025-01-28 - Ingredient & Material Management Enhancements
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

**Note:**
- Add Ingredient modal in Recipe Editor was already fully wired up

### 2025-01-27 - Phase 2 Frontend Complete
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

### 2025-01-27 - Phase 1 Backend Complete
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

## Git Workflow & Version Control Rules

### Core Principles

1. **Protect Main:** NEVER commit directly to the `main` branch. Always create a new feature branch for every task (e.g., `feature/add-login`, `fix/typo-header`).

2. **Sync First:** Before starting ANY new task or creating a branch, you must switch to `main` and run `git pull` to ensure we aren't working on outdated code.

3. **Atomic Commits:** Commit often. Do not wait until the entire feature is done. If you finish one logical step (like "added database schema"), commit it.
   - Format: `git commit -m "Verb: Context"` (e.g., "Add: User profile schema" or "Fix: Mobile navigation overflow").

4. **Verify Before Push:** Before pushing, run the project's build/test command to ensure the new code didn't break the app.

5. **Self-Correction:** If a git command fails (like a merge conflict), STOP and ask the user for guidance. Do not try to force-solve complex git conflicts on your own.

### Quick Reference

```bash
# Start new task
git switch main                    # Always start from main
git pull                          # Get latest changes
git switch -c feature/your-name   # Create feature branch

# Work on your branch
git add <files>                   # Stage specific files
git commit -m "Type: Description" # Atomic commits

# Before pushing
npm run build                     # Frontend: verify build
cd backend && python -m pytest    # Backend: run tests
git push origin feature/your-name # Push to remote

# Merge to main (after PR approval)
git switch main
git pull
git merge feature/your-name
git push origin main
```

## Implementation & Code Review Workflow

### Pre-Implementation Checklist

Before starting any implementation task:

1. **Read existing code** — Never propose changes without reading affected files first
2. **Understand context** — Review related models, schemas, and services
3. **Check patterns** — Follow established conventions (see Code Style section above)
4. **Plan approach** — Outline the implementation strategy before writing code
5. **Ask clarifying questions** — If requirements are ambiguous, ask the user

### Implementation Process

#### 1. Planning Phase
- Outline the changes required (backend/frontend/database)
- Identify files that will be modified or created
- Consider edge cases and error scenarios
- Review related business logic (cost calculations, versioning, etc.)

#### 2. Development Phase
- Write code following established patterns and conventions
- Use type hints (Python) and TypeScript for all code
- Keep functions focused and single-responsibility
- Add inline comments only where logic isn't self-evident
- Avoid over-engineering — minimum complexity for the task
- Trust framework and internal API guarantees
- Validate only at system boundaries (user input, external APIs)

#### 3. Code Review Checklist (10x Developer Standards)

**Architecture & Design**
- [ ] Does the solution follow the established patterns for this codebase?
- [ ] Are database transactions used correctly where needed?
- [ ] Is the data flow clear from frontend → API → database?
- [ ] Are relationships and foreign keys properly defined?
- [ ] Does the solution avoid N+1 queries?

**Backend (Python/FastAPI)**
- [ ] All functions have type hints
- [ ] Pydantic schemas validate input/output correctly
- [ ] Error handling uses HTTPException with clear messages
- [ ] Database operations use proper session management
- [ ] CRUD operations are efficient (joinedload, selectinload for relationships)
- [ ] No circular imports or TYPE_CHECKING violations
- [ ] Cost calculations handle null values correctly
- [ ] Version copy operations do deep copies, not shallow copies

**Frontend (TypeScript/React)**
- [ ] All components have explicit prop types via interfaces
- [ ] React Query hooks use proper query key factories
- [ ] Mutations invalidate relevant query caches
- [ ] useState/useReducer state is properly initialized
- [ ] No unnecessary re-renders or missing dependency arrays
- [ ] Form validation happens before API calls
- [ ] Error states are handled (loading, error, success)
- [ ] TypeScript types match backend schemas
- [ ] Components are functional, not class-based
- [ ] No hardcoded magic strings or numbers

**Quality Standards**
- [ ] Code is readable and self-documenting
- [ ] Variable names are clear and descriptive
- [ ] Functions are not too long (aim for <50 lines for most functions)
- [ ] No premature abstractions or over-generalization
- [ ] Minimal complexity — just enough for current requirements
- [ ] No dead code, commented-out code, or // removed comments
- [ ] No console.log or print debugging left in code

**Testing Considerations** (for future test implementation)
- [ ] Is the code testable? (dependencies are injectable)
- [ ] Error paths are explicit and catchable
- [ ] Edge cases are handled (empty lists, null values, etc.)
- [ ] Calculations are correct and handle edge cases

**Documentation**
- [ ] Complex logic has explanatory comments
- [ ] Database changes are documented in CLAUDE.md
- [ ] API changes are documented in CLAUDE.md
- [ ] Business logic changes are explained

### Code Review Approval Gates

Code is ready for commit when:

1. **Functionality** — Works as specified without bugs
2. **Elegance** — Uses appropriate algorithms and patterns
3. **Consistency** — Follows codebase conventions
4. **Testability** — Can be tested and errors are catchable
5. **Performance** — No N+1 queries, efficient algorithms
6. **Maintainability** — Clear, documented, easy to modify
7. **Safety** — No security vulnerabilities (XSS, SQL injection, etc.)

### Documentation Requirements

After implementation, update relevant sections of CLAUDE.md:

**For Database Changes:**
```markdown
- New tables/columns added with timestamps and indexes
- Migration or init script changes documented
- Relationship changes clearly noted
```

**For API Changes:**
```markdown
- New endpoints documented in Endpoints section
- Response format examples provided
- Error cases listed
```

**For Business Logic:**
```markdown
- Algorithm changes documented with examples
- Edge cases and null handling noted
- Cost calculation updates reflected
```

**For Frontend Changes:**
```markdown
- New components documented with prop types
- Hook changes and query key updates noted
- State management changes explained
```

### Git Workflow

#### Branch Strategy
```bash
# Work on feature branch (already set up for you)
git status  # Verify you're on correct branch

# Keep branch current
git pull origin phase2-frontend-implementation
```

#### Commit Standards

**Atomic Commits** — Each commit should be a single logical change:
- One feature or bug fix per commit
- No mixing refactoring with functionality
- All tests pass for each commit

**Commit Message Format:**
```
<type>: <subject line, max 50 chars>

<optional detailed explanation>

- Bullet points for what changed
- Keep body under 72 chars per line

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
```

**Commit Types:**
- `feat:` New feature or functionality
- `fix:` Bug fix
- `refactor:` Code structure changes without behavior change
- `docs:` Documentation updates (including CLAUDE.md)
- `perf:` Performance improvements
- `test:` Test additions/updates
- `chore:` Dependency updates, config changes

**Example Commits:**
```bash
# Good: Single focused change
git commit -m "feat: add cost per gram calculation to recipe versions

- Calculate cost per gram based on estimated yield
- Return null if yield not set
- Update RecipeVersionDetail schema
- Add cost_calculator function

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>"

# Good: Bug fix with explanation
git commit -m "fix: prevent N+1 queries in recipe list endpoint

- Add joinedload for components relationship
- Add selectinload for ingredients in components
- Reduces query count from N*M to 1 for list of N recipes

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>"

# Good: Documentation update
git commit -m "docs: update CLAUDE.md with cost calculation details

- Add example calculations
- Document null yield handling
- Add common pitfalls section

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>"
```

#### Before Committing

```bash
# 1. Verify all changes
git status                           # See what changed
git diff backend/app/models/        # Review code changes
git diff frontend/src/              # Review frontend changes

# 2. Stage relevant changes only
git add backend/app/models/recipe.py
git add backend/app/schemas/recipe.py
git add backend/app/crud/recipes.py

# 3. Don't commit these files
# - .env files with secrets
# - __pycache__/ or node_modules/
# - Auto-generated database files
# - IDE config files (.vscode, .idea)

# 4. Review staged changes
git diff --staged

# 5. Commit with proper message (see format above)
git commit -m "..."

# 6. Verify commit
git log -1 --stat
```

#### Multi-File Changes Example

When implementation spans multiple files:

```bash
# Stage by logical group
git add backend/app/models/        # All model changes together
git commit -m "feat: add yield tracking to recipes"

# Then stage next logical group
git add backend/app/schemas/      # All schema changes
git commit -m "docs: update schemas for yield tracking"

# Then API changes
git add backend/app/routers/recipes.py
git commit -m "feat: expose yield in recipe endpoint"

# Then frontend
git add frontend/src/components/
git add frontend/src/hooks/
git commit -m "feat: display yield and cost per gram in UI"
```

### After Code Review Approval

1. **All tests pass** (when tests are implemented)
2. **No linting errors** — Run `npm run lint` for frontend, `pylint` for backend
3. **Code follows conventions** — Compare against examples in CLAUDE.md
4. **Documentation updated** — CLAUDE.md reflects changes
5. **Commit messages are clear** — Describe what changed and why

Then proceed with git commit to your current branch.

### Common Code Review Issues to Avoid

**Backend:**
- ❌ Missing type hints → ✅ Add return type and parameter types
- ❌ Returning dicts instead of models → ✅ Return ORM models from CRUD
- ❌ Missing error handling → ✅ Add HTTPException with 4xx/5xx codes
- ❌ N+1 queries → ✅ Use joinedload/selectinload in queries
- ❌ Not flushing before using ID → ✅ Call db.flush() after db.add()
- ❌ Shallow copying relationships → ✅ Deep copy all related objects

**Frontend:**
- ❌ Props without interface types → ✅ Define explicit interface for all props
- ❌ Mutations without cache invalidation → ✅ Always invalidateQueries on success
- ❌ Magic strings in queries → ✅ Use query key factory pattern
- ❌ No error handling → ✅ Show error UI or toast notifications
- ❌ Inline arrays/objects in deps → ✅ Move to useMemo if dependencies needed
- ❌ TypeScript errors ignored → ✅ Fix all TypeScript errors before commit

## Deployment

### Current Production Setup (Vercel)

**Architecture:**
- Monolithic deployment on Vercel
- Frontend: Static files served from `dist/`
- Backend: Serverless functions in `api/`
- Database: PostgreSQL with NullPool (serverless-optimized)

**Deployment Steps:**

1. **Prepare PostgreSQL Database**
   ```bash
   # Provision PostgreSQL (e.g., Supabase, Neon, Railway)
   # Note the connection string: postgresql://user:pass@host:5432/dbname
   ```

2. **Migrate Data (if coming from SQLite)**
   ```bash
   cd api/scripts
   python migrate_sqlite_to_pg.py \
     --sqlite-path ../data/malo_recipes.db \
     --postgres-url "postgresql://user:pass@host:5432/dbname"
   ```

3. **Configure Environment Variables in Vercel**
   - `DATABASE_URL` - PostgreSQL connection string
   - `VITE_API_URL` - Set to `/api` (relative path for same domain)

4. **Deploy to Vercel**
   ```bash
   # Install Vercel CLI
   npm i -g vercel

   # Preview deployment
   vercel

   # Production deployment
   vercel --prod
   ```

5. **Verify Deployment**
   - Check frontend loads: `https://your-app.vercel.app`
   - Check API health: `https://your-app.vercel.app/api/dashboard/stats`
   - Test CRUD operations via UI

**vercel.json Configuration:**
```json
{
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api/index" },
    { "source": "/(.*)", "destination": "/index.html" }
  ],
  "buildCommand": "npm run build",
  "outputDirectory": "dist"
}
```

**Environment Variables:**
```bash
# Production (.env in Vercel dashboard)
DATABASE_URL=postgresql://user:pass@host:5432/dbname
VITE_API_URL=/api

# Development (local .env)
SQLITE_PATH=api/data/malo_recipes.db
VITE_API_URL=http://localhost:8000/api
```

### Future Enhancements

**Security:**
- [ ] Add authentication (consider Clerk or Auth.js)
- [ ] Implement role-based access control (RBAC)
- [ ] Add rate limiting for API endpoints
- [ ] Enable HTTPS-only cookies

**Monitoring:**
- [ ] Add Sentry for error tracking
- [ ] Implement structured logging
- [ ] Add performance monitoring (Vercel Analytics)
- [ ] Database query performance monitoring

**Scalability:**
- [ ] Consider read replicas for database
- [ ] Add Redis for caching (e.g., Upstash)
- [ ] Implement database connection pooling (if moving off serverless)
- [ ] CDN for static assets (Vercel Edge Network already provides this)

**Backup & Recovery:**
- [ ] Automated daily PostgreSQL backups
- [ ] Point-in-time recovery setup
- [ ] Disaster recovery plan documentation
