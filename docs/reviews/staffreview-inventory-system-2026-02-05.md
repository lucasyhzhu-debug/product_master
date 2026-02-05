# Staff Review: Inventory Management System

**Date:** 2026-02-05
**Plan:** `C:\Users\Irfan\.claude\plans\cozy-bubbling-hopper.md`
**Reviewers:** Staff Developer (Implementation) + Principal Developer (Architecture)

---

## 1. Summary

**Overall Assessment:** ⚠️ **Revise with Structure Additions**

The plan presents a comprehensive, well-researched inventory management system with excellent BOM unification and FIFO tracking. The technical design is sound and addresses real business needs. However, the plan is **INCOMPLETE** - it is missing all four mandatory sections required by CLAUDE.md:
- ❌ Git Workflow section
- ❌ Implementation Waves section (with agent assignments)
- ❌ Documentation Updates section
- ❌ Success Criteria section

**Impact:** Without these sections, the plan cannot be executed reliably. Git workflow is undefined, implementation parallelization is unclear, documentation updates will be forgotten, and success verification is ambiguous.

**Action Required:** Add missing mandatory sections before implementation. Sections have been drafted below in "Plan Structure Additions."

---

## 2. Plan Validation (Step 0)

```
PLAN VALIDATION CHECKLIST
═════════════════════════

☐ Git Workflow section exists?
  → Branch name specified? ❌ NO
  → Checkpoint strategy defined? ❌ NO
  → "No direct commits to main" acknowledged? ❌ NO

☐ Implementation Waves section exists?
  → Agents assigned to each wave? ❌ NO
  → File paths specified? ✅ YES (in Phase sections, but not in wave format)
  → Wave dependencies marked (PARALLEL vs SEQUENTIAL)? ❌ NO

☐ Documentation Updates section exists?
  → CHANGELOG.md checkbox present? ❌ NO
  → Other docs identified if applicable? ❌ NO

☐ Success Criteria section exists?
  → Type check requirement? ❌ NO
  → Build requirement? ❌ NO
  → Feature-specific criteria? ❌ NO

═════════════════════════
Status: ❌ PLAN INCOMPLETE - Missing all 4 mandatory sections
Action: Silently adding missing sections (see Section 3)
```

---

## 3. Plan Structure Additions

### ADDED: Git Workflow

```markdown
## Git Workflow

**Branch:** `feature/inventory-management-system`

**Checkpoint Strategy:**
- [ ] Checkpoint 1: After schema migration (Phase 1) - `feat: add inventory schema and componentTypes migration`
- [ ] Checkpoint 2: After backend inventory mutations (Phase 2) - `feat: implement inventory FIFO and stock tracking`
- [ ] Checkpoint 3: After InventoryManager UI (Phase 2) - `feat: add inventory manager UI with batch tracking`
- [ ] Checkpoint 4: After product BOM enhancement (Phase 3) - `feat: integrate unified BOM with product forms`
- [ ] Checkpoint 5: After Kitchen workflow redesign (Phase 4) - `feat: implement boxing/stickering workflow`
- [ ] Checkpoint 6: After order integration (Phase 5) - `feat: integrate inventory with order lifecycle`
- [ ] Final: After build passes and seeding complete (Phase 6) - ready for merge

**Commands:**
```bash
git switch -c feature/inventory-management-system  # Create branch BEFORE any changes
# ... make changes (Phase 1) ...
git add convex/schema.ts convex/componentTypes/*.ts convex/inventory/*.ts
git commit -m "feat: add inventory schema and componentTypes migration"
npm run build  # Verify
# ... continue for each phase ...
npm run build  # MUST pass before final merge
```

**NO direct commits to main. NO exceptions.**
```

### ADDED: Implementation Waves

```markdown
## Implementation Waves

### Wave 1: Schema Foundation & Migration [SEQUENTIAL]
| Agent | Task | Files |
|-------|------|-------|
| convex-backend | Create new tables + migration | `convex/schema.ts`, `convex/migrations/inventorySetup.ts` |
| convex-backend | Seed componentTypes | `convex/componentTypes/seed.ts` |
| convex-backend | Verify migration | Run migration script, verify 6 new tables |

**Dependencies:** None (foundational)
**Verification:** `npx convex dev` → check tables exist in dashboard

### Wave 2: Backend Inventory Core [PARALLEL after Wave 1]
| Agent | Task | Files |
|-------|------|-------|
| convex-backend | Component types CRUD | `convex/componentTypes/queries.ts`, `convex/componentTypes/mutations.ts` |
| convex-backend | Inventory mutations (receive, consume, transfer) | `convex/inventory/mutations.ts` |
| convex-backend | FIFO consumption logic | `convex/inventory/fifo.ts` |
| convex-backend | Stock queries (dashboards, alerts) | `convex/inventory/queries.ts` |
| convex-backend | Weighted avg cost calculation | `convex/inventory/helpers.ts` |

**Dependencies:** Wave 1 complete
**Verification:** Test FIFO batch consumption in Convex dashboard

### Wave 3: Frontend Inventory UI [PARALLEL after Wave 2]
| Agent | Task | Files |
|-------|------|-------|
| react-ui-builder | InventoryManager page | `src/pages/InventoryManager.tsx` |
| react-ui-builder | Inventory components | `src/components/inventory/*.tsx` (14 components) |
| react-ui-builder | LocationsManager page | `src/pages/LocationsManager.tsx` |
| react-ui-builder | ComponentTypesManager page | `src/pages/ComponentTypesManager.tsx` |
| frontend-integrator | Inventory hooks | `src/hooks/convex/useInventory.ts`, `src/hooks/convex/useComponentTypes.ts` |
| frontend-integrator | Add routes | `src/App.tsx` |
| frontend-integrator | Add nav links | `src/components/layout/Header.tsx` |

**Dependencies:** Wave 2 complete
**Verification:** UI renders, can receive stock and view batches

### Wave 4: Product BOM Enhancement [PARALLEL with Wave 3]
| Agent | Task | Files |
|-------|------|-------|
| convex-backend | Update menuProductComponents FK | `convex/schema.ts`, `convex/menuProducts/mutations.ts` |
| convex-backend | Enhanced COGS calculation | `convex/lib/costCalculator.ts` (add all component types) |
| react-ui-builder | Update ProductForm UI | `src/components/menuProducts/ProductForm.tsx` |
| react-ui-builder | Dashboard low stock widget | `src/pages/Dashboard.tsx` |

**Dependencies:** Wave 2 complete
**Verification:** Product form shows production + packaging sections, COGS calculates correctly

### Wave 5: Kitchen Workflow Redesign [SEQUENTIAL after Waves 3 & 4]
| Agent | Task | Files |
|-------|------|-------|
| convex-backend | Add Boxed/Labeled statuses | `convex/orders/helpers/statusTransitions.ts` |
| convex-backend | Package tracking mutations | `convex/orders/mutations.ts` (fillPackage, unfillPackage) |
| react-ui-builder | KitchenView redesign | `src/pages/KitchenView.tsx` |
| react-ui-builder | Kitchen components | `src/components/kitchen/*.tsx` (11 components) |
| react-ui-builder | Order Manager filters | `src/pages/OrderManager.tsx` (add Boxed/Labeled) |

**Dependencies:** Waves 3 & 4 complete
**Verification:** Kitchen can box/sticker orders, packaging consumed at correct stages

### Wave 6: Order Integration & Stock Consumption [SEQUENTIAL after Wave 5]
| Agent | Task | Files |
|-------|------|-------|
| convex-backend | Reserve stock on confirm | `convex/orders/mutations.ts` (reserveStockForOrder) |
| convex-backend | Consume boxing materials | `convex/orders/mutations.ts` (consumeBoxingMaterials) |
| convex-backend | Consume sticker materials | `convex/orders/mutations.ts` (consumeStickerMaterials) |
| convex-backend | Release on cancellation | `convex/orders/mutations.ts` (releaseReservation) |
| react-ui-builder | Stock availability check | `src/components/orders/OrderFormPOS.tsx` |
| react-ui-builder | Packaging requirements display | `src/pages/OrderDetail.tsx` |

**Dependencies:** Wave 5 complete
**Verification:** Full order lifecycle consumes inventory correctly

### Wave 7: Seeding & Testing [SEQUENTIAL after Wave 6]
| Agent | Task | Files |
|-------|------|-------|
| Bash | Seed production componentTypes + locations | Run seed functions in Convex dashboard |
| Manual | Create packaging components via Receive Stock | UI workflow test |
| convex-backend | Update existing menuProducts with BOMs | Data migration script |
| Manual | End-to-end flow test | Verify full workflow per Verification Plan |

**Dependencies:** Wave 6 complete
**Verification:** Full E2E test passes (see Verification Plan in plan)

### Wave 8: Code Audit & Build [SEQUENTIAL after Wave 7]
| Agent | Task |
|-------|------|
| code-auditor | Type safety audit + pattern compliance |
| Bash | `npm run type-check` |
| Bash | `npm run build` |

**Dependencies:** Wave 7 complete
**Verification:** Build succeeds, no type errors
```

### ADDED: Documentation Updates

```markdown
## Documentation Updates

After merge, update these files:

- [ ] **docs/CHANGELOG.md** (ALWAYS required)
  - Entry: "Inventory Management System - Unified BOM, FIFO tracking, Kitchen workflow redesign"
  - List all 6 new tables, modified statuses, major UI additions

- [ ] **docs/SCHEMA.md** (REQUIRED - schema changed)
  - Add 6 new tables: componentTypes, storageLocations, inventoryBatches, componentStock, componentTransactions, orderComponentReservations
  - Update menuProductComponents FK change
  - Add Boxed/Labeled order statuses to workflow diagram
  - Document FIFO consumption flow

- [ ] **docs/API_REFERENCE.md** (REQUIRED - backend changed)
  - New modules: convex/componentTypes/, convex/inventory/
  - Document FIFO consumption API
  - Document new order mutations (reserveStock, consumeMaterials, releaseReservation)

- [ ] **docs/ROADMAP.md** (If inventory tracking was a backlog item)
  - Mark inventory management as complete
  - Update future plans for analytics phase

- [ ] **docs/CODE_STYLE.md** (If new patterns introduced)
  - Document FIFO helper patterns if introducing new architecture
```

### ADDED: Success Criteria

```markdown
## Success Criteria

### Build & Type Safety
- [ ] `npm run type-check` passes
- [ ] `npm run build` succeeds
- [ ] All Convex functions deploy without errors

### Schema Validation
- [ ] 6 new tables exist in production: componentTypes, storageLocations, inventoryBatches, componentStock, componentTransactions, orderComponentReservations
- [ ] Production componentTypes seeded (Big Ball, Mid Ball)
- [ ] Storage locations seeded (Kitchen, Office, Legato Goldfinch)
- [ ] menuProductComponents FK migrated to componentTypes

### Backend Functionality
- [ ] FIFO consumption: Receive 2 batches → consume → verify oldest batch consumed first
- [ ] Weighted avg cost calculation correct
- [ ] Stock reservation on order confirm
- [ ] Boxing materials consumed on Boxed status
- [ ] Sticker materials consumed on Labeled status
- [ ] Reservation release on cancellation

### Frontend UI
- [ ] InventoryManager renders with location tabs
- [ ] Receive Stock dialog works (create batch with supplier info)
- [ ] Low stock alerts show in header badge
- [ ] ProductForm shows production + direct_packaging sections
- [ ] KitchenView shows 3-column layout (Boxing, Stickering, Shipping)
- [ ] Order Manager has Boxed/Labeled filters

### End-to-End Flow (Critical Path)
- [ ] Setup: Seed locations and production components
- [ ] Receive: Create 100 Long Boxes @ Rp 400 (Batch 1), then 50 @ Rp 500 (Batch 2)
- [ ] Product: Update "Original Triple 135g" with full BOM (production + packaging)
- [ ] Order: Create order for 3× Original Triple
- [ ] Confirm: Verify 3 boxes, 9 wrappers, 3 stickers reserved (not consumed)
- [ ] Boxing: Fill packages in Kitchen → verify order moves to "Boxed", boxes consumed via FIFO
- [ ] Stickering: Apply stickers → verify order moves to "Labeled", stickers consumed
- [ ] Ship: Mark shipped → order complete
- [ ] Alert: If boxes < reorderPoint → show reorder alert with supplier

### Documentation
- [ ] All CHANGELOG entries added
- [ ] SCHEMA.md updated with new tables
- [ ] API_REFERENCE.md updated with new endpoints
```

---

## 4. Critical Issues (Must Fix)

| # | Issue | Category | Location in Plan |
|---|-------|----------|------------------|
| 1 | Missing mandatory plan sections | Process | Entire plan |
| 2 | No migration strategy for existing productionUnitTypes | Schema | Phase 1 |
| 3 | Unclear how existing orders handle new statuses | Data Migration | Phase 4 |
| 4 | No rollback strategy for schema changes | Architecture | Implementation Phases |
| 5 | FIFO consumption might fail if batches deleted/expired mid-order | Logic | inventoryBatches schema |
| 6 | No validation for negative stock scenarios | Business Logic | receiveStock/consumeStock |
| 7 | Kitchen workflow assumes all orders have menuProductId | Data Consistency | Phase 4 - Kitchen Workflow |

### Issue 1: Missing Mandatory Plan Sections
**Impact:** Cannot execute plan reliably without git workflow, agent assignments, documentation checklist, and success criteria.

**Recommendation:** Use the added sections in Section 3 above.

---

### Issue 2: No Migration Strategy for Existing productionUnitTypes
The plan mentions migrating `productionUnitTypes` → `componentTypes` (category="production") but provides no migration script or data transformation logic.

**Risks:**
- Existing menuProductComponents references break
- Production data lost if migration incomplete
- System downtime during migration

**Recommendation:**
```typescript
// convex/migrations/inventorySetup.ts
export const migrateProductionTypes = mutation({
  handler: async (ctx) => {
    // 1. Create componentTypes from productionUnitTypes
    const oldTypes = await ctx.db.query("productionUnitTypes").collect();

    for (const oldType of oldTypes) {
      await ctx.db.insert("componentTypes", {
        code: oldType.code,
        name: oldType.name,
        category: "production",
        gramsPerUnit: oldType.gramsPerUnit,
        unitCostIdr: oldType.unitCostIdr,
        unit: "pcs",
        trackInventory: false,  // Production is made to order
        color: oldType.color,
        sortOrder: oldType.sortOrder,
        isActive: oldType.isActive,
        createdBy: "system-migration",
        createdAt: Date.now(),
      });
    }

    // 2. Update menuProductComponents FK
    // NOTE: Convex doesn't support schema-level FK constraints,
    // so no CASCADE needed - just update references

    // 3. IMPORTANT: Do NOT delete productionUnitTypes table
    // until all references verified migrated
  },
});
```

**Add to Wave 1:**
- Run migration script BEFORE creating new menuProducts
- Verify all menuProductComponents have valid componentTypeId
- Only then mark productionUnitTypes as deprecated (keep for rollback)

---

### Issue 3: Unclear How Existing Orders Handle New Statuses
The plan adds `Boxed` and `Labeled` statuses but doesn't address orders currently in `Packaging` or `InProduction`.

**Risks:**
- Orders stuck in old statuses forever
- Kitchen UI doesn't show legacy orders
- Status transition logic breaks for in-flight orders

**Recommendation:**
```typescript
// convex/migrations/orderStatusMigration.ts
export const migrateOrderStatuses = mutation({
  handler: async (ctx) => {
    // All orders currently in "Packaging" → "Boxed"
    const packagingOrders = await ctx.db
      .query("orders")
      .withIndex("by_status", q => q.eq("status", "Packaging"))
      .collect();

    for (const order of packagingOrders) {
      await ctx.db.patch(order._id, { status: "Boxed" });
    }

    // InProduction → remains (first stage of new flow)
  },
});
```

**Add to Wave 4:** Run status migration BEFORE deploying new Kitchen UI.

---

### Issue 4: No Rollback Strategy for Schema Changes
6 new tables + FK changes + status migrations = high-risk deployment. Plan has no rollback strategy if issues occur.

**Risks:**
- Production data corruption
- Cannot revert if FIFO logic fails
- Downtime if migration fails mid-process

**Recommendation:**
```markdown
### Rollback Strategy (Add to Git Workflow)

**Pre-Deploy:**
1. Backup production database: `npx convex export --deployment prod:decisive-wombat-7`
2. Tag last-known-good commit: `git tag pre-inventory-$(date +%Y%m%d)`

**If Deployment Fails:**
1. Stop accepting new orders (set maintenance mode flag in Convex)
2. Revert code: `git revert HEAD` + redeploy
3. If schema corrupted: Restore from backup
   ```bash
   npx convex import backup-2026-02-05.zip --replace --deployment prod
   ```
4. Document failure in incident log

**Hotfix Considerations:**
- Keep productionUnitTypes table for 1 week post-deploy
- Deploy schema-only first (Wave 1), verify, then UI
- Use feature flags for Kitchen workflow toggle
```

**Add to Wave 1 Dependencies:** "Pre-deploy backup taken"

---

### Issue 5: FIFO Consumption Might Fail if Batches Deleted/Expired Mid-Order
The `consumeFromFIFO()` logic assumes batches remain available between reservation and consumption. If a batch is deleted or expires after reservation, consumption fails.

**Risks:**
- Orders cannot be completed if reserved batch disappears
- Stock shows as reserved but cannot be consumed
- Manual intervention required to fix

**Recommendation:**
```typescript
// Add to inventoryBatches schema
status: v.union(
  v.literal("active"),
  v.literal("depleted"),
  v.literal("expired"),
  v.literal("reserved_in_use")  // NEW: Cannot delete if reservations exist
),

// Add before batch deletion
export const deleteBatch = mutation({
  args: { batchId: v.id("inventoryBatches") },
  handler: async (ctx, args) => {
    const batch = await ctx.db.get(args.batchId);
    if (!batch) throw new Error("Batch not found");

    // CRITICAL: Check for active reservations
    if (batch.quantityReserved > 0) {
      throw new Error(
        `Cannot delete batch: ${batch.quantityReserved} units reserved for active orders`
      );
    }

    await ctx.db.delete(args.batchId);
  },
});
```

**Add to Wave 2:** Implement batch deletion protection.

---

### Issue 6: No Validation for Negative Stock Scenarios
Plan doesn't handle edge cases where stock goes negative (e.g., manual adjustment errors, concurrent order confirms).

**Risks:**
- Stock count shows -10 boxes (impossible)
- Orders confirmed with insufficient stock
- FIFO breaks on negative quantities

**Recommendation:**
```typescript
// Add to convex/inventory/mutations.ts
export const adjustStock = mutation({
  args: { /* ... */ },
  handler: async (ctx, args) => {
    const batch = await ctx.db.get(args.batchId);

    // VALIDATION: Prevent negative stock
    const newRemaining = batch.quantityRemaining + args.quantityDelta;
    if (newRemaining < batch.quantityReserved) {
      throw new Error(
        `Adjustment would create negative available stock: ` +
        `${newRemaining} remaining - ${batch.quantityReserved} reserved = ` +
        `${newRemaining - batch.quantityReserved} available`
      );
    }

    await ctx.db.patch(args.batchId, {
      quantityRemaining: newRemaining,
    });
  },
});
```

**Add to Wave 2:** Stock validation in all consume/adjust mutations.

---

### Issue 7: Kitchen Workflow Assumes All Orders Have menuProductId
The new Kitchen workflow filters orders by `productionType` and calculates components from `menuProductComponents`. But legacy orders (or custom orders) might have `menuProductId: null`.

**Risks:**
- Kitchen UI crashes on null menuProductId
- Cannot calculate packaging for custom orders
- Orders stuck in limbo

**Recommendation:**
```typescript
// Add graceful fallback in KitchenView
const orderComponents = useMemo(() => {
  if (!item.menuProductId) {
    // Legacy or custom order - use basic fallback
    return {
      production: item.productionUnits || 0,
      packaging: [],  // No packaging tracking for legacy
    };
  }

  // Normal flow: get components from menuProduct BOM
  return calculateComponentsForItem(item);
}, [item]);
```

**Add to Wave 5:** Null safety for menuProductId in Kitchen components.

---

## 5. Improvements (Recommended)

| # | Improvement | Impact | Effort |
|---|-------------|--------|--------|
| 1 | Add componentTypes.lastPurchaseDate for reorder prioritization | High | Low |
| 2 | Implement batch expiry warnings (30/60/90 days) | Medium | Medium |
| 3 | Add componentStock.lastMovement timestamp for slow mover detection | High | Low |
| 4 | Create InventoryAnalytics page in Wave 3 (currently Phase 2) | Medium | High |
| 5 | Add batch notes field for quality issues tracking | Low | Low |
| 6 | Implement stock transfer approval workflow for venue moves | Medium | High |
| 7 | Add unit test suite for FIFO logic | High | Medium |
| 8 | Create admin toggle to switch between FIFO/LIFO/weighted avg | Low | High |

### Improvement 1: Add lastPurchaseDate for Reorder Prioritization
Currently the plan shows "Reorder from Supplier B" based on LIFO (latest supplier). Add `lastPurchaseDate` to componentTypes for better UX.

**Benefit:** Shows how long since last restock → "Last ordered 45 days ago from Supplier B"

```typescript
componentTypes: defineTable({
  // ... existing fields
  lastPurchaseDate: v.optional(v.number()),      // Auto-update when batch received
  lastSupplierName: v.optional(v.string()),
  lastPurchaseUrl: v.optional(v.string()),
})
```

---

### Improvement 2: Implement Batch Expiry Warnings
The schema has `expiryDate: v.optional(v.number())` but no active warning system for expiring batches.

**Benefit:** Prevent waste by alerting before materials expire.

**Implementation:**
```typescript
// Add to convex/inventory/queries.ts
export const getExpiringBatches = query({
  args: { daysAhead: v.number() },  // e.g., 30
  handler: async (ctx, args) => {
    const cutoff = Date.now() + args.daysAhead * 24 * 60 * 60 * 1000;

    return await ctx.db
      .query("inventoryBatches")
      .filter(q =>
        q.and(
          q.eq(q.field("status"), "active"),
          q.lt(q.field("expiryDate"), cutoff)
        )
      )
      .collect();
  },
});
```

Add to Dashboard: "⚠️ 5 batches expiring in 30 days"

---

### Improvement 3: Add lastMovement Timestamp for Slow Movers
The `componentStock` table has no movement tracking → cannot detect slow-moving inventory.

**Benefit:** Identify components not used in 90+ days → discontinue or reduce orders.

```typescript
componentStock: defineTable({
  // ... existing
  lastMovement: v.optional(v.number()),  // Updated on any transaction
  daysSinceLastUse: v.optional(v.number()),  // Computed daily
})
```

Add to InventoryAnalytics: "Slow Movers (no movement in 90 days)" widget.

---

### Improvement 4: Create InventoryAnalytics Page in Wave 3
The plan mentions InventoryAnalytics in Phase 2 but doesn't assign it to a wave. This is a significant UI feature and should have explicit wave assignment.

**Recommendation:** Add as Wave 3.5 (PARALLEL with Wave 4) or defer to post-MVP.

If included:
- Assign to `react-ui-builder`
- Add admin-only route protection
- Include turnover rate, COGS trend, stock aging charts

---

### Improvement 7: Add Unit Test Suite for FIFO Logic
FIFO consumption is critical business logic but plan has no testing strategy beyond manual E2E.

**Recommendation:**
```typescript
// convex/inventory/fifo.test.ts (if Convex supports testing)
describe("FIFO Consumption", () => {
  test("consumes from oldest batch first", () => {
    // Setup: Batch 1 @ 2026-01-01, Batch 2 @ 2026-02-01
    // Consume 120 units
    // Assert: 100 from Batch 1, 20 from Batch 2
  });

  test("throws error on insufficient stock", () => {
    // Setup: Total 100 available
    // Consume 150 units
    // Assert: Error thrown
  });

  test("respects reserved quantities", () => {
    // Setup: Batch has 100 total, 30 reserved
    // Consume 80 units
    // Assert: Error (only 70 available)
  });
});
```

**Add to Wave 2:** Test suite for FIFO before frontend integration.

---

## 6. Refinements (Minor Suggestions)

- **Batch UI:** In ReceiveStockDialog, add "Use Previous Details" pre-fill (already in plan mockup, ensure implemented)
- **Keyboard shortcuts:** Add Ctrl+R for quick Receive Stock dialog
- **Batch display:** Show batch age in InventoryManager (e.g., "Batch 1 - 45 days old")
- **Color coding:** Use traffic light colors for stock levels (green > 80%, yellow 20-80%, red < 20%)
- **Export functionality:** Add "Export to CSV" for inventory report (for accounting)
- **Barcode scanning:** Consider barcode support for batch receiving (future enhancement)
- **Mobile responsive:** Verify InventoryManager works at 280px (many tables/columns)
- **Optimistic UI:** Show stock changes immediately before mutation completes
- **Undo buffer:** Add "Undo Last Receive" for accidental entries
- **Batch search:** Add search bar in InventoryManager to find batches by supplier

---

## 7. Duplication Analysis

### Existing Code to Leverage

| Existing Code | Location | How to Use |
|---------------|----------|------------|
| `useQuery` patterns | `src/hooks/convex/*.ts` | Copy pagination/loading patterns for inventory hooks |
| Dialog components | `src/components/shared/ConfirmDialog.tsx` | Reuse for ReceiveStockDialog, TransferStockDialog |
| Card grid layouts | `src/pages/RecipeEditor.tsx` | Component list patterns applicable to InventoryManager |
| Cost calculation | `convex/lib/costCalculator.ts` | Extend with weighted avg calculation |
| WhatsApp formatting | `convex/orders/whatsapp.ts` | Could add inventory restock reminder templates |
| Two-tier helpers | `convex/orders/helpers/*.ts` | Apply same pattern to inventory (pure + ctx-dependent) |
| Tag selection UI | `src/components/recipes/*` | Reuse combobox pattern for component selection |
| Toast notifications | All pages use `sonner` | Use for stock alerts |

### Potential Duplication Risks

**Risk 1: Recreating CRUD boilerplate**
The plan creates 4 new managers (Inventory, Locations, ComponentTypes, Analytics). Each will have similar create/edit/delete patterns.

**Mitigation:** Create shared `<EntityManager>` wrapper component:
```tsx
<EntityManager
  entity="componentTypes"
  fields={[
    { name: "code", type: "text", required: true },
    { name: "unitCostIdr", type: "currency", required: true },
  ]}
  onCreate={createComponentType}
  onUpdate={updateComponentType}
/>
```

**Risk 2: Duplicating status badge logic**
Kitchen workflow adds Boxed/Labeled badges. Order Manager already has status badges for Draft/Confirmed/etc.

**Mitigation:** Extract `<OrderStatusBadge>` to shared component, add new statuses:
```tsx
// src/components/shared/OrderStatusBadge.tsx
export function OrderStatusBadge({ status }: { status: string }) {
  const config = {
    Confirmed: { color: "green", label: "Confirmed" },
    Boxed: { color: "blue", label: "Boxed" },  // NEW
    Labeled: { color: "purple", label: "Labeled" },  // NEW
    // ...
  };
  // ...
}
```

**Risk 3: Duplicate location selection UI**
ReceiveStockDialog, TransferStockDialog, and KitchenView all need location pickers.

**Mitigation:** Create `<LocationSelector>` component:
```tsx
<LocationSelector
  value={selectedLocation}
  onChange={setSelectedLocation}
  variant="buttons"  // or "dropdown"
/>
```

---

## 8. Phase/Wave Accuracy

| Phase | Assessment | Notes |
|-------|------------|-------|
| Phase 1: Schema Foundation | ✅ Good | Clear table definitions, but missing migration script |
| Phase 2: Component Types & Inventory | ⚠️ Needs Adjustment | Too broad - should split backend (Wave 2) and frontend (Wave 3) |
| Phase 3: Product BOM Enhancement | ✅ Good | Small, focused scope |
| Phase 4: Kitchen Workflow | ⚠️ Needs Adjustment | Missing status migration step |
| Phase 5: Order Integration | ✅ Good | Clear integration points |
| Phase 6: Product Setup & Testing | ⚠️ Needs Adjustment | Seeding should be automated, not manual |

### Ordering Issues

**Issue:** Phase 2 combines backend mutations + frontend UI in same phase. This blocks parallelization.

**Recommendation:** Split into Wave 2 (backend) and Wave 3 (frontend) as shown in Implementation Waves section.

**Issue:** No explicit audit/build phase before merge.

**Recommendation:** Add Wave 8 (Code Audit & Build) as final gate.

### Missing Phases

**Missing:** Data migration phase for existing orders/products.

**Recommendation:** Add between Waves 1 and 2:
```
### Wave 1.5: Data Migration [SEQUENTIAL after Wave 1]
| Agent | Task |
|-------|------|
| convex-backend | Migrate productionUnitTypes → componentTypes |
| convex-backend | Migrate order statuses (Packaging → Boxed) |
| Bash | Verify migration (run validation queries) |
```

**Missing:** Feature flag / rollback preparation phase.

**Recommendation:** Add to Wave 1:
```typescript
// convex/lib/featureFlags.ts
export const INVENTORY_ENABLED = false;  // Toggle for gradual rollout
```

---

## 9. Specialist Agent Recommendations

| Phase | Recommended Agent | Rationale |
|-------|-------------------|-----------|
| Wave 1 (Schema + Migration) | `convex-backend` | Complex schema changes, migration logic, data integrity |
| Wave 2 (Backend Core) | `convex-backend` | FIFO logic, stock calculations, mutation patterns |
| Wave 3 (Frontend UI) | `react-ui-builder` + `frontend-integrator` | React-ui-builder for components, frontend-integrator for hooks/routes |
| Wave 4 (BOM Enhancement) | `convex-backend` + `react-ui-builder` | Backend for COGS calc, frontend for ProductForm UI |
| Wave 5 (Kitchen Redesign) | `react-ui-builder` | Major UI overhaul, Kanban layout, package tracking |
| Wave 6 (Order Integration) | `convex-backend` | Complex order lifecycle hooks, reservation logic |
| Wave 7 (Seeding & Testing) | Manual + Bash | Human verification of E2E flow |
| Wave 8 (Audit & Build) | `code-auditor` + Bash | Quality gate before merge |

**Available Agents:**
- `convex-backend` - Backend mutations, queries, schema changes ✅ Used
- `react-ui-builder` - Frontend components, pages, hooks ✅ Used
- `frontend-integrator` - Hook wiring, barrel exports ✅ Used
- `code-auditor` - Code review, quality checks ✅ Used
- `cto-orchestrator` - Cross-cutting concerns, major decisions ❌ Not needed (plan is detailed enough)
- `refactor-architect` - Refactoring, restructuring ❌ Not needed (greenfield feature)

**Parallelization Opportunities:**
- Waves 2 & 3 can run in parallel (backend + frontend)
- Waves 3 & 4 can run in parallel (inventory UI + product BOM)
- Within Wave 3, all UI pages can be built in parallel

---

## 10. Git Workflow Assessment

### Branch Strategy
| Assessment | Status |
|------------|--------|
| Feature branch specified | ✅ Yes (added in Section 3) |
| Branch naming convention | ✅ Correct (`feature/inventory-management-system`) |
| Merge strategy documented | ✅ Yes (after build passes, merge to main) |

### Commit Strategy
| Phase | Expected Commits | Commit Type | Notes |
|-------|------------------|-------------|-------|
| Wave 1 | 2 | feat | Schema + migration separate commits |
| Wave 2 | 5 | feat | One per backend module (mutations, queries, FIFO, helpers, seeds) |
| Wave 3 | 4 | feat | Pages, components, hooks, routes |
| Wave 4 | 2 | feat | Backend calc, frontend UI |
| Wave 5 | 3 | feat | Backend status, Kitchen UI, Order Manager |
| Wave 6 | 2 | feat | Stock reservation, consumption |
| Wave 7 | 1 | chore | Seeding + verification |
| Wave 8 | 0 | - | Audit only, no code changes |

**Total:** ~19 commits (atomic, focused)

### Recommended Commit Checkpoints
The plan should commit at these natural boundaries:

1. **After schema changes** → `feat: add inventory schema with 6 new tables`
2. **After migration script** → `feat: migrate productionUnitTypes to componentTypes`
3. **After FIFO logic** → `feat: implement FIFO batch consumption algorithm`
4. **After inventory mutations** → `feat: add inventory receive/transfer/adjust mutations`
5. **After inventory queries** → `feat: add inventory stock queries and low stock alerts`
6. **After InventoryManager UI** → `feat: create inventory manager with batch tracking UI`
7. **After inventory components** → `feat: add receive stock and transfer stock dialogs`
8. **After product BOM enhancement** → `feat: integrate unified BOM with product forms`
9. **After Kitchen workflow backend** → `feat: add Boxed/Labeled statuses and package tracking`
10. **After Kitchen workflow frontend** → `feat: redesign KitchenView with boxing/stickering workflow`
11. **After order integration** → `feat: integrate inventory with order lifecycle`
12. **After seeding** → `chore: seed production components and storage locations`

### Pre-Push Verification
- [x] Plan includes `npm run build` check (added in Success Criteria)
- [x] Plan includes `npm run type-check` verification (added in Success Criteria)
- [x] Plan includes local testing before push (E2E flow in Success Criteria)

### CI/CD Considerations
| Concern | Assessment |
|---------|------------|
| Rollback strategy | ❌ Missing (Critical Issue #4 - added recommendation) |
| Deployment order | ⚠️ Needs adjustment (backend before frontend, migrations first) |
| Data backup needed | ✅ Yes (schema changes = backup required) |
| Migration safety | ⚠️ Review needed (Critical Issue #2 - migration script missing) |

**Deployment Sequence (Recommended):**
```
1. Pre-deploy: Backup production database
2. Deploy: Wave 1 (schema + migration) → verify tables exist
3. Deploy: Wave 1.5 (data migration) → verify data migrated
4. Deploy: Wave 2 (backend) → verify mutations work in dashboard
5. Deploy: Waves 3-6 (frontend + integration) → full feature
6. Monitor: Check low stock alerts, FIFO consumption, order flow
7. Post-deploy: Keep backup for 7 days
```

### Git Workflow Issues Found

1. **No commit checkpoints between phases** → Added explicit checkpoints above
2. **Missing branch creation step** → Added in Git Workflow section
3. **No build verification before merge** → Added in Success Criteria
4. **Large mixed commits implied** → Recommendation: Split into 19 atomic commits
5. **No rollback strategy** → Added in Critical Issue #4

---

## 11. Documentation Checkpoints

| Phase | Documentation Update Required |
|-------|-------------------------------|
| Wave 1 | docs/SCHEMA.md (6 new tables) |
| Wave 2 | docs/API_REFERENCE.md (inventory mutations/queries) |
| Wave 3 | docs/ONBOARDING.md (new pages: InventoryManager, LocationsManager) |
| Wave 4 | docs/SCHEMA.md (menuProductComponents FK change) |
| Wave 5 | docs/SCHEMA.md (Boxed/Labeled statuses in workflow diagram) |
| Wave 6 | docs/API_REFERENCE.md (order integration mutations) |
| All Waves | docs/CHANGELOG.md (comprehensive entry post-merge) |

### CHANGELOG.md Entry (Draft)

```markdown
## 2026-02-XX - Inventory Management System

**Major Feature: Unified Bill of Materials + FIFO Inventory Tracking**

This release introduces a comprehensive inventory management system with:
- Unified component types (production + packaging)
- FIFO batch tracking with purchase history
- Multi-location stock management
- Automated stock reservation and consumption
- Kitchen workflow redesign (Boxing → Labeled statuses)
- Low stock alerts and reorder tracking

**Schema Changes (6 New Tables):**
- `componentTypes` - Unified production + packaging components
- `storageLocations` - Kitchen, Office, Venue tracking
- `inventoryBatches` - FIFO batch tracking with supplier info
- `componentStock` - Aggregated stock view per location
- `componentTransactions` - Complete audit log
- `orderComponentReservations` - Order-level stock reservations

**Modified Tables:**
- `menuProductComponents` - FK changed to componentTypes
- `orders` - Added Boxed/Labeled statuses to workflow

**New Backend Modules:**
- `convex/componentTypes/` - Component CRUD
- `convex/inventory/` - Stock operations (receive, consume, transfer, FIFO)

**New Frontend Pages:**
- `/inventory` - InventoryManager (Warehouse View)
- `/inventory/locations` - LocationsManager
- `/inventory/components` - ComponentTypesManager

**Kitchen Workflow Changes:**
- Split "Packaging" into "Boxed" (materials consumed) and "Labeled" (stickers applied)
- Package-level progress tracking (fill packages individually)
- Packaging inventory sidebar in KitchenView
- Batch confirm dialog for stickering phase

**Files Modified:**
- convex/schema.ts
- convex/menuProducts/mutations.ts
- convex/orders/mutations.ts
- convex/orders/helpers/statusTransitions.ts
- src/pages/KitchenView.tsx
- src/pages/OrderManager.tsx
- src/pages/Dashboard.tsx
- src/components/menuProducts/ProductForm.tsx
- src/App.tsx
- src/components/layout/Header.tsx

**Migration Required:**
- Run `migrateProductionTypes()` to convert existing productionUnitTypes
- Run `migrateOrderStatuses()` to update orders in Packaging status
- Seed production components and storage locations via dashboard

**Commits:**
- abc123 - feat: add inventory schema with 6 new tables
- def456 - feat: migrate productionUnitTypes to componentTypes
- ghi789 - feat: implement FIFO batch consumption algorithm
- jkl012 - feat: add inventory receive/transfer/adjust mutations
- mno345 - feat: create inventory manager UI with batch tracking
- pqr678 - feat: integrate unified BOM with product forms
- stu901 - feat: add Boxed/Labeled statuses and package tracking
- vwx234 - feat: redesign KitchenView with boxing/stickering workflow
- yza567 - feat: integrate inventory with order lifecycle
- bcd890 - chore: seed production components and storage locations
```

---

## 12. Edge Cases to Address

The plan should explicitly handle:

- [x] **Concurrent order confirms with limited stock** → Add mutex/transaction lock in reserveStockForOrder
- [ ] **Batch deleted while order has reservation** → Critical Issue #5 (addressed)
- [ ] **Stock goes negative via concurrent adjustments** → Critical Issue #6 (validation added)
- [x] **Legacy orders without menuProductId** → Critical Issue #7 (null safety added)
- [ ] **Component cost changes during order processing** → Snapshot component costs at order creation (not in plan)
- [ ] **Order cancelled but stock already consumed** → Add "unreserve only, don't add back consumed stock" logic
- [ ] **Transfer between locations fails mid-transfer** → Transaction rollback needed (Convex auto-handles)
- [ ] **Receive stock with zero/negative quantity** → Add validation: quantity > 0, totalCost >= 0
- [ ] **Supplier name contains special chars (WhatsApp formatting)** → Sanitize input or escape for display
- [ ] **Reorder point set higher than total warehouse capacity** → Add warning in UI, allow override
- [ ] **Multiple users receiving same component simultaneously** → Convex transactions handle this atomically
- [ ] **User creates duplicate batch by accident** → Add "Similar batch exists" warning (within 24h, same supplier)
- [ ] **FIFO consumes from expired batch** → Filter expired batches in consumption query
- [ ] **Packaging component deleted while referenced in menuProduct BOM** → Add dependency check before deletion
- [ ] **Kitchen fills more balls than ordered** → Add max validation: ballsFilled <= productionUnits

**Recommendation:** Add edge case validation to Wave 2 (backend) and Wave 3 (frontend input validation).

---

## 13. Approval Conditions

### For Approval, address:

1. ✅ **Add mandatory plan sections** (Git Workflow, Implementation Waves, Documentation, Success Criteria) - COMPLETED in Section 3
2. ❌ **Critical Issue #2:** Add migration script for productionUnitTypes → componentTypes
3. ❌ **Critical Issue #3:** Add order status migration for Packaging → Boxed
4. ❌ **Critical Issue #4:** Document rollback strategy
5. ❌ **Critical Issue #5:** Add batch deletion protection (reserved stock check)
6. ❌ **Critical Issue #6:** Add negative stock validation
7. ❌ **Critical Issue #7:** Add null safety for menuProductId in Kitchen UI

### Recommended before implementation:

1. **Improvement #1:** Add lastPurchaseDate to componentTypes
2. **Improvement #7:** Add unit test suite for FIFO logic
3. **Duplication Risk #1:** Create shared EntityManager component
4. **Duplication Risk #2:** Extract OrderStatusBadge to shared
5. **Duplication Risk #3:** Create LocationSelector component
6. **Missing Wave 1.5:** Add data migration phase
7. **Edge Case:** Add component cost snapshotting at order creation
8. **Edge Case:** Add duplicate batch detection in ReceiveStock

---

## 14. Final Recommendation

**Status:** ⚠️ **REVISE - Address Critical Issues**

**Priority Actions (Before Implementation):**

1. **Add missing plan sections** → Use drafts from Section 3 ✅
2. **Write migration scripts** → Critical Issues #2, #3 ❌
3. **Add rollback strategy** → Critical Issue #4 ❌
4. **Implement safeguards** → Critical Issues #5, #6, #7 ❌
5. **Review edge cases** → Section 12 ⚠️

**Plan Quality Assessment:**
- **Design:** ⭐⭐⭐⭐⭐ Excellent (unified BOM, FIFO, multi-location)
- **Architecture:** ⭐⭐⭐⭐☆ Very Good (needs migration strategy)
- **Implementation Detail:** ⭐⭐⭐⭐☆ Very Good (UI mockups, schemas clear)
- **Process Compliance:** ⭐☆☆☆☆ Poor (missing all mandatory sections - now fixed)
- **Risk Management:** ⭐⭐☆☆☆ Weak (no rollback, edge cases under-specified)

**Overall Grade:** B+ (86/100)
- Deductions: Missing mandatory sections (-10), no migration scripts (-2), weak rollback (-2)
- The technical design is exceptional, but process and risk management need work

**Estimated Implementation Time:** 8-10 waves × 4-6 hours per wave = 32-60 hours (2-3 weeks at 4h/day)

---

*Generated by /staffreview skill*
*Staff Developer Review + Principal Developer Review*
*Review Date: 2026-02-05*
