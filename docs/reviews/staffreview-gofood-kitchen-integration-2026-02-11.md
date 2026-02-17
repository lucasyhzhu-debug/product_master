# Staff Review: GoFood Kitchen + Goldfinch Depot Integration

**Date:** 2026-02-11
**Plan:** `C:\Users\Irfan\.claude\plans\nested-bouncing-grove.md`
**Reviewers:** Staff Developer (Implementation) + Principal Developer (Architecture)

---

## 0. Plan Structure Validation

```
PLAN VALIDATION CHECKLIST
═════════════════════════

✅ Git Workflow section exists?
  → Branch name: feature/gofood-kitchen-integration
  → Checkpoint strategy: After each wave

✅ Implementation Waves section exists?
  → Agents assigned (convex-backend, react-ui-builder)
  → File paths specified
  → PARALLEL/SEQUENTIAL marked

✅ Documentation Updates section exists?
  → CHANGELOG.md checkbox ✅

✅ Success Criteria section exists?
  → Type check requirement ✅
  → Build requirement ✅

═════════════════════════
```

✅ Plan structure validated.

---

## 1. Summary

**Overall Assessment:** Revise (address 5 critical issues before implementation)

This is a well-researched, thorough plan with excellent business context from 25+ user Q&A questions. The data model is sound, the UI concept is mobile-first and follows existing kitchen patterns, and the core flows are well-documented. However, there are critical issues around the GoBiz sync Phase C architecture (action-to-mutation boundary), missing auth on new mutations, `gofoodDepotStock` race conditions, the cron approach, and a missing testing plan. The frontend design review (jade color, undo button removal) is a good addition.

---

## 2. Critical Issues (Must Fix)

| # | Issue | Category | Location in Plan |
|---|-------|----------|------------------|
| 1 | Phase C cannot call mutations from an action directly | Architecture | Flow 2 / Wave 2 |
| 2 | New mutations missing auth protection | Security | Wave 1 |
| 3 | `gofoodDepotStock` has a race condition with concurrent writes | Schema/Logic | Data Model |
| 4 | Cron cannot guarantee business-hours-only execution | Logic | GoBiz Auto-Sync Cron |
| 5 | No testing plan whatsoever | Testing | Wave 4 |

**Details:**

### Issue 1: Phase C cannot call mutations from an action directly

The GoBiz adapter (`convex/integrations/gobiz/adapter.ts`) is an `action` (uses `"use node"` for HTTP fetching). Convex actions cannot call `ctx.db` directly — they must use `ctx.runMutation()` or `ctx.runQuery()` to interact with the database.

The plan says Phase C will "call `recordSale` for each matched GoFood item" from within the sync action. But:
- `recordSale` as designed is a mutation with direct `ctx.db` access
- The action can only call it via `ctx.runMutation(internal.gofoodDepot.mutations.recordSale, {...})`
- Each `runMutation` call is a separate transaction — if one product's sale records but another fails, you get partial state

**Recommendation:**
1. Expose `recordSale` as an `internalMutation` (not public mutation) — called only by the GoBiz sync action
2. Create a batch-style `recordSales` mutation that processes ALL GoFood items from a sync in a single transaction
3. Clearly document the action→mutation boundary in the plan's Flow 2

### Issue 2: New mutations missing auth protection

The plan creates `recordShipment` as a mutation for "Ship to Goldfinch" but doesn't specify auth. Per CLAUDE.md: "Backend enforcement: Use `requireRole(ctx, args.token, [roles])` from `convex/lib/auth.ts`."

The plan says "anyone with kitchen access" can ship, which means all 4 roles. But the mutation still needs `token: v.string()` in args and `requireRole()` validation.

Similarly, `recordSale` (called from GoBiz sync) needs to be an `internalMutation` (no external access) since it's called from a server action, not from the frontend.

**Recommendation:**
- `recordShipment`: Add `token: v.string()` arg, call `requireRole(ctx, args.token, ["kitchen", "order_staff", "manager", "admin"])`
- `recordSale`: Make it `internalMutation` (import from `../_generated/server`) — only callable by the GoBiz action
- Manual stock adjustment mutation (mentioned but not detailed): Restrict to `["manager", "admin"]`

### Issue 3: `gofoodDepotStock` race condition

`gofoodDepotStock` uses a running `quantity` field updated by both:
1. "Ship to Goldfinch" (frontend mutation, +N)
2. GoBiz sync Phase C (backend action→mutation, -N)

If GoBiz cron runs while someone is shipping, both read the same `quantity` value and one write overwrites the other. Convex mutations are transactional within a single mutation, but two separate mutations reading and writing the same document can interleave.

**Recommendation:**
- This is actually mitigated by Convex's OCC (Optimistic Concurrency Control) — if two mutations touch the same document simultaneously, one will automatically retry. However, the plan should explicitly acknowledge this and ensure both mutations use a read-then-patch pattern (not read-then-replace).
- Add a note that both `recordShipment` and `recordSale` must read the current `gofoodDepotStock` document and use `ctx.db.patch()` with relative increments rather than absolute values.
- Even better: Add a `stickerDeficit` field to `gofoodDepotStock` so deficits are tracked in the same document and don't require a separate table.

### Issue 4: Cron cannot guarantee business-hours-only execution

The plan uses `crons.interval("sync gobiz revenue", { hours: 2 }, ...)` with a runtime check for business hours. But `crons.interval` runs on a fixed interval from deployment — it doesn't respect WIB business hours. You'll get runs at 2 AM, 4 AM, etc. that simply bail out.

This wastes execution quota and creates noise in sync logs.

**Recommendation:**
- Use `crons.interval` as planned but acknowledge the early-exit cost is minimal (just a timestamp check + return)
- Alternatively, use `crons.cron("sync gobiz revenue", "0 8,10,12,14,16,18,20 * * *", ...)` — exact hours at UTC offsets matching WIB business hours (1, 3, 5, 7, 9, 11, 13 UTC = 8-20 WIB). Note: Convex `crons.cron` uses standard cron syntax.
- Add the cron to run as `syncType: "cron"` (already in the externalSyncLogs schema union)

### Issue 5: No testing plan

Wave 4 lists only `code-auditor`, `npm run build`, and a vague "Manual test" — no automated tests. Per the staffreview testing rubric, this is **Missing**.

New backend logic includes:
- `recordShipment` mutation (multi-table writes: depot stock, shipments, production counts, sticker transfer)
- `recordSale` mutation (depot stock decrement, FIFO consumption, production log)
- `getGoFoodDailyOrder` query (complex computed assembly from 4 data sources)
- GoBiz Phase C integration (item matching, deficit handling)

All of these need convex-test coverage.

**Recommendation:** Add Wave 3.5 (Testing) or extend Wave 4:

| Agent | Task | Files |
|-------|------|-------|
| tdd-test-architect | Backend tests: `recordShipment` (happy path, insufficient boxed, sticker transfer), `recordSale` (happy path, deficit, zero stock), `getGoFoodDailyOrder` (no targets, partial shipment, full shipment) | `convex/gofoodDepot/__tests__/mutations.test.ts`, `convex/gofoodDepot/__tests__/queries.test.ts` |

---

## 3. Improvements (Recommended)

| # | Improvement | Impact | Effort |
|---|-------------|--------|--------|
| 1 | Batch `recordSales` for atomicity | High | Medium |
| 2 | Add `shippedToGoldfinch` to existing `productionCounts` queries | Medium | Low |
| 3 | Handle `externalSyncLogs.syncType` for cron | Medium | Low |
| 4 | Use internal helpers instead of calling `transferStock` mutation | High | Low |
| 5 | Add manual depot stock correction mutation | Medium | Low |

**Details:**

### Improvement 1: Batch `recordSales` for atomicity

Instead of calling `recordSale` per-product from the action, create a single `internalMutation` that processes ALL GoFood sale items in one transaction:

```typescript
export const processSyncSales = internalMutation({
  args: {
    items: v.array(v.object({
      menuProductId: v.id("menuProducts"),
      quantity: v.number(),
    })),
  },
  handler: async (ctx, args) => {
    // Process all in one transaction
    for (const item of args.items) {
      // decrement depot stock, consume sticker, write log
    }
  },
});
```

This prevents partial state if one product fails.

### Improvement 2: Expose `shippedToGoldfinch` in existing queries

The plan adds `shippedToGoldfinch` to `productionCounts` table but doesn't update the existing `productionCounts/queries.ts::getAll` query to include it. The frontend hook `useKitchenProduction` calls `api.productionCounts.queries.getAll` — ensure the query return type includes the new field.

### Improvement 3: Sync type for cron

The existing `externalSyncLogs` schema already supports `syncType: "cron"` in its union. The auto-sync action should pass `syncType: "cron"` instead of `"manual"`.

### Improvement 4: Use FIFO helpers directly in `recordShipment`

The plan says `recordShipment` will "Call existing `transferStock(...)`" — but `transferStock` is a mutation. You can't call a mutation from within another mutation. Instead, import the FIFO helpers directly:

```typescript
import { consumeFromFIFO, applyFIFOConsumption } from "../inventory/fifo";
import { updateComponentStock } from "../inventory/helpers";
```

Then call `consumeFromFIFO()` and `applyFIFOConsumption()` directly within the `recordShipment` mutation, followed by creating new batches at the destination. This is exactly what `transferStock` does internally.

### Improvement 5: Manual depot stock correction

The plan mentions "Manual adjustment for reconciliation/correction" as an updater for `gofoodDepotStock` but doesn't define the mutation. Add an `adjustDepotStock` mutation (admin/manager only) for when physical counts differ from system counts.

---

## 4. Refinements (Minor Suggestions)

- The `gofoodDepotStock.lastShipmentDate` field is redundant — you can derive it from `gofoodDepotShipments` via a query. Consider dropping it to reduce data staleness risk.
- The `gofoodDepotShipments.stickersTransferred` field is useful but the sticker transfer is already logged in `componentTransactions`. Consider whether both are needed or if one reference suffices.
- The plan proposes `gofoodDepotShipments.shippedBy: v.string()` — consider using `v.id("users")` for type safety, but string works fine for display names.
- The "Sync Now" button in the Sticker panel should debounce or disable for 60s after a sync to prevent rapid re-syncs (GoBiz API rate limiting).
- Consider adding `gofoodDepotStock.stickerDeficit: v.optional(v.number())` to track cumulative sticker shortfalls directly on the document.

---

## 5. Duplication Analysis

### Existing Code to Leverage
| Existing Code | Location | How to Use |
|---------------|----------|------------|
| `consumeFromFIFO` + `applyFIFOConsumption` | `convex/inventory/fifo.ts` | Import directly in `recordShipment` and `recordSale` mutations |
| `updateComponentStock` | `convex/inventory/helpers.ts` | Call after FIFO consumption to update aggregated stock |
| `transferStock` mutation logic | `convex/inventory/mutations.ts:274-363` | Copy the pattern (consume→create destination batches) into `recordShipment`, don't call the mutation |
| `fetchWithAuth` | `convex/integrations/gobiz/adapter.ts` | Already used; Phase C runs within the existing `syncGoBizRevenue` action |
| `FlipNumber` component | `src/components/kitchen/FlipNumber.tsx` | Reuse in GoFoodStickerCard stat display |
| `actionToast` utility | `src/lib/actionToast.ts` | Use for "Shipped to Goldfinch" feedback |
| Double-tap confirm pattern | `src/components/kitchen/PackingPanel.tsx:112-150` | Copy for "SHIP TO GOLDFINCH" button |
| Kitchen card anatomy | `StickeringPanel.tsx`, `BoxingPanel.tsx` | Follow border-l-4, tinted header, white content pattern |
| `useProtectedMutation` hook | `src/hooks/convex/useProtectedMutation.ts` | Use for `recordShipment` frontend call |

### Potential Duplication Risks
- The plan creates `convex/gofoodDepot/queries.ts::getGoldfinchStickerInventory` — check if existing `convex/inventory/queries.ts` already has a location-filtered stock query that could be reused/extended.
- `getGoFoodDailyOrder` assembles data from `productionProductTargets` + `externalRevenueItems` — similar aggregation patterns exist in `convex/productionTargets/queries.ts::getProductTargets`. Consider extending that query or sharing helper logic.

---

## 6. Phase/Wave Accuracy

| Phase | Assessment | Notes |
|-------|------------|-------|
| Wave 1: Schema + Core Logic | Needs Adjustment | Schema changes and mutations should NOT run in parallel on same file (`schema.ts`). Schema must be deployed first before mutations reference new tables. |
| Wave 2: GoBiz Integration + Cron | Good | Sequential after Wave 1 is correct. |
| Wave 3: Frontend Kitchen UI | Good | Parallel after Wave 2 is correct. 6 parallel tasks are fine. |
| Wave 4: Verification | Needs Adjustment | Missing automated tests. Add test wave. |

**Ordering Issues:**
- Wave 1 has 3 parallel tasks all touching `convex/schema.ts` (one modifies it, others create files referencing new tables). The schema change must complete and deploy before mutations can reference the new tables. Split Wave 1:
  - Wave 1a: Schema changes only (`convex/schema.ts`)
  - Wave 1b: Mutations + queries (can parallelize `mutations.ts` and `queries.ts` since they don't overlap)

**Missing Phases:**
- Wave 3.5: Backend tests (convex-test for new mutations/queries)
- Wave 3 should also include: Remove undo buttons from `BoxingPanel.tsx` and `StickeringPanel.tsx` (mentioned in Frontend Design Review but not in wave tasks)
- Wave 3 should include: Add GoFood CSS variables to `src/index.css`

---

## 7. Specialist Agent Recommendations

| Phase | Recommended Agent | Rationale |
|-------|-------------------|-----------|
| Wave 1a: Schema | `convex-backend` | Schema changes require careful typing |
| Wave 1b: Mutations + Queries | `convex-backend` | Core backend logic, FIFO integration |
| Wave 2: GoBiz Phase C + Cron | `convex-backend` | Action→mutation boundary, complex integration |
| Wave 3: Frontend Components | `react-ui-builder` | New components + existing component updates |
| Wave 3.5: Backend Tests | `tdd-test-architect` | convex-test patterns, edge case coverage |
| Wave 4: Verification | `code-auditor` + Bash | Type check + build verification |

---

## 8. Git Workflow Assessment

### Branch Strategy
| Assessment | Status |
|------------|--------|
| Feature branch specified | ✅ Yes: `feature/gofood-kitchen-integration` |
| Branch naming convention | ✅ Correct |
| Merge strategy documented | ⚠️ Implicit (checkpoints after each wave, but no explicit merge instructions) |

### Commit Strategy
| Phase | Expected Commits | Commit Type | Notes |
|-------|------------------|-------------|-------|
| Wave 1a | 1 | feat | Schema changes only |
| Wave 1b | 2 | feat | Mutations + queries (separate commits) |
| Wave 2 | 2 | feat | GoBiz Phase C + cron (separate) |
| Wave 3 | 4-6 | feat | New components + updates (batch logically) |
| Wave 3.5 | 1 | test | Backend tests |
| Wave 4 | 0 | - | Verification only |

### Recommended Commit Checkpoints
1. After schema change → `feat(schema): add gofoodDepotStock, gofoodDepotShipments tables`
2. After backend mutations → `feat(gofoodDepot): add recordShipment and recordSale mutations`
3. After backend queries → `feat(gofoodDepot): add depot stock queries and virtual daily order`
4. After GoBiz Phase C → `feat(gobiz): add Phase C auto-sticker deduction on sale sync`
5. After cron → `feat(cron): add GoBiz auto-sync every 2 hours`
6. After frontend components → `feat(kitchen): add GoFood sticker card and packing card`
7. After panel updates → `feat(kitchen): integrate GoFood cards into sticker and pack panels`
8. After undo removal → `refactor(kitchen): remove redundant undo buttons from boxing/stickering`
9. After tests → `test(gofoodDepot): add convex-test coverage for mutations and queries`

### Pre-Push Verification
- [x] Plan includes `npm run build` check
- [x] Plan includes `npm run type-check` verification
- [ ] Plan should include `npm run test` before push (**missing**)

### CI/CD Considerations
| Concern | Assessment |
|---------|------------|
| Rollback strategy | ❌ Missing — should note: new tables are additive, safe to roll back frontend without data loss |
| Deployment order | ✅ Correct — backend (schema first) then frontend |
| Data backup needed | ⚠️ Recommended before cron setup |
| Migration safety | ✅ Safe — new tables, new optional field on existing table |

### Git Workflow Issues Found
- No explicit `git switch -c feature/gofood-kitchen-integration` step at start
- No explicit `npm run build` checkpoint between Wave 1 and Wave 2
- Missing `npm run test` in verification

---

## 9. Documentation Checkpoints

| Phase | Documentation Update Required |
|-------|-------------------------------|
| Wave 1 | `docs/SCHEMA.md` (new tables + modified productionCounts) |
| Wave 2 | `docs/API_REFERENCE.md` (new gofoodDepot module + Phase C description) |
| Final | `docs/CHANGELOG.md` (always required) |

### CHANGELOG.md Entry (Draft)
```markdown
## 2026-02-XX - GoFood Kitchen + Goldfinch Depot Integration

**Goldfinch depot stock tracking integrated into Kitchen View with automated GoBiz sync.**

- Added `gofoodDepotStock` and `gofoodDepotShipments` tables for depot inventory tracking
- Added `shippedToGoldfinch` field to `productionCounts` table
- Added GoFood Sticker Card (read-only depot info) in Kitchen Sticker panel
- Added GoFood Packing Card (ship-to-depot) in Kitchen Pack panel
- Added depot stock annotation in Production Log's Finished Products table
- Added GoBiz auto-sync cron (every 2 hours during business hours)
- Added Phase C to GoBiz sync: auto sticker deduction on GoFood sale
- Added jade green (#2D8A6E) GoFood color identity to kitchen design system
- Removed redundant "Undo last (-1)" buttons from Boxing and Stickering panels
- Added freshness tracking (green/yellow/red) for depot stock age

**Files Modified:**
- `convex/schema.ts` (new tables)
- `convex/gofoodDepot/mutations.ts` (new)
- `convex/gofoodDepot/queries.ts` (new)
- `convex/integrations/gobiz/adapter.ts` (Phase C)
- `convex/crons.ts` (auto-sync)
- `src/components/kitchen/GoFoodStickerCard.tsx` (new)
- `src/components/kitchen/GoFoodPackingCard.tsx` (new)
- `src/components/kitchen/StickeringPanel.tsx`
- `src/components/kitchen/PackingPanel.tsx`
- `src/components/kitchen/BoxingPanel.tsx`
- `src/components/kitchen/ProductionLogPanel.tsx`
- `src/hooks/convex/useKitchenProduction.ts`
- `src/index.css` (GoFood CSS variables)
```

---

## 10. Testing Plan Assessment

**Overall Testing Verdict:** Missing

### Planned Tests
| Layer | What's Tested | Test Type | Status |
|-------|---------------|-----------|--------|
| Backend | recordShipment | convex-test | Missing |
| Backend | recordSale | convex-test | Missing |
| Backend | getGoFoodDailyOrder | convex-test | Missing |
| Backend | GoBiz Phase C | convex-test | Missing |
| Frontend | GoFoodStickerCard | Vitest + RTL | Missing |
| Frontend | GoFoodPackingCard | Vitest + RTL | Missing |
| Integration | Ship-to-Goldfinch flow | Manual | Planned (vague) |

### Missing Test Coverage (Must Add)

| # | Missing Test | Why It Matters | Suggested Approach |
|---|--------------|----------------|-------------------|
| 1 | `recordShipment` happy path: increments depot stock, creates shipment log, transfers stickers | Core flow — multi-table mutation must be verified | convex-test: seed data, call mutation, verify all 4 tables updated |
| 2 | `recordShipment` insufficient boxed: quantity > available boxed products | Prevents shipping more than was produced | convex-test: expect error thrown |
| 3 | `recordSale` happy path: decrements depot stock, consumes sticker FIFO, writes production log | Auto-deduction is the core automation | convex-test: seed depot + batches, call mutation, verify FIFO consumed correctly |
| 4 | `recordSale` deficit: not enough stickers at Goldfinch | Must degrade gracefully, not crash | convex-test: seed with 0 stickers, expect partial consumption + deficit flag |
| 5 | `getGoFoodDailyOrder` computed assembly | Virtual order correctness from 4 data sources | convex-test: seed targets + depot + shipments + sales, verify computed fields |
| 6 | `getGoFoodDailyOrder` no targets | Should return empty/null when no GoFood targets for today | convex-test: no targets seeded, verify empty response |
| 7 | `recordSale` with zero depot stock | Edge case: sell when depot shows 0 | convex-test: verify it doesn't go negative or throws appropriately |
| 8 | GoBiz Phase C integration | New items correctly trigger `recordSale` | Integration test or mock within existing sync test |

### Test Execution Checkpoints
1. After Wave 1b backend: `npm run test` (new + existing backend tests pass)
2. After Wave 2 GoBiz: `npm run test` (Phase C tests pass)
3. After Wave 3 frontend: `npm run test` (component tests pass)
4. Before merge: `npm run test && npm run build` full verification

### Regression Risk
- Existing `productionCounts` queries may need updating if `shippedToGoldfinch` field is required (vs optional)
- Existing GoBiz sync tests (if any) should still pass after Phase C addition
- Existing kitchen UI components should not regress — test with no GoFood targets set (GoFood cards should not appear)
- Undo button removal should not break boxing/stickering flows

---

## 11. Edge Cases to Address

The plan should explicitly handle:

- [ ] **No GoFood targets set for today:** GoFood cards should not render at all (no sticker card, no packing card)
- [ ] **Depot stock goes negative:** Should clamp to 0 or throw? (Recommendation: clamp + flag deficit)
- [ ] **GoBiz sync runs with expired/invalid token:** Should gracefully fail Phase C without losing Phase A/B data
- [ ] **Multiple shipments in one day:** UI should show cumulative shipped-today total, not just last shipment
- [ ] **Product added to GoFood targets mid-day:** GoFood card should appear dynamically
- [ ] **Sticker component not linked to product:** Products without a `consumptionStage="labeling"` component should be skipped in Phase C
- [ ] **Goldfinch location deleted or deactivated:** Mutations should validate location exists and is active
- [ ] **Zero quantity shipment:** Should be rejected (don't create empty shipment records)
- [ ] **Concurrent ship + sync:** Both writing to same `gofoodDepotStock` — handled by Convex OCC but needs testing

---

## 12. Approval Conditions

**For Approval, address:**
1. **Critical #1:** Document the action→mutation boundary for Phase C; use `internalMutation` for `recordSale`
2. **Critical #2:** Add auth (`token` + `requireRole`) to `recordShipment`; make `recordSale` internal
3. **Critical #3:** Add note about Convex OCC for concurrent writes; use patch-with-increment pattern
4. **Critical #4:** Clarify cron strategy (fixed interval with business-hours check is OK, but document the UTC cron alternative)
5. **Critical #5:** Add a testing wave with specific test cases

**Recommended before implementation:**
1. Split Wave 1 into 1a (schema) and 1b (mutations/queries)
2. Import FIFO helpers directly instead of calling `transferStock` mutation
3. Add manual depot stock correction mutation
4. Extend Wave 3 to include undo button removal + CSS variable addition

---

*Generated by /staffreview skill*
*Staff Developer Review + Principal Developer Review*
