# Menu Products Manager - Implementation Plan

**Created:** 2026-02-03
**Status:** Planned
**PRD:** Menu Products CRUD with POS Slot System

## Overview
Create a comprehensive CRUD page to manage menu products with:
1. **View/Edit all products** (including legacy fixed products)
2. **Create new custom products** with pricing and ball configurations
3. **Assign products to POS slots (1-4)** - only slotted products appear on POS
4. **Keep legacy products** for historical orders without deleting them

## Key Concept: POS Slots

Instead of using `isFixed` to determine what shows on POS, we'll add a **`posSlot`** field:
- `posSlot: 1-4` → Product appears in that slot on POS
- `posSlot: null` → Product is legacy/inactive, not shown on POS
- Only 1 product per slot (unique constraint)
- Can have 1, 2, 3, or 4 products on POS at any time

## Data Model Changes

### Schema Update: `menuProducts` table
```typescript
menuProducts: defineTable({
  // ... existing fields ...

  // NEW: POS slot assignment (1-4, or null for legacy)
  posSlot: v.optional(v.number()), // 1, 2, 3, or 4 (null = not on POS)
})
  .index("by_code", ["code"])
  .index("by_active", ["isActive"])
  .index("by_pos_slot", ["posSlot"])  // NEW: for fetching POS products
```

### Relationship Diagram
```
menuProducts                    productionUnitTypes
├─ code: "ORIGINAL"            ├─ code: "BIG_BALL" (80g)
├─ name: "Original"            └─ code: "MID_BALL" (45g)
├─ grams: 80                         │
├─ defaultPrice: 50000               │
├─ unitCost: 19231                   │
├─ isFixed: true (legacy flag)       │
├─ posSlot: null (not on POS)   ◄────┤  ← Legacy product
├─ cachedProductionSummary           │
└─ _id ──────────────────────────────┼─► menuProductComponents
                                     │   ├─ menuProductId
                                     │   ├─ productionUnitTypeId
                                     │   └─ quantity

New Product Example:
├─ code: "NEW_ORIGINAL"
├─ name: "Original (New)"
├─ posSlot: 1                   ◄────── Shows in slot 1 on POS
├─ isFixed: false
```

## UI Design

### Main View - Products Table
```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│  ← Back    Menu Products                                         [+ New Product]     │
├──────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│  ═══ POS MENU (drag to reorder slots) ═══════════════════════════════════════════   │
│  ┌────────────────────────────────────────────────────────────────────────────────┐ │
│  │ Slot │ Product         │ Grams │ Price      │ COGS       │ Margin │ Balls  │ ⚙️│ │
│  ├──────┼─────────────────┼───────┼────────────┼────────────┼────────┼────────┼───┤ │
│  │  1   │ New Original    │ 80g   │ Rp 50.000  │ Rp 19.231  │ 61.5%  │ 1 Big  │ ✏️│ │
│  │  2   │ Bite Single V2  │ 45g   │ Rp 38.000  │ Rp 12.422  │ 67.3%  │ 1 Mid  │ ✏️│ │
│  │  3   │ Bite Double V2  │ 90g   │ Rp 70.000  │ Rp 24.843  │ 64.5%  │ 2 Mid  │ ✏️│ │
│  │  4   │ (empty)         │   -   │     -      │     -      │   -    │   -    │   │ │
│  └────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                      │
│  ═══ LEGACY PRODUCTS (not on POS) ═══════════════════════════════════════════════   │
│  ┌────────────────────────────────────────────────────────────────────────────────┐ │
│  │ Product         │ Grams │ Price      │ COGS       │ Margin │ Balls    │ ⚙️    │ │
│  ├─────────────────┼───────┼────────────┼────────────┼────────┼──────────┼───────┤ │
│  │ Original        │ 80g   │ Rp 50.000  │ Rp 19.231  │ 61.5%  │ 1 Big    │ ✏️ 📤 │ │
│  │ Bite Single     │ 45g   │ Rp 35.000  │ Rp 12.422  │ 64.5%  │ 1 Mid    │ ✏️ 📤 │ │
│  │ Bite Double     │ 90g   │ Rp 70.000  │ Rp 24.843  │ 64.5%  │ 2 Mid    │ ✏️ 📤 │ │
│  │ Bite Triple     │ 135g  │ Rp 99.000  │ Rp 36.765  │ 62.9%  │ 3 Mid    │ ✏️ 📤 │ │
│  └────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                      │
│  📤 = Assign to POS slot                                                            │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

### Edit/Create Form (Sheet)
```
┌─────────────────────────────────────────────────────────────┐
│  Edit Product: Bite Single V2                         [X]   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Code: [BITE_SINGLE_V2  ]                                   │
│  Name: [Bite Single V2                             ]        │
│                                                             │
│  ── POS Assignment ───────────────────────────────────────  │
│  Slot: [2 ▼]  (1, 2, 3, 4, or None)                         │
│                                                             │
│  ── Pricing ──────────────────────────────────────────────  │
│  Grams:        [45     ]                                    │
│  Price (IDR):  [38000  ]                                    │
│  COGS (IDR):   [12422  ]     Margin: 67.3%                  │
│                                                             │
│  ── Production Components ────────────────────────────────  │
│  │ Unit Type    │ Qty │ Cost    │      │                    │
│  ├──────────────┼─────┼─────────┼──────┤                    │
│  │ Mid Ball     │ [1] │ 12,422  │ [🗑] │                    │
│  └──────────────┴─────┴─────────┴──────┘                    │
│  [+ Add Component]                                          │
│                                                             │
│  Summary: 1 Mid Ball                                        │
│                                                             │
│                              [Cancel]  [Save Changes]       │
└─────────────────────────────────────────────────────────────┘
```

### Assign to Slot Dialog (for legacy products)
```
┌─────────────────────────────────────────────────┐
│  Assign "Original" to POS                  [X]  │
├─────────────────────────────────────────────────┤
│                                                 │
│  Select a slot:                                 │
│                                                 │
│  ○ Slot 1 (currently: New Original)             │
│  ○ Slot 2 (currently: Bite Single V2)           │
│  ○ Slot 3 (currently: Bite Double V2)           │
│  ● Slot 4 (empty)                               │
│                                                 │
│  ⚠️ Assigning to an occupied slot will          │
│     move the current product to Legacy.         │
│                                                 │
│                    [Cancel]  [Assign to Slot 4] │
└─────────────────────────────────────────────────┘
```

## Implementation Steps

### Step 1: Schema Update
**File:** `convex/schema.ts`

Add `posSlot` field and index:
```typescript
posSlot: v.optional(v.number()), // 1, 2, 3, or 4
.index("by_pos_slot", ["posSlot"])
```

### Step 2: Backend Updates
**Files:** `convex/menuProducts/queries.ts`, `convex/menuProducts/mutations.ts`

New queries:
- `listPosProducts()` - Get products with posSlot 1-4, sorted by slot
- `listLegacyProducts()` - Get products with posSlot null

New/updated mutations:
- `assignToSlot(id, slot)` - Assign product to POS slot (swap if occupied)
- `removeFromSlot(id)` - Remove product from POS (set posSlot null)
- `update()` - Allow updating posSlot

### Step 3: Update useConvexFixedProducts Hook
**File:** `src/hooks/convex/useMenuProducts.ts`

Change `useConvexFixedProducts` to fetch by `posSlot` instead of `isFixed`:
```typescript
export function useConvexPosProducts() {
  // Fetch products where posSlot is 1-4, sorted by slot
  const products = useQuery(api.menuProducts.queries.listPosProducts);
  // Return in slot order for POS display
}
```

### Step 4: Create ProductForm Component
**File:** `src/components/menuProducts/ProductForm.tsx`

- Code, name, grams, price, COGS fields
- POS slot dropdown (1, 2, 3, 4, or None)
- Production components editor
- Auto-calc COGS from components
- Auto-calc margin

### Step 5: Create MenuProductsManager Page
**File:** `src/pages/MenuProductsManager.tsx`

- Two sections: POS Menu (slotted) + Legacy Products
- Edit opens ProductForm in Sheet
- "Assign to POS" button for legacy products
- "New Product" button

### Step 6: Add Route
**File:** `src/App.tsx`

Add route: `/menu-products` → `<MenuProductsManager />`

### Step 7: Update OrderFormPOS
**File:** `src/components/orders/OrderFormPOS.tsx`

Update to use new `useConvexPosProducts()` hook.

## Files to Create/Modify

| Action | File | Description |
|--------|------|-------------|
| **MODIFY** | `convex/schema.ts` | Add posSlot field + index |
| **MODIFY** | `convex/menuProducts/queries.ts` | Add listPosProducts, listLegacyProducts |
| **MODIFY** | `convex/menuProducts/mutations.ts` | Add assignToSlot, removeFromSlot |
| **CREATE** | `src/components/menuProducts/ProductForm.tsx` | Shared form component |
| **CREATE** | `src/pages/MenuProductsManager.tsx` | Main CRUD page |
| **MODIFY** | `src/hooks/convex/useMenuProducts.ts` | Add useConvexPosProducts hook |
| **MODIFY** | `src/components/orders/OrderFormPOS.tsx` | Use new POS hook |
| **MODIFY** | `src/App.tsx` | Add route |

## Backend APIs

| Purpose | API |
|---------|-----|
| List POS products | `menuProducts/queries:listPosProducts` (NEW) |
| List legacy products | `menuProducts/queries:listLegacyProducts` (NEW) |
| Assign to slot | `menuProducts/mutations:assignToSlot` (NEW) |
| Remove from slot | `menuProducts/mutations:removeFromSlot` (NEW) |
| Create product | `menuProducts/mutations:create` (existing) |
| Update product | `menuProducts/mutations:update` (existing) |
| List unit types | `productionUnitTypes/queries:list` (existing) |
| Get components | `menuProductComponents/queries:getByMenuProduct` (existing) |
| Set components | `menuProductComponents/mutations:setComponents` (existing) |

## Migration: Existing Fixed Products

Run migration to set initial posSlot values for existing fixed products:
```typescript
// Migration: Set posSlot for existing fixed products
ORIGINAL → posSlot: 1
BITE_SINGLE → posSlot: 2
BITE_DOUBLE → posSlot: 3
BITE_TRIPLE → posSlot: 4
```

This preserves backward compatibility - existing products stay on POS until you create new ones and reassign slots.

## Verification

1. Navigate to `/menu-products`
2. Verify existing fixed products appear in POS Menu section (slots 1-4)
3. Create new product "Original V2" with 1 Big Ball component
4. Assign "Original V2" to slot 1 → old "Original" moves to Legacy
5. Verify POS only shows 4 slotted products (or fewer if slots empty)
6. Edit "Original V2" → change price → verify real-time update
7. Open OrderFormPOS → verify it shows the new slotted products
8. Create test order with new product → verify kitchen calculations work
