# Unified Channel Integration Architecture — Design Spec

**Phase:** 999.4 (α) with folded-in 999.5
**Status:** Design — pending implementation plan
**Author:** Claude (brainstormed with user 2026-04-17)
**Roadmap reference:** `.planning/ROADMAP.md` § Phase 999.4
**Follow-on phases:** 999.6 (pricing consolidation), 999.7 (SKU resolver service), 999.8 (channel onboarding docs)

---

## 1. Problem

External sales channels (GoFood, Shopee, TikTok, BigSeller, K3Mart) currently flow through inconsistent paths. Inventory deduction is implemented for GoFood only; Shopee and TikTok deduct nothing, so product stock counts drift from reality daily. K3Mart has a custom deduction path. Five adapters use three different patterns for writing revenue. There is no single contract a new channel can plug into.

The consequence: adding a new channel today requires replicating several patterns, and every existing channel behaves slightly differently when debugging.

## 2. Goal

One coherent spine for "external sale → financial record + inventory transaction", with:

- A canonical `ChannelSaleEvent` type emitted by every adapter.
- A single atomic entry (`saveRevenueItems`) that writes revenue AND deducts inventory.
- An admin-configurable routing table resolving `(source, outlet?, product?) → storageLocation`.
- Data-hygiene audit + curation before historical backfill.
- Full historical deduction backfill preserving original transaction timestamps for analytics fidelity.
- Adapter interface contract formalized, all five adapters refactored to conform.

Future channels plug in by implementing `ChannelAdapter`, adding a routing row, and running the sync. No schema changes, no revenue-writer changes, no deducer changes.

## 3. Scope

### In scope (this phase)

- Layer 1 (Adapters): formalize `ChannelAdapter` interface; refactor gobiz/bigseller/internal (shape normalization) and k3mart/grabfood (reroute through `saveRevenueItems`).
- Layer 3 (Revenue recognizer): extend `saveRevenueItems` to dispatch deduction; add `inventoryDeductedAt` flag; wire audit-issue detection.
- Layer 4 (Inventory deducer): new `processChannelSaleInternal` + `channelRouting` table + resolution algorithm + admin UI.
- Data hygiene: audit detection, curation workbench, backfill migration, manual stock reset handoff.
- Migrations: seed `channelRouting` from `externalOutlets.linkedStorageLocationId`; migrate `gofood_sale` transactions to `channel_sale` + `source`; backfill historical deductions with preserved `occurredAt`.
- Tests: unit (routing, audit, normalize), integration (saveRevenueItems atomicity, backfill chunking), E2E (routing UI, audit workbench).

### Deferred (follow-on phases, documented here)

- **999.6** — Pricing consolidation. New `menuProductChannelPricing` table; deprecate `restockTargets.customPrice`, `externalProductMappings.grabfoodPrice`, scattered inline pricing. Adapters consult the table for authoritative `unitPrice`.
- **999.7** — SKU resolver auto-match service. Extract `resolveSkuToMenuProduct` with confidence-threshold config and manager review queue.
- **999.8** — Channel onboarding recipe in `docs/CHANNEL_INTEGRATION.md`; proves the architecture's scalability claim.

### Explicitly out of scope

- Direct-order reservation/fulfillment lifecycle (reserved stock → consumed stock via `reserveStockForOrderInternal`). This phase leaves it untouched. It represents a different semantic ("order not yet fulfilled") than external sync ("sale already happened").
- Layer 5 journal posting (`journalEngine.ts`) is unchanged; only validated that new transactions flow correctly.

## 4. Architecture — Five-layer spine

```
┌─────────────────────────────────────────────────────────────────────┐
│  LAYER 1 — ADAPTERS (per-source)                                    │
│  ChannelAdapter interface: { source, fetch(), normalize() }         │
│  Emits: ChannelSaleEvent[]                                          │
│  Refactor: gobiz, bigseller, internal (normalize shape)             │
│  Refactor: k3mart, grabfood (reroute via saveRevenueItems)          │
│  Shared helpers: convex/integrations/_shared/                        │
└─────────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  LAYER 2 — SKU RESOLVER (contract only this phase)                  │
│  Contract: resolveSkuToMenuProduct(source, externalCode, name)      │
│            → menuProductId | null                                   │
│  Backed by: externalProductMappings                                 │
│  Implementation tightening deferred to 999.7.                        │
└─────────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  LAYER 3 — REVENUE RECOGNIZER                                       │
│  saveRevenueItems: atomic revenue-write + deduction-dispatch         │
│  Adds: inventoryDeductedAt per item                                 │
│  Adds: audit-issue detection hooks                                  │
└─────────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  LAYER 4 — INVENTORY DEDUCER ★                                      │
│  processChannelSaleInternal(event)                                  │
│  channelRouting table, 3-tier precedence                            │
│  Transactions: transactionType="channel_sale", source=<source>       │
│  Negative stock allowed (sales already happened)                    │
└─────────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  LAYER 5 — JOURNAL POSTER (unchanged)                               │
└─────────────────────────────────────────────────────────────────────┘
```

## 5. Data model

### 5.1 New table: `channelRouting`

```ts
channelRouting: defineTable({
  source: externalSource,                          // required
  outletId: v.optional(v.id("externalOutlets")),   // nullable — only for outlet-scoped sources
  menuProductId: v.optional(v.id("menuProducts")), // nullable — product-specific override
  storageLocationId: v.id("storageLocations"),     // required
  isDefault: v.boolean(),                           // true = source-level default row
  updatedBy: v.string(),
  updatedAt: v.number(),
})
  .index("by_source", ["source"])
  .index("by_source_outlet", ["source", "outletId"])
  .index("by_source_product", ["source", "menuProductId"])
  .index("by_source_outlet_product", ["source", "outletId", "menuProductId"])
```

### 5.2 Modified: `externalRevenueItems`

Add field:

```ts
inventoryDeductedAt: v.optional(v.number())  // null = pending; timestamp = deducted
```

### 5.3 Modified: `productInventoryTransactions`

```ts
// ADD fields:
source: v.optional(externalSource)
externalRef: v.optional(v.string())   // composite key: externalTransactionId + externalItemId

// ADD literal to transactionType union:
v.literal("channel_sale")

// REMOVED (post-migration): v.literal("gofood_sale")
// Kept during migration window, then removed in a cleanup plan once all rows migrated.

// Existing field `gofoodOrderRef` is left in place during migration; reads prefer
// `externalRef` when populated. Cleanup plan in step 9 migrates gofoodOrderRef →
// externalRef and drops the legacy field.
```

### 5.4 New tables: `channelAuditReports` + `channelAuditIssues`

```ts
channelAuditReports: defineTable({
  generatedAt: v.number(),
  generatedBy: v.string(),
  status: v.union(v.literal("pending"), v.literal("resolved"), v.literal("superseded")),
  summary: v.object({
    totalItemsScanned: v.number(),
    unmappedSkus: v.number(),
    staleMappings: v.number(),
    malformedItems: v.number(),
    duplicateTransactions: v.number(),
    orphanItems: v.number(),
  }),
  resolvedAt: v.optional(v.number()),
  resolvedBy: v.optional(v.string()),
})
  .index("by_status", ["status", "generatedAt"])

channelAuditIssues: defineTable({
  reportId: v.id("channelAuditReports"),
  issueType: v.union(
    v.literal("unmapped_sku"),
    v.literal("stale_mapping"),
    v.literal("malformed_item"),
    v.literal("duplicate_transaction"),
    v.literal("orphan_item"),
  ),
  revenueItemId: v.optional(v.id("externalRevenueItems")),
  revenueId: v.optional(v.id("externalRevenue")),
  externalProductCode: v.optional(v.string()),
  externalProductName: v.optional(v.string()),
  source: externalSource,
  details: v.string(),
  resolution: v.optional(v.union(
    v.literal("remapped"),
    v.literal("excluded"),
    v.literal("merged"),
    v.literal("deleted"),
    v.literal("ignored"),
  )),
  resolvedAt: v.optional(v.number()),
  resolvedBy: v.optional(v.string()),
})
  .index("by_report", ["reportId"])
  .index("by_report_type", ["reportId", "issueType"])
  .index("by_resolution", ["resolution"])
```

### 5.5 New code types (not schema)

```ts
// convex/lib/channelSaleEvent.ts
export type ChannelSaleEvent = {
  source: ExternalSource;
  occurredAt: number;                  // ★ actual sale timestamp — preserved through ledger
  externalTransactionId: string;
  externalItemId?: string;
  outletId?: Id<"externalOutlets">;
  menuProductId?: Id<"menuProducts">;  // null if SKU unmapped; audit catches
  externalProductCode: string;
  externalProductName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
};

// convex/integrations/_shared/channelAdapter.ts
export interface ChannelAdapter {
  source: ExternalSource;
  fetch(ctx: ActionCtx, args: FetchArgs): Promise<RawPayload>;
  normalize(raw: RawPayload): ChannelSaleEvent[];
}
```

## 6. Mutation contract

### 6.1 `processChannelSaleInternal` — Layer 4 core

```ts
// convex/productInventory/channelSale.ts
export async function processChannelSaleInternal(
  ctx: MutationCtx,
  event: ChannelSaleEvent
): Promise<{
  deducted: boolean;
  locationId: Id<"storageLocations">;
  transactionId?: Id<"productInventoryTransactions">;
  skipReason?: "unmapped_sku" | "zero_quantity" | "already_deducted";
}>
```

Behaviour:

1. If `event.menuProductId` is null → `{ deducted: false, skipReason: "unmapped_sku" }`.
2. If `event.quantity <= 0` → `{ deducted: false, skipReason: "zero_quantity" }`.
3. Resolve `storageLocationId` via `resolveChannelRoute`. If no route → throw `CHANNEL_ROUTING_NOT_CONFIGURED`.
4. Apply substitution plan via `resolveSubstitutionPlan` (Phase 78 helper).
5. Deduct via `stockTracker.getStock` pattern (Phase 78).
6. Insert `productInventoryTransactions` row:
   ```
   transactionType: "channel_sale"
   source: event.source
   createdAt: event.occurredAt      ← historical timestamp, not Date.now()
   quantity: -event.quantity
   externalRef: event.externalTransactionId + (event.externalItemId ?? "")
   performedBy: `system:${event.source}_sync`
   ```
7. Low-stock alert check via `productInventorySettings.globalLowStockThreshold`.
8. Negative stock is always allowed (all channels are post-sale).

### 6.2 `saveRevenueItems` hook (Layer 3 → Layer 4 seam)

```ts
export const saveRevenueItems = internalMutation({
  args: { revenueId, items: [...] },
  handler: async (ctx, args) => {
    // Step A: existing — insert/upsert externalRevenueItems
    const insertedItems = await insertRevenueItems(ctx, args);

    // Step B: NEW — detect audit issues per item
    const auditIssues = await detectAuditIssues(ctx, insertedItems);
    if (auditIssues.length > 0) await recordAuditIssues(ctx, auditIssues);

    // Step C: NEW — dispatch Layer 4 deduction per eligible item
    const revenue = await ctx.db.get(args.revenueId);
    for (const item of insertedItems) {
      if (item.inventoryDeductedAt != null) continue;     // re-sync idempotency
      if (item.linkedMenuProductId == null) continue;      // audit flagged
      if (item.quantity <= 0) continue;

      const event: ChannelSaleEvent = buildEventFromRow(revenue, item);
      const result = await processChannelSaleInternal(ctx, event);
      if (result.deducted) {
        await ctx.db.patch(item._id, { inventoryDeductedAt: Date.now() });
      }
    }
  },
});
```

**Atomicity:** `saveRevenueItems` is one mutation. If deduction throws mid-batch, the entire mutation rolls back. Re-running replays; items with `inventoryDeductedAt != null` skip.

## 7. Routing resolution algorithm

Five-tier precedence, most specific wins:

```ts
export async function resolveChannelRoute(
  ctx: QueryCtx | MutationCtx,
  params: {
    source: ExternalSource;
    outletId?: Id<"externalOutlets">;
    menuProductId?: Id<"menuProducts">;
  }
): Promise<Id<"storageLocations">> {
  // Tier 1: (source, outlet, product)
  if (params.outletId && params.menuProductId) { /* index lookup */ }
  // Tier 2: (source, outlet) with menuProductId null
  if (params.outletId)                           { /* index lookup */ }
  // Tier 3: (source, product) with outletId null
  if (params.menuProductId)                      { /* index lookup */ }
  // Tier 4: source default (isDefault=true)
  // Tier 5: throw CHANNEL_ROUTING_NOT_CONFIGURED
}
```

**Why throw at Tier 5:** silent fallback would hide misconfiguration. For a new channel, an admin must add at minimum a `(source, isDefault=true)` row before sales can flow. The error message guides them.

## 8. Audit + curation

### 8.1 Detection (runs inside `saveRevenueItems`)

| Issue | Detection |
|-------|-----------|
| `unmapped_sku` | `item.linkedMenuProductId == null` AND no match in `externalProductMappings` |
| `stale_mapping` | `item.linkedMenuProductId` → inactive/deleted menuProduct |
| `malformed_item` | `quantity <= 0` OR `totalPrice < 0` OR missing required fields |
| `duplicate_transaction` | Same `(source, externalTransactionId, externalItemId)` already exists |
| `orphan_item` | Parent `externalRevenue` doc missing |

Full-database scan: `runFullAudit(ctx)` — emits a fresh `channelAuditReports` with every current issue. Callable from admin UI.

### 8.2 Curation UI — `ChannelAuditWorkbench.tsx`

Tabs per issue type, resolution actions per issue:

- **Unmapped SKU** → Map to menu product (dropdown) | Exclude from deduction
- **Stale mapping** → Remap to … | Retire product (mark related rows excluded)
- **Malformed item** → Fix quantity/price | Delete item
- **Duplicate transaction** → Keep first | Keep last | Merge quantities
- **Orphan item** → Delete (confirm)

Each resolution logs `channelAuditIssues.{resolution, resolvedBy, resolvedAt}`.

### 8.3 Gate

Backfill cannot start while `channelAuditReports.status === "pending"` has unresolved issues.

### 8.4 Post-backfill resolution semantics

Resolving an audit issue after the backfill has already run does **not** automatically re-deduct or un-deduct historical inventory. The resolution flags are record-keeping only. Two manual paths:

- **Remapped an unmapped SKU post-backfill** → admin runs a **targeted re-backfill** scoped to `{ source, externalProductCode }` (new button in workbench: "Deduct resolved items"). Only items with the newly-set `linkedMenuProductId` and `inventoryDeductedAt == null` will process.
- **Discovered an over-deduction** (e.g., duplicate that was marked "keep first" but both had already deducted) → admin uses `reverseChannelSale(transactionId, reason)` from Section 11 to insert a compensating positive-quantity row.

Rationale: auto-re-deducting on resolution could silently change historical stock counts minutes after a manual reconciliation — dangerous. Explicit admin action is safer.

## 9. Backfill migration

Ordered steps:

1. **Pre-audit gate** — admin runs `runFullAudit`, resolves all issues in workbench.
2. **Seed `channelRouting`** — migration reads `externalOutlets.linkedStorageLocationId` → writes `(source, outletId)` rows. Admin manually adds `(source)` default rows for shopee, tiktok, bigseller via the matrix UI. Validation: every active `externalSource` must have at least a default row.
3. **Transaction-type migration** — update every `productInventoryTransactions` where `transactionType="gofood_sale"` → `{transactionType: "channel_sale", source: "gofood"}`. Chunked 500 rows per mutation via an internal action that loops until done.
4. **Historical deduction backfill** — query `externalRevenueItems` ORDER BY `transactionDate` ASC WHERE `inventoryDeductedAt IS NULL AND linkedMenuProductId IS NOT NULL`. Chunk 200 items per mutation call. For each: call `processChannelSaleInternal` with `occurredAt = revenue.transactionDate`. Set `inventoryDeductedAt = Date.now()` after success. Write summary to `channelAuditReports`.
5. **Manual stock reset** — user-executed. After backfill, admin reviews stock counts and uses existing adjustment UI to baseline reality.

**Idempotency:** the whole pipeline is re-runnable. Steps 1–3 are one-shot (idempotent by construction); step 4 skips any item already flagged; step 5 is manual.

## 10. Admin UI

### 10.1 Routing matrix — `ChannelRoutingManager.tsx`

```
Source      | Default location    | Per-outlet overrides      | Per-product overrides
────────────┼─────────────────────┼───────────────────────────┼──────────────────────
gofood      | Office              | [Outlet X → Depot X]      | [none]
                                    [Outlet Y → Depot Y]
shopee      | HQ Warehouse        | (n/a)                     | [Frozen SKUs → Cold]
tiktok      | HQ Warehouse        | (n/a)                     | [none]
bigseller   | HQ Warehouse        | (n/a)                     | [none]
k3mart      | [unset — blocks!]   | [Outlet A → Consign A]    | [none]
internal    | Office (default)    | (n/a)                     | [none]
```

Edit modal per row: pick default location, add/remove outlet overrides, add/remove product overrides. Save validates no duplicate (source, outlet?, product?) combination.

### 10.2 Audit workbench — `ChannelAuditWorkbench.tsx`

Header: "Run full audit" button + latest report summary.
Body: tabs per issue type with counts in badges.
Footer: "Ready for backfill" banner when all issues resolved + "Start backfill" trigger (admin only).

### 10.3 Settings extension

Inventory settings page gets:
- "Run historical backfill" button (disabled until audit is clean)
- Dry-run toggle for backfill preview
- "Last backfill" summary with counts + timestamp

## 11. Error handling + observability

### Loud failures (throw)

- Unconfigured routing for a source → `CHANNEL_ROUTING_NOT_CONFIGURED` (payload: source, outletId, menuProductId)
- Audit has unresolved issues when backfill attempted → blocked with count

### Soft skips (logged + counted)

- Unmapped SKU — caught by audit; deduction returns `skipReason`
- Zero-quantity item — deduction returns `skipReason`
- Already-deducted item (re-sync) — deduction returns `skipReason`

### Sync log integration

`externalSyncLogs` gets two new optional fields:
- `itemsDeducted: v.optional(v.number())`
- `itemsSkipped: v.optional(v.number())`

Adapters report totals back via sync log on each run.

### Transaction reversal

New admin-only mutation `reverseChannelSale(transactionId, reason)` — inserts a compensating row with positive quantity and the reason. Used when post-backfill audit discovers a deduction that should be undone.

### 11.1 Auth / role enforcement

| Surface | Required role | Notes |
|---------|--------------|-------|
| `ChannelRoutingManager` page | admin | Read + write routing rules; affects all deductions |
| `ChannelAuditWorkbench` page | admin | Resolution actions change menu product mappings |
| "Run full audit" trigger | admin | Read-only but expensive |
| "Start backfill" / "Deduct resolved items" trigger | admin | Destructive — writes historical ledger rows |
| `reverseChannelSale` mutation | admin | Writes compensating transactions |
| `saveRevenueItems` (adapter path) | internal | Already internalMutation; no token needed |
| `processChannelSaleInternal` (helper) | internal | Not publicly callable |

All admin-only pages use `<ProtectedRoute>` with `canAccessInventory` + explicit admin role filter. Mutations use `requireRole(ctx, args.token, ["admin"])`.

## 12. Testing strategy

### Unit (Vitest)
- `resolveChannelRoute` — each precedence tier + Tier 5 throw
- `ChannelSaleEvent` normalization per adapter (pure-function tests — easy)
- `detectAuditIssues` — each issue type

### Integration (convex-test)
- `saveRevenueItems` with deduction — idempotency, flag setting, partial rollback
- `processChannelSaleInternal` — substitution plan + stock tracker interactions (Phase 78 bridge)
- Backfill migration — chunked processing, `occurredAt` preservation
- Transaction-type migration — `gofood_sale` → `channel_sale` + `source` rewrite

### E2E (Playwright)
- Routing manager CRUD round-trip
- Audit workbench — detect, resolve, verify
- Backfill trigger + status reporting

## 13. Implementation plan skeleton

Estimated 8–9 plans over ~4 weeks. Detailed wave breakdown to be produced by the writing-plans skill. Rough sketch:

1. Schema + `channelRouting` + `channelAudit*` tables + migration of `externalOutlets.linkedStorageLocationId` + transaction-type union change
2. `ChannelSaleEvent` type + `ChannelAdapter` interface + shared helpers; normalize gobiz/bigseller/internal
3. Reroute k3mart + grabfood onto `saveRevenueItems`
4. `processChannelSaleInternal` + `resolveChannelRoute` + `saveRevenueItems` deduction hook
5. Audit detection + `runFullAudit` + audit tables wiring
6. `ChannelRoutingManager` admin UI + hooks + route validation
7. `ChannelAuditWorkbench` admin UI + resolution actions
8. Historical backfill migration + dry-run mode + sync-log fields
9. Tests (unit + integration + E2E) + docs (channel onboarding recipe) + cleanup of `gofood_sale` literal

## 14. Risks + open questions

### Risks

- **Refactoring 5 live sync adapters** — each needs a regression test before and after the refactor. Recommendation: snapshot sample payloads from prod logs, regression-test normalization is byte-identical on the happy path.
- **Historical backfill stock negatives** — Shopee/TikTok products will go deeply negative. User has accepted this; manual reset is step 5.
- **K3Mart consignment semantics** — K3Mart's existing path may have consignment-specific logic not captured in the generic `processChannelSale` path. Plan 3 must preserve all K3Mart-specific behaviour (e.g., collapsed-period revenue, outlet-level delivery receipts). Reference `convex/consignment/mutations.ts` and `convex/integrations/k3mart/` carefully.
- **Convex mutation time limit on backfill** — mitigated by chunking 200 items per mutation call, looped by an action.

### Open questions (resolved during writing-plans)

- Exact index shape for `channelRouting` filters — Tier 2/3 need `outletId` or `menuProductId` to be literal `undefined` vs. missing; Convex handles this but the `.filter()` call must be explicit. Writing-plans phase will confirm via small index test.
- Whether `externalOutlets.linkedStorageLocationId` is dropped in this phase or deprecated-for-one-release. Recommendation: deprecate for one release (keep field, stop writing), drop in 999.6 cleanup.

## 15. Success criteria

- `npm run type-check` passes
- `npm run build` succeeds
- All 5 adapters emit `ChannelSaleEvent`; `saveRevenueItems` is the only entry to Layer 4
- Shopee and TikTok sales, after cutover, produce `productInventoryTransactions` rows with `transactionType="channel_sale"`, `source` set, `createdAt = revenue.transactionDate`
- Running the backfill twice produces zero additional transactions (idempotency)
- `resolveChannelRoute` throws for an unconfigured source rather than silently defaulting
- Audit workbench surfaces all five issue types and allows resolution; backfill is gated on clean audit
- Existing GoFood deduction behaviour is preserved byte-for-byte (same locations, same quantities, same stock outcomes) — regression test required

---

**Next step:** user reviews this spec; once approved, the writing-plans skill produces the detailed implementation plan with wave breakdown.
