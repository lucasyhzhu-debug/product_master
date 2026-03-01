# Phase 31: Tech Debt Cleanup - Research

**Researched:** 2026-03-01
**Domain:** TypeScript type safety, API contract clarity, dead code removal
**Confidence:** HIGH

## Summary

Phase 31 addresses 4 specific tech debt items identified in the v1.4 milestone audit. All items are isolated, well-scoped fixes with no cross-cutting concerns. The work involves: (1) replacing 2 `as any` casts in BigSeller production code with proper runtime type guards, (2) evaluating whether a dedicated SKU index is needed on `bigsellerOrders` or `externalProductMappings`, (3) clarifying the confusing GrabFood pause duration mapping where the numeric key `120` maps to `"24h"`, and (4) removing a dead `createTag` export from test helpers.

This is a cleanup phase -- no new features, no schema changes, no UI changes. The risk is extremely low and the scope is tightly bounded by the audit findings.

**Primary recommendation:** Fix all 4 items in a single plan with sequential tasks. No schema migration needed. The SKU index is already covered by the existing `by_source_code` composite index -- document this conclusion rather than adding a new index.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Convex | ^1.31.7 | Backend runtime + type system | Project's existing backend |
| TypeScript | ~5.9 | Static type checking | Project standard |
| Vitest | ^4.0.18 | Test runner | Project standard |

### Supporting
No new libraries needed. This phase uses only existing project dependencies.

### Alternatives Considered
None -- this is a cleanup phase operating entirely within the existing stack.

**Installation:**
```bash
# No new packages needed
```

## Architecture Patterns

### Pattern 1: Runtime Type Guard for Convex Union Types

**What:** The `externalSource` validator in `convex/schema.ts` defines 8 literal strings. When a `string` value (e.g., from `split("::")[0]`) needs to be passed to `withIndex("by_source_code")`, Convex's type system requires the exact union type, not a plain `string`. The fix is a runtime type guard that narrows `string` to the union.

**When to use:** Whenever a dynamically-derived string must be passed to a Convex index query that expects a union-typed field.

**The problem (current code):**
```typescript
// convex/bigsellerOrders/queries.ts:102-110
const [platform, skuCode] = key.split("::");
// platform is `string`, but withIndex needs externalSource union type
.eq("source", platform as any)  // <-- unsafe cast
```

**The fix:**
```typescript
// Define the valid sources as a const array (single source of truth)
const EXTERNAL_SOURCES = [
  "k3mart", "gobiz", "internal", "grabfood",
  "bigseller", "consignment", "shopee", "tiktok",
] as const;

type ExternalSource = (typeof EXTERNAL_SOURCES)[number];

function isExternalSource(s: string): s is ExternalSource {
  return (EXTERNAL_SOURCES as readonly string[]).includes(s);
}

// Usage:
const [platform, skuCode] = key.split("::");
if (!skuCode || !isExternalSource(platform)) continue;
// Now `platform` is narrowed to ExternalSource -- no `as any` needed
.eq("source", platform)
```

**Where to define the guard:** Create a shared helper in `convex/lib/externalSource.ts` since both `bigsellerOrders/queries.ts` and `integrations/bigseller/queries.ts` need it. This avoids duplicating the array in two places.

**Confidence:** HIGH -- this is standard TypeScript narrowing. The const array must match the `externalSource` validator in `schema.ts`. Adding a comment linking them ensures future sync.

### Pattern 2: Self-Documenting Duration Map (GrabFood Pause)

**What:** The current `durationMap` uses numeric keys representing minutes (30, 60, 120) but `120` maps to `"24h"` -- a 24-hour pause, not 2 hours. This creates confusion because the key implies minutes but the value implies a completely different duration.

**Current code (confusing):**
```typescript
// convex/integrations/grabfood/adapter.ts:306
const durationMap: Record<number, string> = { 30: "30m", 60: "1h", 120: "24h" };
```

**The confusion chain:**
1. Frontend defines buttons: `{ mins: 30 }, { mins: 60 }, { mins: 120 }`
2. Button labels: `"30 min"`, `"1 hour"`, `"24 hours"` (120 mins labeled as 24 hours!)
3. Backend maps: `30 -> "30m"`, `60 -> "1h"`, `120 -> "24h"`
4. GrabFood API receives: `"30m"`, `"1h"`, or `"24h"`

**Root cause:** The GrabFood Partner API only supports 3 pause durations: `"30m"`, `"1h"`, `"24h"`. The frontend chose to use `mins: 120` as a UI-level identifier for the 24-hour option, but `120` is not the actual duration in minutes (which would be 1440). The number `120` is arbitrary -- it's just "the third option."

**Recommended fix:** Replace numeric-keyed map with a named-option pattern that removes the false implication of minutes:

```typescript
// Option A: Use the API values directly as keys (recommended)
const GRABFOOD_PAUSE_DURATIONS = {
  "30m": { label: "30 min", apiValue: "30m" },
  "1h":  { label: "1 hour", apiValue: "1h" },
  "24h": { label: "24 hours", apiValue: "24h" },
} as const;

// Frontend sends the API value directly, no translation needed
// Backend validates it's one of the 3 allowed values
```

```typescript
// Option B: Keep numeric keys but rename them to match reality
// Change frontend from mins: 120 to mins: 1440 (actual 24h in minutes)
// This keeps the "minutes" semantic honest but requires frontend change
```

**Confidence:** HIGH -- GrabFood API docs confirm only 3 values: `"30m"`, `"1h"`, `"24h"`. The `120` key is not a real minutes value.

**Impact boundary:** This affects:
- `convex/integrations/grabfood/adapter.ts` (backend: durationMap + response message)
- `src/pages/GrabFoodManager.tsx` (frontend: button config + handler parameter)
- `src/hooks/convex/useGrabFood.ts` (hook: pauseStore argument type)

### Anti-Patterns to Avoid
- **Don't add a new Convex index without evidence of a performance problem.** The `by_source_code` composite index on `externalProductMappings` already covers the SKU lookup pattern. Adding a redundant index wastes Convex's index budget.
- **Don't change the `externalSource` validator in schema.ts.** The type guard extracts the existing values -- it does not alter the schema.
- **Don't touch test `as any` casts.** The `as any` casts in test files (e.g., `"sync-id" as any` for Convex IDs) are acceptable test ergonomics. Only production code casts are in scope.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Type narrowing for union | Custom validator lib | Simple `includes()` type guard | Standard TS pattern, < 10 lines |
| Duration config | Complex enum system | Const object with JSDoc | 3 values, no need for complexity |

**Key insight:** This phase is about surgical cleanup, not architectural improvement. Every fix should be the smallest correct change.

## Common Pitfalls

### Pitfall 1: Const Array Drifting from Schema Validator
**What goes wrong:** The `EXTERNAL_SOURCES` array in the type guard falls out of sync with `externalSource` in `schema.ts` when a new platform is added in the future.
**Why it happens:** Two separate definitions of the same set of values.
**How to avoid:** Add a prominent comment in both locations cross-referencing each other. Consider a contract test that validates the array matches the validator's accepted values.
**Warning signs:** TypeScript compile error when a new source is added to schema but not to the array (good -- fails loudly). However, missing a source in the array means valid data would be silently skipped (bad -- fails quietly).

### Pitfall 2: Changing Frontend Pause Parameter Without Updating Backend
**What goes wrong:** If the frontend changes from sending `120` to sending `"24h"`, the backend's `pauseDuration: v.number()` arg validator rejects it.
**Why it happens:** The frontend and backend must agree on the parameter type/value.
**How to avoid:** Change both sides atomically. If switching from numeric to string keys, update the Convex action arg validator from `v.number()` to `v.string()`.

### Pitfall 3: Removing createTag Breaks Future Tests
**What goes wrong:** Removing `createTag` from helpers.ts could break a test that gets added later and needs it.
**Why it happens:** Over-aggressive dead code removal.
**How to avoid:** The `tags` table still exists in schema. However, all tag-related tests were deleted in Phase 29.1 and no current tests import `createTag`. The removal is safe. If a future test needs it, it can be re-added.

### Pitfall 4: Index Evaluation -- Adding Unnecessary Indexes
**What goes wrong:** Adding a standalone `by_sku` index on `bigsellerOrders` when the existing `externalProductMappings.by_source_code` composite index already handles the lookup pattern.
**Why it happens:** The audit note mentions "evaluate SKU index needs" but the current query pattern in `getUnmappedSkus` iterates all bigsellerOrders (table scan) then looks up each SKU in `externalProductMappings` using `by_source_code`. The table scan on `bigsellerOrders` is acceptable at ~hundreds of rows. The bottleneck, if any, would be the N lookups in `externalProductMappings`, but those are already indexed.
**How to avoid:** Document the evaluation conclusion. No schema change needed.

## Code Examples

### Type Guard for ExternalSource (New File)

```typescript
// convex/lib/externalSource.ts

/**
 * Runtime type guard for the externalSource union type.
 *
 * IMPORTANT: This array MUST match the literals in `externalSource`
 * validator defined in convex/schema.ts. If you add a new platform
 * to the schema, add it here too.
 */
export const EXTERNAL_SOURCES = [
  "k3mart", "gobiz", "internal", "grabfood",
  "bigseller", "consignment", "shopee", "tiktok",
] as const;

export type ExternalSource = (typeof EXTERNAL_SOURCES)[number];

/** Narrows a string to ExternalSource if it matches a known platform. */
export function isExternalSource(s: string): s is ExternalSource {
  return (EXTERNAL_SOURCES as readonly string[]).includes(s);
}
```

### Fixed BigSeller Query (bigsellerOrders/queries.ts)

```typescript
// Before (line 102-110):
const [platform, skuCode] = key.split("::");
if (!skuCode) continue;
const mapping = await ctx.db
  .query("externalProductMappings")
  .withIndex("by_source_code", (q) =>
    q.eq("source", platform as any).eq("externalProductCode", skuCode)
  )
  .unique();

// After:
import { isExternalSource } from "../lib/externalSource";
// ...
const [platform, skuCode] = key.split("::");
if (!skuCode || !isExternalSource(platform)) continue;
const mapping = await ctx.db
  .query("externalProductMappings")
  .withIndex("by_source_code", (q) =>
    q.eq("source", platform).eq("externalProductCode", skuCode)
  )
  .unique();
```

### Fixed BigSeller Internal Query (integrations/bigseller/queries.ts)

```typescript
// Before (line 53-65):
export const checkProductMapping = internalQuery({
  args: {
    source: v.string(),
    externalProductCode: v.string(),
  },
  handler: async (ctx, args) => {
    const mapping = await ctx.db
      .query("externalProductMappings")
      .withIndex("by_source_code", (q) =>
        q.eq("source", args.source as any)
          .eq("externalProductCode", args.externalProductCode)
      )
      .unique();

// After:
import { isExternalSource } from "../../lib/externalSource";
// ...
export const checkProductMapping = internalQuery({
  args: {
    source: v.string(),
    externalProductCode: v.string(),
  },
  handler: async (ctx, args) => {
    if (!isExternalSource(args.source)) return null;
    const mapping = await ctx.db
      .query("externalProductMappings")
      .withIndex("by_source_code", (q) =>
        q.eq("source", args.source)
          .eq("externalProductCode", args.externalProductCode)
      )
      .unique();
```

### Self-Documenting Pause Duration (grabfood/adapter.ts)

```typescript
// Before (line 306):
const durationMap: Record<number, string> = { 30: "30m", 60: "1h", 120: "24h" };

// After:
/**
 * GrabFood API pause durations.
 * Only 3 values are supported by the API: "30m", "1h", "24h".
 * Keys are the minute values sent from the frontend UI buttons.
 * Note: 1440 = 24 * 60 (actual minutes in 24 hours).
 */
const PAUSE_DURATION_MAP: Record<number, string> = {
  30: "30m",
  60: "1h",
  1440: "24h",
};
```

And the corresponding frontend change:
```typescript
// Before (GrabFoodManager.tsx:680):
{([{ mins: 30, label: "30 min" }, { mins: 60, label: "1 hour" }, { mins: 120, label: "24 hours" }] as const)

// After:
{([{ mins: 30, label: "30 min" }, { mins: 60, label: "1 hour" }, { mins: 1440, label: "24 hours" }] as const)
```

This keeps the "minutes" semantic honest: `30` = 30 minutes, `60` = 60 minutes, `1440` = 1440 minutes (24 hours). The backend map converts to GrabFood's API string format.

Also update the success message in the backend:
```typescript
// Before:
const action = args.pauseDuration === 0 ? "unpaused" : `paused for ${args.pauseDuration} min`;

// After:
const pauseLabel = PAUSE_DURATION_MAP[args.pauseDuration] ?? `${args.pauseDuration}m`;
const action = args.pauseDuration === 0 ? "unpaused" : `paused for ${pauseLabel}`;
```

### Dead Export Removal (tests/convex/helpers.ts)

```typescript
// Remove lines 55-65 (the entire createTag function):
// /**
//  * Creates a tag.
//  */
// export async function createTag(
//   t: TestContext,
//   name: string
// ): Promise<Id<'tags'>> {
//   return await t.run(async (ctx) => {
//     return await ctx.db.insert('tags', { name });
//   });
// }
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `as any` for type mismatches | Runtime type guards | TypeScript 3.7+ | Type-safe index queries |
| Magic number keys in maps | Self-documenting const objects | Always best practice | Reduced confusion |

**Deprecated/outdated:**
- The `as any` casts were expedient during Phase 28 development but should have been type guards from the start.

## Open Questions

1. **GrabFood API pause behavior verification**
   - What we know: API accepts exactly `"30m"`, `"1h"`, `"24h"`. The frontend currently sends `mins: 120` which maps to `"24h"` in the backend.
   - What's unclear: Whether the UI label "24 hours" is what the user actually wants (it is -- they chose the button labeled "24 hours") vs whether GrabFood actually pauses for 24 hours when receiving `"24h"` (likely yes, but unverified against live API).
   - Recommendation: Proceed with the fix (change `120` to `1440` in frontend). The mapping to `"24h"` API value stays the same. If human testing reveals the API behaves differently, adjust then.

2. **Contract test for EXTERNAL_SOURCES sync**
   - What we know: The type guard array must match the schema validator.
   - What's unclear: Whether a compile-time check is possible (Convex `v.union` doesn't expose member types easily).
   - Recommendation: Add a unit test that validates the array against the schema validator's accepted values. This is LOW priority -- the cross-reference comments are sufficient for now.

## Sources

### Primary (HIGH confidence)
- `convex/schema.ts` lines 18-27: `externalSource` validator with 8 literals
- `convex/bigsellerOrders/queries.ts` line 110: `as any` cast (production code)
- `convex/integrations/bigseller/queries.ts` line 63: `as any` cast (production code)
- `convex/integrations/grabfood/adapter.ts` lines 304-312: pause duration map
- `convex/integrations/grabfood/config.ts`: GrabFood API endpoint config
- `src/pages/GrabFoodManager.tsx` line 680: frontend pause button config
- `tests/convex/helpers.ts` lines 55-65: dead `createTag` export
- `.planning/v1.4-MILESTONE-AUDIT.md`: tech debt inventory (7 items, 4 in scope)

### Secondary (MEDIUM confidence)
- GrabFood Partner API v1.1.3 docs (via config.ts comments): pause endpoint accepts `"30m"`, `"1h"`, `"24h"`
- Phase 27 VERIFICATION.md: documents the pause duration confusion and recommends human verification

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new libraries, all changes in existing codebase
- Architecture: HIGH -- standard TypeScript patterns (type guards, const objects)
- Pitfalls: HIGH -- all pitfalls are concrete, code-level concerns verified against actual source

**Research date:** 2026-03-01
**Valid until:** 2026-04-01 (stable -- this is cleanup of existing code, not dependent on external library changes)
