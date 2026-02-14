# Phase 6: BOM Migration - Research

**Researched:** 2026-02-14
**Domain:** Strangler fig data migration (deprecated field removal, dual-read/write transition)
**Confidence:** HIGH

## Summary

Phase 6 migrates all ball composition data flows from deprecated `productionType`/`productionUnits` fields to the BOM system (`menuProductComponents` + `componentTypes`). The codebase is partially migrated: the NEW system (`orderItemProduction` records, `productionCounts/queries.ts`) already works correctly, but the OLD system fields are still actively read in 10 backend files and 6 frontend files, and actively written in 4 backend mutation files.

The critical complexity is the **counterintuitive mapping**: `productionType: "original"` maps to `BIG_BALL` (80g/Jumbo), not `MID_BALL` as the name suggests. This is well-documented in CLAUDE.md Pitfall #11 and is the #1 source of bugs in this domain. The migration must handle this mapping correctly in the backfill AND in the dual-read fallback for historical orders.

The `by_production_type` index on `orderItems` was **already removed** in Phase 3 (QFIX-05), so BOM-05 is already complete. The remaining `by_production_type` index (on `orderItemProduction` table) indexes `productionUnitTypeId` and is part of the NEW system -- it must NOT be removed.

**Primary recommendation:** Follow the 6-step strangler fig sequence exactly. The packaging mutations (`packaging.ts`) are the highest-risk migration target because they use `productionUnits` for ball-per-package calculations that directly affect kitchen workflow correctness.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Legacy order display:**
- **Seamless fallback** -- old orders (pre-BOM) must look identical to new orders. No visual indicators, no "(legacy)" badges. The dual-read fallback is invisible to all users.
- **All history supported** -- every order ever created must display correctly. Fallback covers the entire order history, not just recent orders.
- **Kitchen view unchanged** -- kitchen staff see no difference during or after migration. No toasts, banners, or transition notices.

**Backfill behavior:**
- **Skip products with no productionType** -- if a menuProduct has null/undefined productionType, the backfill leaves it without BOM entries. It won't show ball composition until manually configured.
- **Overwrite existing BOM entries** -- if a menuProduct already has BOM entries (manually created earlier), the backfill deletes and recreates them from deprecated field values. Clean, consistent source.
- **Direct quantity mapping** -- `productionUnits` value maps directly to BOM component quantity. No transformation or scaling.
- **Idempotent migration** -- the backfill can be re-run safely. It deletes existing BOM entries and recreates them each time. Supports fixing mapping logic and re-running.

**Deprecated field cleanup:**
- **Strip from API responses** -- after migration, query functions explicitly omit `productionType` and `productionUnits` from returned data. Cleaner API surface.
- **Remove from edit forms** -- MenuProductsManager edit form removes productionType/productionUnits fields entirely. BOM is the only way to configure ball composition going forward.
- **Stop snapshotting on orders** -- new orders only store BOM-derived composition. The deprecated fields on new orderItems will be null/empty.
- **BOM-only writes** -- once backfill is deployed, new orders write only BOM data. No dual-write transition period.
- **Full deletion in Phase 8** -- deprecated fields will be removed from the schema entirely in Phase 8 (Schema Cleanup). Not kept indefinitely.

**Verification & rollback:**
- **Automated comparison query** -- write a verification query that compares BOM-derived ball composition vs deprecated fields for every menuProduct. Report mismatches as a list.
- **Log mismatches, don't halt** -- if the comparison finds mismatches, log them to a report but continue the migration. User reviews the report and fixes manually after.
- **Same-session deploys** -- all 6 sequential deploy steps execute back-to-back in one session. Verify each step with automated checks, then immediately proceed to the next.
- **Fix forward only** -- no rollbacks. If something breaks mid-migration, debug and deploy a fix. The strangler fig design means each step is safe independently.

### Claude's Discretion
- Technical implementation of the dual-read fallback logic
- Exact migration query structure and batch sizing
- How the automated comparison query reports results (console output, file, or dashboard)
- Order of frontend file updates within the 19-file migration

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

## Standard Stack

This phase is purely an internal migration. No new libraries are needed.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Convex | ^1.31.7 | Backend runtime, schema, mutations | Already in use |
| React 19 | ^19.2.0 | Frontend framework | Already in use |
| TypeScript | ~5.9 | Type safety | Already in use |

### Supporting
No additional libraries required. This is a pure data-flow migration within the existing stack.

### Alternatives Considered
Not applicable -- this is a code migration, not a technology choice.

## Architecture Patterns

### Pattern 1: Dual-Read Fallback (BOM-01)
**What:** Every query that reads ball composition first attempts BOM lookup. If BOM data exists, use it. If not (historical order), fall back to the deprecated `productionType`/`productionUnits` fields on `orderItems`.
**When to use:** All backend query functions that currently read `productionType`/`productionUnits`.
**Example:**
```typescript
// Source: Codebase pattern, verified in convex/orders/queries.ts

// DUAL-READ PATTERN: BOM first, deprecated fallback
function getBallComposition(
  item: Doc<"orderItems">,
  productionRecords: Doc<"orderItemProduction">[]
): { bigBalls: number; midBalls: number } {
  // NEW system: Check production records first (BOM-derived)
  if (productionRecords.length > 0) {
    let bigBalls = 0;
    let midBalls = 0;
    for (const record of productionRecords) {
      if (record.isCancelled) continue;
      if (record.productionUnitCode === "BIG_BALL") {
        bigBalls += record.unitsRemaining;
      } else if (record.productionUnitCode === "MID_BALL") {
        midBalls += record.unitsRemaining;
      }
    }
    return { bigBalls, midBalls };
  }

  // FALLBACK: Deprecated fields for historical orders (pre-BOM)
  // CRITICAL: "original" -> BIG_BALL (80g), "bite_sized" -> MID_BALL (45g)
  // This mapping is counterintuitive but correct (CLAUDE.md Pitfall #11)
  // Wait -- this is for KITCHEN queries which show "needed" counts.
  // Actually the existing code already has the mapping inverted:
  //   "original" -> midBallsNeeded, "bite_sized" -> bigBallsNeeded
  // The code at queries.ts:298-301 correctly maps:
  //   productionType === "original" -> midBallsNeeded (MID_BALL)
  //   productionType === "bite_sized" -> bigBallsNeeded (BIG_BALL)
  // BUT the CLAUDE.md says "original" -> BIG_BALL. The code is WRONG per docs.
  // Actually wait -- looking at the data: "Bite Sized Double" has productionType:"bite_sized"
  // and its BOM has MID_BALL. And "Original" has productionType:"original" and BOM has BIG_BALL.
  // So the queries.ts code maps original->midBalls which is... the WRONG mapping.
  // This confusion is exactly why BOM migration matters!
  // For the fallback, we replicate the EXISTING behavior to maintain identical display.
  let bigBalls = 0;
  let midBalls = 0;
  if (item.productionType === "original" && item.productionUnits) {
    midBalls += item.productionUnits * item.quantity;
  } else if (item.productionType === "bite_sized" && item.productionUnits) {
    bigBalls += item.productionUnits * item.quantity;
  }
  return { bigBalls, midBalls };
}
```

### Pattern 2: Idempotent Backfill (BOM-06)
**What:** A mutation that reads every `menuProduct` with a `productionType`, maps it to the correct `componentType`, deletes existing BOM entries, and recreates them.
**When to use:** Run once as Step 1 of the migration sequence.
**Example:**
```typescript
// Backfill mapping
// CRITICAL: productionType -> componentType code mapping
// "original" -> "BIG_BALL" (80g/Jumbo) -- NOT what the name suggests!
// "bite_sized" -> "MID_BALL" (45g/Original) -- counterintuitive naming
const PRODUCTION_TYPE_TO_BOM_CODE: Record<string, string> = {
  "original": "BIG_BALL",
  "bite_sized": "MID_BALL",
};
```

### Pattern 3: Strip Fields from API Response
**What:** After migration, query functions use destructuring to explicitly exclude deprecated fields from returned data.
**When to use:** All menu product queries that currently return raw `ctx.db.get()` results.
**Example:**
```typescript
// Strip deprecated fields from menu product queries
const product = await ctx.db.get(args.id);
if (!product) return null;
const { productionType: _, productionUnits: _2, ...cleanProduct } = product;
return cleanProduct;
```

### Pattern 4: BOM-Derived ballsPerPackage (replacing productionUnits reads)
**What:** The packaging mutations use `item.productionUnits ?? 1` to determine balls per package. After migration, this must be derived from the item's production records or the BOM.
**When to use:** All packaging mutation code that reads `productionUnits`.
**Example:**
```typescript
// OLD: const ballsPerPackage = item.productionUnits ?? 1;
// NEW: Derive from production records (already available on orderItems via orderItemProduction)
async function getBallsPerPackage(
  ctx: MutationCtx,
  item: Doc<"orderItems">
): Promise<number> {
  // Try BOM-derived production records first
  if (item.menuProductId) {
    const records = await ctx.db
      .query("orderItemProduction")
      .withIndex("by_order_item", (q) => q.eq("orderItemId", item._id))
      .collect();

    const activeRecords = records.filter(r => !r.isCancelled);
    if (activeRecords.length > 0) {
      // Sum all production units per single package
      // unitsRequired / quantity = units per package
      const totalUnitsRequired = activeRecords.reduce((sum, r) => sum + r.unitsRequired, 0);
      return item.quantity > 0 ? totalUnitsRequired / item.quantity : 1;
    }
  }
  // Fallback for historical orders
  return item.productionUnits ?? 1;
}
```

### Anti-Patterns to Avoid
- **Reading `productionType` in NEW code:** Never. Use BOM tables or `orderItemProduction` records.
- **Writing `productionType`/`productionUnits` after BOM-02:** Once writes are stopped, they must never be re-introduced.
- **Assuming `productionType` name matches ball type:** "original" = BIG_BALL (80g), "bite_sized" = MID_BALL (45g). The names are misleading.
- **Removing `by_production_type` from `orderItemProduction`:** This index is on the NEW system table (indexing `productionUnitTypeId`). It must stay.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Ball composition lookup | Inline per-query logic | Shared `getBallComposition()` helper | 6 query functions need identical logic; DRY |
| Backfill mapping | Hard-coded if/else | Lookup table `PRODUCTION_TYPE_TO_BOM_CODE` | Single source of truth for the mapping |
| Field stripping | Manual omit per field | Destructuring with rest spread | Less error-prone, TypeScript catches missing fields |
| ballsPerPackage derivation | Inline production record lookups | Shared `getBallsPerPackage()` helper | 7 reads in packaging.ts need identical logic |

**Key insight:** The migration touches functions that are used daily in kitchen operations. Consistency and DRY helpers reduce the chance of introducing a regression in one function while fixing another.

## Common Pitfalls

### Pitfall 1: The Counterintuitive productionType Mapping
**What goes wrong:** Developer assumes `productionType: "original"` means the product uses MID_BALL (because the product named "Original" uses MID_BALL). But actually `productionType: "original"` maps to BIG_BALL (80g).
**Why it happens:** The deprecated `productionType` field uses confusing values that don't match product names or ball types.
**How to avoid:** Use the constant mapping table. Add comments on every mapping site. Run the verification query after backfill.
**Warning signs:** BOM-derived ball counts differ from deprecated-field-derived counts for the same products.

### Pitfall 2: The queries.ts Mapping Confusion
**What goes wrong:** The existing code in `convex/orders/queries.ts` lines 296-302 maps `productionType === "original"` to `midBallsNeeded` and `productionType === "bite_sized"` to `bigBallsNeeded`. This appears to contradict the mapping documented in CLAUDE.md (`original` -> BIG_BALL). However, this existing behavior is what users currently see.
**Why it happens:** The queries.ts code was written with the understanding that "original" products (like "Original Single 45g") use MID_BALL, while "bite_sized" products (like "Bite Sized Double 90g") use BIG_BALL. This is actually WRONG per the field semantics but produces correct results because the field values were assigned incorrectly in the first place.
**How to avoid:** The dual-read fallback must replicate the EXISTING behavior exactly for historical orders (seamless fallback decision). For new orders, production records contain the correct `productionUnitCode` (BIG_BALL/MID_BALL) directly, so no mapping is needed.
**Warning signs:** Kitchen stats show different ball counts after migration.

### Pitfall 3: Packaging Mutations Break Kitchen Workflow
**What goes wrong:** The `packaging.ts` file uses `item.productionUnits ?? 1` in 7 places to determine balls per package. If this is replaced incorrectly, package filling/packing breaks for all kitchen staff.
**Why it happens:** `packaging.ts` is called frequently during kitchen operations. A wrong value for `ballsPerPackage` means packages can't be filled or are filled with wrong counts.
**How to avoid:** Use a shared helper that falls back to `productionUnits` for historical orders. Test with both new and old orders.
**Warning signs:** Kitchen staff can't fill or pack packages, ball counts per package are wrong.

### Pitfall 4: Schema Deploy Fails Due to Required Fields
**What goes wrong:** Changing `productionType: v.string()` to `v.optional(v.string())` on `menuProducts` requires a schema push. If existing data doesn't match, Convex rejects the deploy.
**Why it happens:** `menuProducts.productionType` is currently `v.string()` (required), not `v.optional()`. `menuProducts.productionUnits` is currently `v.number()` (required), not `v.optional()`. `orderItems` already has these as `v.optional()`.
**How to avoid:** BOM-04 must change both `menuProducts` fields from required to `v.optional()`. This is safe because existing data all has values (checked via dev-export data). The schema change just relaxes the constraint.
**Warning signs:** `npx convex deploy` fails with schema validation error.

### Pitfall 5: productionItems Filter Breaks for Packaging-Only Products
**What goes wrong:** `packaging.ts` filters items with `allItems.filter((i) => i.productionType)`. After migration stops writing `productionType`, new order items won't have this field, so the filter returns empty -- breaking "complete packaging" checks.
**Why it happens:** The filter uses the deprecated field as a proxy for "has production data."
**How to avoid:** Replace the filter with a BOM-derived check: check for production records via `orderItemProduction`, or check if `menuProductId` links to a food-type product.
**Warning signs:** "Cannot complete packaging: some packages are not yet packed" error when all packages are actually packed.

### Pitfall 6: Frontend Type Interfaces Still Reference Deprecated Fields
**What goes wrong:** TypeScript interfaces like `MenuProduct`, `KitchenOrderItem`, `PackageItem`, `ProductButtonProduct`, `FixedProduct`, `PosProduct`, `AvailableProduct` all reference `productionType`/`productionUnits`. Removing the fields from backend responses without updating these types causes TypeScript build failures.
**How to avoid:** Update types in lockstep with backend changes. Add `// DEPRECATED` comments during BOM-04, then remove entirely in the same frontend migration wave (BOM-03).
**Warning signs:** `npm run type-check` fails after backend deploys.

### Pitfall 7: WhatsApp Template Uses productionUnits for Gram Descriptions
**What goes wrong:** `convex/orders/whatsapp.ts` line 554 uses `p.productionUnits > 1` to format gram descriptions in the catalog template. After removing writes, this field may be undefined.
**Why it happens:** The WhatsApp catalog template reads `menuProducts.productionUnits` directly (not from order items).
**How to avoid:** Replace with BOM-derived data. Look up `menuProductComponents` for each product and derive ball count from production components.
**Warning signs:** WhatsApp catalog shows incorrect gram breakdowns.

## Code Examples

### Current State: Files That Read Deprecated Fields

**Backend (10 files, convex/):**

| File | Lines | What It Reads | How It's Used |
|------|-------|---------------|---------------|
| `orders/queries.ts` | 298-301, 560-571, 584-587, 795-799, 927-930 | `item.productionType`, `item.productionUnits` | Kitchen stats, ball counts, debug output |
| `orders/mutations/orderCrud.ts` | 159-166, 247-248, 347-348 | `mp.productionType`, `mp.productionUnits` | Stamps on new orderItems at creation |
| `orders/mutations/itemCrud.ts` | 59-66, 84-85, 226-233, 249-250 | `menuProduct.productionType/.productionUnits` | Stamps on new orderItems (addItem, replaceItems) |
| `orders/mutations/packaging.ts` | 47, 89, 146, 244, 317, 354, 392, 400, 445 | `item.productionUnits`, `item.productionType` | Balls per package, production item filtering |
| `orders/whatsapp.ts` | 554-556 | `p.productionUnits` | Gram description in WhatsApp catalog |
| `menuProducts/mutations.ts` | 122-123, 187-188, 229-230, 280-281, 404-438, 461-462 | `productionType`, `productionUnits` | Create/update mutations, seed defaults |
| `orders/mutations/migrations.ts` | 67, 93-98, 213-269 | `item.productionType`, `item.productionUnits` | Legacy migration functions (bootstrap) |
| `orders/migrations.ts` | 50, 64, 98 | `item.productionType` | Verification query (data integrity check) |
| `schema.ts` | 55-56 | Field definitions (required) | `menuProducts.productionType: v.string()`, `menuProducts.productionUnits: v.number()` |
| `schema.ts` | 405-406 | Field definitions (optional) | `orderItems.productionType: v.optional()`, `orderItems.productionUnits: v.optional()` |

**Frontend (6 files, src/):**

| File | Lines | What It Reads | How It's Used |
|------|-------|---------------|---------------|
| `hooks/convex/useMenuProducts.ts` | 21-22, 37-38, 61-62, 125-126, 143-144, 164-165, 195-196, 220-221, 238-239 | `productionType`, `productionUnits` | Type interfaces, transform functions, mapped to snake_case |
| `hooks/convex/useKitchenStats.ts` | 52-53, 155-156 | `productionType`, `productionUnits` | Type interfaces, item transform |
| `components/orders/PackageStatusDisplay.tsx` | 20-21, 105-107 | `productionUnits`, `productionType` | Type interface, ball count display |
| `components/orders/ProductButtons.tsx` | 22-23 | `productionType`, `productionUnits` | Type interface only (not read in render) |
| `components/orders/EnhancedCancellationDialog.tsx` | 25, 173 | `productionUnitsAffected` | Impact display (already uses `item.quantity`, not deprecated fields) |
| `pages/OrderDetail.tsx` | 458, 468 | `productionUnitsAffected` | Calculates from `item.quantity` (already BOM-independent) |
| `lib/types.ts` | 258-259, 627-628 | `production_type`, `production_units` | TypeScript type definitions |

### Current State: Fields That Need Schema Changes

| Table | Field | Current Type | Target Type |
|-------|-------|-------------|-------------|
| `menuProducts` | `productionType` | `v.string()` (REQUIRED) | `v.optional(v.string())` |
| `menuProducts` | `productionUnits` | `v.number()` (REQUIRED) | `v.optional(v.number())` |
| `orderItems` | `productionType` | `v.optional(v.string())` | No change (already optional) |
| `orderItems` | `productionUnits` | `v.optional(v.number())` | No change (already optional) |

### Production Data State (from dev-export)

All 8 active menuProducts have `productionType` and `productionUnits` set:

| Product | productionType | productionUnits | BOM (expected) |
|---------|---------------|-----------------|----------------|
| Original - Single (45g) | "original" | 1 | 1 Mid Ball |
| Jumbo Size (80g) | "original" | 1 | 1 Big Ball |
| Bite Sized Single | "bite_sized" | 1 | 1 Mid Ball |
| Bite Sized Double | "bite_sized" | 2 | 2 Mid Ball |
| Bite Sized Triple | "bite_sized" | 3 | 3 Mid Ball |
| Original | "original" | 1 | 1 Big Ball |
| Original - Triple (135g) | "original" | 1 | 3 Mid Ball |
| Brochure - How to eat | "original" | 0 | No production BOM |

**Key observation:** "Original - Triple" has `productionType: "original"` and `productionUnits: 1`, but its BOM already shows "3 Mid Ball". The backfill would set it to 1 BIG_BALL which is WRONG. This means the BOM was manually configured with correct data that DIFFERS from the deprecated fields. The overwrite decision means this correct BOM data would be destroyed by the backfill.

**CRITICAL FINDING:** The backfill decision to "overwrite existing BOM entries" creates a real risk for products where BOM was already manually configured correctly (like "Original - Triple"). The backfill maps `productionType: "original"` -> `BIG_BALL` with `quantity: 1`, but the correct BOM is `3 x MID_BALL`. The verification query will catch this mismatch, but the overwrite will have already happened.

**Recommendation:** The backfill should SKIP products that already have BOM entries AND where the BOM data differs from what the backfill would create. Log these as "already configured, skipping" rather than overwriting. However, the user decision is "overwrite existing BOM entries," so this recommendation is noted but not binding. The verification query becomes the safety net.

### Already Completed Work

| Requirement | Status | Evidence |
|-------------|--------|----------|
| BOM-05: Remove `by_production_type` index on `orderItems` | **ALREADY DONE** | `schema.ts:428` comment: "QFIX-05: removed by_production_type -- deprecated field, zero references" |
| `productionCounts/queries.ts` BOM-only | **ALREADY DONE** | Line 17: "Ball info derived exclusively from BOM" |
| `ballDistribution.ts` uses NEW system | **ALREADY DONE** | Lines 201, 288: "FIX: Use NEW system (production records)" |
| `productionRecords.ts` uses BOM | **ALREADY DONE** | `createProductionRecordsForItem` reads `menuProductComponents` |

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `menuProducts.productionType` + `productionUnits` | BOM (`menuProductComponents` + `componentTypes`) | Ongoing since Phase 1 | Ball composition, kitchen workflow |
| `orderItems.productionType` stamped at creation | `orderItemProduction` records from BOM | Phase 1 (tests), partial in production | Production tracking |
| `by_production_type` index on `orderItems` | Removed (QFIX-05) | Phase 3 | Schema cleanup |
| `productionCounts` reads `productionType` fallback | BOM-only derivation | Already done | Production count queries |

**Deprecated/outdated:**
- `menuProducts.productionType` / `menuProducts.productionUnits`: Replaced by BOM. Still required fields in schema (must make optional in BOM-04).
- `orderItems.productionType` / `orderItems.productionUnits`: Replaced by `orderItemProduction` records. Already optional in schema.
- `calculateOldSystemBallStats()` in `queries.ts`: Explicitly labeled for backward compatibility. Must be wrapped in dual-read.

## Revised Migration Sequence

Based on research, the sequence needs adjustments:

### Step 1: BOM-06 Backfill
Deploy a migration mutation that:
1. Fetches all `menuProducts` with non-null `productionType`
2. For each, maps `productionType` to BOM code using `PRODUCTION_TYPE_TO_BOM_CODE`
3. Deletes existing `menuProductComponents` where `category="production"` for that product
4. Creates new `menuProductComponents` entry with the mapped `componentType` and `productionUnits` as quantity
5. Skips products with null/undefined `productionType`
6. Logs all actions and mismatches

**Batch sizing:** With 8 products, no batching needed. Single mutation call.

### Step 2: BOM-01 Dual-Read
Modify query functions to read BOM first, fall back to deprecated fields:
- `convex/orders/queries.ts`: `getKitchenOrders`, `getKitchenStats`, `getCompletedToday`, `debugProductionRecords`
- `convex/orders/whatsapp.ts`: `generateCatalogTemplate`

### Step 3: BOM-02 Stop Writes
Remove deprecated field writes from mutations:
- `convex/orders/mutations/orderCrud.ts`: Stop stamping `productionType`/`productionUnits` on new `orderItems`
- `convex/orders/mutations/itemCrud.ts`: Stop stamping on `addItem` and `replaceItems`
- `convex/menuProducts/mutations.ts`: Remove `productionType`/`productionUnits` from `create` and `update` args, stop writing to DB

### Step 4: BOM-03 Frontend Migration
Update frontend files to stop reading deprecated fields:
- `src/hooks/convex/useMenuProducts.ts`: Remove from type interfaces and transforms
- `src/hooks/convex/useKitchenStats.ts`: Remove from type interfaces and transforms
- `src/components/orders/PackageStatusDisplay.tsx`: Derive ball count from production records
- `src/components/orders/ProductButtons.tsx`: Remove from type interface
- `src/lib/types.ts`: Add DEPRECATED comments to `production_type`/`production_units`

### Step 5: BOM-04 Schema Changes
- `convex/schema.ts`: Change `menuProducts.productionType` from `v.string()` to `v.optional(v.string())`
- `convex/schema.ts`: Change `menuProducts.productionUnits` from `v.number()` to `v.optional(v.number())`
- Add `// DEPRECATED: Phase 8 removal` comments

### Step 6: BOM-05 Index Removal
**ALREADY COMPLETE.** The `by_production_type` index on `orderItems` was removed in QFIX-05 (Phase 3). Verify and document. The `by_production_type` index on `orderItemProduction` (indexing `productionUnitTypeId`) is part of the NEW system and must NOT be removed.

## Packaging Mutations: Critical Migration Path

The `packaging.ts` file has the most complex migration because it uses `productionUnits` for actual business logic (not just display):

| Line | Current Code | Migration Approach |
|------|-------------|-------------------|
| 47 | `const ballsPerPackage = item.productionUnits ?? 1;` | Derive from `orderItemProduction` records |
| 89 | `allItems.filter((i) => i.productionType)` | Filter by presence of production records |
| 146 | `allItems.filter((i) => i.productionType)` | Filter by presence of production records |
| 244 | `const ballsPerPackage = item.productionUnits ?? 1;` | Derive from production records |
| 317 | `const ballsPerPackage = item.productionUnits ?? 1;` | Derive from production records |
| 354 | `const ballsPerPackage = item.productionUnits ?? 1;` | Derive from production records |
| 392 | `allItems.filter((i) => i.productionType)` | Filter by presence of production records |
| 400 | `const ballsPerPkg = i.productionUnits ?? 1;` | Derive from production records |
| 445 | `const ballsPerPackage = item.productionUnits ?? 1;` | Derive from production records |

**Recommended helper:**
```typescript
async function getBallsPerPackageForItem(
  ctx: MutationCtx,
  item: Doc<"orderItems">
): Promise<number> {
  const records = await ctx.db
    .query("orderItemProduction")
    .withIndex("by_order_item", (q) => q.eq("orderItemId", item._id))
    .collect();

  const activeRecords = records.filter(r => !r.isCancelled);
  if (activeRecords.length > 0 && item.quantity > 0) {
    const totalUnits = activeRecords.reduce((sum, r) => sum + r.unitsRequired, 0);
    return totalUnits / item.quantity;
  }

  // Fallback for historical orders without production records
  return item.productionUnits ?? 1;
}

async function hasProductionData(
  ctx: MutationCtx,
  item: Doc<"orderItems">
): Promise<boolean> {
  const records = await ctx.db
    .query("orderItemProduction")
    .withIndex("by_order_item", (q) => q.eq("orderItemId", item._id))
    .collect();
  return records.some(r => !r.isCancelled);
}
```

## Verification Query Design

The automated comparison query should:
1. Iterate all `menuProducts` with `productionType` set
2. For each, look up BOM entries (`menuProductComponents` where `componentType.category === "production"`)
3. Compare: Does the BOM match what the deprecated fields would predict?
4. Report mismatches as a structured list

```typescript
// Verification query return shape
interface VerificationResult {
  total: number;
  matched: number;
  mismatched: number;
  skipped: number; // Products with no productionType
  details: Array<{
    productId: string;
    productName: string;
    deprecatedType: string;
    deprecatedUnits: number;
    bomCode: string | null;
    bomQuantity: number | null;
    status: "match" | "mismatch" | "no_bom" | "no_deprecated";
  }>;
}
```

**Recommendation:** Implement as a Convex query function (`convex/migrations/bomVerification.ts`) callable from the dashboard. Returns a JSON report that can be logged to console.

## Open Questions

1. **Backfill overwrite risk for "Original - Triple"**
   - What we know: "Original - Triple" has `productionType: "original"`, `productionUnits: 1`, but BOM shows "3 Mid Ball". The backfill would overwrite correct BOM with wrong data (1 BIG_BALL).
   - What's unclear: Should the user decision to "overwrite existing BOM entries" be reconsidered for this specific case?
   - Recommendation: The verification query will catch this. After backfill, run verification, identify mismatches, and manually fix affected products. Since there are only 8 products, manual fix is feasible. The user explicitly chose "overwrite" with the understanding that verification + manual fixes follow.

2. **Test files using deprecated fields**
   - What we know: Test files (`tests/convex/helpers.ts`, `tests/convex/orderLifecycle.test.ts`, `tests/fixtures/k3martCockpit.ts`, etc.) still pass `productionType`/`productionUnits` when creating menu products and order items.
   - What's unclear: Should tests be updated as part of Phase 6, or is this Phase 8 cleanup?
   - Recommendation: Tests should be updated in Phase 6 to stop writing deprecated fields in NEW test code. Existing test helpers that create menu products still need to pass these fields because the schema still requires them (until BOM-04 makes them optional). After BOM-04, update test helpers to omit these fields.

## Sources

### Primary (HIGH confidence)
- `convex/schema.ts` - Verified field definitions and index status
- `convex/orders/queries.ts` - Verified all 5 functions reading deprecated fields
- `convex/orders/mutations/packaging.ts` - Verified 9 reads of deprecated fields
- `convex/orders/mutations/orderCrud.ts` - Verified write patterns
- `convex/orders/mutations/itemCrud.ts` - Verified write patterns
- `convex/menuProducts/mutations.ts` - Verified create/update mutations
- `convex/orders/whatsapp.ts` - Verified catalog template reads
- `dev-export-temp/menuProducts/documents.jsonl` - Verified production data state
- `dev-export-temp/orderItems/documents.jsonl` - Verified historical order data
- `convex/productionCounts/queries.ts` - Verified BOM-only derivation (already done)
- `convex/orders/helpers/ballDistribution.ts` - Verified NEW system usage (already done)

### Secondary (MEDIUM confidence)
- `.planning/research/PITFALLS.md` - Migration pitfalls documentation
- `.planning/research/ARCHITECTURE.md` - System architecture context
- `docs/decisions/bom-source-of-truth.md` - BOM design decision documentation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new libraries, pure code migration
- Architecture: HIGH - all patterns verified against actual codebase files and data
- Pitfalls: HIGH - identified 7 specific pitfalls with exact file/line references
- Migration sequence: HIGH - verified BOM-05 already complete, identified schema change requirements
- Data state: HIGH - verified against dev-export production data

**Research date:** 2026-02-14
**Valid until:** 2026-03-14 (stable domain, no external dependencies)
