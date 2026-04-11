# Phase 78: Product Inventory Substitution - Research

**Researched:** 2026-04-11
**Domain:** Convex backend mutations/queries + React frontend (inventory drawdown flow)
**Confidence:** HIGH

## Summary

Phase 78 adds product inventory substitution -- allowing triple products (Dubai Triple, Nutella Triple) to be fulfilled from single product stock when direct triple stock is insufficient. This is a focused, well-scoped feature touching 3 backend files, 1 new helper, 4 frontend files, and 1 new test file. The design spec, implementation plan, and staff review already exist from the original 71.1 planning.

The pre-existing implementation plan (1692 lines in `docs/superpowers/plans/2026-04-10-product-inventory-substitution.md`) is comprehensive with inline code blocks for every task. However, **critical line number drift and test schema mismatches** exist since the plan was written against the codebase state at Phase 70.1, and multiple phases may have modified files since. This research documents the ACTUAL current state of all affected files.

**Primary recommendation:** The pre-existing plans are high quality and should be used as-is, but the planner MUST update: (1) YAML frontmatter from "71.1" to "78", (2) the test `createOrder` helper to match current schema required fields, and (3) line number references to reflect current file state.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Schema: Add `fulfillFromProductId: v.optional(v.id("menuProducts"))` and `fulfillMultiplier: v.optional(v.number())` to menuProducts
- Both fields optional, no index needed (low cardinality, queried rarely)
- Direct triple stock consumed FIRST, then fall back to singles for remainder
- `resolveSubstitutionPlan()` pure helper shared by mutations + queries
- Transaction logging: one transaction per source product
- GoFood auto-deduction: same substitution, negative stock still allowed
- Both fields must be set together or both omitted
- `fulfillMultiplier` must be integer >= 2
- Cannot reference self
- No forward chains: target must not itself have fulfillFromProductId
- No reverse chains: product used as source by another cannot get its own fulfillFromProductId
- Target must be active
- UI: Collapsible "Inventory Fulfillment" section on food products only
- UI: "Fulfill from" dropdown + "Units per product" number input
- UI: InventoryAvailabilityPanel split sub-rows for substitution products
- UI: FulfillFromInventoryButton success toast shows per-source deduction breakdown (duration: 6000ms)
- Flows NOT affected: addStock, adjustStock, transferStock, bulkStockCount, packaging BOM, kitchen production, order creation/pricing

### Claude's Discretion
- Internal structure of substitution.ts helper
- Exact styling of sub-rows (follow existing table patterns)
- Error message wording for validation failures

### Deferred Ideas (OUT OF SCOPE)
- Multi-level substitution chains (explicitly blocked by design)
- Auto-redirect addStock from triple to singles
- Concurrent deduction from same substitute pool across multiple order items
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SUB-01 | Substitution config: `fulfillFromProductId` + `fulfillMultiplier` on menuProducts with validation | Schema change verified at current line 172 (menuProducts table ends at line 129 with closing index). New fields go after `cogsOverrideIdr` (line 121). Update mutation at line 218 confirmed. |
| SUB-02 | Fulfillment logic: direct-first, substitute-fallback in fulfillFromInventory + processGofoodSales | `fulfillFromInventory` at lines 210-368, `processGofoodSales` at lines 635-745 verified. Both need substitution injection points documented. |
| SUB-03 | Availability UI: split sub-rows in InventoryAvailabilityPanel | Component at 123 lines, simple table structure. `getStockForOrder` at lines 310-363 needs enriched return. |
| SUB-04 | GoFood auto-deduction: processGofoodSales resolves substitution | Confirmed at lines 635-745. Uses `hasSubstitution` import from new helper. Negative stock allowed (no shortage blocking). |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Git:** NO direct commits to main. Feature branch required (`feature/78-product-inventory-substitution`).
- **Build gate:** `npm run build` MUST pass before merge.
- **Planning:** Every plan MUST include Git Workflow, Implementation Waves, Documentation Updates, Success Criteria sections.
- **Branch:** Always `git switch main && git pull` before creating feature branch.
- **Convex IDs:** Typed strings `Id<"tableName">`, not numbers.
- **Auth:** Protected mutations require `token: v.string()` arg.
- **Post-merge:** Update `docs/CHANGELOG.md` (always), `docs/SCHEMA.md` (schema changed).

## Standard Stack

### Core (no new dependencies)
| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| Convex | ^1.31.7 | Backend + real-time DB | Schema, mutations, queries |
| React | ^19.2.0 | UI framework | ProductForm, InventoryAvailabilityPanel |
| TypeScript | ~5.9 | Type safety | All files |
| Vitest + convex-test | ^4.0.18 | Testing | New test file |
| shadcn/ui | (bundled) | UI components | Select, Input, Label, Separator |

**No new packages needed.** This phase uses only existing project dependencies. [VERIFIED: read package.json versions from CLAUDE.md]

## Architecture Patterns

### Recommended Project Structure
```
convex/productInventory/
  substitution.ts          # NEW: Pure helper (resolveSubstitutionPlan, hasSubstitution)
  mutations.ts             # MODIFY: fulfillFromInventory, processGofoodSales
  queries.ts               # MODIFY: getStockForOrder

convex/menuProducts/
  mutations.ts             # MODIFY: update mutation (add validation)

src/hooks/convex/
  useMenuProducts.ts       # MODIFY: interfaces + transforms

src/components/menuProducts/
  ProductForm.tsx           # MODIFY: add Inventory Fulfillment section

src/components/inventory/
  InventoryAvailabilityPanel.tsx  # MODIFY: split sub-rows
  FulfillFromInventoryButton.tsx  # MODIFY: enhanced toast

tests/convex/
  productSubstitution.test.ts     # NEW: unit + integration tests
```

### Pattern 1: Pure Helper + Shared Import
**What:** Extract `resolveSubstitutionPlan()` as a pure function (no `ctx`) in its own file, imported by both mutations and queries.
**When to use:** When the same logic is needed in both mutation and query contexts.
**Example:**
```typescript
// convex/productInventory/substitution.ts
export function resolveSubstitutionPlan(
  needed: number,
  directAvailable: number,
  substituteAvailable: number,
  multiplier: number,
): SubstitutionPlan | null { ... }
```
[VERIFIED: matches existing project pattern -- see `convex/orders/helpers.ts` for pure functions]

### Pattern 2: Type Guard for Substitution Check
**What:** `hasSubstitution()` narrows the product type so TypeScript knows both fields exist.
**When to use:** Before accessing `fulfillFromProductId` and `fulfillMultiplier` on a menuProduct doc.
[VERIFIED: existing pattern in codebase]

### Anti-Patterns to Avoid
- **Reading `fulfillFromProductId` without type guard:** Always use `hasSubstitution(product)` before accessing substitution fields.
- **Using `product.id` instead of `product._id` in dropdowns:** The `transformMenuProduct` function converts `_id` to a number for legacy compatibility. Use `_id` (Convex string) for dropdown values, never `id` (number). [VERIFIED: staff review Critical #3]
- **Inline substitution logic in processGofoodSales:** Must use `resolveSubstitutionPlan` shared helper, not duplicate logic. [VERIFIED: staff review Improvement #3]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Substitution math | Inline per-mutation calculation | `resolveSubstitutionPlan()` in substitution.ts | Shared by 3 callsites, must be consistent |
| Chain validation | Custom graph traversal | Simple 2-query check (forward + reverse) | One-level depth only -- no graph needed |
| Eligible dropdown filtering | Manual array filtering | `useMemo` over `posProducts + availableProducts` | Already available from existing hooks |

## Common Pitfalls

### Pitfall 1: Test Helper Schema Mismatch (CRITICAL)
**What goes wrong:** The pre-existing plan's `createOrder` test helper (in the implementation plan code blocks) creates orders and orderItems with INCOMPLETE required fields.
**Why it happens:** The plan was written before/during Phase 70, and the schema requires fields the test helper omits.
**Current schema requires for `orders`:**
- `customerId: v.id("customers")` -- REQUIRED, plan's helper omits it
- `paymentStatus: v.union(...)` -- REQUIRED, plan's helper omits it
- `totalCost: v.number()` -- REQUIRED, plan's helper omits it
- `totalMargin: v.number()` -- REQUIRED, plan's helper omits it
- `deliveryType: v.string()` -- REQUIRED, plan's helper omits it
- `createdBy: v.string()` -- implied required
- `itemCount` -- used in existing helpers

**Current schema requires for `orderItems`:**
- `unitCost: v.number()` -- REQUIRED, plan uses `totalPrice` which doesn't exist
- `discountAmount: v.number()` -- REQUIRED, plan's helper omits it
- `lineTotal: v.number()` -- REQUIRED, plan's helper omits it
- `lineCost: v.number()` -- REQUIRED, plan's helper omits it
- `lineMargin: v.number()` -- REQUIRED, plan's helper omits it

**How to avoid:** Use the existing `createBasicOrder` helper from `tests/convex/helpers.ts` (line 555) which correctly populates ALL required fields. Or update the plan's inline `createOrder` to match schema. See the existing helper for the correct field set. [VERIFIED: compared schema.ts lines 189-322 with plan's createOrder helper]

### Pitfall 2: YAML Frontmatter Still References "71.1"
**What goes wrong:** The pre-existing plan files `78-01-PLAN.md` and `78-02-PLAN.md` have `phase: 71.1-product-inventory-substitution` in YAML frontmatter.
**How to avoid:** Update to `phase: 78-product-inventory-substitution` before execution.
[VERIFIED: read 78-01-PLAN.md line 2]

### Pitfall 3: Line Number Drift from Original Plan
**What goes wrong:** The plan references specific line numbers that may have shifted since Phase 70.1.
**Current verified line numbers:**
- `convex/schema.ts`: menuProducts table at lines 93-129 (matches plan) [VERIFIED]
- `convex/schema.ts`: `cogsOverrideIdr` at line 121 (matches plan) [VERIFIED]
- `convex/productInventory/mutations.ts`: `fulfillFromInventory` at lines 210-368 (matches plan) [VERIFIED]
- `convex/productInventory/mutations.ts`: `processGofoodSales` at lines 635-745 (matches plan) [VERIFIED]
- `convex/productInventory/queries.ts`: `getStockForOrder` at lines 310-363 (matches plan) [VERIFIED]
- `convex/menuProducts/mutations.ts`: `update` mutation at lines 218-343 (matches plan) [VERIFIED]
**How to avoid:** Line numbers are currently accurate. No drift detected.

### Pitfall 4: ProductForm handleSubmit Structure
**What goes wrong:** The plan's Step 6 for Task 8 asks to modify the `handleSubmit` to wrap the update call. The current structure (line 314-319) calls `updateMutation.mutateAsync({ id, updates: productData })`. The plan needs to enhance `productData` with substitution fields before this call.
**How to avoid:** The plan correctly identifies this -- just ensure the `updateData` object construction happens BEFORE the `updateMutation.mutateAsync` call at line 316. [VERIFIED: read ProductForm.tsx lines 314-319]

### Pitfall 5: MenuProductUpdateInput Must Include New Args
**What goes wrong:** The backend `update` mutation gains `fulfillFromProductId`, `fulfillMultiplier`, `clearFulfillFrom` args, but the hook's `useUpdateMenuProduct` passes `{ id, ...data.updates }`. If `MenuProductUpdateInput` doesn't include the new fields, TypeScript will strip them.
**How to avoid:** Add all 3 fields to `MenuProductUpdateInput` interface AND ensure `useUpdateMenuProduct` passes them through. [VERIFIED: current hook at lines 241-259 destructures `{ id: data.id, ...data.updates }`]

### Pitfall 6: Destructuring in Update Mutation Handler
**What goes wrong:** The current destructuring at line 251 extracts specific fields to prevent them from being spread into `updates`. The new `fulfillFromProductId`, `fulfillMultiplier`, and `clearFulfillFrom` must also be extracted.
**Current line 251:**
```typescript
const { id, token: _, components, productType: _pt, cogsOverrideIdr, clearCogsOverride, ...updates } = args;
```
Must become:
```typescript
const { id, token: _, components, productType: _pt, cogsOverrideIdr, clearCogsOverride, fulfillFromProductId: _ffp, fulfillMultiplier: _fm, clearFulfillFrom: _cff, ...updates } = args;
```
[VERIFIED: read mutations.ts line 251]

## Code Examples

### Current menuProducts table (schema.ts lines 93-129)
```typescript
menuProducts: defineTable({
  code: v.string(),
  name: v.string(),
  grams: v.number(),
  defaultPrice: v.number(),
  isActive: v.boolean(),
  unitCost: v.number(),
  cachedProductionSummary: v.string(),
  posSlot: v.optional(v.number()),
  unitCostStaleAt: v.optional(v.number()),
  packagingPosSlot: v.optional(v.number()),
  productType: v.optional(v.union(v.literal("food"), v.literal("packaging"))),
  productionType: v.optional(v.string()),     // DEPRECATED
  productionUnits: v.optional(v.number()),    // DEPRECATED
  isFixed: v.optional(v.boolean()),
  cogsOverrideIdr: v.optional(v.number()),
  photoStorageId: v.optional(v.id("_storage")),
  // NEW FIELDS GO HERE (after cogsOverrideIdr, before photoStorageId)
})
```
[VERIFIED: convex/schema.ts lines 93-124]

### Correct Test Helper Pattern (from tests/convex/helpers.ts)
```typescript
// The CORRECT way to create orders in tests (lines 596-637)
const orderId = await t.run(async (ctx) => {
  return await ctx.db.insert('orders', {
    orderNumber: '0410-001',
    customerId,              // REQUIRED
    customerName: 'Test Customer',
    status: 'PaymentReceived',
    paymentStatus: 'Unpaid', // REQUIRED
    orderDate: Date.now(),
    totalAmount,
    totalCost: quantity * unitCost,   // REQUIRED
    totalMargin: quantity * (unitPrice - unitCost), // REQUIRED
    deliveryType: 'Delivery',  // REQUIRED
    createdBy: 'test',
    itemCount: 1,
    finalTotal: totalAmount,
    isKitchenVisible: false,
  });
});

const orderItemId = await t.run(async (ctx) => {
  return await ctx.db.insert('orderItems', {
    orderId,
    productName,
    quantity,
    unitPrice,
    unitCost,                // REQUIRED
    discountAmount: 0,       // REQUIRED
    lineTotal: quantity * unitPrice,    // REQUIRED
    lineCost: quantity * unitCost,      // REQUIRED
    lineMargin: quantity * (unitPrice - unitCost), // REQUIRED
    menuProductId,
  });
});
```
[VERIFIED: tests/convex/helpers.ts lines 596-637]

### Typed API Import Pattern for Tests
```typescript
// CORRECT pattern (from ballDistribution.test.ts)
import { api } from '../../convex/_generated/api';
import schema from '../../convex/schema';

const t = convexTest(schema);
const result = await t.mutation(
  api.productInventory.mutations.fulfillFromInventory,
  { token: sessionToken, orderId, locationId }
);
```
[VERIFIED: tests/convex/ballDistribution.test.ts lines 24-25]

### productInventoryTransactions Schema (supports reason field)
```typescript
productInventoryTransactions: defineTable({
  ...
  reason: v.optional(v.string()), // For adjustments -- already exists, safe to use for substitution logging
  ...
})
```
[VERIFIED: convex/schema.ts line 1020]

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^4.0.18 + convex-test |
| Config file | vitest.config.ts (project root) |
| Quick run command | `npx vitest tests/convex/productSubstitution.test.ts --run` |
| Full suite command | `npm run test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SUB-01 | Substitution config validation (self-ref, chains, multiplier) | convex-test integration | `npx vitest tests/convex/productSubstitution.test.ts --run` | Wave 0 |
| SUB-02 | fulfillFromInventory direct-first + substitute fallback | convex-test integration | `npx vitest tests/convex/productSubstitution.test.ts --run` | Wave 0 |
| SUB-02 | resolveSubstitutionPlan pure helper | Vitest unit | `npx vitest tests/convex/productSubstitution.test.ts --run` | Wave 0 |
| SUB-03 | getStockForOrder returns enriched availability | convex-test integration | `npx vitest tests/convex/productSubstitution.test.ts --run` | Wave 0 |
| SUB-04 | processGofoodSales substitution resolution | convex-test integration | `npx vitest tests/convex/productSubstitution.test.ts --run` | Wave 0 (test MISSING in plan) |

### Sampling Rate
- **Per task commit:** `npx vitest tests/convex/productSubstitution.test.ts --run`
- **Per wave merge:** `npm run test`
- **Phase gate:** Full suite green + `npm run build` before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/convex/productSubstitution.test.ts` -- NEW file covering SUB-01 through SUB-04
- [ ] Test for `processGofoodSales` substitution (staff review flagged this as missing)
- [ ] Test helpers must use correct schema fields (see Pitfall 1)

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Direct-only stock check in fulfillFromInventory | Substitution-aware with configurable source product | Phase 78 (this phase) | Enables triple fulfillment from singles |
| Flat availability rows in InventoryAvailabilityPanel | Split sub-rows with direct + substitute breakdown | Phase 78 (this phase) | Better stock visibility |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | No phases 72-77 have been executed yet (only 70 + 70.1 complete) | Pitfall 3 (Line Numbers) | Line numbers would drift -- implementer must re-verify if any phases execute before 78 |
| A2 | `createBasicOrder` from `tests/convex/helpers.ts` can be imported into new test file | Code Examples | If helpers are not exported or have module boundary issues, tests need standalone helpers |

## Open Questions

1. **Concurrent substitution from same pool**
   - What we know: If an order has 2 Dubai Triples AND 3 Dubai Singles, both draw from Dubai Single stock. The plan computes deduction plans independently per item.
   - What's unclear: Whether accumulated demand should be checked against supply before committing.
   - Recommendation: Deferred per CONTEXT.md. Add a comment noting the edge case.

2. **Substitute product deactivated after config**
   - What we know: Validation at config time checks `isActive`. But product could be deactivated later.
   - What's unclear: Should `fulfillFromInventory` fail if substitute is inactive?
   - Recommendation: Staff review flagged this. Treat inactive substitute as "no substitution" at drawdown time (fall back to direct-only). Low priority -- can add in future if needed.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | -- |
| V3 Session Management | no | -- |
| V4 Access Control | yes | `requireRole(ctx, args.token, ["admin"])` for config, `["order_staff", "manager", "admin"]` for fulfillment |
| V5 Input Validation | yes | Multiplier >= 2 integer check, chain validation, self-reference block |
| V6 Cryptography | no | -- |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Setting substitution to steal stock from another product | Elevation of Privilege | Admin-only config (requireRole) + target validation |
| Circular chains causing infinite loops | Denial of Service | Forward + reverse chain validation blocks at save time |

## Sources

### Primary (HIGH confidence)
- `convex/schema.ts` -- Read lines 93-129 (menuProducts), 324-355 (orderItems), 189-268 (orders), 1004-1029 (productInventoryTransactions)
- `convex/productInventory/mutations.ts` -- Read lines 210-368 (fulfillFromInventory), 635-745 (processGofoodSales)
- `convex/productInventory/queries.ts` -- Read lines 310-363 (getStockForOrder)
- `convex/menuProducts/mutations.ts` -- Read lines 218-343 (update mutation)
- `src/components/menuProducts/ProductForm.tsx` -- Read full file (696 lines)
- `src/components/inventory/InventoryAvailabilityPanel.tsx` -- Read full file (123 lines)
- `src/components/inventory/FulfillFromInventoryButton.tsx` -- Read full file (230 lines)
- `src/hooks/convex/useMenuProducts.ts` -- Read full file
- `tests/convex/helpers.ts` -- Read createBasicOrder helper (lines 555-637)
- `tests/convex/inventory.test.ts` -- Read test patterns (lines 1-100)
- `tests/convex/ballDistribution.test.ts` -- Read typed API import pattern (lines 1-50)

### Secondary (HIGH confidence)
- `docs/superpowers/plans/2026-04-10-product-inventory-substitution.md` -- Full 1692-line implementation plan with code blocks
- `docs/superpowers/specs/2026-04-10-product-inventory-substitution-design.md` -- Design spec
- `docs/reviews/staffreview-product-inventory-substitution-2026-04-10.md` -- Staff review (4 criticals, all addressed in plan)
- `78-CONTEXT.md` -- User decisions from discuss phase

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, all existing patterns
- Architecture: HIGH -- pre-existing plan with full code blocks, verified against current codebase
- Pitfalls: HIGH -- schema mismatch in test helpers verified by reading actual schema fields

**Research date:** 2026-04-11
**Valid until:** 2026-04-25 (stable -- no external dependencies, schema unlikely to change before execution)
