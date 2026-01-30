# Database Schema Reference

> **Purpose:** Complete database schema documentation for Malo Recipe Master.
> **When to read:** Before making database changes, adding fields, or modifying relationships.

## Table of Contents
- [System Architecture Overview](#system-architecture-overview)
- [Complete Database Schema (19 Tables)](#complete-database-schema-19-tables)
- [Order Status Workflow](#order-status-workflow)
- [Visual Schema Diagram](#visual-schema-diagram)
- [Data Flow Patterns](#data-flow-patterns)
- [Database Conventions](#database-conventions)

---

## System Architecture Overview

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

---

## Complete Database Schema (19 Tables)

### 1. `ingredient` - Food Ingredients
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

### 2. `packaging_material` - Packaging Materials
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

### 3. `tag` - Category Tags
```sql
CREATE TABLE tag (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(100) NOT NULL UNIQUE,         -- e.g., "Dubai-Snack"
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
-- Seeded on init: Dubai-Snack, Extruded-Snack, Sachet, Pouch, Box
```

### 4. `recipe` - Recipe Parent Entity
```sql
CREATE TABLE recipe (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(255) NOT NULL,                -- e.g., "Choco Crunch Base"
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100) DEFAULT 'admin'
);
CREATE INDEX idx_recipe_name ON recipe(name);
```

### 5. `recipe_version` - Versioned Recipe Data
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

### 6. `recipe_component` - Components in a Recipe Version
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

### 7. `component_ingredient` - Ingredients in a Component
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

### 8. `recipe_tag` - Junction Table (Recipe ↔ Tag)
```sql
CREATE TABLE recipe_tag (
    recipe_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    PRIMARY KEY (recipe_id, tag_id),
    FOREIGN KEY (recipe_id) REFERENCES recipe(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tag(id) ON DELETE CASCADE
);
```

### 9. `packaging_recipe` - Packaging Parent Entity
```sql
CREATE TABLE packaging_recipe (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(255) NOT NULL,                -- e.g., "Standard Sachet"
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100) DEFAULT 'admin'
);
CREATE INDEX idx_packaging_recipe_name ON packaging_recipe(name);
```

### 10. `packaging_version` - Versioned Packaging Data
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

### 11. `packaging_component` - Components in Packaging Version
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

### 12. `packaging_component_material` - Materials in Packaging Component
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

### 13. `packaging_tag` - Junction Table (PackagingRecipe ↔ Tag)
```sql
CREATE TABLE packaging_tag (
    packaging_recipe_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    PRIMARY KEY (packaging_recipe_id, tag_id),
    FOREIGN KEY (packaging_recipe_id) REFERENCES packaging_recipe(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tag(id) ON DELETE CASCADE
);
```

### 14. `product` - Product Parent Entity
```sql
CREATE TABLE product (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(255) NOT NULL,                -- e.g., "Choco Crunch 50g"
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100) DEFAULT 'admin'
);
CREATE INDEX idx_product_name ON product(name);
```

### 15. `product_version` - Product Version with COGS
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

### 16. `product_tag` - Junction Table (Product ↔ Tag)
```sql
CREATE TABLE product_tag (
    product_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    PRIMARY KEY (product_id, tag_id),
    FOREIGN KEY (product_id) REFERENCES product(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tag(id) ON DELETE CASCADE
);
```

### 17. `customer` - Customer Entity (Order Management)
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

### 18. `order` - Order Entity (Standalone - No ProductVersion FK)
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

### 19. `order_item` - Order Line Items (Standalone - No ProductVersion FK)
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

---

## Order Status Workflow

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

---

## Visual Schema Diagram

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

---

## Data Flow Patterns

### Cost Calculation Flow
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

### Version Copy Flow
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

---

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
