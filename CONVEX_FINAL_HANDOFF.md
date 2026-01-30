# Convex Migration - Final Handoff

## Project Context
**Malo Recipe Master** - Indonesian FMCG snack company recipe/product management system.
Migrating from FastAPI + PostgreSQL to Convex to solve serverless connection issues.

## Current State

**Branch:** `main` (Convex migration merged)
**Last Commit:** `2ccd5d7` - Phase 5 frontend hooks

### Completed Work (Phases 1-5)

| Phase | Status | Description |
|-------|--------|-------------|
| 1 | ✅ | Base tables (ingredients, materials, tags, menuProducts) |
| 2 | ✅ | Recipes backend (CRUD, versioning, components) |
| 3 | ✅ | Packaging + Products backend & frontend hooks |
| 4 | ✅ | Orders, Customers, Dashboard backend |
| 5 | ✅ | Orders, Customers, Dashboard frontend hooks |

### Files Added (~8,150 lines)

**Convex Backend (28 files):**
```
convex/
├── schema.ts                    # 19 tables defined
├── lib/costCalculator.ts        # Cost calculation utilities
├── ingredients/{queries,mutations}.ts
├── materials/{queries,mutations}.ts
├── tags/{queries,mutations}.ts
├── menuProducts/{queries,mutations}.ts
├── recipes/{queries,mutations}.ts
├── packaging/{queries,mutations}.ts
├── products/{queries,mutations}.ts
├── customers/{queries,mutations}.ts
├── orders/{queries,mutations,whatsapp}.ts
├── dashboard/queries.ts
└── _generated/                  # Auto-generated types
```

**Frontend Hooks (10 files):**
```
src/hooks/convex/
├── index.ts                     # Barrel export (100+ hooks)
├── useIngredients.ts
├── useMaterials.ts
├── useTags.ts
├── useRecipes.ts
├── usePackaging.ts
├── useProducts.ts
├── useOrders.ts                 # 19 hooks
├── useCustomers.ts              # 7 hooks
└── useDashboard.ts              # 4 hooks
```

---

## Remaining Work

### Phase 6: Database Seeding

Create a Convex seed function to populate initial data.

**Default Data to Seed:**

1. **Tags** (already exists: `convex/tags/mutations.ts:seedDefaults`)
   - Dubai-Snack, Extruded-Snack, Sachet, Pouch, Box

2. **Menu Products** (NEEDS CREATION)
   ```typescript
   const defaultMenuProducts = [
     { code: "ORIGINAL_SINGLE", name: "Original Single (80g)", grams: 80, defaultPrice: 50000, productionType: "original", productionUnits: 1 },
     { code: "BITE_SINGLE", name: "Bite Sized Single (45g)", grams: 45, defaultPrice: 35000, productionType: "bite_sized", productionUnits: 1 },
     { code: "BITE_DOUBLE", name: "Bite Sized Double (90g)", grams: 90, defaultPrice: 70000, productionType: "bite_sized", productionUnits: 2 },
     { code: "BITE_TRIPLE", name: "Bite Sized Triple (135g)", grams: 135, defaultPrice: 99000, productionType: "bite_sized", productionUnits: 3 },
   ];
   ```

**Files to Create/Modify:**
- `convex/menuProducts/mutations.ts` - Add `seedDefaults` mutation
- `convex/seed.ts` - Combined seed function that calls all seeders

### Phase 7: Data Migration (PostgreSQL → Convex)

Create migration script to transfer existing production data.

**Script Requirements:**
```
scripts/migrate-to-convex.ts
├── Export data from PostgreSQL via FastAPI endpoints
├── Transform integer IDs to Convex ID mapping
├── Import in correct order (dependencies first):
│   1. Tags
│   2. Ingredients
│   3. Materials
│   4. Menu Products
│   5. Recipes + Versions + Components
│   6. Packaging + Versions + Components
│   7. Products + Versions
│   8. Customers
│   9. Orders + Items
└── Validate row counts post-migration
```

**ID Mapping Strategy:**
- Old: `{ id: 1, ... }` (integer)
- New: `{ _id: "k57x..." }` (Convex ID)
- Keep map: `oldIdToNewId = { 1: "k57x...", 2: "m39y..." }`

### Phase 8: Frontend Switchover

Replace React Query hooks with Convex hooks in all pages.

**Pages to Update:**

| Page | Current Hooks | New Hooks |
|------|---------------|-----------|
| `Dashboard.tsx` | useRecipes, usePackagingRecipes, useProducts, useIngredients, useMaterials, useTags, useOrderStats | useConvexRecipes, useConvexPackagingList, useConvexProducts, useConvexIngredients, useConvexMaterials, useConvexTags, useConvexOrderStats |
| `RecipeEditor.tsx` | useRecipe, useCreateRecipe, etc. | useConvexRecipe, useConvexCreateRecipe, etc. |
| `PackagingEditor.tsx` | usePackaging, etc. | useConvexPackaging, etc. |
| `ProductEditor.tsx` | useProduct, etc. | useConvexProduct, etc. |
| `OrderManager.tsx` | useOrders, useCustomers | useConvexOrders, useConvexCustomers |
| `OrderDetail.tsx` | useOrder, useUpdateOrderStatus, etc. | useConvexOrder, useConvexUpdateOrderStatus, etc. |
| `KitchenView.tsx` | useKitchenOrders | useConvexKitchenOrders |
| `IngredientsManager.tsx` | useIngredients | useConvexIngredients |
| `MaterialsManager.tsx` | useMaterials | useConvexMaterials |

**Import Changes:**
```typescript
// Before
import { useRecipes } from '@/hooks/useRecipes';

// After
import { useConvexRecipes } from '@/hooks/convex';
```

**Note:** The Convex hooks transform data to match existing frontend types (snake_case), so component logic should work unchanged.

### Phase 9: Cleanup

**Files to Delete:**
```
api/                           # Entire FastAPI backend (~50 files)
├── app/
├── data/malo_recipes.db
├── scripts/
├── index.py
└── requirements.txt

vercel.json                    # No longer needed
src/lib/api.ts                 # Replaced by Convex hooks
src/hooks/useRecipes.ts        # Old React Query hooks (9 files)
src/hooks/usePackaging.ts
src/hooks/useProducts.ts
src/hooks/useIngredients.ts
src/hooks/useMaterials.ts
src/hooks/useTags.ts
src/hooks/useOrders.ts
src/hooks/useCustomers.ts
src/hooks/useOrderStats.ts
```

**Dependencies to Remove:**
```bash
npm uninstall axios @tanstack/react-query
```

**Files to Update:**
- `src/App.tsx` - Remove QueryClientProvider
- `CLAUDE.md` - Update documentation for Convex architecture
- `package.json` - Remove unused scripts

---

## Commands

```bash
# Start Convex dev server (must run during development)
npx convex dev

# One-time: push schema to Convex
npx convex dev --once

# Deploy to production
npx convex deploy

# Seed default data (run once after deployment)
# In Convex dashboard or via mutation:
# - Call tags.mutations.seedDefaults()
# - Call menuProducts.mutations.seedDefaults() (after creating it)

# Frontend development
npm run dev

# Build check
npm run build
```

---

## Convex Dashboard
https://dashboard.convex.dev/d/exciting-fennec-671

---

## Architecture After Migration

```
Frontend (React + Vite)
    ↓
Convex Hooks (src/hooks/convex/)
    ↓ Real-time subscriptions
Convex Backend (convex/)
    ↓
Convex Database (managed)
```

**Key Benefits:**
- No database connection management
- Real-time updates (no polling/cache invalidation)
- Serverless-native (no cold starts affecting DB)
- Type-safe end-to-end

---

## Checklist for Next Session

- [ ] Create `convex/menuProducts/mutations.ts:seedDefaults`
- [ ] Create `convex/seed.ts` combined seeder
- [ ] Run seed functions on Convex dashboard
- [ ] Create `scripts/migrate-to-convex.ts` (if migrating existing data)
- [ ] Update `Dashboard.tsx` to use Convex hooks
- [ ] Update `OrderManager.tsx` to use Convex hooks
- [ ] Update `OrderDetail.tsx` to use Convex hooks
- [ ] Update `KitchenView.tsx` to use Convex hooks
- [ ] Update remaining editor pages
- [ ] Delete old FastAPI backend
- [ ] Remove axios and React Query
- [ ] Update CLAUDE.md documentation

---

## Quick Reference

**Convex Hook Pattern:**
```typescript
// Query (auto-reactive)
const { data, isLoading } = useConvexOrders({ status: "Confirmed" });

// Mutation
const createOrder = useConvexCreateOrder();
await createOrder.mutate({ ... }); // Shows toast automatically
```

**Data Shape Compatibility:**
- Convex returns camelCase (`orderNumber`, `customerName`)
- Hooks transform to snake_case (`order_number`, `customer_name`)
- Frontend components work unchanged
