# Product Inventory Substitution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow triple products (Dubai Triple, Nutella Triple) to be fulfilled from single product inventory when direct triple stock is insufficient.

**Architecture:** Add `fulfillFromProductId` + `fulfillMultiplier` fields to `menuProducts` schema. Modify `fulfillFromInventory` mutation and `getStockForOrder` query to resolve substitution: check direct stock first, fall back to substitute stock for the shortfall. UI shows split sub-rows in availability panel and clear deduction breakdown in fulfillment summary.

**Tech Stack:** Convex (schema + mutations + queries), React 19, TypeScript, shadcn/ui, Vitest + convex-test

**Spec:** `docs/superpowers/specs/2026-04-10-product-inventory-substitution-design.md`

---

## Git Workflow

**Branch:** `feature/71.1-product-inventory-substitution`
**Checkpoints:** Commit after each task

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `convex/schema.ts` | Modify | Add 2 fields to `menuProducts` |
| `convex/menuProducts/mutations.ts` | Modify | Add substitution validation to `update` |
| `convex/productInventory/mutations.ts` | Modify | Substitution logic in `fulfillFromInventory` + `processGofoodSales` |
| `convex/productInventory/queries.ts` | Modify | Enriched availability in `getStockForOrder` |
| `convex/productInventory/substitution.ts` | Create | Pure helper: `resolveSubstitution()` shared by mutations + queries |
| `src/hooks/convex/useMenuProducts.ts` | Modify | Add `fulfillFromProductId`/`fulfillMultiplier` to update input |
| `src/components/menuProducts/ProductForm.tsx` | Modify | Add "Inventory Fulfillment" section |
| `src/components/inventory/InventoryAvailabilityPanel.tsx` | Modify | Split sub-rows for substitution |
| `src/components/inventory/FulfillFromInventoryButton.tsx` | Modify | Enhanced deduction summary toast |
| `tests/convex/productSubstitution.test.ts` | Create | Backend tests for substitution logic |

---

## Implementation Waves

### Wave 1: Backend [SEQUENTIAL]
| Task | Agent | Files |
|------|-------|-------|
| Task 1: Schema | convex-backend | `convex/schema.ts` |
| Task 2: Substitution helper | convex-backend | `convex/productInventory/substitution.ts` |
| Task 3: Backend tests | convex-backend | `tests/convex/productSubstitution.test.ts` |
| Task 4: Mutation validation | convex-backend | `convex/menuProducts/mutations.ts` |
| Task 5: fulfillFromInventory | convex-backend | `convex/productInventory/mutations.ts` |
| Task 6: getStockForOrder | convex-backend | `convex/productInventory/queries.ts` |
| Task 7: processGofoodSales | convex-backend | `convex/productInventory/mutations.ts` |

### Wave 2: Frontend [PARALLEL, after Wave 1]
| Task | Agent | Files |
|------|-------|-------|
| Task 8: Hook + ProductForm | react-ui-builder | `src/hooks/convex/useMenuProducts.ts`, `src/components/menuProducts/ProductForm.tsx` |
| Task 9: AvailabilityPanel | react-ui-builder | `src/components/inventory/InventoryAvailabilityPanel.tsx` |
| Task 10: FulfillmentButton summary | react-ui-builder | `src/components/inventory/FulfillFromInventoryButton.tsx` |

### Wave 3: Verification [SEQUENTIAL]
| Task | Agent |
|------|-------|
| Task 11: Type check + build | code-auditor |

---

## Task 1: Schema — Add substitution fields to menuProducts

**Files:**
- Modify: `convex/schema.ts:93-129` (menuProducts table definition)

- [ ] **Step 1: Add fulfillFromProductId and fulfillMultiplier fields**

In `convex/schema.ts`, inside the `menuProducts` table definition, add these two fields after the `cogsOverrideIdr` field (line 121):

```typescript
    // Phase 71.1: Product inventory substitution.
    // When set, fulfillFromInventory deducts from the source product's stock instead.
    // E.g., Dubai Triple -> fulfillFromProductId = Dubai Single, fulfillMultiplier = 3
    fulfillFromProductId: v.optional(v.id("menuProducts")),
    fulfillMultiplier: v.optional(v.number()),
```

- [ ] **Step 2: Verify type-check passes**

Run: `npx tsc --noEmit`
Expected: No errors related to the new fields.

- [ ] **Step 3: Commit**

```bash
git add convex/schema.ts
git commit -m "feat(71.1): add fulfillFromProductId and fulfillMultiplier to menuProducts schema"
```

---

## Task 2: Substitution helper — Pure function for resolving substitution

**Files:**
- Create: `convex/productInventory/substitution.ts`

- [ ] **Step 1: Create the substitution resolver**

Create `convex/productInventory/substitution.ts`:

```typescript
/**
 * Product inventory substitution helpers.
 *
 * Resolves how to fulfill a product from inventory when direct stock
 * is insufficient and a substitute product is configured.
 *
 * Phase 71.1
 */
import type { Doc } from "../_generated/dataModel";

export interface SubstitutionPlan {
  /** Units to deduct from the product's own stock */
  directUnits: number;
  /** Units to deduct from the substitute product's stock (in substitute units) */
  substituteUnits: number;
  /** Shortfall in product units that the substitute covers */
  substituteCoversProductUnits: number;
}

/**
 * Calculate how many units to take from direct stock vs substitute stock.
 *
 * Logic:
 * 1. Use direct stock first (up to what's available)
 * 2. For any shortfall, convert to substitute units via multiplier
 *
 * Returns null if total available (direct + substitute) is insufficient.
 */
export function resolveSubstitutionPlan(
  needed: number,
  directAvailable: number,
  substituteAvailable: number,
  multiplier: number,
): SubstitutionPlan | null {
  const directUsed = Math.min(needed, Math.max(0, directAvailable));
  const shortfall = needed - directUsed;

  if (shortfall <= 0) {
    return { directUnits: directUsed, substituteUnits: 0, substituteCoversProductUnits: 0 };
  }

  const substituteNeeded = shortfall * multiplier;
  if (substituteAvailable < substituteNeeded) {
    return null; // insufficient even with substitution
  }

  return {
    directUnits: directUsed,
    substituteUnits: substituteNeeded,
    substituteCoversProductUnits: shortfall,
  };
}

/**
 * Check whether a menuProduct has valid substitution config.
 */
export function hasSubstitution(
  product: Doc<"menuProducts">,
): product is Doc<"menuProducts"> & {
  fulfillFromProductId: NonNullable<Doc<"menuProducts">["fulfillFromProductId"]>;
  fulfillMultiplier: number;
} {
  return (
    product.fulfillFromProductId !== undefined &&
    product.fulfillMultiplier !== undefined &&
    product.fulfillMultiplier >= 2
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add convex/productInventory/substitution.ts
git commit -m "feat(71.1): add pure substitution resolution helper"
```

---

## Task 3: Backend tests — Substitution logic

**Files:**
- Create: `tests/convex/productSubstitution.test.ts`

- [ ] **Step 1: Write unit tests for the pure helper**

Create `tests/convex/productSubstitution.test.ts`:

```typescript
/**
 * Product Inventory Substitution tests
 *
 * Tests the substitution resolution logic and the integrated
 * fulfillFromInventory mutation with substitution.
 *
 * Phase 71.1
 */
import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import schema from "../../convex/schema";
import { api } from "../../convex/_generated/api";
import { resolveSubstitutionPlan } from "../../convex/productInventory/substitution";
import type { Id } from "../../convex/_generated/dataModel";

// ============================================
// Pure helper tests
// ============================================

describe("resolveSubstitutionPlan", () => {
  test("no shortfall — all from direct stock", () => {
    const plan = resolveSubstitutionPlan(3, 10, 50, 3);
    expect(plan).toEqual({
      directUnits: 3,
      substituteUnits: 0,
      substituteCoversProductUnits: 0,
    });
  });

  test("partial direct — remainder from substitute", () => {
    // Need 5 triples, have 2 direct, sub multiplier 3 → need 3*3=9 from singles
    const plan = resolveSubstitutionPlan(5, 2, 50, 3);
    expect(plan).toEqual({
      directUnits: 2,
      substituteUnits: 9,
      substituteCoversProductUnits: 3,
    });
  });

  test("no direct stock — all from substitute", () => {
    const plan = resolveSubstitutionPlan(3, 0, 50, 3);
    expect(plan).toEqual({
      directUnits: 0,
      substituteUnits: 9,
      substituteCoversProductUnits: 3,
    });
  });

  test("insufficient even with substitute — returns null", () => {
    // Need 5 triples, 0 direct, sub has 10 singles → need 15 but only 10
    const plan = resolveSubstitutionPlan(5, 0, 10, 3);
    expect(plan).toBeNull();
  });

  test("negative direct stock treated as 0", () => {
    const plan = resolveSubstitutionPlan(2, -5, 20, 3);
    expect(plan).toEqual({
      directUnits: 0,
      substituteUnits: 6,
      substituteCoversProductUnits: 2,
    });
  });

  test("multiplier of 2 (double product)", () => {
    const plan = resolveSubstitutionPlan(3, 1, 10, 2);
    expect(plan).toEqual({
      directUnits: 1,
      substituteUnits: 4,
      substituteCoversProductUnits: 2,
    });
  });

  test("exact substitute stock — no surplus", () => {
    // Need 2, 0 direct, 6 singles with multiplier 3 → exactly enough
    const plan = resolveSubstitutionPlan(2, 0, 6, 3);
    expect(plan).toEqual({
      directUnits: 0,
      substituteUnits: 6,
      substituteCoversProductUnits: 2,
    });
  });
});

// ============================================
// Integration tests (convex-test)
// ============================================

type TestContext = ReturnType<typeof convexTest>;

async function createTestUser(t: TestContext): Promise<{ userId: Id<"users">; sessionToken: string }> {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      name: "Test Admin",
      pin: "9999",
      role: "admin",
      isActive: true,
    });
    const sessionToken = "test-session-token";
    await ctx.db.insert("sessions", {
      userId,
      token: sessionToken,
      createdAt: Date.now(),
      expiresAt: Date.now() + 86400000,
      isActive: true,
    });
    return { userId, sessionToken };
  });
}

async function createMenuProduct(
  t: TestContext,
  overrides: { code?: string; name?: string; defaultPrice?: number } = {}
): Promise<Id<"menuProducts">> {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("menuProducts", {
      code: overrides.code ?? "TEST_SINGLE",
      name: overrides.name ?? "Test Single",
      grams: 45,
      defaultPrice: overrides.defaultPrice ?? 35000,
      isActive: true,
      unitCost: 12000,
      cachedProductionSummary: "1 Mid Ball",
    });
  });
}

async function createLocation(t: TestContext, name = "Office"): Promise<Id<"storageLocations">> {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("storageLocations", {
      name,
      locationType: "office",
      isDefault: true,
      isActive: true,
      createdBy: "test",
      createdAt: Date.now(),
    });
  });
}

async function setProductStock(
  t: TestContext,
  menuProductId: Id<"menuProducts">,
  locationId: Id<"storageLocations">,
  quantity: number
): Promise<void> {
  await t.run(async (ctx) => {
    const existing = await ctx.db
      .query("productInventory")
      .withIndex("by_product_location", (q) =>
        q.eq("menuProductId", menuProductId).eq("locationId", locationId)
      )
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { quantity, lastUpdated: Date.now() });
    } else {
      await ctx.db.insert("productInventory", {
        menuProductId,
        locationId,
        quantity,
        lastUpdated: Date.now(),
      });
    }
  });
}

async function configureSubstitution(
  t: TestContext,
  productId: Id<"menuProducts">,
  sourceId: Id<"menuProducts">,
  multiplier: number
): Promise<void> {
  await t.run(async (ctx) => {
    await ctx.db.patch(productId, {
      fulfillFromProductId: sourceId,
      fulfillMultiplier: multiplier,
    });
  });
}

async function createOrder(
  t: TestContext,
  menuProductId: Id<"menuProducts">,
  quantity: number,
  productName: string,
): Promise<Id<"orders">> {
  return await t.run(async (ctx) => {
    const orderId = await ctx.db.insert("orders", {
      orderNumber: "0410-001",
      status: "PaymentReceived",
      orderDate: Date.now(),
      customerName: "Test Customer",
      totalAmount: 0,
      finalTotal: 0,
      isPaid: true,
      createdBy: "test",
      isKitchenVisible: false,
    });
    await ctx.db.insert("orderItems", {
      orderId,
      menuProductId,
      productName,
      quantity,
      unitPrice: 35000,
      totalPrice: 35000 * quantity,
    });
    return orderId;
  });
}

describe("fulfillFromInventory with substitution", () => {
  test("all from direct stock — no substitution needed", async () => {
    const t = convexTest(schema);

    const { sessionToken } = await createTestUser(t);
    const single = await createMenuProduct(t, { code: "DUBAI_SINGLE", name: "Dubai Single" });
    const triple = await createMenuProduct(t, { code: "DUBAI_TRIPLE", name: "Dubai Triple", defaultPrice: 99000 });
    const locationId = await createLocation(t);

    await configureSubstitution(t, triple, single, 3);
    await setProductStock(t, triple, locationId, 5);
    await setProductStock(t, single, locationId, 50);

    const orderId = await createOrder(t, triple, 3, "Dubai Triple");

    const result = await t.mutation(
      api.productInventory.mutations.fulfillFromInventory,
      { token: sessionToken, orderId, locationId }
    );

    expect(result.success).toBe(true);

    // Verify triple stock deducted directly (no substitute used)
    const tripleStock = await t.run(async (ctx) => {
      const row = await ctx.db
        .query("productInventory")
        .withIndex("by_product_location", (q) =>
          q.eq("menuProductId", triple).eq("locationId", locationId)
        )
        .first();
      return row?.quantity ?? 0;
    });
    expect(tripleStock).toBe(2); // 5 - 3

    // Single stock unchanged
    const singleStock = await t.run(async (ctx) => {
      const row = await ctx.db
        .query("productInventory")
        .withIndex("by_product_location", (q) =>
          q.eq("menuProductId", single).eq("locationId", locationId)
        )
        .first();
      return row?.quantity ?? 0;
    });
    expect(singleStock).toBe(50);
  });

  test("mixed: partial direct + substitute for remainder", async () => {
    const t = convexTest(schema);

    const { sessionToken } = await createTestUser(t);
    const single = await createMenuProduct(t, { code: "DUBAI_SINGLE", name: "Dubai Single" });
    const triple = await createMenuProduct(t, { code: "DUBAI_TRIPLE", name: "Dubai Triple", defaultPrice: 99000 });
    const locationId = await createLocation(t);

    await configureSubstitution(t, triple, single, 3);
    await setProductStock(t, triple, locationId, 2);
    await setProductStock(t, single, locationId, 50);

    // Order 5 triples: 2 direct + 3 via substitute (9 singles)
    const orderId = await createOrder(t, triple, 5, "Dubai Triple");

    const result = await t.mutation(
      api.productInventory.mutations.fulfillFromInventory,
      { token: sessionToken, orderId, locationId }
    );

    expect(result.success).toBe(true);

    const tripleStock = await t.run(async (ctx) => {
      const row = await ctx.db
        .query("productInventory")
        .withIndex("by_product_location", (q) =>
          q.eq("menuProductId", triple).eq("locationId", locationId)
        )
        .first();
      return row?.quantity ?? 0;
    });
    expect(tripleStock).toBe(0); // 2 - 2

    const singleStock = await t.run(async (ctx) => {
      const row = await ctx.db
        .query("productInventory")
        .withIndex("by_product_location", (q) =>
          q.eq("menuProductId", single).eq("locationId", locationId)
        )
        .first();
      return row?.quantity ?? 0;
    });
    expect(singleStock).toBe(41); // 50 - 9
  });

  test("insufficient stock even with substitution — throws error", async () => {
    const t = convexTest(schema);

    const { sessionToken } = await createTestUser(t);
    const single = await createMenuProduct(t, { code: "DUBAI_SINGLE", name: "Dubai Single" });
    const triple = await createMenuProduct(t, { code: "DUBAI_TRIPLE", name: "Dubai Triple", defaultPrice: 99000 });
    const locationId = await createLocation(t);

    await configureSubstitution(t, triple, single, 3);
    await setProductStock(t, triple, locationId, 0);
    await setProductStock(t, single, locationId, 5); // Only 5 singles, need 9

    const orderId = await createOrder(t, triple, 3, "Dubai Triple");

    await expect(
      t.mutation(
        api.productInventory.mutations.fulfillFromInventory,
        { token: sessionToken, orderId, locationId }
      )
    ).rejects.toThrow();
  });

  test("no substitution configured — falls back to direct-only check", async () => {
    const t = convexTest(schema);

    const { sessionToken } = await createTestUser(t);
    const triple = await createMenuProduct(t, { code: "DUBAI_TRIPLE", name: "Dubai Triple", defaultPrice: 99000 });
    const locationId = await createLocation(t);

    // No substitution configured, 0 direct stock
    await setProductStock(t, triple, locationId, 0);
    const orderId = await createOrder(t, triple, 1, "Dubai Triple");

    await expect(
      t.mutation(
        api.productInventory.mutations.fulfillFromInventory,
        { token: sessionToken, orderId, locationId }
      )
    ).rejects.toThrow();
  });
});

describe("getStockForOrder with substitution", () => {
  test("returns substitution info when configured", async () => {
    const t = convexTest(schema);

    const single = await createMenuProduct(t, { code: "DUBAI_SINGLE", name: "Dubai Single" });
    const triple = await createMenuProduct(t, { code: "DUBAI_TRIPLE", name: "Dubai Triple", defaultPrice: 99000 });
    const locationId = await createLocation(t);

    await configureSubstitution(t, triple, single, 3);
    await setProductStock(t, triple, locationId, 1);
    await setProductStock(t, single, locationId, 30);

    const orderId = await createOrder(t, triple, 3, "Dubai Triple");

    const result = await t.query(
      api.productInventory.queries.getStockForOrder,
      { orderId, locationId }
    );

    expect(result).toHaveLength(1);
    const item = result[0];
    expect(item.quantityNeeded).toBe(3);
    expect(item.directAvailable).toBe(1);
    expect(item.substitution).toBeDefined();
    expect(item.substitution.sourceProductName).toBe("Dubai Single");
    expect(item.substitution.multiplier).toBe(3);
    expect(item.substitution.sourceNeeded).toBe(6); // shortfall 2 * multiplier 3
    expect(item.substitution.sourceAvailable).toBe(30);
    expect(item.isSufficient).toBe(true);
  });
});

describe("menuProducts update — substitution validation", () => {
  test("blocks self-reference", async () => {
    const t = convexTest(schema);

    const { sessionToken } = await createTestUser(t);
    const product = await createMenuProduct(t, { code: "SELF_REF", name: "Self Ref" });

    await expect(
      t.mutation(api.menuProducts.mutations.update, {
        token: sessionToken,
        id: product,
        fulfillFromProductId: product,
        fulfillMultiplier: 3,
      })
    ).rejects.toThrow(/cannot substitute from itself/i);
  });

  test("blocks chain — target already has substitution", async () => {
    const t = convexTest(schema);

    const { sessionToken } = await createTestUser(t);
    const a = await createMenuProduct(t, { code: "PROD_A", name: "Product A" });
    const b = await createMenuProduct(t, { code: "PROD_B", name: "Product B" });
    const c = await createMenuProduct(t, { code: "PROD_C", name: "Product C" });

    // B -> A (valid)
    await configureSubstitution(t, b, a, 3);

    // C -> B should fail (B already has a substitution)
    await expect(
      t.mutation(api.menuProducts.mutations.update, {
        token: sessionToken,
        id: c,
        fulfillFromProductId: b,
        fulfillMultiplier: 3,
      })
    ).rejects.toThrow(/chain/i);
  });

  test("blocks reverse chain — target is used as source by another product", async () => {
    const t = convexTest(schema);

    const { sessionToken } = await createTestUser(t);
    const single = await createMenuProduct(t, { code: "DUB_SINGLE", name: "Dubai Single" });
    const triple = await createMenuProduct(t, { code: "DUB_TRIPLE", name: "Dubai Triple" });
    const other = await createMenuProduct(t, { code: "OTHER", name: "Other Product" });

    // Triple -> Single (valid)
    await configureSubstitution(t, triple, single, 3);

    // Single -> Other should fail (Single is used as source by Triple)
    await expect(
      t.mutation(api.menuProducts.mutations.update, {
        token: sessionToken,
        id: single,
        fulfillFromProductId: other,
        fulfillMultiplier: 2,
      })
    ).rejects.toThrow(/substitution source/i);
  });

  test("blocks multiplier < 2", async () => {
    const t = convexTest(schema);

    const { sessionToken } = await createTestUser(t);
    const a = await createMenuProduct(t, { code: "PROD_A2", name: "Product A2" });
    const b = await createMenuProduct(t, { code: "PROD_B2", name: "Product B2" });

    await expect(
      t.mutation(api.menuProducts.mutations.update, {
        token: sessionToken,
        id: a,
        fulfillFromProductId: b,
        fulfillMultiplier: 1,
      })
    ).rejects.toThrow(/multiplier/i);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail (implementations don't exist yet)**

Run: `npx vitest tests/convex/productSubstitution.test.ts --run`
Expected: Pure helper tests pass (helper exists from Task 2). Integration tests fail (mutations not yet updated).

- [ ] **Step 3: Commit**

```bash
git add tests/convex/productSubstitution.test.ts
git commit -m "test(71.1): add substitution unit and integration tests"
```

---

## Task 4: Mutation validation — Block circular substitution chains

**Files:**
- Modify: `convex/menuProducts/mutations.ts:218-343` (update mutation)

- [ ] **Step 1: Add fulfillFromProductId and fulfillMultiplier to update args**

In `convex/menuProducts/mutations.ts`, add to the `update` mutation's `args` object (after `clearCogsOverride`):

```typescript
    // Phase 71.1: Inventory substitution config
    fulfillFromProductId: v.optional(v.id("menuProducts")),
    fulfillMultiplier: v.optional(v.number()),
    clearFulfillFrom: v.optional(v.boolean()),
```

- [ ] **Step 2: Add validation logic in the handler**

In the handler, after the COGS override handling block (after line ~284), add:

```typescript
    // Phase 71.1: Inventory substitution handling
    if (args.clearFulfillFrom) {
      patchData.fulfillFromProductId = undefined;
      patchData.fulfillMultiplier = undefined;
    } else if (args.fulfillFromProductId !== undefined) {
      // Validate: cannot reference self
      if (args.fulfillFromProductId === id) {
        throw new Error("Product cannot substitute from itself");
      }

      // Validate: multiplier required and >= 2
      if (args.fulfillMultiplier === undefined || args.fulfillMultiplier < 2 || !Number.isInteger(args.fulfillMultiplier)) {
        throw new Error("Substitution multiplier must be an integer >= 2");
      }

      // Validate: target exists and is active
      const sourceProduct = await ctx.db.get(args.fulfillFromProductId);
      if (!sourceProduct) {
        throw new Error("Substitution source product not found");
      }
      if (!sourceProduct.isActive) {
        throw new Error("Substitution source product must be active");
      }

      // Validate: no forward chains — target must not itself have fulfillFromProductId
      if (sourceProduct.fulfillFromProductId !== undefined) {
        throw new Error("Substitution source product already has its own substitution configured — chains are not allowed");
      }

      // Validate: no reverse chains — this product must not be used as a source by others
      const dependents = await ctx.db
        .query("menuProducts")
        .filter((q) => q.eq(q.field("fulfillFromProductId"), id))
        .collect();
      if (dependents.length > 0) {
        throw new Error(
          `This product is used as a substitution source by ${dependents[0].name} — remove that configuration first`
        );
      }

      patchData.fulfillFromProductId = args.fulfillFromProductId;
      patchData.fulfillMultiplier = args.fulfillMultiplier;
    }
```

- [ ] **Step 3: Update destructuring to exclude new args from spread**

Update the destructuring line (currently line ~251) to also extract the new fields:

```typescript
    const { id, token: _, components, productType: _pt, cogsOverrideIdr, clearCogsOverride, fulfillFromProductId: _ffp, fulfillMultiplier: _fm, clearFulfillFrom: _cff, ...updates } = args;
```

- [ ] **Step 4: Verify type-check passes**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add convex/menuProducts/mutations.ts
git commit -m "feat(71.1): add substitution validation to menuProducts update mutation"
```

---

## Task 5: fulfillFromInventory — Add substitution resolution

**Files:**
- Modify: `convex/productInventory/mutations.ts:210-368` (fulfillFromInventory mutation)

- [ ] **Step 1: Add import for substitution helpers**

At the top of `convex/productInventory/mutations.ts`, add:

```typescript
import { resolveSubstitutionPlan, hasSubstitution } from "./substitution";
```

- [ ] **Step 2: Replace the availability check section (lines ~258-291)**

Replace the section from `// 3. Check availability for ALL items first` through the `if (shortages.length > 0)` block with:

```typescript
    // 3. Check availability for ALL items first (no partial drawdown)
    //    Supports substitution: if a product has fulfillFromProductId,
    //    use direct stock first, then fall back to substitute stock.
    const shortages: Array<{ productName: string; needed: number; available: number }> = [];
    const productNameMap = new Map<string, string>();

    // Pre-build deduction plans for each order item
    interface DeductionPlan {
      menuProductId: typeof orderItems[0]["menuProductId"];
      directDeduct: number;
      substituteProductId?: typeof orderItems[0]["menuProductId"];
      substituteDeduct: number;
      substituteCoversProductUnits: number;
      productName: string;
      substituteProductName?: string;
    }
    const deductionPlans: DeductionPlan[] = [];

    for (const item of orderItems) {
      const menuProduct = menuProductCache.get(String(item.menuProductId!));
      const pName = menuProduct?.name ?? item.productName;
      productNameMap.set(String(item.menuProductId!), pName);

      // Get direct stock
      const stockRow = await ctx.db
        .query("productInventory")
        .withIndex("by_product_location", (q) =>
          q.eq("menuProductId", item.menuProductId!).eq("locationId", args.locationId)
        )
        .first();
      const directAvailable = stockRow?.quantity ?? 0;

      if (menuProduct && hasSubstitution(menuProduct)) {
        // Substitution configured — resolve plan
        const sourceProduct = await ctx.db.get(menuProduct.fulfillFromProductId);
        const sourceStock = await ctx.db
          .query("productInventory")
          .withIndex("by_product_location", (q) =>
            q.eq("menuProductId", menuProduct.fulfillFromProductId).eq("locationId", args.locationId)
          )
          .first();
        const substituteAvailable = sourceStock?.quantity ?? 0;

        const plan = resolveSubstitutionPlan(
          item.quantity,
          directAvailable,
          substituteAvailable,
          menuProduct.fulfillMultiplier,
        );

        if (plan === null) {
          // Not enough even with substitution
          const totalEffective = Math.max(0, directAvailable) +
            Math.floor(substituteAvailable / menuProduct.fulfillMultiplier);
          shortages.push({
            productName: pName,
            needed: item.quantity,
            available: totalEffective,
          });
        } else {
          deductionPlans.push({
            menuProductId: item.menuProductId,
            directDeduct: plan.directUnits,
            substituteProductId: menuProduct.fulfillFromProductId,
            substituteDeduct: plan.substituteUnits,
            substituteCoversProductUnits: plan.substituteCoversProductUnits,
            productName: pName,
            substituteProductName: sourceProduct?.name ?? "Unknown",
          });
        }
      } else {
        // No substitution — direct check only (existing behavior)
        if (directAvailable < item.quantity) {
          shortages.push({
            productName: pName,
            needed: item.quantity,
            available: directAvailable,
          });
        } else {
          deductionPlans.push({
            menuProductId: item.menuProductId,
            directDeduct: item.quantity,
            substituteDeduct: 0,
            substituteCoversProductUnits: 0,
            productName: pName,
          });
        }
      }
    }

    if (shortages.length > 0) {
      throw new ConvexError({
        type: "insufficient_stock",
        shortages,
      });
    }
```

- [ ] **Step 3: Replace the deduction section (lines ~293-345)**

Replace from `// 4. Deduct all items atomically` through the end of the deduction loop with:

```typescript
    // 4. Deduct all items atomically using pre-computed plans
    const now = Date.now();
    let itemsFulfilled = 0;
    const deductions: Array<{
      productName: string;
      used: number;
      remaining: number;
      isSubstitution?: boolean;
      substituteProductName?: string;
      substituteUsed?: number;
    }> = [];

    for (const plan of deductionPlans) {
      // Deduct direct stock (if any)
      if (plan.directDeduct > 0) {
        const stockRow = await ctx.db
          .query("productInventory")
          .withIndex("by_product_location", (q) =>
            q.eq("menuProductId", plan.menuProductId!).eq("locationId", args.locationId)
          )
          .first();

        const previousQuantity = stockRow?.quantity ?? 0;
        const newQuantity = previousQuantity - plan.directDeduct;

        if (stockRow) {
          await ctx.db.patch(stockRow._id, { quantity: newQuantity, lastUpdated: now });
        } else {
          await ctx.db.insert("productInventory", {
            menuProductId: plan.menuProductId!,
            locationId: args.locationId,
            quantity: newQuantity,
            lastUpdated: now,
          });
        }

        await ctx.db.insert("productInventoryTransactions", {
          menuProductId: plan.menuProductId!,
          locationId: args.locationId,
          transactionType: "drawdown",
          quantity: -plan.directDeduct,
          previousQuantity,
          newQuantity,
          orderId: args.orderId,
          performedBy: user.name,
          createdAt: now,
        });

        deductions.push({
          productName: plan.productName,
          used: plan.directDeduct,
          remaining: newQuantity,
        });
      }

      // Deduct substitute stock (if any)
      if (plan.substituteDeduct > 0 && plan.substituteProductId) {
        const subStockRow = await ctx.db
          .query("productInventory")
          .withIndex("by_product_location", (q) =>
            q.eq("menuProductId", plan.substituteProductId!).eq("locationId", args.locationId)
          )
          .first();

        const prevSubQty = subStockRow?.quantity ?? 0;
        const newSubQty = prevSubQty - plan.substituteDeduct;

        if (subStockRow) {
          await ctx.db.patch(subStockRow._id, { quantity: newSubQty, lastUpdated: now });
        } else {
          await ctx.db.insert("productInventory", {
            menuProductId: plan.substituteProductId,
            locationId: args.locationId,
            quantity: newSubQty,
            lastUpdated: now,
          });
        }

        await ctx.db.insert("productInventoryTransactions", {
          menuProductId: plan.substituteProductId,
          locationId: args.locationId,
          transactionType: "drawdown",
          quantity: -plan.substituteDeduct,
          previousQuantity: prevSubQty,
          newQuantity: newSubQty,
          orderId: args.orderId,
          reason: `Substitution for ${plan.substituteCoversProductUnits}x ${plan.productName} (Order ${order.orderNumber})`,
          performedBy: user.name,
          createdAt: now,
        });

        deductions.push({
          productName: plan.productName,
          used: plan.substituteCoversProductUnits,
          remaining: newSubQty,
          isSubstitution: true,
          substituteProductName: plan.substituteProductName,
          substituteUsed: plan.substituteDeduct,
        });
      }

      itemsFulfilled++;
    }
```

The rest of the mutation (status advancement, logging, return) stays unchanged.

- [ ] **Step 4: Run tests**

Run: `npx vitest tests/convex/productSubstitution.test.ts --run`
Expected: Integration tests for fulfillFromInventory now pass.

- [ ] **Step 5: Commit**

```bash
git add convex/productInventory/mutations.ts
git commit -m "feat(71.1): add substitution resolution to fulfillFromInventory mutation"
```

---

## Task 6: getStockForOrder — Enriched availability data

**Files:**
- Modify: `convex/productInventory/queries.ts:310-363` (getStockForOrder query)

- [ ] **Step 1: Add import**

At the top of `convex/productInventory/queries.ts`, add:

```typescript
import { resolveSubstitutionPlan, hasSubstitution } from "./substitution";
```

- [ ] **Step 2: Replace the availability loop**

Replace the `for (const item of itemsWithProduct)` loop (lines ~332-358) with:

```typescript
    const availability = [];
    for (const item of itemsWithProduct) {
      const menuProduct = await ctx.db.get(item.menuProductId!);

      // Skip packaging-type products
      if (menuProduct?.productType === "packaging") continue;

      const stockRow = await ctx.db
        .query("productInventory")
        .withIndex("by_product_location", (q) =>
          q.eq("menuProductId", item.menuProductId!).eq("locationId", args.locationId)
        )
        .first();
      const directAvailable = stockRow?.quantity ?? 0;

      if (menuProduct && hasSubstitution(menuProduct)) {
        // Product has substitution configured
        const sourceProduct = await ctx.db.get(menuProduct.fulfillFromProductId);
        const sourceStock = await ctx.db
          .query("productInventory")
          .withIndex("by_product_location", (q) =>
            q.eq("menuProductId", menuProduct.fulfillFromProductId).eq("locationId", args.locationId)
          )
          .first();
        const substituteAvailable = sourceStock?.quantity ?? 0;

        const plan = resolveSubstitutionPlan(
          item.quantity,
          directAvailable,
          substituteAvailable,
          menuProduct.fulfillMultiplier,
        );

        const shortfall = Math.max(0, item.quantity - Math.max(0, directAvailable));
        const sourceNeeded = shortfall * menuProduct.fulfillMultiplier;

        availability.push({
          orderItemId: item._id,
          menuProductId: item.menuProductId!,
          productName: menuProduct.name ?? item.productName,
          quantityNeeded: item.quantity,
          quantityAvailable: directAvailable, // backward compat
          directAvailable,
          directSufficient: directAvailable >= item.quantity,
          substitution: {
            sourceProductId: menuProduct.fulfillFromProductId,
            sourceProductName: sourceProduct?.name ?? "Unknown",
            multiplier: menuProduct.fulfillMultiplier,
            sourceNeeded,
            sourceAvailable: substituteAvailable,
            sourceSufficient: substituteAvailable >= sourceNeeded,
          },
          isSufficient: plan !== null,
        });
      } else {
        // No substitution — existing behavior
        availability.push({
          orderItemId: item._id,
          menuProductId: item.menuProductId!,
          productName: menuProduct?.name ?? item.productName,
          quantityNeeded: item.quantity,
          quantityAvailable: directAvailable,
          directAvailable,
          directSufficient: directAvailable >= item.quantity,
          isSufficient: directAvailable >= item.quantity,
        });
      }
    }
```

- [ ] **Step 3: Run tests**

Run: `npx vitest tests/convex/productSubstitution.test.ts --run`
Expected: getStockForOrder tests pass.

- [ ] **Step 4: Commit**

```bash
git add convex/productInventory/queries.ts
git commit -m "feat(71.1): add substitution info to getStockForOrder query"
```

---

## Task 7: processGofoodSales — Substitution for GoFood auto-deduction

**Files:**
- Modify: `convex/productInventory/mutations.ts:635-745` (processGofoodSales)

- [ ] **Step 1: Add substitution resolution to the deduction loop**

Inside `processGofoodSales`, after the `const previousQuantity = existing?.quantity ?? 0;` line (line ~705), wrap the deduction logic with substitution awareness:

```typescript
      // Check if this product has substitution configured
      const productDoc = await ctx.db.get(item.menuProductId);

      if (productDoc && hasSubstitution(productDoc)) {
        // Resolve substitution plan using shared helper
        const subExistingCheck = await ctx.db
          .query("productInventory")
          .withIndex("by_product_location", (q) =>
            q.eq("menuProductId", productDoc.fulfillFromProductId).eq("locationId", locationId)
          )
          .first();
        const subAvail = subExistingCheck?.quantity ?? 0;

        // GoFood: always proceed even if insufficient (allow negative)
        const plan = resolveSubstitutionPlan(item.quantity, previousQuantity, subAvail, productDoc.fulfillMultiplier);
        const directUsed = plan ? plan.directUnits : Math.min(item.quantity, Math.max(0, previousQuantity));
        const shortfall = item.quantity - directUsed;

        // Deduct direct (even if goes negative — GoFood never blocks)
        if (directUsed > 0 || shortfall === 0) {
          const newQuantity = previousQuantity - directUsed;
          if (existing) {
            await ctx.db.patch(existing._id, { quantity: newQuantity, lastUpdated: now });
          } else {
            await ctx.db.insert("productInventory", {
              menuProductId: item.menuProductId,
              locationId,
              quantity: newQuantity,
              lastUpdated: now,
            });
          }

          await ctx.db.insert("productInventoryTransactions", {
            menuProductId: item.menuProductId,
            locationId,
            transactionType: "gofood_sale",
            quantity: -directUsed,
            previousQuantity,
            newQuantity,
            gofoodOrderRef: item.gofoodOrderRef,
            performedBy: "system:gobiz_sync",
            createdAt: now,
          });
        }

        // Deduct substitute for shortfall (GoFood: allow negative)
        if (shortfall > 0) {
          const subUnits = shortfall * productDoc.fulfillMultiplier;
          const subExisting = await ctx.db
            .query("productInventory")
            .withIndex("by_product_location", (q) =>
              q.eq("menuProductId", productDoc.fulfillFromProductId).eq("locationId", locationId)
            )
            .first();

          const subPrev = subExisting?.quantity ?? 0;
          const subNew = subPrev - subUnits;

          if (subExisting) {
            await ctx.db.patch(subExisting._id, { quantity: subNew, lastUpdated: now });
          } else {
            await ctx.db.insert("productInventory", {
              menuProductId: productDoc.fulfillFromProductId,
              locationId,
              quantity: subNew,
              lastUpdated: now,
            });
          }

          await ctx.db.insert("productInventoryTransactions", {
            menuProductId: productDoc.fulfillFromProductId,
            locationId,
            transactionType: "gofood_sale",
            quantity: -subUnits,
            previousQuantity: subPrev,
            newQuantity: subNew,
            gofoodOrderRef: item.gofoodOrderRef,
            reason: `Substitution for ${shortfall}x ${productDoc.name}`,
            performedBy: "system:gobiz_sync",
            createdAt: now,
          });
        }

        processed++;

        // Low stock check on direct product
        if (previousQuantity > globalThreshold && (previousQuantity - directUsed) <= globalThreshold) {
          lowStockAlerts++;
        }

        // Low stock check on substitute product (only if shortfall consumed from it)
        if (shortfall > 0) {
          const subPrevQty = subExisting?.quantity ?? 0;
          const subNewQty = subPrevQty - (shortfall * productDoc.fulfillMultiplier);
          if (subPrevQty > globalThreshold && subNewQty <= globalThreshold) {
            lowStockAlerts++;
          }
        }
        continue; // Skip default deduction below
      }
```

Put this BEFORE the existing deduction block (lines ~706-739). Add `continue;` at the end so non-substitution products fall through to the existing logic.

- [ ] **Step 2: Run type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add convex/productInventory/mutations.ts
git commit -m "feat(71.1): add substitution to processGofoodSales"
```

---

## Task 8: Hook + ProductForm — Substitution config UI

**Files:**
- Modify: `src/hooks/convex/useMenuProducts.ts:31-46` (MenuProductUpdateInput)
- Modify: `src/components/menuProducts/ProductForm.tsx`

- [ ] **Step 1: Update MenuProductUpdateInput type**

In `src/hooks/convex/useMenuProducts.ts`:

**Step 1a:** Add to `MenuProductUpdateInput` (after `clearCogsOverride`):

```typescript
  // Phase 71.1: Inventory substitution
  fulfillFromProductId?: string;
  fulfillMultiplier?: number;
  clearFulfillFrom?: boolean;
```

**Step 1b:** Add to the `PosProduct` interface (after `cogsOverrideIdr`):

```typescript
  fulfillFromProductId?: string;
  fulfillMultiplier?: number;
```

**Step 1c:** Add to the `AvailableProduct` interface (after `cogsOverrideIdr`):

```typescript
  fulfillFromProductId?: string;
  fulfillMultiplier?: number;
```

**Step 1d:** Add these fields to both `usePosProducts` and `useAvailableProducts` transform maps:

In `usePosProducts` (inside the `.map` callback), add:
```typescript
    fulfillFromProductId: p.fulfillFromProductId as string | undefined,
    fulfillMultiplier: p.fulfillMultiplier,
```

In `useAvailableProducts` (inside the `.map` callback), add:
```typescript
    fulfillFromProductId: p.fulfillFromProductId as string | undefined,
    fulfillMultiplier: p.fulfillMultiplier,
```

- [ ] **Step 2: Add substitution state to ProductForm**

In `src/components/menuProducts/ProductForm.tsx`, add imports at the top:

```typescript
import { ArrowRightLeft } from 'lucide-react';
```

Also add `useAvailableProducts` to the existing `@/hooks/convex` import:

```typescript
import {
  useCreateMenuProduct,
  useUpdateMenuProduct,
  useAssignToSlot,
  useAssignToPackagingSlot,
  usePosProducts,
  usePackagingPosProducts,
  useMenuProducts,
  useMenuProductComponents,
  useComponentsByCategory,
  useAvailableProducts,  // ADD THIS
  type PosProduct,
  type AvailableProduct,
} from '@/hooks/convex';
```

And add the hook call inside the component (after existing hook calls):

```typescript
  const { data: availableProducts } = useAvailableProducts();
```

Add state variables after the existing form state (after line ~111):

```typescript
  // Phase 71.1: Inventory substitution
  const [fulfillFromId, setFulfillFromId] = useState<string>('none');
  const [fulfillMultiplier, setFulfillMultiplier] = useState<string>('');
```

- [ ] **Step 3: Load existing substitution config on edit**

In the `useEffect` that initializes form on product edit (inside the `if (product && !loadingComponents)` block), add after the component initialization:

```typescript
      // Phase 71.1: Load substitution config
      if ('fulfillFromProductId' in product && product.fulfillFromProductId) {
        setFulfillFromId(product.fulfillFromProductId as string);
        setFulfillMultiplier(
          'fulfillMultiplier' in product && product.fulfillMultiplier
            ? product.fulfillMultiplier.toString()
            : ''
        );
      } else {
        setFulfillFromId('none');
        setFulfillMultiplier('');
      }
```

Also add to `resetForm`:

```typescript
    setFulfillFromId('none');
    setFulfillMultiplier('');
```

- [ ] **Step 4: Build the eligible products list**

Add a `useMemo` after the existing `calculatedValues` memo:

```typescript
  // Phase 71.1: Products eligible as substitution sources
  // Use posProducts + availableProducts (which carry _id as string) for correct Convex IDs
  const eligibleSubstituteSources = useMemo(() => {
    const allRaw = [
      ...(posProducts ?? []),
      ...(availableProducts ?? []),
    ];
    return allRaw.filter((p) => {
      // Exclude self
      if (product && p._id === product._id) return false;
      // Exclude products that already have substitution configured (no chains)
      if ('fulfillFromProductId' in p && p.fulfillFromProductId) return false;
      // Only food products
      if ('productType' in p && p.productType === 'packaging') return false;
      return true;
    });
  }, [posProducts, availableProducts, product]);
```

- [ ] **Step 5: Add UI section before POS Slot**

In the JSX, before the `{/* POS Slot */}` section (before line ~630), add:

```tsx
              {/* Phase 71.1: Inventory Fulfillment Substitution */}
              {productType === 'food' && (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
                      <Label className="text-sm font-medium">Inventory Fulfillment</Label>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      When this product is ordered, inventory can be drawn from another product instead.
                      E.g., 1 Triple = 3 Singles.
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="fulfillFrom" className="text-xs">Fulfill from</Label>
                        <Select
                          value={fulfillFromId}
                          onValueChange={(val) => {
                            setFulfillFromId(val);
                            if (val === 'none') setFulfillMultiplier('');
                            else if (!fulfillMultiplier) setFulfillMultiplier('3');
                          }}
                        >
                          <SelectTrigger id="fulfillFrom" className="h-9">
                            <SelectValue placeholder="None" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            {eligibleSubstituteSources.map((p) => (
                              <SelectItem key={p._id} value={p._id}>
                                {p.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="fulfillMultiplier" className="text-xs">Units per product</Label>
                        <Input
                          id="fulfillMultiplier"
                          type="number"
                          min={2}
                          step={1}
                          value={fulfillMultiplier}
                          onChange={(e) => setFulfillMultiplier(e.target.value)}
                          placeholder="e.g., 3"
                          disabled={fulfillFromId === 'none'}
                          className="h-9"
                        />
                      </div>
                    </div>
                    {fulfillFromId !== 'none' && fulfillMultiplier && (
                      <div className="rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 px-3 py-2">
                        <p className="text-xs text-blue-700 dark:text-blue-400">
                          1 {name || 'this product'} will draw {fulfillMultiplier}x{' '}
                          {eligibleSubstituteSources.find((p) => p._id === fulfillFromId)?.name ?? 'selected product'}{' '}
                          from inventory when direct stock is insufficient.
                        </p>
                      </div>
                    )}
                  </div>
                </>
              )}
```

- [ ] **Step 6: Include substitution in handleSubmit**

In `handleSubmit`, update the `productData` object to include substitution fields when editing:

```typescript
      if (isEditing) {
        const updateData: Record<string, unknown> = { ...productData };

        // Phase 71.1: Substitution config
        if (fulfillFromId === 'none') {
          // Clear substitution if it was previously set
          if (product && 'fulfillFromProductId' in product && product.fulfillFromProductId) {
            updateData.clearFulfillFrom = true;
          }
        } else {
          updateData.fulfillFromProductId = fulfillFromId;
          updateData.fulfillMultiplier = parseInt(fulfillMultiplier) || 3;
        }

        await updateMutation.mutateAsync({
          id: product._id as Id<"menuProducts">,
          updates: updateData as MenuProductUpdateInput,
        });
```

Note: For the existing `updateMutation.mutateAsync` call in `handleSubmit`, replace the simple call with the enhanced one above. The `else` branch (creating new products) doesn't need substitution — it's configured after creation.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/convex/useMenuProducts.ts src/components/menuProducts/ProductForm.tsx
git commit -m "feat(71.1): add inventory substitution config to ProductForm"
```

---

## Task 9: InventoryAvailabilityPanel — Split sub-rows

**Files:**
- Modify: `src/components/inventory/InventoryAvailabilityPanel.tsx`

- [ ] **Step 1: Replace the table body with substitution-aware rendering**

Replace the entire `<tbody>` section (lines ~81-104) with:

```tsx
          <tbody>
            {availability.map((item) => {
              const hasSub = 'substitution' in item && item.substitution;

              if (!hasSub) {
                // Standard row (no substitution)
                return (
                  <tr
                    key={item.orderItemId}
                    className={item.isSufficient ? '' : 'bg-red-50 dark:bg-red-950/30'}
                  >
                    <td className="px-3 py-2">{item.productName}</td>
                    <td className="px-3 py-2 text-center">{item.quantityNeeded}</td>
                    <td className="px-3 py-2 text-center">{item.quantityAvailable}</td>
                    <td className="px-3 py-2 text-center">
                      {item.isSufficient ? (
                        <span className="inline-flex items-center gap-1 text-green-700 dark:text-green-400 text-xs font-medium">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          OK
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-red-700 dark:text-red-400 text-xs font-medium">
                          <XCircle className="h-3.5 w-3.5" />
                          Short {item.quantityNeeded - item.quantityAvailable}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              }

              // Substitution rows
              const sub = item.substitution as {
                sourceProductName: string;
                multiplier: number;
                sourceNeeded: number;
                sourceAvailable: number;
                sourceSufficient: boolean;
              };
              const directAvail = (item as any).directAvailable ?? item.quantityAvailable;
              const directSufficient = (item as any).directSufficient ?? false;
              const shortfall = Math.max(0, item.quantityNeeded - Math.max(0, directAvail));

              return (
                <tr key={item.orderItemId} className="group">
                  {/* Product header row */}
                  <td colSpan={4} className="px-3 pt-2 pb-0">
                    <div className="font-medium text-sm">{item.productName}</div>
                    <table className="w-full text-xs mt-1 mb-2">
                      <tbody>
                        {/* Direct stock sub-row */}
                        <tr className={directSufficient ? '' : shortfall > 0 ? 'text-amber-700 dark:text-amber-400' : ''}>
                          <td className="py-0.5 pl-4 text-muted-foreground">Direct stock</td>
                          <td className="py-0.5 text-center w-20">{item.quantityNeeded}</td>
                          <td className="py-0.5 text-center w-24">{Math.max(0, directAvail)}</td>
                          <td className="py-0.5 text-center w-28">
                            {directSufficient ? (
                              <span className="inline-flex items-center gap-1 text-green-700 dark:text-green-400">
                                <CheckCircle2 className="h-3 w-3" />
                                OK
                              </span>
                            ) : (
                              <span className="text-amber-700 dark:text-amber-400">
                                Short {shortfall}
                              </span>
                            )}
                          </td>
                        </tr>
                        {/* Substitute sub-row (only if shortfall) */}
                        {shortfall > 0 && (
                          <tr>
                            <td className="py-0.5 pl-4 text-muted-foreground">
                              <span className="inline-flex items-center gap-1">
                                <span className="text-muted-foreground/50">└</span>
                                via {sub.multiplier}x {sub.sourceProductName}
                              </span>
                            </td>
                            <td className="py-0.5 text-center">{sub.sourceNeeded}</td>
                            <td className="py-0.5 text-center">{sub.sourceAvailable}</td>
                            <td className="py-0.5 text-center">
                              {sub.sourceSufficient ? (
                                <span className="inline-flex items-center gap-1 text-green-700 dark:text-green-400">
                                  <CheckCircle2 className="h-3 w-3" />
                                  OK
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-red-700 dark:text-red-400">
                                  <XCircle className="h-3 w-3" />
                                  Short {sub.sourceNeeded - sub.sourceAvailable}
                                </span>
                              )}
                            </td>
                          </tr>
                        )}
                        {/* Overall verdict */}
                        <tr className="border-t border-dashed">
                          <td className="py-0.5 pl-4 font-medium" colSpan={3}>Overall</td>
                          <td className="py-0.5 text-center">
                            {item.isSufficient ? (
                              <span className="inline-flex items-center gap-1 text-green-700 dark:text-green-400 font-medium">
                                <CheckCircle2 className="h-3 w-3" />
                                OK
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-red-700 dark:text-red-400 font-medium">
                                <XCircle className="h-3 w-3" />
                                Short
                              </span>
                            )}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </td>
                </tr>
              );
            })}
          </tbody>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/inventory/InventoryAvailabilityPanel.tsx
git commit -m "feat(71.1): show split sub-rows for substitution in availability panel"
```

---

## Task 10: FulfillFromInventoryButton — Enhanced deduction summary

**Files:**
- Modify: `src/components/inventory/FulfillFromInventoryButton.tsx:122-134`

- [ ] **Step 1: Update the success toast to show substitution details**

Replace the success handler in `handleConfirm` (lines ~122-134):

```typescript
      if (result?.deductions && result.deductions.length > 0) {
        const lines = result.deductions.map(
          (d: {
            productName: string;
            used: number;
            remaining: number;
            isSubstitution?: boolean;
            substituteProductName?: string;
            substituteUsed?: number;
          }) => {
            if (d.isSubstitution && d.substituteProductName) {
              return `${d.productName} x${d.used} (via ${d.substituteUsed}x ${d.substituteProductName}) → ${d.remaining} remaining`;
            }
            return `${d.productName} x${d.used} (direct) → ${d.remaining} remaining`;
          }
        );
        toast.success('Order fulfilled from inventory!', {
          description: lines.join('\n'),
          duration: 6000,
        });
      } else {
        toast.success('Order fulfilled from inventory! Status: Awaiting Delivery');
      }
```

- [ ] **Step 2: Commit**

```bash
git add src/components/inventory/FulfillFromInventoryButton.tsx
git commit -m "feat(71.1): show substitution details in fulfillment success toast"
```

---

## Task 11: Verification — Type check + build

- [ ] **Step 1: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 2: Run full test suite**

Run: `npx vitest --run`
Expected: All tests pass including new substitution tests.

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 4: Commit any fixes if needed, then final commit**

```bash
git add -A
git commit -m "chore(71.1): verify build and type check pass"
```

---

## Documentation Updates

- [ ] `docs/CHANGELOG.md` — Add Phase 71.1 entry
- [ ] `docs/SCHEMA.md` — Document new `fulfillFromProductId`/`fulfillMultiplier` fields on menuProducts
- [ ] `CLAUDE.md` — Add substitution pattern note to "Key Business Rules"

## Success Criteria

- [ ] `npm run type-check` passes
- [ ] `npm run build` succeeds
- [ ] `npx vitest --run` passes (all existing + new tests)
- [ ] Staff can fulfill an order containing Dubai Triple when only Dubai Singles are in stock
- [ ] Availability panel shows split sub-rows with direct vs substitution breakdown
- [ ] Fulfillment summary toast shows exactly what was deducted and from where
- [ ] Direct triple stock is consumed first before falling back to singles
- [ ] Circular substitution chains are blocked at save time
