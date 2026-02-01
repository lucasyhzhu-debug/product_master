# Frollie Recipe Master - Module Specification

**Version:** 1.0
**Owner:** Product Manager

## 1. Overview

Frollie Recipe Master is a local-first recipe and product concept management system. It enables tracking of food recipes, packaging configurations, and product concepts with full versioning, cost calculations, and margin analysis.

## 2. Core Entities & Business Logic

### 2.1 Recipes

- **Structure**: Recipes have multiple immutable versions.
- **Components**: Each version consists of "Components" (e.g., Dough, Filling).
- **Ingredients**: Components contain "Ingredients" (e.g., Flour, Sugar).
- **Reusability**: Components can be defined inline OR linked to another Recipe Version (e.g., a "Basic Dough" recipe used in multiple cookies).
- **Costing**:
  - `Cost Per Gram` = Total Cost / Estimated Yield (grams).
  - Linked components inherit cost from their source version.

### 2.2 Packaging

- **Structure**: Similar to recipes (Parent -> Version -> Component -> Material).
- **Units**: Materials use pcs, m, cm, sheets.
- **Costing**: Sum of all materials in all components.

### 2.3 Products

- **Structure**: Product -> Version.
- **Composition**: A product version "pins" a specific Recipe Version and Packaging Version.
- **COGS Analysis**:
  - `Recipe COGS` = (Recipe Cost/g) *(Grams/Piece* Pieces/Pack).
  - `Packaging COGS` = Total Packaging Cost.
  - `Total COGS` = Recipe COGS + Packaging COGS.
  - `Margin` = Retail Price - Total COGS.

### 2.4 Order Management (New Module)

- **Customer CRM**: Lightweight tracking (Name, Phone, Source, Notes).
- **Order Structure**:
  - `Order`: Linked to Customer. Tracks status, payment, channel.
  - `OrderItem`: Standalone line items (product name as text + variant) for flexibility.
  - Linked to Product Version? *Future roadmap item. Currently decoupled.*
- **Workflow**: Draft -> Confirmed -> Completed -> Cancelled.
- **Key Features**:
  - **WhatsApp Receipts**: specific formatting with bank details.
  - **Autocomplete**: Suggestions for Products and Sellers from history.
  - **Sales Channel**: Track IG, WA, Shopee, etc.
  - **Exports**: CSV export for Orders and Line Items.
- **Reference**: See schema tables `customer`, `order`, `order_item` in CLAUDE.md.

## 3. Data Flow & Calculations

### Cost Calculation Flow

1. **Base Cost**: Normalize ingredient price to base unit (g, ml, pcs).
2. **Component Cost**: Sum of (Quantity * Base Cost) for all ingredients.
3. **Recipe Cost**: Sum of all component costs. (If linked, fetch cost from linked version).
4. **Product COGS**:
    - `Total Grams` = Pieces * Grams/Piece.
    - `Recipe Cost` = (Recipe Total Cost / Recipe Yield) * Total Grams.
    - `Total` = Recipe Cost + Packaging Cost.

### Versioning Flow

- **Immutable**: Once saved, a version cannot be changed.
- **Copy**: Users "Copy" a version to create a new Draft.
- **Deep Copy**: Copying a recipe deep-copies all its inline components and ingredients to ensure independence.

## 4. API Design Summary

*See CLAUDE.md for full list*

- **Ingredients/Materials**: CRUD with cost normalization.
- **Recipes/Packaging**: CRUD with deep nested versioning logic. `POST /api/recipes/{id}/versions/copy`.
- **Products**: CRUD with COGS analysis endpoints.
- **Orders**: CRUD with status workflow and export capabilities.

## 5. User Interface Guidelines

- **Dashboard**: High-level stats, carousels for recent items.
- **Editors**:
  - **Version Navigator**: Clear `IsNew` vs `Edit` vs `View` states.
  - **Locked Fields**: Previous versions are read-only.
  - **Dynamic Forms**: Add/Remove components and ingredients dynamically.
- **Shared Components**:
  - `CostTooltip`: Shows detailed breakdown on hover.
  - `VersionNavigator`: Consistent implementation across all 3 main editors.

## 6. Key Constraints

- **Unit Conversion**: 1 ml = 1 g assumption for simple liquid handling.
- **Deletion**: Block deletion if entity is used in a downstream product.
- **Validation**:
  - Yield must be > 0 for Per Gram calculation.
  - Recursion check for linked recipes (no circles).
