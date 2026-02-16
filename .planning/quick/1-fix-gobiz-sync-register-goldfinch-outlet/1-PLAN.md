---
phase: quick-gobiz-fix
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - convex/integrations/gobiz/adapter.ts
  - convex/externalData/queries.ts
  - docs/CHANGELOG.md
autonomous: true
must_haves:
  truths:
    - "GoBiz sync auto-registers Goldfinch and Crystal outlets before building outletMap"
    - "GoBiz sync saves product mappings to externalProductMappings after fetching order details"
    - "Revenue records from GoBiz show outlet name in Customer/Store column on Sales Analytics page"
    - "CHANGELOG documents Phase 14.1 gap closure items"
  artifacts:
    - path: "convex/integrations/gobiz/adapter.ts"
      provides: "Auto-seed outlets + product mapping calls in sync flow"
      contains: "internalUpsertOutlet"
    - path: "convex/externalData/queries.ts"
      provides: "GoBiz outlet name enrichment in getRevenue"
      contains: "gobiz"
    - path: "docs/CHANGELOG.md"
      provides: "Updated changelog with gap closure items"
      contains: "Save as Draft"
  key_links:
    - from: "convex/integrations/gobiz/adapter.ts"
      to: "convex/externalData/mutations.ts:internalUpsertOutlet"
      via: "ctx.runMutation before outletMap build"
      pattern: "internalUpsertOutlet"
    - from: "convex/integrations/gobiz/adapter.ts"
      to: "convex/externalData/mutations.ts:saveProductMappings"
      via: "ctx.runMutation after Phase B order details"
      pattern: "saveProductMappings"
    - from: "convex/externalData/queries.ts"
      to: "externalOutlets table"
      via: "outletNameMap lookup for gobiz source"
      pattern: "gobiz.*outletId"
---

<objective>
Fix three GoBiz sync issues: (1) auto-register outlets so Goldfinch/Crystal always exist before sync runs, (2) save product mappings from GoFood transactions so they appear in the mapping UI, (3) show outlet names in the Customer/Store column for GoBiz revenue records. Also update CHANGELOG for Phase 14.1 gap closure.

Purpose: GoBiz sync silently skips revenue attribution because outlets aren't registered, product mappings never populate, and the Sales Analytics table shows "---" for all GoBiz rows.
Output: Working GoBiz sync with self-bootstrapping outlets, product mapping population, and visible outlet names.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@convex/integrations/gobiz/adapter.ts
@convex/integrations/gobiz/config.ts
@convex/integrations/gobiz/mutations.ts
@convex/externalData/queries.ts
@convex/externalData/mutations.ts
@convex/integrations/k3mart/adapter.ts (reference: lines 190-200 show saveProductMappings pattern)
@docs/CHANGELOG.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Auto-seed outlets and save product mappings in GoBiz adapter</name>
  <files>convex/integrations/gobiz/adapter.ts</files>
  <action>
Two changes to `convex/integrations/gobiz/adapter.ts`:

**Change A: Auto-seed outlets before building outletMap (both syncGoBizRevenue and autoSyncGoBizRevenue)**

In `syncGoBizRevenue` handler, BEFORE the outletMap build loop (before line 482), add auto-seed using `GOBIZ_OUTLET_SEED` from config and `internalUpsertOutlet` from externalData/mutations:

```typescript
import { GOBIZ_OUTLET_SEED } from "./config";
```

Then before the outletMap construction in BOTH `syncGoBizRevenue` (around line 482) and `autoSyncGoBizRevenue` (around line 703):

```typescript
// Auto-seed outlets (idempotent upsert ensures they exist)
for (const outlet of GOBIZ_OUTLET_SEED) {
  await ctx.runMutation(internal.externalData.mutations.internalUpsertOutlet, {
    source: outlet.source,
    externalId: outlet.externalId,
    name: outlet.name,
    isActive: true,
  });
}
```

Place this BEFORE `const outletMap = new Map(...)` in both functions.

**Change B: Save product mappings after Phase B completes**

In `syncGoBizRevenue`, after Phase B completes (after the `console.log("Phase B complete:...")` at ~line 550), collect unique product names from `enrichedItems` and call `saveProductMappings`.

To collect products efficiently, modify `fetchAndSaveOrderDetails` to also return unique product names:
- Add a `Set<string>` called `uniqueProductNames` at the top of the function
- In the inner loop where enrichedItems are built, add each `item.productName` to the Set
- Return `uniqueProductNames` alongside existing return values (as `productNames: Array.from(uniqueProductNames)`)

Then in `syncGoBizRevenue`, after Phase B:
```typescript
if (orderResults.productNames.length > 0) {
  await ctx.runMutation(internal.externalData.mutations.saveProductMappings, {
    mappings: orderResults.productNames.map(name => ({
      source: "gobiz" as const,
      externalProductCode: name,
      externalProductName: name,
    })),
  });
  console.log(`  Saved ${orderResults.productNames.length} product mappings`);
}
```

Do the same for `autoSyncGoBizRevenue` Phase B section (~line 729-731). Capture the return value of `fetchAndSaveOrderDetails` and call `saveProductMappings` with the product names.

IMPORTANT: The `fetchAndSaveOrderDetails` return type changes. Update the return type to include `productNames: string[]`.
  </action>
  <verify>Run `npm run type-check` to confirm no TypeScript errors. Verify the import of GOBIZ_OUTLET_SEED is added. Verify `saveProductMappings` call exists after Phase B in both sync functions.</verify>
  <done>Both sync functions auto-seed outlets before outletMap build. fetchAndSaveOrderDetails returns unique product names. Both sync functions call saveProductMappings after Phase B with collected product names.</done>
</task>

<task type="auto">
  <name>Task 2: Add GoBiz outlet name to getRevenue query</name>
  <files>convex/externalData/queries.ts</files>
  <action>
In `convex/externalData/queries.ts`, in the `getRevenue` query handler, at line 172 (after the `else if (r.source === "internal" ...)` block and before the closing of the map callback), add:

```typescript
} else if (r.source === "gobiz" && r.outletId) {
  customerStoreName = outletNameMap.get(r.outletId);
}
```

This goes between line 171 (`customerStoreName = customerNameMap.get(r.externalTransactionId);`) closing brace and line 174 (`// Override gross/net for internal orders...`).

The outletNameMap is already built earlier in the function (lines 139-146) from ALL revenue records with outletId, so no additional data fetching is needed. The fix is simply adding the missing `else if` branch for the gobiz source.
  </action>
  <verify>Run `npm run type-check` to confirm no TypeScript errors. Grep for "gobiz" in getRevenue to confirm the branch exists.</verify>
  <done>getRevenue query returns customerStoreName for GoBiz revenue records (e.g., "Legato Goldfinch" or "GoFood Crystal") instead of undefined.</done>
</task>

<task type="auto">
  <name>Task 3: Update CHANGELOG with Phase 14.1 gap closure + GoBiz fix</name>
  <files>docs/CHANGELOG.md</files>
  <action>
In `docs/CHANGELOG.md`, add two items to the existing "2026-02-16 - Phase 14.1: Draft Order Fixes" entry:

Under the "### Fixed" section, add:
```
- Removed AnimatePresence fade transitions that caused blank page on navigation
- Save as Draft button now persists all order fields (items, delivery, notes) without requiring status change
```

Then add a NEW changelog entry ABOVE the Phase 14.1 entry (newer entries go on top):

```markdown
## 2026-02-16 - GoBiz Sync Fixes

GoBiz (GoFood) revenue sync now properly registers outlets and populates product mappings automatically. The Sales Analytics table shows the actual outlet name (Legato Goldfinch / GoFood Crystal) instead of a blank dash.

### Fixed
- GoBiz outlets (Goldfinch, Crystal) now auto-register on every sync run (no manual seed required)
- Product mappings from GoFood transactions now saved to externalProductMappings table
- Customer/Store column in Sales Analytics now shows outlet name for GoBiz revenue records

---
```
  </action>
  <verify>Read docs/CHANGELOG.md and confirm both the new GoBiz entry and updated Phase 14.1 Fixed section exist.</verify>
  <done>CHANGELOG has new GoBiz sync fixes entry and Phase 14.1 gap closure items (AnimatePresence removal, Save as Draft button).</done>
</task>

</tasks>

<verification>
1. `npm run type-check` passes with zero errors
2. `npm run build` succeeds
3. In adapter.ts: grep for `internalUpsertOutlet` shows calls in BOTH sync functions
4. In adapter.ts: grep for `saveProductMappings` shows calls in BOTH sync functions
5. In queries.ts: grep for `gobiz.*outletId` confirms the new branch in getRevenue
6. In CHANGELOG.md: both new entries present
</verification>

<success_criteria>
- [ ] `npm run type-check` passes
- [ ] `npm run build` succeeds
- [ ] GoBiz adapter auto-seeds outlets before outletMap construction (both sync functions)
- [ ] GoBiz adapter saves product mappings after Phase B (both sync functions)
- [ ] getRevenue returns outlet name for gobiz source records
- [ ] CHANGELOG updated with GoBiz fixes and Phase 14.1 gap closure
</success_criteria>

<output>
After completion, create `.planning/quick/1-fix-gobiz-sync-register-goldfinch-outlet/1-SUMMARY.md`
</output>
