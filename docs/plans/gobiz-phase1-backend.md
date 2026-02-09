# Phase 1: Backend Foundation

## Context
Establishes all schema changes, new mutations/queries, and auto-match logic. No adapter changes, no frontend. After this phase, the data layer is ready to receive journal-level data.

## Git Workflow
**Branch:** `feature/gobiz-journal-sync`
**Checkpoints:** Single commit after all tasks verified

## Implementation Waves

### Wave 1: Schema Changes [SEQUENTIAL]
| Task | Files | Details |
|------|-------|---------|
| 1.1 Add `externalRevenueItems` table | `convex/schema.ts` | New table with indexes: by_revenue, by_source, by_menu_product, by_product_name |
| 1.2 Add fields to `externalRevenue` | `convex/schema.ts` | Add `adBurn`, `promoBurn`, `gobizOrderNumber` (all optional) after `commission` field |
| 1.3 Add `refreshToken` to `platformCredentials` | `convex/schema.ts` | Add `refreshToken: v.optional(v.string())` after `tokenExpiresAt` |
| 1.4 Add `by_default_price` index to `menuProducts` | `convex/schema.ts` | Add `.index("by_default_price", ["defaultPrice"])` after `by_packaging_pos_slot` |

#### Schema Details

**externalRevenueItems table:**
```typescript
externalRevenueItems: defineTable({
  revenueId: v.id("externalRevenue"),
  source: v.union(v.literal("k3mart"), v.literal("gobiz"), v.literal("internal")),
  externalItemId: v.optional(v.string()),
  productName: v.string(),
  unitPrice: v.number(),
  quantity: v.number(),
  totalPrice: v.number(),
  variants: v.optional(v.string()),  // JSON string for variant details
  linkedMenuProductId: v.optional(v.id("menuProducts")),
  isAutoMatched: v.boolean(),
  matchConfidence: v.optional(v.union(
    v.literal("exact"), v.literal("price_only"),
    v.literal("name_only"), v.literal("none")
  )),
  createdAt: v.number(),
})
  .index("by_revenue", ["revenueId"])
  .index("by_source", ["source"])
  .index("by_menu_product", ["linkedMenuProductId"])
  .index("by_product_name", ["source", "productName"]),
```

### Wave 2: Backend Mutations & Queries [PARALLEL]
| Task | Files | Details |
|------|-------|---------|
| 2.1 Add `saveRevenueItems` mutation | `convex/externalData/mutations.ts` | internalMutation, dedup by revenueId + externalItemId |
| 2.2 Add `autoMatchMenuProduct` mutation | `convex/externalData/mutations.ts` | internalMutation, 3-tier matching algorithm |
| 2.3 Add `getRevenueItems` query | `convex/externalData/queries.ts` | Public query, enriches with menu product name |
| 2.4 Update `getDashboardSummary` | `convex/externalData/queries.ts` | Add totalCommission, totalAdBurn, totalPromoBurn |
| 2.5 Update `saveDirectToken` | `convex/platformCredentials/mutations.ts` | Add refreshToken arg |
| 2.6 Update `getCredentialStatus` | `convex/platformCredentials/queries.ts` | Add hasRefreshToken to return |

#### Mutation Details

**saveRevenueItems (internalMutation):**
- Args: `{ revenueId: v.id("externalRevenue"), items: v.array(v.object({...})) }`
- Dedup: skip if same `revenueId + externalItemId` exists (query by_revenue, filter by externalItemId)
- Returns: array of inserted IDs

**autoMatchMenuProduct (internalMutation):**
- Args: `{ productName: v.string(), unitPrice: v.number(), source: v.union(...) }`
- Algorithm:
  1. Query `menuProducts` by `by_default_price` index for exact price match
  2. If price match found: compare name case-insensitive --> "exact" or "price_only"
  3. If no price match: scan all active menu products for name contains --> "name_only"
  4. No match --> "none"
- Returns: `{ linkedMenuProductId?: Id<"menuProducts">, matchConfidence: string }`

**getRevenueItems (public query):**
- Args: `{ revenueId: v.id("externalRevenue") }`
- Query `externalRevenueItems` via `by_revenue` index
- For each item with `linkedMenuProductId`: fetch menu product name
- Returns enriched items array

**getDashboardSummary update:**
- Add to `recentRevenue` object: `totalCommission`, `totalAdBurn`, `totalPromoBurn`
- Computed same way as existing totalGross/totalNet (reduce over recentRevenue)

**saveDirectToken update:**
- Add `refreshToken: v.optional(v.string())` to args
- Store alongside existing data

**getCredentialStatus update:**
- Add `hasRefreshToken: !!cred.refreshToken` to return object

### Wave 3: Tests [SEQUENTIAL, after Wave 1+2]
| Task | Files |
|------|-------|
| 3.1 Add test helpers | `tests/convex/helpers.ts` |
| 3.2 Add 10+ new tests | `tests/convex/externalData.test.ts` |

#### Test Helper Additions

**createMenuProduct helper:**
```typescript
export async function createMenuProduct(
  t: TestContext,
  overrides: { code?: string; name?: string; defaultPrice?: number; isActive?: boolean } = {}
): Promise<Id<"menuProducts">>
```

**createExternalRevenue helper:**
```typescript
export async function createExternalRevenue(
  t: TestContext,
  overrides: { source?: string; revenueGross?: number; ... } = {}
): Promise<Id<"externalRevenue">>
```

#### Test Cases

| Test | What It Verifies |
|------|-----------------|
| `saveRevenueItems` inserts items for a revenue record | Basic insert |
| `saveRevenueItems` skips duplicate items (same revenueId + externalItemId) | Dedup |
| `saveRevenueItems` handles multiple items per revenue | Batch insert |
| `autoMatchMenuProduct` matches by exact price + name | "exact" confidence |
| `autoMatchMenuProduct` matches by price only | "price_only" confidence |
| `autoMatchMenuProduct` matches by name only | "name_only" confidence |
| `autoMatchMenuProduct` returns "none" when no match | No false positives |
| `getRevenueItems` returns empty for revenue with no items | Empty state |
| `getRevenueItems` returns items enriched with menu product name | Join |
| `getDashboardSummary` includes commission/adBurn/promoBurn | New fields |
| `saveDirectToken` stores refresh token | Persistence |
| All 19 existing externalData tests still pass | No regressions |

### Wave 4: Verification [SEQUENTIAL]
| Agent | Task |
|-------|------|
| code-auditor | Type check + pattern compliance |
| Bash | `npm run build` |
| Bash | `npm run test` |

## Documentation Updates
- [x] `docs/SCHEMA.md` -- new table + field additions

## Success Criteria
- [ ] Schema compiles with all additions
- [ ] 10+ new tests pass
- [ ] All 19 existing tests pass
- [ ] `npm run build` passes
- [ ] `npm run test` passes (full suite)
- [ ] `docs/SCHEMA.md` updated

## Git Checkpoint
```
git commit -m "feat: GoBiz journal sync backend foundation (schema + config + mutations)"
```
