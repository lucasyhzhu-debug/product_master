# Deploy Failure: dispatchPlans Schema Validation

**Date:** 2026-03-01
**Severity:** BLOCKING (prevents production deploy)
**Command:** `npx convex deploy --yes`

---

## Error

```
Schema validation failed.
Document with ID "sn70ak1h2j3n63rh9tctr5m07x81x0dj" in table "dispatchPlans" does not match the schema:
  Path: .outletId
  Value: "sh7301fnqd92egvr6jpem62cr181x3w7"
  Validator: v.union(v.id("externalOutlets"), v.id("consignmentOutlets"))
```

## Root Cause

A document in the production `dispatchPlans` table has an `outletId` value (`sh7301fnqd92egvr6jpem62cr181x3w7`) that is **not a valid ID from `externalOutlets` or `consignmentOutlets`** tables. The ID prefix `sh73...` doesn't match either table's ID space.

The schema at `convex/schema.ts:1247` defines:
```typescript
outletId: v.optional(v.union(v.id("externalOutlets"), v.id("consignmentOutlets")))
```

This is likely one of:
1. **Stale data** — an outlet was deleted but its `dispatchPlans` references were not cleaned up
2. **Wrong table reference** — the outletId was written from a different table's ID (e.g., `k3martOutlets` or another entity) before the schema was tightened
3. **Manual/seed data** — a dispatch plan was created with a hardcoded or incorrect outletId

## Fix Options

### Option A: Delete the offending document (fastest)
Run in Convex Dashboard > Functions or via `npx convex run`:
```typescript
// Find and inspect the document first
const doc = await ctx.db.get("sn70ak1h2j3n63rh9tctr5m07x81x0dj" as Id<"dispatchPlans">);
console.log(doc);

// If safe to delete:
await ctx.db.delete("sn70ak1h2j3n63rh9tctr5m07x81x0dj" as Id<"dispatchPlans">);
```

### Option B: Fix the outletId to point to a valid outlet
If the dispatch plan is still needed, update its `outletId` to a valid `externalOutlets` or `consignmentOutlets` ID, or set it to `undefined`.

### Option C: Widen the schema validator (not recommended)
Adding more ID types to the union would mask the data quality issue.

## Verification

After fixing the data, re-run:
```bash
npx convex deploy --yes
```

## Lesson

When deleting outlets or changing table references in the schema, always check for foreign key references in related tables (`dispatchPlans`, etc.) and clean up orphaned documents before deploying the stricter schema.
