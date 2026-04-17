# Unified Channel Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single coherent pipeline from external sale events to inventory transactions so all channels (GoFood, Shopee, TikTok, BigSeller, K3Mart, internal) flow through one atomic `saveRevenueItems` + admin-configurable routing table, with backfilled historical deductions.

**Architecture:** Five-layer spine (Adapters → SKU resolver → Revenue recognizer → Inventory deducer → Journal poster). `saveRevenueItems` becomes the single atomic entry: it writes `externalRevenueItems`, detects data-hygiene issues, and dispatches `processChannelSaleInternal` which resolves a storage location via the 3-tier `channelRouting` table and writes a `channel_sale` transaction with the original sale timestamp preserved.

**Tech Stack:** Convex 1.31.7, React 19, TypeScript 5.9, Vitest 4, convex-test, Playwright, Tailwind 4 + shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-04-17-unified-channel-integration-architecture-design.md`

**Branch:** `feature/999.4-channel-integration-spec` (already checked out; spec already committed)

---

## File Structure + Dependency Map

### New files

| Path | Purpose |
|------|---------|
| `convex/lib/channelSaleEvent.ts` | `ChannelSaleEvent` type (canonical adapter output) |
| `convex/integrations/_shared/channelAdapter.ts` | `ChannelAdapter` interface + shared normalize helpers |
| `convex/productInventory/channelRouting.ts` | `resolveChannelRoute` + CRUD mutations for `channelRouting` table |
| `convex/productInventory/channelSale.ts` | `processChannelSaleInternal` (Layer 4 core) |
| `convex/productInventory/channelAudit.ts` | `detectAuditIssues`, `runFullAudit`, `recordAuditIssues` |
| `convex/productInventory/channelAuditResolution.ts` | Resolution mutations for audit issues (admin-authed) |
| `convex/productInventory/channelBackfill.ts` | Historical deduction backfill + chunked action loop |
| `convex/migrations/channelRoutingSeed.ts` | Seed `channelRouting` from `externalOutlets.linkedStorageLocationId` |
| `convex/migrations/gofoodSaleToChannelSale.ts` | Migrate existing `gofood_sale` transactions to `channel_sale` + `source` |
| `convex/productInventory/__tests__/channelRouting.test.ts` | Tier 1–5 precedence tests |
| `convex/productInventory/__tests__/channelSale.test.ts` | `processChannelSaleInternal` integration tests |
| `convex/productInventory/__tests__/channelAudit.test.ts` | Per-issue-type detection tests |
| `convex/productInventory/__tests__/saveRevenueItemsHook.test.ts` | Atomic revenue+deduction dispatch + idempotency |
| `convex/productInventory/__tests__/channelBackfill.test.ts` | Historical backfill chunking + `occurredAt` preservation |
| `convex/productInventory/__tests__/adapterRegression/` | Snapshot payloads per adapter |
| `src/pages/ChannelRoutingManager.tsx` | Admin UI — routing matrix |
| `src/pages/ChannelAuditWorkbench.tsx` | Admin UI — audit workbench |
| `src/components/channelRouting/RoutingMatrixTable.tsx` | Routing matrix table component |
| `src/components/channelRouting/RoutingRowEditDialog.tsx` | Edit dialog for per-source routing |
| `src/components/channelAudit/AuditIssueTabs.tsx` | Tabs container per issue type |
| `src/components/channelAudit/IssueResolutionRow.tsx` | Single-issue resolution action row |
| `src/components/channelAudit/BackfillTriggerCard.tsx` | "Start backfill" gated on clean audit |
| `src/hooks/convex/useChannelRouting.ts` | Query + mutation hooks for routing |
| `src/hooks/convex/useChannelAudit.ts` | Query + mutation hooks for audit |
| `tests/e2e/channel-routing.spec.ts` | Playwright E2E — routing manager CRUD |
| `tests/e2e/channel-audit.spec.ts` | Playwright E2E — audit workbench flow |
| `docs/CHANNEL_INTEGRATION.md` | Onboarding recipe for adding new channels |

### Modified files

| Path | Change |
|------|--------|
| `convex/schema.ts` | Add 3 tables (`channelRouting`, `channelAuditReports`, `channelAuditIssues`); add `inventoryDeductedAt` to `externalRevenueItems`; add `source` + `externalRef` + `channel_sale` literal to `productInventoryTransactions`; optional sync-log fields |
| `convex/externalData/mutations.ts` | `saveRevenueItems` gains Step B (audit) + Step C (deduction dispatch) |
| `convex/integrations/gobiz/adapter.ts` | Refactor to emit `ChannelSaleEvent[]` via normalize step |
| `convex/integrations/bigseller/sync.ts` | Refactor to emit `ChannelSaleEvent[]` |
| `convex/integrations/internal/adapter.ts` | Refactor to emit `ChannelSaleEvent[]` |
| `convex/integrations/k3mart/adapter.ts` | Reroute sales write path through `saveRevenueItems` |
| `convex/integrations/grabfood/adapter.ts` | Reroute sales write path through `saveRevenueItems` |
| `convex/productInventory/mutations.ts` | `processGofoodSales` becomes a thin adapter that emits events + calls `processChannelSaleInternal` |
| `src/App.tsx` | Add routes for `ChannelRoutingManager` and `ChannelAuditWorkbench` |
| `src/hooks/convex/index.ts` | Export new hooks |
| `docs/CHANGELOG.md` | Phase entry |
| `docs/SCHEMA.md` | Document new tables + field additions |
| `docs/API_REFERENCE.md` | Document `processChannelSaleInternal`, `resolveChannelRoute`, audit mutations |

### Dependency DAG

```
Task 1 (schema)
    │
    ├─→ Task 2 (ChannelSaleEvent + Adapter interface)
    │       │
    │       ├─→ Task 3 (routing resolver)
    │       │       │
    │       │       └─→ Task 4 (processChannelSaleInternal)
    │       │               │
    │       │               └─→ Task 6 (saveRevenueItems hook)
    │       │                       │
    │       │                       └─→ Task 7 (adapter normalize: gobiz/bigseller/internal)
    │       │                               │
    │       │                               └─→ Task 8 (adapter reroute: k3mart/grabfood)
    │       │
    │       └─→ Task 5 (audit detection) ─→ (also feeds into Task 6)
    │
    ├─→ Task 9 (routing UI) [can start after Task 3]
    ├─→ Task 10 (audit workbench) [needs Task 5]
    ├─→ Task 11 (backfill migration) [needs Task 4 + audit clean]
    └─→ Task 12 (tests + docs + cleanup) [last]
```

---

## Git Workflow

**Branch:** `feature/999.4-channel-integration-spec` (already checked out)
**Commit rhythm:** One commit per task-step where indicated. Tasks 1–6 use strict TDD (test commit before impl commit optional but encouraged). Tasks 7–8 use snapshot-regression commits. Tasks 9–10 use component-then-wire commits. Task 11 uses migration-then-test commits. Task 12 is docs.
**Checkpoint:** After Task 6 completes, run full type-check + existing test suite before proceeding to Tasks 7–8 (adapter refactors are the highest-risk part).

---

## Task 1: Schema foundation

**Files:**
- Modify: `convex/schema.ts` (add 3 tables, modify 2)
- Create: `convex/productInventory/__tests__/schemaValidation.test.ts`

**Reference:** Spec § 5. Convex schema changes are validated at the framework level via `v.*` validators; what we test here is that mutations touching the new fields compile and that the gofood_sale literal is still accepted during the migration window.

- [ ] **Step 1.1: Add `channelRouting` table**

Open `convex/schema.ts`, find the `// PRODUCT INVENTORY` section (near line 985), add immediately below `productInventorySettings`:

```ts
channelRouting: defineTable({
  source: externalSource,
  outletId: v.optional(v.id("externalOutlets")),
  menuProductId: v.optional(v.id("menuProducts")),
  storageLocationId: v.id("storageLocations"),
  isDefault: v.boolean(),
  updatedBy: v.string(),
  updatedAt: v.number(),
})
  .index("by_source", ["source"])
  .index("by_source_outlet", ["source", "outletId"])
  .index("by_source_product", ["source", "menuProductId"])
  .index("by_source_outlet_product", ["source", "outletId", "menuProductId"]),
```

- [ ] **Step 1.2: Add `channelAuditReports` + `channelAuditIssues` tables**

Below `channelRouting`:

```ts
channelAuditReports: defineTable({
  generatedAt: v.number(),
  generatedBy: v.string(),
  status: v.union(
    v.literal("pending"),
    v.literal("resolved"),
    v.literal("superseded"),
  ),
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
  .index("by_status", ["status", "generatedAt"]),

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
  .index("by_resolution", ["resolution"]),
```

- [ ] **Step 1.3: Add `inventoryDeductedAt` to `externalRevenueItems`**

Find `externalRevenueItems: defineTable({` around line 1142. Add after `matchConfidence`:

```ts
inventoryDeductedAt: v.optional(v.number()),
```

- [ ] **Step 1.4: Add `source`, `externalRef`, and `channel_sale` to `productInventoryTransactions`**

Find `productInventoryTransactions: defineTable({` around line 1009. In the `transactionType` union, add `channel_sale`:

```ts
transactionType: v.union(
  v.literal("add"),
  v.literal("drawdown"),
  v.literal("gofood_sale"),     // LEGACY — kept during migration; removed in Task 12
  v.literal("channel_sale"),    // NEW — generic cross-channel deduction
  v.literal("adjust"),
  v.literal("transfer"),
  v.literal("stock_count"),
),
```

Add below `gofoodOrderRef`:

```ts
source: v.optional(externalSource),
externalRef: v.optional(v.string()),
```

- [ ] **Step 1.5: Add optional sync-log fields**

Find `externalSyncLogs: defineTable({`. Add inside the table definition:

```ts
itemsDeducted: v.optional(v.number()),
itemsSkipped: v.optional(v.number()),
```

- [ ] **Step 1.6: Write schema validation test**

Create `convex/productInventory/__tests__/schemaValidation.test.ts`:

```ts
import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "../../schema";
import { api } from "../../_generated/api";

describe("Task 1 schema additions", () => {
  it("accepts a channelRouting row with only source+location (Tier 4 default)", async () => {
    const t = convexTest(schema);
    const loc = await t.run(async (ctx) =>
      ctx.db.insert("storageLocations", { name: "HQ", isDefault: true, isActive: true })
    );
    const id = await t.run(async (ctx) =>
      ctx.db.insert("channelRouting", {
        source: "shopee",
        storageLocationId: loc,
        isDefault: true,
        updatedBy: "test",
        updatedAt: Date.now(),
      })
    );
    expect(id).toBeDefined();
  });

  it("accepts a productInventoryTransactions row with channel_sale + source", async () => {
    const t = convexTest(schema);
    const { locId, mpId } = await t.run(async (ctx) => {
      const loc = await ctx.db.insert("storageLocations", {
        name: "HQ", isDefault: true, isActive: true,
      });
      const mp = await ctx.db.insert("menuProducts", {
        name: "Test", code: "T1", defaultPrice: 100, isActive: true,
      } as any);
      return { locId: loc, mpId: mp };
    });
    const txId = await t.run(async (ctx) =>
      ctx.db.insert("productInventoryTransactions", {
        menuProductId: mpId,
        locationId: locId,
        transactionType: "channel_sale",
        source: "shopee",
        externalRef: "txn-1|item-1",
        quantity: -1,
        previousQuantity: 5,
        newQuantity: 4,
        performedBy: "system:test",
        createdAt: Date.now() - 86_400_000,  // yesterday — historical timestamp preserved
      })
    );
    expect(txId).toBeDefined();
  });

  it("still accepts gofood_sale during migration window", async () => {
    const t = convexTest(schema);
    const { locId, mpId } = await t.run(async (ctx) => {
      const loc = await ctx.db.insert("storageLocations", {
        name: "HQ", isDefault: true, isActive: true,
      });
      const mp = await ctx.db.insert("menuProducts", {
        name: "Test", code: "T2", defaultPrice: 100, isActive: true,
      } as any);
      return { locId: loc, mpId: mp };
    });
    const txId = await t.run(async (ctx) =>
      ctx.db.insert("productInventoryTransactions", {
        menuProductId: mpId,
        locationId: locId,
        transactionType: "gofood_sale",
        quantity: -1,
        previousQuantity: 5,
        newQuantity: 4,
        performedBy: "system:test",
        createdAt: Date.now(),
      })
    );
    expect(txId).toBeDefined();
  });
});
```

- [ ] **Step 1.7: Run schema test**

```bash
npm run test -- convex/productInventory/__tests__/schemaValidation.test.ts
```

Expected: 3 pass.

- [ ] **Step 1.8: Run type-check**

```bash
npm run type-check
```

Expected: 0 errors.

- [ ] **Step 1.9: Commit**

```bash
git add convex/schema.ts convex/productInventory/__tests__/schemaValidation.test.ts
git commit -m "feat(999.4): add channelRouting + audit schema + channel_sale tx type"
```

---

## Task 2: `ChannelSaleEvent` type + `ChannelAdapter` interface

**Files:**
- Create: `convex/lib/channelSaleEvent.ts`
- Create: `convex/integrations/_shared/channelAdapter.ts`
- Create: `convex/integrations/_shared/__tests__/channelSaleEvent.test.ts`

**Reference:** Spec § 5.5.

- [ ] **Step 2.1: Write the failing test**

Create `convex/integrations/_shared/__tests__/channelSaleEvent.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildChannelSaleEvent, validateChannelSaleEvent } from "../channelAdapter";
import type { Id } from "../../../_generated/dataModel";

describe("ChannelSaleEvent builder + validator", () => {
  const baseArgs = {
    source: "shopee" as const,
    occurredAt: 1_710_000_000_000,
    externalTransactionId: "ORDER-1",
    externalItemId: "ITEM-1",
    externalProductCode: "SKU-A",
    externalProductName: "Product A",
    quantity: 2,
    unitPrice: 25_000,
    totalPrice: 50_000,
  };

  it("builds a valid event from all required fields", () => {
    const evt = buildChannelSaleEvent(baseArgs);
    expect(evt.source).toBe("shopee");
    expect(evt.quantity).toBe(2);
    expect(evt.totalPrice).toBe(50_000);
  });

  it("accepts optional outletId and menuProductId", () => {
    const evt = buildChannelSaleEvent({
      ...baseArgs,
      outletId: "j971xyz" as Id<"externalOutlets">,
      menuProductId: "j982abc" as Id<"menuProducts">,
    });
    expect(evt.outletId).toBeDefined();
    expect(evt.menuProductId).toBeDefined();
  });

  it("validateChannelSaleEvent rejects negative quantity", () => {
    const evt = buildChannelSaleEvent({ ...baseArgs, quantity: -1 });
    expect(() => validateChannelSaleEvent(evt)).toThrow(/quantity/);
  });

  it("validateChannelSaleEvent rejects empty externalTransactionId", () => {
    const evt = buildChannelSaleEvent({ ...baseArgs, externalTransactionId: "" });
    expect(() => validateChannelSaleEvent(evt)).toThrow(/externalTransactionId/);
  });

  it("validateChannelSaleEvent rejects totalPrice mismatch beyond tolerance", () => {
    const evt = buildChannelSaleEvent({ ...baseArgs, totalPrice: 999_999 });
    expect(() => validateChannelSaleEvent(evt)).toThrow(/totalPrice/);
  });
});
```

- [ ] **Step 2.2: Run test — fails**

```bash
npm run test -- convex/integrations/_shared/__tests__/channelSaleEvent.test.ts
```

Expected: fail — module not found.

- [ ] **Step 2.3: Create `ChannelSaleEvent` type**

Create `convex/lib/channelSaleEvent.ts`:

```ts
/**
 * Canonical sale event emitted by every channel adapter.
 *
 * This is the single shape the revenue recognizer + inventory deducer
 * consume. Adapters are responsible for turning source-specific payloads
 * into arrays of this type via their normalize() step.
 */

import type { Id } from "../_generated/dataModel";

export type ExternalSource =
  | "gofood"
  | "grabfood"
  | "shopee"
  | "tiktok"
  | "bigseller"
  | "k3mart"
  | "internal"
  | "manual";

export type ChannelSaleEvent = {
  source: ExternalSource;
  /** Epoch ms — the actual moment the sale happened on the channel. */
  occurredAt: number;
  /** Channel-level order/transaction id. Used for idempotency upstream. */
  externalTransactionId: string;
  /** Per-item id within the transaction. Optional — not all channels emit one. */
  externalItemId?: string;
  /** Outlet (for outlet-scoped channels like GoFood). */
  outletId?: Id<"externalOutlets">;
  /** Resolved menu product. Null if SKU is unmapped — audit will flag. */
  menuProductId?: Id<"menuProducts">;
  externalProductCode: string;
  externalProductName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
};
```

- [ ] **Step 2.4: Create `ChannelAdapter` interface + helpers**

Create `convex/integrations/_shared/channelAdapter.ts`:

```ts
/**
 * ChannelAdapter — the contract every source-specific integration conforms to.
 *
 * An adapter is responsible for two things:
 *   1. fetch(): pull raw data from the external API (source-specific)
 *   2. normalize(): turn the raw payload into a ChannelSaleEvent[]
 *
 * Downstream (saveRevenueItems) is shared and source-agnostic.
 */

import type { ActionCtx } from "../../_generated/server";
import type { ChannelSaleEvent, ExternalSource } from "../../lib/channelSaleEvent";

export interface ChannelAdapter<RawPayload, FetchArgs = unknown> {
  source: ExternalSource;
  fetch(ctx: ActionCtx, args: FetchArgs): Promise<RawPayload>;
  normalize(raw: RawPayload): ChannelSaleEvent[];
}

/**
 * Builder — applies defaults and returns a ChannelSaleEvent.
 * Does NOT validate; call validateChannelSaleEvent separately if paranoid.
 */
export function buildChannelSaleEvent(
  args: Omit<ChannelSaleEvent, "externalItemId" | "outletId" | "menuProductId"> &
    Partial<Pick<ChannelSaleEvent, "externalItemId" | "outletId" | "menuProductId">>
): ChannelSaleEvent {
  return {
    source: args.source,
    occurredAt: args.occurredAt,
    externalTransactionId: args.externalTransactionId,
    externalItemId: args.externalItemId,
    outletId: args.outletId,
    menuProductId: args.menuProductId,
    externalProductCode: args.externalProductCode,
    externalProductName: args.externalProductName,
    quantity: args.quantity,
    unitPrice: args.unitPrice,
    totalPrice: args.totalPrice,
  };
}

const PRICE_TOLERANCE_IDR = 1; // allow 1 rupiah rounding

export function validateChannelSaleEvent(evt: ChannelSaleEvent): void {
  if (!evt.externalTransactionId) {
    throw new Error("ChannelSaleEvent: externalTransactionId required");
  }
  if (evt.quantity < 0) {
    throw new Error(`ChannelSaleEvent: quantity must be >= 0 (got ${evt.quantity})`);
  }
  if (evt.quantity > 0) {
    const expected = evt.unitPrice * evt.quantity;
    if (Math.abs(evt.totalPrice - expected) > PRICE_TOLERANCE_IDR) {
      throw new Error(
        `ChannelSaleEvent: totalPrice ${evt.totalPrice} != unitPrice*qty ${expected}`
      );
    }
  }
  if (!evt.externalProductCode && !evt.externalProductName) {
    throw new Error("ChannelSaleEvent: at least one of externalProductCode or externalProductName required");
  }
}
```

- [ ] **Step 2.5: Run test — passes**

```bash
npm run test -- convex/integrations/_shared/__tests__/channelSaleEvent.test.ts
```

Expected: 5 pass.

- [ ] **Step 2.6: Commit**

```bash
git add convex/lib/channelSaleEvent.ts convex/integrations/_shared/channelAdapter.ts convex/integrations/_shared/__tests__/channelSaleEvent.test.ts
git commit -m "feat(999.4): ChannelSaleEvent type + ChannelAdapter interface"
```

---

## Task 3: Routing resolver

**Files:**
- Create: `convex/productInventory/channelRouting.ts`
- Create: `convex/productInventory/__tests__/channelRouting.test.ts`

**Reference:** Spec § 7.

- [ ] **Step 3.1: Write the failing test**

Create `convex/productInventory/__tests__/channelRouting.test.ts`:

```ts
import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "../../schema";
import { api, internal } from "../../_generated/api";

describe("resolveChannelRoute — 5-tier precedence", () => {
  async function seed(t: ReturnType<typeof convexTest>) {
    return t.run(async (ctx) => {
      const defLoc = await ctx.db.insert("storageLocations", { name: "Default", isDefault: true, isActive: true });
      const outLoc = await ctx.db.insert("storageLocations", { name: "OutletX", isDefault: false, isActive: true });
      const prodLoc = await ctx.db.insert("storageLocations", { name: "ColdStorage", isDefault: false, isActive: true });
      const specLoc = await ctx.db.insert("storageLocations", { name: "Specific", isDefault: false, isActive: true });
      const outlet = await ctx.db.insert("externalOutlets", {
        source: "gofood", externalId: "OUT-X", name: "Outlet X",
      } as any);
      const mp = await ctx.db.insert("menuProducts", {
        name: "Frozen", code: "FZ", defaultPrice: 100, isActive: true,
      } as any);
      return { defLoc, outLoc, prodLoc, specLoc, outlet, mp };
    });
  }

  it("Tier 1 wins: (source, outlet, product)", async () => {
    const t = convexTest(schema);
    const { defLoc, outLoc, prodLoc, specLoc, outlet, mp } = await seed(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("channelRouting", { source: "gofood", storageLocationId: defLoc, isDefault: true, updatedBy: "t", updatedAt: 0 });
      await ctx.db.insert("channelRouting", { source: "gofood", outletId: outlet, storageLocationId: outLoc, isDefault: false, updatedBy: "t", updatedAt: 0 });
      await ctx.db.insert("channelRouting", { source: "gofood", menuProductId: mp, storageLocationId: prodLoc, isDefault: false, updatedBy: "t", updatedAt: 0 });
      await ctx.db.insert("channelRouting", { source: "gofood", outletId: outlet, menuProductId: mp, storageLocationId: specLoc, isDefault: false, updatedBy: "t", updatedAt: 0 });
    });
    const result = await t.query(internal.productInventory.channelRouting.resolveChannelRouteQuery, {
      source: "gofood", outletId: outlet, menuProductId: mp,
    });
    expect(result).toBe(specLoc);
  });

  it("Tier 2 wins when no product-specific row: (source, outlet)", async () => {
    const t = convexTest(schema);
    const { defLoc, outLoc, outlet, mp } = await seed(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("channelRouting", { source: "gofood", storageLocationId: defLoc, isDefault: true, updatedBy: "t", updatedAt: 0 });
      await ctx.db.insert("channelRouting", { source: "gofood", outletId: outlet, storageLocationId: outLoc, isDefault: false, updatedBy: "t", updatedAt: 0 });
    });
    const result = await t.query(internal.productInventory.channelRouting.resolveChannelRouteQuery, {
      source: "gofood", outletId: outlet, menuProductId: mp,
    });
    expect(result).toBe(outLoc);
  });

  it("Tier 3 wins when no outlet row: (source, product)", async () => {
    const t = convexTest(schema);
    const { defLoc, prodLoc, mp } = await seed(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("channelRouting", { source: "shopee", storageLocationId: defLoc, isDefault: true, updatedBy: "t", updatedAt: 0 });
      await ctx.db.insert("channelRouting", { source: "shopee", menuProductId: mp, storageLocationId: prodLoc, isDefault: false, updatedBy: "t", updatedAt: 0 });
    });
    const result = await t.query(internal.productInventory.channelRouting.resolveChannelRouteQuery, {
      source: "shopee", menuProductId: mp,
    });
    expect(result).toBe(prodLoc);
  });

  it("Tier 4 falls back to source default", async () => {
    const t = convexTest(schema);
    const { defLoc } = await seed(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("channelRouting", { source: "tiktok", storageLocationId: defLoc, isDefault: true, updatedBy: "t", updatedAt: 0 });
    });
    const result = await t.query(internal.productInventory.channelRouting.resolveChannelRouteQuery, {
      source: "tiktok",
    });
    expect(result).toBe(defLoc);
  });

  it("Tier 5 throws CHANNEL_ROUTING_NOT_CONFIGURED", async () => {
    const t = convexTest(schema);
    await expect(
      t.query(internal.productInventory.channelRouting.resolveChannelRouteQuery, { source: "tiktok" })
    ).rejects.toThrow(/CHANNEL_ROUTING_NOT_CONFIGURED/);
  });
});
```

- [ ] **Step 3.2: Run test — fails**

```bash
npm run test -- convex/productInventory/__tests__/channelRouting.test.ts
```

Expected: fail (module missing).

- [ ] **Step 3.3: Implement resolver + query wrapper**

Create `convex/productInventory/channelRouting.ts`:

```ts
/**
 * Channel routing resolution — Layer 4 location lookup.
 *
 * Five-tier precedence (most specific wins):
 *   1. (source, outletId, menuProductId)
 *   2. (source, outletId) with menuProductId undefined
 *   3. (source, menuProductId) with outletId undefined
 *   4. (source, isDefault=true)
 *   5. throw CHANNEL_ROUTING_NOT_CONFIGURED
 */

import { ConvexError, v } from "convex/values";
import { internalQuery, mutation } from "../_generated/server";
import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { externalSource } from "../schema";
import { requireRole } from "../lib/auth";

export async function resolveChannelRoute(
  ctx: QueryCtx | MutationCtx,
  params: {
    source: string;
    outletId?: Id<"externalOutlets">;
    menuProductId?: Id<"menuProducts">;
  }
): Promise<Id<"storageLocations">> {
  // Tier 1
  if (params.outletId && params.menuProductId) {
    const row = await ctx.db
      .query("channelRouting")
      .withIndex("by_source_outlet_product", (q) =>
        q.eq("source", params.source as any)
         .eq("outletId", params.outletId!)
         .eq("menuProductId", params.menuProductId!)
      )
      .first();
    if (row) return row.storageLocationId;
  }
  // Tier 2
  if (params.outletId) {
    const row = await ctx.db
      .query("channelRouting")
      .withIndex("by_source_outlet", (q) =>
        q.eq("source", params.source as any).eq("outletId", params.outletId!)
      )
      .filter((q) => q.eq(q.field("menuProductId"), undefined))
      .first();
    if (row) return row.storageLocationId;
  }
  // Tier 3
  if (params.menuProductId) {
    const row = await ctx.db
      .query("channelRouting")
      .withIndex("by_source_product", (q) =>
        q.eq("source", params.source as any).eq("menuProductId", params.menuProductId!)
      )
      .filter((q) => q.eq(q.field("outletId"), undefined))
      .first();
    if (row) return row.storageLocationId;
  }
  // Tier 4
  const defaultRow = await ctx.db
    .query("channelRouting")
    .withIndex("by_source", (q) => q.eq("source", params.source as any))
    .filter((q) => q.eq(q.field("isDefault"), true))
    .first();
  if (defaultRow) return defaultRow.storageLocationId;

  // Tier 5
  throw new ConvexError({
    code: "CHANNEL_ROUTING_NOT_CONFIGURED",
    source: params.source,
    outletId: params.outletId ?? null,
    menuProductId: params.menuProductId ?? null,
  });
}

/** Thin query wrapper so convex-test can call resolveChannelRoute directly. */
export const resolveChannelRouteQuery = internalQuery({
  args: {
    source: externalSource,
    outletId: v.optional(v.id("externalOutlets")),
    menuProductId: v.optional(v.id("menuProducts")),
  },
  handler: async (ctx, args) => resolveChannelRoute(ctx, args),
});

// ─── Admin CRUD for channelRouting ──────────────────────────────────────────

export const listRoutes = internalQuery({
  args: {},
  handler: async (ctx) => ctx.db.query("channelRouting").collect(),
});

export const upsertRoute = mutation({
  args: {
    token: v.string(),
    id: v.optional(v.id("channelRouting")),
    source: externalSource,
    outletId: v.optional(v.id("externalOutlets")),
    menuProductId: v.optional(v.id("menuProducts")),
    storageLocationId: v.id("storageLocations"),
    isDefault: v.boolean(),
  },
  handler: async (ctx, args) => {
    const { user } = await requireRole(ctx, args.token, ["admin"]);
    const { token: _t, id, ...data } = args;
    const payload = {
      ...data,
      updatedBy: user.name,
      updatedAt: Date.now(),
    };
    if (id) {
      await ctx.db.patch(id, payload);
      return id;
    }
    return ctx.db.insert("channelRouting", payload);
  },
});

export const deleteRoute = mutation({
  args: { token: v.string(), id: v.id("channelRouting") },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["admin"]);
    await ctx.db.delete(args.id);
  },
});
```

- [ ] **Step 3.4: Run test — passes**

```bash
npm run test -- convex/productInventory/__tests__/channelRouting.test.ts
```

Expected: 5 pass.

- [ ] **Step 3.5: Type-check**

```bash
npm run type-check
```

Expected: 0 errors.

- [ ] **Step 3.6: Commit**

```bash
git add convex/productInventory/channelRouting.ts convex/productInventory/__tests__/channelRouting.test.ts
git commit -m "feat(999.4): channelRouting resolver + CRUD mutations"
```

---

## Task 4: `processChannelSaleInternal`

**Files:**
- Create: `convex/productInventory/channelSale.ts`
- Create: `convex/productInventory/__tests__/channelSale.test.ts`

**Reference:** Spec § 6.1.

- [ ] **Step 4.1: Write the failing test**

Create `convex/productInventory/__tests__/channelSale.test.ts`:

```ts
import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "../../schema";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";

describe("processChannelSaleInternal", () => {
  async function setup(t: ReturnType<typeof convexTest>) {
    return t.run(async (ctx) => {
      const loc = await ctx.db.insert("storageLocations", { name: "HQ", isDefault: true, isActive: true });
      const mp = await ctx.db.insert("menuProducts", {
        name: "Test Prod", code: "TP1", defaultPrice: 25_000, isActive: true,
      } as any);
      await ctx.db.insert("productInventory", {
        menuProductId: mp, locationId: loc, quantity: 10, lastUpdated: Date.now(),
      });
      await ctx.db.insert("channelRouting", {
        source: "shopee", storageLocationId: loc, isDefault: true,
        updatedBy: "test", updatedAt: Date.now(),
      });
      return { loc, mp };
    });
  }

  it("deducts 2 units and writes channel_sale transaction with historical timestamp", async () => {
    const t = convexTest(schema);
    const { loc, mp } = await setup(t);
    const occurredAt = Date.now() - 7 * 86_400_000; // 7 days ago
    const result = await t.mutation(internal.productInventory.channelSale.processChannelSaleEntry, {
      event: {
        source: "shopee",
        occurredAt,
        externalTransactionId: "ORD-1",
        externalItemId: "I-1",
        menuProductId: mp,
        externalProductCode: "SKU-A",
        externalProductName: "Test Prod",
        quantity: 2,
        unitPrice: 25_000,
        totalPrice: 50_000,
      },
    });
    expect(result.deducted).toBe(true);
    expect(result.locationId).toBe(loc);

    const inv = await t.run(async (ctx) =>
      ctx.db.query("productInventory")
        .withIndex("by_product_location", q => q.eq("menuProductId", mp).eq("locationId", loc))
        .first()
    );
    expect(inv?.quantity).toBe(8);

    const txs = await t.run(async (ctx) =>
      ctx.db.query("productInventoryTransactions")
        .withIndex("by_product_location", q => q.eq("menuProductId", mp).eq("locationId", loc))
        .collect()
    );
    const channelTx = txs.find(tx => tx.transactionType === "channel_sale");
    expect(channelTx).toBeDefined();
    expect(channelTx?.source).toBe("shopee");
    expect(channelTx?.createdAt).toBe(occurredAt);
    expect(channelTx?.externalRef).toBe("ORD-1I-1");
    expect(channelTx?.quantity).toBe(-2);
  });

  it("skips when menuProductId missing (unmapped_sku)", async () => {
    const t = convexTest(schema);
    const result = await t.mutation(internal.productInventory.channelSale.processChannelSaleEntry, {
      event: {
        source: "shopee", occurredAt: Date.now(),
        externalTransactionId: "ORD-2",
        externalProductCode: "SKU-X", externalProductName: "Unmapped",
        quantity: 1, unitPrice: 1000, totalPrice: 1000,
      },
    });
    expect(result.deducted).toBe(false);
    expect(result.skipReason).toBe("unmapped_sku");
  });

  it("skips when quantity is zero", async () => {
    const t = convexTest(schema);
    const { mp } = await setup(t);
    const result = await t.mutation(internal.productInventory.channelSale.processChannelSaleEntry, {
      event: {
        source: "shopee", occurredAt: Date.now(),
        externalTransactionId: "ORD-3", menuProductId: mp,
        externalProductCode: "SKU-A", externalProductName: "Test",
        quantity: 0, unitPrice: 1000, totalPrice: 0,
      },
    });
    expect(result.deducted).toBe(false);
    expect(result.skipReason).toBe("zero_quantity");
  });

  it("allows negative stock on post-sale deduction", async () => {
    const t = convexTest(schema);
    const { mp } = await setup(t);
    const result = await t.mutation(internal.productInventory.channelSale.processChannelSaleEntry, {
      event: {
        source: "shopee", occurredAt: Date.now(),
        externalTransactionId: "ORD-4", menuProductId: mp,
        externalProductCode: "SKU-A", externalProductName: "Test",
        quantity: 100, unitPrice: 1000, totalPrice: 100_000,
      },
    });
    expect(result.deducted).toBe(true);
    const inv = await t.run(async (ctx) =>
      ctx.db.query("productInventory").first()
    );
    expect(inv?.quantity).toBe(-90);
  });

  it("throws CHANNEL_ROUTING_NOT_CONFIGURED when no routing row", async () => {
    const t = convexTest(schema);
    const mp = await t.run(async (ctx) =>
      ctx.db.insert("menuProducts", { name: "Unrouted", code: "UR", defaultPrice: 100, isActive: true } as any)
    );
    await expect(
      t.mutation(internal.productInventory.channelSale.processChannelSaleEntry, {
        event: {
          source: "tokopedia" as any, occurredAt: Date.now(),
          externalTransactionId: "ORD-5", menuProductId: mp,
          externalProductCode: "X", externalProductName: "Y",
          quantity: 1, unitPrice: 100, totalPrice: 100,
        },
      })
    ).rejects.toThrow(/CHANNEL_ROUTING_NOT_CONFIGURED/);
  });
});
```

- [ ] **Step 4.2: Run test — fails**

```bash
npm run test -- convex/productInventory/__tests__/channelSale.test.ts
```

Expected: module-not-found failures.

- [ ] **Step 4.3: Implement `processChannelSaleInternal`**

Create `convex/productInventory/channelSale.ts`:

```ts
/**
 * processChannelSaleInternal — Layer 4 core.
 *
 * Resolves a routing location, applies Phase 78 substitution plan if configured,
 * deducts stock via the shared stockTracker, writes a channel_sale transaction
 * with the original sale timestamp preserved in createdAt.
 *
 * Negative stock is always allowed — all channels hitting this path represent
 * sales that have already happened.
 */

import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { externalSource } from "../schema";
import { resolveChannelRoute } from "./channelRouting";
import { createStockTracker } from "./stockTracker";
import { resolveSubstitutionPlan } from "./substitution";

export interface ChannelSaleResult {
  deducted: boolean;
  locationId?: Id<"storageLocations">;
  transactionId?: Id<"productInventoryTransactions">;
  skipReason?: "unmapped_sku" | "zero_quantity" | "already_deducted";
}

const channelSaleEventValidator = v.object({
  source: externalSource,
  occurredAt: v.number(),
  externalTransactionId: v.string(),
  externalItemId: v.optional(v.string()),
  outletId: v.optional(v.id("externalOutlets")),
  menuProductId: v.optional(v.id("menuProducts")),
  externalProductCode: v.string(),
  externalProductName: v.string(),
  quantity: v.number(),
  unitPrice: v.number(),
  totalPrice: v.number(),
});

export async function processChannelSaleInternal(
  ctx: MutationCtx,
  event: {
    source: string;
    occurredAt: number;
    externalTransactionId: string;
    externalItemId?: string;
    outletId?: Id<"externalOutlets">;
    menuProductId?: Id<"menuProducts">;
    externalProductCode: string;
    externalProductName: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
  }
): Promise<ChannelSaleResult> {
  // Guard 1: unmapped SKU
  if (!event.menuProductId) {
    return { deducted: false, skipReason: "unmapped_sku" };
  }
  // Guard 2: zero quantity
  if (event.quantity <= 0) {
    return { deducted: false, skipReason: "zero_quantity" };
  }

  // Guard 3: route — throws on missing config
  const locationId = await resolveChannelRoute(ctx, {
    source: event.source,
    outletId: event.outletId,
    menuProductId: event.menuProductId,
  });

  // Apply Phase 78 substitution (if configured for this menu product)
  const menuProduct = await ctx.db.get(event.menuProductId);
  if (!menuProduct) {
    // Product deleted between mapping and processing — treat as unmapped
    return { deducted: false, skipReason: "unmapped_sku" };
  }

  const tracker = createStockTracker(ctx);
  const direct = await tracker.getStock(event.menuProductId, locationId);

  let sourceProduct = null;
  let substituteStock = null;
  if (menuProduct.fulfillFromProductId && menuProduct.fulfillMultiplier) {
    sourceProduct = await ctx.db.get(menuProduct.fulfillFromProductId);
    if (sourceProduct) {
      substituteStock = await tracker.getStock(menuProduct.fulfillFromProductId, locationId);
    }
  }

  const plan = resolveSubstitutionPlan(
    event.quantity,
    direct.runningQty,
    menuProduct,
    sourceProduct
  );

  const externalRef = `${event.externalTransactionId}${event.externalItemId ?? ""}`;
  const performedBy = `system:${event.source}_sync`;
  let transactionId: Id<"productInventoryTransactions"> | undefined;

  // Direct deduction
  if (plan.directUnits > 0) {
    const prev = direct.runningQty;
    const next = prev - plan.directUnits;
    direct.runningQty = next;
    transactionId = await ctx.db.insert("productInventoryTransactions", {
      menuProductId: event.menuProductId,
      locationId,
      transactionType: "channel_sale",
      source: event.source as any,
      externalRef,
      quantity: -plan.directUnits,
      previousQuantity: prev,
      newQuantity: next,
      performedBy,
      createdAt: event.occurredAt,  // ★ historical timestamp preserved
    });
  }

  // Substitute deduction
  if (plan.needsSubstitution && plan.substituteUnits > 0 && sourceProduct && substituteStock) {
    const prev = substituteStock.runningQty;
    const next = prev - plan.substituteUnits;
    substituteStock.runningQty = next;
    await ctx.db.insert("productInventoryTransactions", {
      menuProductId: sourceProduct._id,
      locationId,
      transactionType: "channel_sale",
      source: event.source as any,
      externalRef,
      quantity: -plan.substituteUnits,
      previousQuantity: prev,
      newQuantity: next,
      performedBy,
      createdAt: event.occurredAt,
    });
  }

  await tracker.flush(Date.now());

  return { deducted: true, locationId, transactionId };
}

/** Internal test-facing wrapper — convex-test needs an internalMutation handle. */
export const processChannelSaleEntry = internalMutation({
  args: { event: channelSaleEventValidator },
  handler: async (ctx, args) => processChannelSaleInternal(ctx, args.event),
});
```

- [ ] **Step 4.4: Run test — passes**

```bash
npm run test -- convex/productInventory/__tests__/channelSale.test.ts
```

Expected: 5 pass.

- [ ] **Step 4.5: Type-check**

```bash
npm run type-check
```

Expected: 0 errors.

- [ ] **Step 4.6: Commit**

```bash
git add convex/productInventory/channelSale.ts convex/productInventory/__tests__/channelSale.test.ts
git commit -m "feat(999.4): processChannelSaleInternal with timestamp-preserving transactions"
```

---

## Task 5: Audit detection + `runFullAudit`

**Files:**
- Create: `convex/productInventory/channelAudit.ts`
- Create: `convex/productInventory/__tests__/channelAudit.test.ts`

**Reference:** Spec § 8.1.

- [ ] **Step 5.1: Write the failing test**

Create `convex/productInventory/__tests__/channelAudit.test.ts`:

```ts
import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "../../schema";
import { internal } from "../../_generated/api";

describe("channelAudit detection", () => {
  it("flags unmapped_sku when linkedMenuProductId null and no mapping exists", async () => {
    const t = convexTest(schema);
    const { revId, itemId } = await t.run(async (ctx) => {
      const revenueId = await ctx.db.insert("externalRevenue", {
        source: "shopee", revenueGross: 10_000, revenueNet: 9000,
        transactionDate: Date.now(), externalTransactionId: "T1",
      } as any);
      const iid = await ctx.db.insert("externalRevenueItems", {
        revenueId, source: "shopee",
        productName: "Mystery SKU", unitPrice: 10_000, quantity: 1, totalPrice: 10_000,
        isAutoMatched: false, createdAt: Date.now(),
      });
      return { revId: revenueId, itemId: iid };
    });

    const report = await t.mutation(internal.productInventory.channelAudit.runFullAudit, {
      generatedBy: "test",
    });
    const issues = await t.run(async (ctx) =>
      ctx.db.query("channelAuditIssues")
        .withIndex("by_report", q => q.eq("reportId", report.reportId))
        .collect()
    );
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.some(i => i.issueType === "unmapped_sku" && i.revenueItemId === itemId)).toBe(true);
  });

  it("flags stale_mapping when linked menu product is inactive", async () => {
    const t = convexTest(schema);
    await t.run(async (ctx) => {
      const mp = await ctx.db.insert("menuProducts", {
        name: "Retired", code: "RET", defaultPrice: 1000, isActive: false,
      } as any);
      const rev = await ctx.db.insert("externalRevenue", {
        source: "shopee", revenueGross: 1000, revenueNet: 900,
        transactionDate: Date.now(), externalTransactionId: "T2",
      } as any);
      await ctx.db.insert("externalRevenueItems", {
        revenueId: rev, source: "shopee",
        productName: "Retired", unitPrice: 1000, quantity: 1, totalPrice: 1000,
        linkedMenuProductId: mp, isAutoMatched: false, createdAt: Date.now(),
      });
    });
    const report = await t.mutation(internal.productInventory.channelAudit.runFullAudit, {
      generatedBy: "test",
    });
    const issues = await t.run(async (ctx) =>
      ctx.db.query("channelAuditIssues")
        .withIndex("by_report_type", q => q.eq("reportId", report.reportId).eq("issueType", "stale_mapping"))
        .collect()
    );
    expect(issues.length).toBe(1);
  });

  it("flags malformed_item when quantity <= 0 or totalPrice < 0", async () => {
    const t = convexTest(schema);
    await t.run(async (ctx) => {
      const rev = await ctx.db.insert("externalRevenue", {
        source: "shopee", revenueGross: 0, revenueNet: 0,
        transactionDate: Date.now(), externalTransactionId: "T3",
      } as any);
      await ctx.db.insert("externalRevenueItems", {
        revenueId: rev, source: "shopee",
        productName: "Bad", unitPrice: 100, quantity: -1, totalPrice: -100,
        isAutoMatched: false, createdAt: Date.now(),
      });
    });
    const report = await t.mutation(internal.productInventory.channelAudit.runFullAudit, {
      generatedBy: "test",
    });
    const issues = await t.run(async (ctx) =>
      ctx.db.query("channelAuditIssues")
        .withIndex("by_report_type", q => q.eq("reportId", report.reportId).eq("issueType", "malformed_item"))
        .collect()
    );
    expect(issues.length).toBeGreaterThanOrEqual(1);
  });

  it("flags orphan_item when parent revenue missing", async () => {
    const t = convexTest(schema);
    await t.run(async (ctx) => {
      const rev = await ctx.db.insert("externalRevenue", {
        source: "shopee", revenueGross: 100, revenueNet: 90,
        transactionDate: Date.now(), externalTransactionId: "T4",
      } as any);
      await ctx.db.insert("externalRevenueItems", {
        revenueId: rev, source: "shopee",
        productName: "Orphan", unitPrice: 100, quantity: 1, totalPrice: 100,
        isAutoMatched: false, createdAt: Date.now(),
      });
      // Simulate orphan by deleting revenue
      await ctx.db.delete(rev);
    });
    const report = await t.mutation(internal.productInventory.channelAudit.runFullAudit, {
      generatedBy: "test",
    });
    const issues = await t.run(async (ctx) =>
      ctx.db.query("channelAuditIssues")
        .withIndex("by_report_type", q => q.eq("reportId", report.reportId).eq("issueType", "orphan_item"))
        .collect()
    );
    expect(issues.length).toBe(1);
  });

  it("summary counts match issues found", async () => {
    const t = convexTest(schema);
    await t.run(async (ctx) => {
      const rev = await ctx.db.insert("externalRevenue", {
        source: "shopee", revenueGross: 100, revenueNet: 90,
        transactionDate: Date.now(), externalTransactionId: "T5",
      } as any);
      await ctx.db.insert("externalRevenueItems", {
        revenueId: rev, source: "shopee",
        productName: "X", unitPrice: 50, quantity: -2, totalPrice: -100,
        isAutoMatched: false, createdAt: Date.now(),
      });
    });
    const report = await t.mutation(internal.productInventory.channelAudit.runFullAudit, {
      generatedBy: "test",
    });
    const doc = await t.run(async (ctx) => ctx.db.get(report.reportId));
    expect(doc?.summary.malformedItems).toBe(1);
    expect(doc?.summary.totalItemsScanned).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 5.2: Run test — fails**

```bash
npm run test -- convex/productInventory/__tests__/channelAudit.test.ts
```

Expected: module-not-found.

- [ ] **Step 5.3: Implement audit detection + runner**

Create `convex/productInventory/channelAudit.ts`:

```ts
/**
 * Channel audit — data-hygiene detection for externalRevenueItems.
 *
 * Two surfaces:
 *   - detectAuditIssuesForItem: per-row checker used inline by saveRevenueItems
 *   - runFullAudit: full-database scan used by the admin workbench
 *
 * Both write into channelAuditIssues referenced by a channelAuditReports row.
 */

import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

export type AuditIssue = {
  issueType:
    | "unmapped_sku"
    | "stale_mapping"
    | "malformed_item"
    | "duplicate_transaction"
    | "orphan_item";
  revenueItemId?: Id<"externalRevenueItems">;
  revenueId?: Id<"externalRevenue">;
  externalProductCode?: string;
  externalProductName?: string;
  source: string;
  details: string;
};

/**
 * Per-row detection. Called by saveRevenueItems after each row insert.
 */
export async function detectAuditIssuesForItem(
  ctx: QueryCtx | MutationCtx,
  item: Doc<"externalRevenueItems">,
  revenue: Doc<"externalRevenue"> | null
): Promise<AuditIssue[]> {
  const issues: AuditIssue[] = [];

  // malformed_item
  if (item.quantity <= 0 || item.totalPrice < 0) {
    issues.push({
      issueType: "malformed_item",
      revenueItemId: item._id,
      revenueId: item.revenueId,
      externalProductName: item.productName,
      source: item.source,
      details: `quantity=${item.quantity} totalPrice=${item.totalPrice}`,
    });
  }

  // orphan_item
  if (!revenue) {
    issues.push({
      issueType: "orphan_item",
      revenueItemId: item._id,
      revenueId: item.revenueId,
      externalProductName: item.productName,
      source: item.source,
      details: `parent externalRevenue ${item.revenueId} missing`,
    });
    // Can't check other issue types without a parent — return early
    return issues;
  }

  // unmapped_sku
  if (!item.linkedMenuProductId) {
    // Look for a mapping we missed
    const mapping = await ctx.db
      .query("externalProductMappings")
      .withIndex("by_source_code", (q) =>
        q.eq("source", item.source as any)
         .eq("externalProductCode", item.productName)
      )
      .first();
    if (!mapping?.menuProductId) {
      issues.push({
        issueType: "unmapped_sku",
        revenueItemId: item._id,
        revenueId: item.revenueId,
        externalProductName: item.productName,
        source: item.source,
        details: `no externalProductMappings row for source=${item.source}`,
      });
    }
  }

  // stale_mapping
  if (item.linkedMenuProductId) {
    const mp = await ctx.db.get(item.linkedMenuProductId);
    if (!mp || !mp.isActive) {
      issues.push({
        issueType: "stale_mapping",
        revenueItemId: item._id,
        revenueId: item.revenueId,
        externalProductName: item.productName,
        source: item.source,
        details: mp
          ? `linked menuProduct ${item.linkedMenuProductId} is inactive`
          : `linked menuProduct ${item.linkedMenuProductId} missing`,
      });
    }
  }

  // duplicate_transaction — only flag when revenue has externalTransactionId
  if (revenue.externalTransactionId && item.externalItemId) {
    const matches = await ctx.db
      .query("externalRevenueItems")
      .withIndex("by_revenue", (q) => q.eq("revenueId", item.revenueId))
      .filter((q) => q.eq(q.field("externalItemId"), item.externalItemId))
      .collect();
    if (matches.length > 1) {
      issues.push({
        issueType: "duplicate_transaction",
        revenueItemId: item._id,
        revenueId: item.revenueId,
        externalProductName: item.productName,
        source: item.source,
        details: `${matches.length} items share (revenueId, externalItemId=${item.externalItemId})`,
      });
    }
  }

  return issues;
}

/** Write issues into channelAuditIssues under a given report. */
export async function recordAuditIssues(
  ctx: MutationCtx,
  reportId: Id<"channelAuditReports">,
  issues: AuditIssue[]
): Promise<void> {
  for (const issue of issues) {
    await ctx.db.insert("channelAuditIssues", {
      reportId,
      issueType: issue.issueType,
      revenueItemId: issue.revenueItemId,
      revenueId: issue.revenueId,
      externalProductCode: issue.externalProductCode,
      externalProductName: issue.externalProductName,
      source: issue.source as any,
      details: issue.details,
    });
  }
}

/** Full-DB scan. Emits a fresh report with all current issues. */
export const runFullAudit = internalMutation({
  args: { generatedBy: v.string() },
  handler: async (ctx, args) => {
    const reportId = await ctx.db.insert("channelAuditReports", {
      generatedAt: Date.now(),
      generatedBy: args.generatedBy,
      status: "pending",
      summary: {
        totalItemsScanned: 0,
        unmappedSkus: 0,
        staleMappings: 0,
        malformedItems: 0,
        duplicateTransactions: 0,
        orphanItems: 0,
      },
    });

    const counts = {
      totalItemsScanned: 0,
      unmappedSkus: 0,
      staleMappings: 0,
      malformedItems: 0,
      duplicateTransactions: 0,
      orphanItems: 0,
    };

    const items = await ctx.db.query("externalRevenueItems").collect();
    for (const item of items) {
      counts.totalItemsScanned++;
      const revenue = await ctx.db.get(item.revenueId);
      const issues = await detectAuditIssuesForItem(ctx, item, revenue);
      await recordAuditIssues(ctx, reportId, issues);
      for (const issue of issues) {
        if (issue.issueType === "unmapped_sku") counts.unmappedSkus++;
        else if (issue.issueType === "stale_mapping") counts.staleMappings++;
        else if (issue.issueType === "malformed_item") counts.malformedItems++;
        else if (issue.issueType === "duplicate_transaction") counts.duplicateTransactions++;
        else if (issue.issueType === "orphan_item") counts.orphanItems++;
      }
    }

    await ctx.db.patch(reportId, { summary: counts });
    return { reportId, summary: counts };
  },
});

/** Supersede older pending reports when a fresh run completes — keeps UI simple. */
export const supersedePriorReports = internalMutation({
  args: { keepReportId: v.id("channelAuditReports") },
  handler: async (ctx, args) => {
    const prior = await ctx.db
      .query("channelAuditReports")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();
    for (const r of prior) {
      if (r._id !== args.keepReportId) {
        await ctx.db.patch(r._id, { status: "superseded" });
      }
    }
  },
});
```

- [ ] **Step 5.4: Run test — passes**

```bash
npm run test -- convex/productInventory/__tests__/channelAudit.test.ts
```

Expected: 5 pass.

- [ ] **Step 5.5: Commit**

```bash
git add convex/productInventory/channelAudit.ts convex/productInventory/__tests__/channelAudit.test.ts
git commit -m "feat(999.4): channelAudit detection + runFullAudit"
```

---

## Task 6: `saveRevenueItems` hook — Layer 3 → Layer 4 seam

**Files:**
- Modify: `convex/externalData/mutations.ts` (extend `saveRevenueItems`)
- Create: `convex/productInventory/__tests__/saveRevenueItemsHook.test.ts`

**Reference:** Spec § 6.2.

- [ ] **Step 6.1: Write the failing test**

Create `convex/productInventory/__tests__/saveRevenueItemsHook.test.ts`:

```ts
import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "../../schema";
import { internal } from "../../_generated/api";

describe("saveRevenueItems dispatches deduction", () => {
  async function setup(t: ReturnType<typeof convexTest>) {
    return t.run(async (ctx) => {
      const loc = await ctx.db.insert("storageLocations", { name: "HQ", isDefault: true, isActive: true });
      const mp = await ctx.db.insert("menuProducts", {
        name: "Shopee Prod", code: "SP1", defaultPrice: 25_000, isActive: true,
      } as any);
      await ctx.db.insert("productInventory", {
        menuProductId: mp, locationId: loc, quantity: 10, lastUpdated: Date.now(),
      });
      await ctx.db.insert("channelRouting", {
        source: "shopee", storageLocationId: loc, isDefault: true,
        updatedBy: "test", updatedAt: Date.now(),
      });
      const revId = await ctx.db.insert("externalRevenue", {
        source: "shopee", revenueGross: 50_000, revenueNet: 45_000,
        transactionDate: Date.now() - 86_400_000, externalTransactionId: "ORD-A",
      } as any);
      return { loc, mp, revId };
    });
  }

  it("writes channel_sale transaction + sets inventoryDeductedAt", async () => {
    const t = convexTest(schema);
    const { loc, mp, revId } = await setup(t);
    await t.mutation(internal.externalData.mutations.saveRevenueItems, {
      revenueId: revId,
      items: [{
        externalItemId: "I-1",
        productName: "Shopee Prod",
        unitPrice: 25_000, quantity: 2, totalPrice: 50_000,
        linkedMenuProductId: mp, isAutoMatched: true,
      }],
    });
    const items = await t.run(async (ctx) =>
      ctx.db.query("externalRevenueItems").collect()
    );
    expect(items.length).toBe(1);
    expect(items[0].inventoryDeductedAt).toBeDefined();

    const inv = await t.run(async (ctx) =>
      ctx.db.query("productInventory").first()
    );
    expect(inv?.quantity).toBe(8);
  });

  it("re-running saveRevenueItems with same externalItemId does NOT re-deduct", async () => {
    const t = convexTest(schema);
    const { mp, revId } = await setup(t);
    const payload = {
      revenueId: revId,
      items: [{
        externalItemId: "I-1", productName: "Shopee Prod",
        unitPrice: 25_000, quantity: 2, totalPrice: 50_000,
        linkedMenuProductId: mp, isAutoMatched: true,
      }],
    };
    await t.mutation(internal.externalData.mutations.saveRevenueItems, payload);
    await t.mutation(internal.externalData.mutations.saveRevenueItems, payload);
    const inv = await t.run(async (ctx) =>
      ctx.db.query("productInventory").first()
    );
    expect(inv?.quantity).toBe(8); // deducted once, not twice
  });

  it("unmapped item does NOT deduct but DOES write an audit issue inline", async () => {
    const t = convexTest(schema);
    const { revId } = await setup(t);
    await t.mutation(internal.externalData.mutations.saveRevenueItems, {
      revenueId: revId,
      items: [{
        externalItemId: "I-UNMAPPED", productName: "Unknown",
        unitPrice: 1000, quantity: 1, totalPrice: 1000,
        isAutoMatched: false,
      }],
    });
    const items = await t.run(async (ctx) =>
      ctx.db.query("externalRevenueItems").collect()
    );
    expect(items[0].inventoryDeductedAt).toBeUndefined();

    const issues = await t.run(async (ctx) =>
      ctx.db.query("channelAuditIssues").collect()
    );
    expect(issues.some(i => i.issueType === "unmapped_sku")).toBe(true);
  });

  it("uses revenue.transactionDate as occurredAt for the ledger transaction", async () => {
    const t = convexTest(schema);
    const { mp, revId } = await setup(t);
    const historicalDate = Date.now() - 30 * 86_400_000;
    await t.run(async (ctx) => {
      await ctx.db.patch(revId, { transactionDate: historicalDate });
    });
    await t.mutation(internal.externalData.mutations.saveRevenueItems, {
      revenueId: revId,
      items: [{
        externalItemId: "I-1", productName: "Shopee Prod",
        unitPrice: 25_000, quantity: 1, totalPrice: 25_000,
        linkedMenuProductId: mp, isAutoMatched: true,
      }],
    });
    const txs = await t.run(async (ctx) =>
      ctx.db.query("productInventoryTransactions")
        .withIndex("by_type", q => q.eq("transactionType", "channel_sale"))
        .collect()
    );
    expect(txs[0].createdAt).toBe(historicalDate);
  });
});
```

- [ ] **Step 6.2: Run test — fails**

```bash
npm run test -- convex/productInventory/__tests__/saveRevenueItemsHook.test.ts
```

Expected: deduction not happening yet (items returned but no transactions).

- [ ] **Step 6.3: Need a standalone audit report for inline writes**

Before modifying `saveRevenueItems`, add a helper in `convex/productInventory/channelAudit.ts` that returns a singleton "inline" audit report id (created once, reused for inline issue writes). Open `channelAudit.ts`, add at the bottom:

```ts
/** Get or create the singleton "inline" audit report used by saveRevenueItems. */
export async function getOrCreateInlineReport(
  ctx: MutationCtx
): Promise<Id<"channelAuditReports">> {
  const existing = await ctx.db
    .query("channelAuditReports")
    .withIndex("by_status", (q) => q.eq("status", "pending"))
    .filter((q) => q.eq(q.field("generatedBy"), "system:inline"))
    .first();
  if (existing) return existing._id;
  return ctx.db.insert("channelAuditReports", {
    generatedAt: Date.now(),
    generatedBy: "system:inline",
    status: "pending",
    summary: {
      totalItemsScanned: 0,
      unmappedSkus: 0,
      staleMappings: 0,
      malformedItems: 0,
      duplicateTransactions: 0,
      orphanItems: 0,
    },
  });
}
```

- [ ] **Step 6.4: Modify `saveRevenueItems`**

Open `convex/externalData/mutations.ts`. Replace the existing `saveRevenueItems` export with:

```ts
export const saveRevenueItems = internalMutation({
  args: {
    revenueId: v.id("externalRevenue"),
    items: v.array(v.object({
      externalItemId: v.optional(v.string()),
      productName: v.string(),
      unitPrice: v.number(),
      quantity: v.number(),
      totalPrice: v.number(),
      variants: v.optional(v.string()),
      linkedMenuProductId: v.optional(v.id("menuProducts")),
      isAutoMatched: v.boolean(),
      matchConfidence: v.optional(v.union(
        v.literal("exact"), v.literal("price_only"),
        v.literal("name_only"), v.literal("none")
      )),
      externalProductCode: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args) => {
    const ids: Id<"externalRevenueItems">[] = [];
    const revenue = await ctx.db.get(args.revenueId);
    if (!revenue) {
      throw new Error(`Revenue record not found: ${args.revenueId}`);
    }

    // Lazy-create audit report for inline issues
    let inlineReportId: Id<"channelAuditReports"> | null = null;
    const ensureReport = async () => {
      if (inlineReportId) return inlineReportId;
      inlineReportId = await getOrCreateInlineReport(ctx);
      return inlineReportId;
    };

    for (const item of args.items) {
      // ─── Step A: existing dedup + insert ───
      if (item.externalItemId) {
        const existing = await ctx.db
          .query("externalRevenueItems")
          .withIndex("by_revenue", (q) => q.eq("revenueId", args.revenueId))
          .filter((q) => q.eq(q.field("externalItemId"), item.externalItemId))
          .first();
        if (existing) {
          ids.push(existing._id);
          continue;
        }
      }
      const itemId = await ctx.db.insert("externalRevenueItems", {
        revenueId: args.revenueId,
        source: revenue.source,
        externalItemId: item.externalItemId,
        productName: item.productName,
        unitPrice: item.unitPrice,
        quantity: item.quantity,
        totalPrice: item.totalPrice,
        variants: item.variants,
        linkedMenuProductId: item.linkedMenuProductId,
        isAutoMatched: item.isAutoMatched,
        matchConfidence: item.matchConfidence,
        createdAt: Date.now(),
      });
      ids.push(itemId);
      const insertedRow = await ctx.db.get(itemId);
      if (!insertedRow) continue;

      // ─── Step B: audit detection ───
      const issues = await detectAuditIssuesForItem(ctx, insertedRow, revenue);
      if (issues.length > 0) {
        const reportId = await ensureReport();
        await recordAuditIssues(ctx, reportId, issues);
      }

      // ─── Step C: deduction dispatch ───
      if (insertedRow.inventoryDeductedAt != null) continue;
      if (!item.linkedMenuProductId) continue;
      if (item.quantity <= 0) continue;

      const event = {
        source: revenue.source,
        occurredAt: revenue.transactionDate ?? Date.now(),
        externalTransactionId: revenue.externalTransactionId ?? "",
        externalItemId: item.externalItemId,
        outletId: revenue.outletId,
        menuProductId: item.linkedMenuProductId,
        externalProductCode: item.externalProductCode ?? item.productName,
        externalProductName: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
      };

      const result = await processChannelSaleInternal(ctx, event);
      if (result.deducted) {
        await ctx.db.patch(itemId, { inventoryDeductedAt: Date.now() });
      }
    }
    return ids;
  },
});
```

Add the imports at the top of `convex/externalData/mutations.ts`:

```ts
import { processChannelSaleInternal } from "../productInventory/channelSale";
import {
  detectAuditIssuesForItem,
  recordAuditIssues,
  getOrCreateInlineReport,
} from "../productInventory/channelAudit";
```

- [ ] **Step 6.5: Run test — passes**

```bash
npm run test -- convex/productInventory/__tests__/saveRevenueItemsHook.test.ts
```

Expected: 4 pass.

- [ ] **Step 6.6: Full backend test suite**

```bash
npm run test -- convex/
```

Expected: all tests pass (new tests + zero regressions in existing tests). If any existing tests fail, inspect — saveRevenueItems behavior changed only by adding downstream effects; existing callers that don't set up routing rows should work if their test data either (a) sets up routing, or (b) sets linkedMenuProductId to null. Fix test fixtures as needed; commit fixes separately.

- [ ] **Step 6.7: Type-check**

```bash
npm run type-check
```

Expected: 0 errors.

- [ ] **Step 6.8: Commit**

```bash
git add convex/externalData/mutations.ts convex/productInventory/channelAudit.ts convex/productInventory/__tests__/saveRevenueItemsHook.test.ts
git commit -m "feat(999.4): saveRevenueItems dispatches audit + channel_sale deduction"
```

- [ ] **Step 6.9: Checkpoint — run full test suite + build**

```bash
npm run test
npm run build
```

Both must pass before proceeding. This is the highest-risk integration point; stop here if anything is red.

---

## Task 7: Adapter normalize — gobiz, bigseller, internal

**Files:**
- Modify: `convex/integrations/gobiz/adapter.ts`
- Modify: `convex/integrations/bigseller/sync.ts`
- Modify: `convex/integrations/internal/adapter.ts`
- Create: `convex/productInventory/__tests__/adapterRegression/gobizSnapshot.ts`
- Create: `convex/productInventory/__tests__/adapterRegression/bigsellerSnapshot.ts`
- Create: `convex/productInventory/__tests__/adapterRegression/internalSnapshot.ts`
- Create: `convex/productInventory/__tests__/adapterRegression.test.ts`

**Reference:** Spec § 14 risk mitigation — "regression-test normalization is byte-identical on the happy path".

These three adapters already route through `saveRevenueItems`. The refactor here is **shape normalization only** — each adapter's existing payload conversion code extracts into a pure `normalize(raw)` step returning `ChannelSaleEvent[]`. Behaviour must be byte-identical.

- [ ] **Step 7.1: Capture baseline snapshots**

For each adapter, find 3–5 real sample payloads from recent sync logs (or use the test fixtures if any exist in `__tests__` folders). Create snapshot files:

```ts
// convex/productInventory/__tests__/adapterRegression/gobizSnapshot.ts
export const GOBIZ_RAW_SAMPLES = [
  {
    /* paste a real payload sample from prod log — single order */
  },
  // ... 2–4 more
];

export const GOBIZ_EXPECTED_EVENTS = [
  // For each raw sample, the expected ChannelSaleEvent[] output.
  // Derive by manually inspecting the existing adapter code.
];
```

**Engineer guidance:** the spec says "snapshot sample payloads from prod logs". If prod access isn't practical, capture payloads by running the existing sync against dev (`npx convex dev` + trigger a sync action from the dashboard) and logging the raw + current output. Commit these fixtures before touching the adapter code.

- [ ] **Step 7.2: Write the regression test**

Create `convex/productInventory/__tests__/adapterRegression.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { normalizeGobizSales } from "../../integrations/gobiz/adapter";
import { normalizeBigsellerOrders } from "../../integrations/bigseller/sync";
import { normalizeInternalOrders } from "../../integrations/internal/adapter";
import { GOBIZ_RAW_SAMPLES, GOBIZ_EXPECTED_EVENTS } from "./adapterRegression/gobizSnapshot";
import { BIGSELLER_RAW_SAMPLES, BIGSELLER_EXPECTED_EVENTS } from "./adapterRegression/bigsellerSnapshot";
import { INTERNAL_RAW_SAMPLES, INTERNAL_EXPECTED_EVENTS } from "./adapterRegression/internalSnapshot";

describe("Adapter normalize regression — byte-identical", () => {
  it.each(GOBIZ_RAW_SAMPLES.map((s, i) => [i, s, GOBIZ_EXPECTED_EVENTS[i]]))(
    "gobiz sample %i produces expected ChannelSaleEvent[]",
    (_i, raw, expected) => {
      expect(normalizeGobizSales(raw as any)).toEqual(expected);
    }
  );

  it.each(BIGSELLER_RAW_SAMPLES.map((s, i) => [i, s, BIGSELLER_EXPECTED_EVENTS[i]]))(
    "bigseller sample %i produces expected ChannelSaleEvent[]",
    (_i, raw, expected) => {
      expect(normalizeBigsellerOrders(raw as any)).toEqual(expected);
    }
  );

  it.each(INTERNAL_RAW_SAMPLES.map((s, i) => [i, s, INTERNAL_EXPECTED_EVENTS[i]]))(
    "internal sample %i produces expected ChannelSaleEvent[]",
    (_i, raw, expected) => {
      expect(normalizeInternalOrders(raw as any)).toEqual(expected);
    }
  );
});
```

- [ ] **Step 7.3: Extract + export normalize functions**

For each adapter, pull the payload-shaping logic out of the action handler into a pure `normalize*` function exported from the file. Keep the action that calls `saveRevenueItems`; it now calls `normalize*()` first, then passes the resulting events into the revenue-item shape.

Example signature (gobiz):

```ts
export function normalizeGobizSales(raw: GobizRawResponse): ChannelSaleEvent[] {
  // existing payload-shaping logic, returning ChannelSaleEvent[] instead of
  // passing straight into saveRevenueItems args
}
```

Then the action:

```ts
const events = normalizeGobizSales(raw);
for (const event of events) validateChannelSaleEvent(event);
await ctx.runMutation(internal.externalData.mutations.saveRevenueItems, {
  revenueId: /* as before */,
  items: events.map(eventToRevenueItemArg),
});
```

Do the same for `bigseller/sync.ts` (`normalizeBigsellerOrders`) and `internal/adapter.ts` (`normalizeInternalOrders`).

Create the `eventToRevenueItemArg` helper once in `convex/integrations/_shared/channelAdapter.ts`:

```ts
export function eventToRevenueItemArg(event: ChannelSaleEvent) {
  return {
    externalItemId: event.externalItemId,
    productName: event.externalProductName,
    unitPrice: event.unitPrice,
    quantity: event.quantity,
    totalPrice: event.totalPrice,
    linkedMenuProductId: event.menuProductId,
    isAutoMatched: event.menuProductId != null,
    externalProductCode: event.externalProductCode,
  };
}
```

- [ ] **Step 7.4: Run regression test**

```bash
npm run test -- convex/productInventory/__tests__/adapterRegression.test.ts
```

Expected: all samples pass (byte-identical).

If a sample fails, **do not edit the expected output** — fix the normalize function until it matches. The regression contract is "old behavior preserved".

- [ ] **Step 7.5: Run full backend test suite**

```bash
npm run test -- convex/
```

Expected: all pass.

- [ ] **Step 7.6: Commit**

```bash
git add convex/integrations/gobiz/adapter.ts convex/integrations/bigseller/sync.ts convex/integrations/internal/adapter.ts convex/integrations/_shared/channelAdapter.ts convex/productInventory/__tests__/adapterRegression/ convex/productInventory/__tests__/adapterRegression.test.ts
git commit -m "refactor(999.4): gobiz/bigseller/internal adapters emit ChannelSaleEvent"
```

---

## Task 8: Adapter reroute — k3mart, grabfood

**Files:**
- Modify: `convex/integrations/k3mart/adapter.ts`
- Modify: `convex/integrations/grabfood/adapter.ts`
- Create: `convex/productInventory/__tests__/adapterRegression/k3martSnapshot.ts`
- Create: `convex/productInventory/__tests__/adapterRegression/grabfoodSnapshot.ts`
- Modify: `convex/productInventory/__tests__/adapterRegression.test.ts` (add k3mart + grabfood cases)

**Reference:** Spec § 14 risk — K3Mart consignment semantics must be preserved.

K3Mart and GrabFood do NOT currently flow through `saveRevenueItems`. They write via source-specific mutations (`k3martCockpit/*` or custom paths). This task migrates them onto the shared revenue writer.

- [ ] **Step 8.1: Read existing K3Mart write path**

```bash
# engineer — trace where K3Mart sales rows currently originate
grep -rn "insert.*externalRevenue" convex/k3martCockpit/ convex/integrations/k3mart/
grep -rn "collapseRevenuePeriod" convex/integrations/k3mart/
```

Note every current call site. K3Mart uses `collapseRevenuePeriod` (per memory — consignment period collapsing). This semantics must survive the refactor.

- [ ] **Step 8.2: Capture K3Mart + GrabFood snapshots**

Same as Step 7.1 — sample raw payloads, expected ChannelSaleEvent[] outputs.

```ts
// convex/productInventory/__tests__/adapterRegression/k3martSnapshot.ts
export const K3MART_RAW_SAMPLES = [/* … */];
export const K3MART_EXPECTED_EVENTS = [/* … */];
```

- [ ] **Step 8.3: Write regression assertions**

Add to the existing `adapterRegression.test.ts`:

```ts
import { normalizeK3MartSales } from "../../integrations/k3mart/adapter";
import { normalizeGrabfoodOrders } from "../../integrations/grabfood/adapter";
import { K3MART_RAW_SAMPLES, K3MART_EXPECTED_EVENTS } from "./adapterRegression/k3martSnapshot";
import { GRABFOOD_RAW_SAMPLES, GRABFOOD_EXPECTED_EVENTS } from "./adapterRegression/grabfoodSnapshot";

it.each(K3MART_RAW_SAMPLES.map((s, i) => [i, s, K3MART_EXPECTED_EVENTS[i]]))(
  "k3mart sample %i produces expected ChannelSaleEvent[]",
  (_i, raw, expected) => {
    expect(normalizeK3MartSales(raw as any)).toEqual(expected);
  }
);

it.each(GRABFOOD_RAW_SAMPLES.map((s, i) => [i, s, GRABFOOD_EXPECTED_EVENTS[i]]))(
  "grabfood sample %i produces expected ChannelSaleEvent[]",
  (_i, raw, expected) => {
    expect(normalizeGrabfoodOrders(raw as any)).toEqual(expected);
  }
);
```

**Important K3Mart constraint:** the `occurredAt` for each event must be the consignment recognition date (NOT the collection date). Per the memory "Consignment recognition — collapsed period fields (periodStart=periodEnd=transactionDate=recognitionDate); use `collapseRevenuePeriod` helper". The K3Mart normalize function must use `collapseRevenuePeriod` internally and set `occurredAt = collapsedRecognitionDate`.

- [ ] **Step 8.4: Implement `normalizeK3MartSales` + `normalizeGrabfoodOrders`**

Extract the payload-shaping from the existing action handlers. For K3Mart:

```ts
// convex/integrations/k3mart/adapter.ts
import { collapseRevenuePeriod } from "../../consignment/recognition";  // path as appropriate

export function normalizeK3MartSales(raw: K3MartSalesResponse): ChannelSaleEvent[] {
  const events: ChannelSaleEvent[] = [];
  for (const outletSales of raw.outlets) {
    const recognitionDate = collapseRevenuePeriod(outletSales.periodStart, outletSales.periodEnd);
    for (const row of outletSales.sales) {
      events.push({
        source: "k3mart",
        occurredAt: recognitionDate,  // ★ consignment semantics preserved
        externalTransactionId: row.dedupKey,
        externalItemId: row.productCode,
        outletId: row.outletId,
        menuProductId: row.resolvedMenuProductId,
        externalProductCode: row.productCode,
        externalProductName: row.productName,
        quantity: row.quantity,
        unitPrice: row.unitPrice,
        totalPrice: row.totalPrice,
      });
    }
  }
  return events;
}
```

Swap the action's sales-write path to:

```ts
const events = normalizeK3MartSales(raw);
for (const event of events) validateChannelSaleEvent(event);
// Upsert parent externalRevenue via existing pattern (if K3Mart didn't before,
// add it here — one revenue row per outlet/period pair)
for (const outletPeriod of groupByOutletPeriod(events)) {
  const revenueId = await ctx.runMutation(internal.externalData.mutations.upsertExternalRevenue, {
    records: [{
      source: "k3mart",
      outletId: outletPeriod.outletId,
      revenueGross: outletPeriod.totalGross,
      revenueNet: outletPeriod.totalNet,
      transactionDate: outletPeriod.recognitionDate,
      externalTransactionId: outletPeriod.dedupKey,
      periodStart: outletPeriod.recognitionDate,
      periodEnd: outletPeriod.recognitionDate,
    }],
  });
  await ctx.runMutation(internal.externalData.mutations.saveRevenueItems, {
    revenueId: revenueId[0].id,
    items: outletPeriod.events.map(eventToRevenueItemArg),
  });
}
```

Do the analogous extraction for GrabFood. GrabFood's existing sales path (check `webhooks.ts` — per glob output, it exists and may carry the sales handler) must route through the same `saveRevenueItems` call.

- [ ] **Step 8.5: Run K3Mart consignment end-to-end test**

The memory entry for `lessons_consignment_recognition.md` is the canonical reference. Write a new integration test that:
1. Inserts a K3Mart raw payload spanning a 7-day period
2. Runs the adapter via `t.action(...)`
3. Verifies the resulting `externalRevenue.periodStart === periodEnd === transactionDate === recognitionDate`
4. Verifies `externalRevenueItems.inventoryDeductedAt` is set
5. Verifies `productInventoryTransactions.createdAt === recognitionDate` (not now)

If this test passes, consignment semantics survived the refactor.

```bash
npm run test -- convex/productInventory/__tests__/adapterRegression.test.ts
npm run test -- convex/integrations/k3mart/
```

Expected: all pass.

- [ ] **Step 8.6: Commit**

```bash
git add convex/integrations/k3mart/adapter.ts convex/integrations/grabfood/adapter.ts convex/productInventory/__tests__/adapterRegression/k3martSnapshot.ts convex/productInventory/__tests__/adapterRegression/grabfoodSnapshot.ts convex/productInventory/__tests__/adapterRegression.test.ts
git commit -m "refactor(999.4): k3mart+grabfood adapters reroute through saveRevenueItems"
```

---

## Task 9: `ChannelRoutingManager` admin UI

**Files:**
- Create: `src/pages/ChannelRoutingManager.tsx`
- Create: `src/components/channelRouting/RoutingMatrixTable.tsx`
- Create: `src/components/channelRouting/RoutingRowEditDialog.tsx`
- Create: `src/components/channelRouting/index.ts` (barrel)
- Create: `src/hooks/convex/useChannelRouting.ts`
- Modify: `src/hooks/convex/index.ts` (re-export)
- Modify: `src/App.tsx` (add route + link)

**Reference:** Spec § 10.1.

- [ ] **Step 9.1: Convert `listRoutes` to a public authenticated query**

Open `convex/productInventory/channelRouting.ts`. Delete the internal `listRoutes` query added in Task 3 and replace with this public query. Keep the `upsertRoute` and `deleteRoute` mutations unchanged.

```ts
export const listRoutes = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["admin", "manager"]);
    const rows = await ctx.db.query("channelRouting").collect();
    const enriched = [];
    for (const row of rows) {
      const loc = await ctx.db.get(row.storageLocationId);
      const outlet = row.outletId ? await ctx.db.get(row.outletId) : null;
      const mp = row.menuProductId ? await ctx.db.get(row.menuProductId) : null;
      enriched.push({
        ...row,
        locationName: loc?.name ?? "?",
        outletName: outlet?.name ?? null,
        menuProductName: mp?.name ?? null,
      });
    }
    return enriched;
  },
});
```

Also update the import at the top of the file — swap `internalQuery` for `query` (keep both if other internal queries remain).

- [ ] **Step 9.2: Create the hook**

Create `src/hooks/convex/useChannelRouting.ts`:

```ts
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useAuth } from "@/contexts/AuthContext";

export function useChannelRoutes() {
  const { token } = useAuth();
  return useQuery(api.productInventory.channelRouting.listRoutes, token ? { token } : "skip");
}

export function useUpsertChannelRoute() {
  const { token } = useAuth();
  const mutate = useMutation(api.productInventory.channelRouting.upsertRoute);
  return async (args: {
    id?: Id<"channelRouting">;
    source: string;
    outletId?: Id<"externalOutlets">;
    menuProductId?: Id<"menuProducts">;
    storageLocationId: Id<"storageLocations">;
    isDefault: boolean;
  }) => {
    if (!token) throw new Error("Not authenticated");
    return mutate({ token, ...args } as any);
  };
}

export function useDeleteChannelRoute() {
  const { token } = useAuth();
  const mutate = useMutation(api.productInventory.channelRouting.deleteRoute);
  return async (id: Id<"channelRouting">) => {
    if (!token) throw new Error("Not authenticated");
    return mutate({ token, id });
  };
}
```

- [ ] **Step 9.3: Barrel export**

Open `src/hooks/convex/index.ts`, add:

```ts
export { useChannelRoutes, useUpsertChannelRoute, useDeleteChannelRoute } from "./useChannelRouting";
```

- [ ] **Step 9.4: Create matrix table component**

Create `src/components/channelRouting/RoutingMatrixTable.tsx`:

```tsx
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pencil, Trash2, Plus } from "lucide-react";
import type { Id } from "../../../convex/_generated/dataModel";

export type ChannelRoute = {
  _id: Id<"channelRouting">;
  source: string;
  outletId?: Id<"externalOutlets">;
  outletName?: string | null;
  menuProductId?: Id<"menuProducts">;
  menuProductName?: string | null;
  storageLocationId: Id<"storageLocations">;
  locationName: string;
  isDefault: boolean;
};

interface Props {
  routes: ChannelRoute[];
  onEdit: (route: ChannelRoute) => void;
  onDelete: (id: Id<"channelRouting">) => void;
  onAddForSource: (source: string) => void;
}

const KNOWN_SOURCES = ["gofood", "grabfood", "shopee", "tiktok", "bigseller", "k3mart", "internal", "manual"];

export function RoutingMatrixTable({ routes, onEdit, onDelete, onAddForSource }: Props) {
  const grouped = new Map<string, ChannelRoute[]>();
  for (const src of KNOWN_SOURCES) grouped.set(src, []);
  for (const r of routes) grouped.get(r.source)?.push(r);

  return (
    <div className="space-y-6">
      {KNOWN_SOURCES.map((source) => {
        const sourceRoutes = grouped.get(source) ?? [];
        const defaultRoute = sourceRoutes.find((r) => r.isDefault);
        const outletOverrides = sourceRoutes.filter((r) => r.outletId && !r.menuProductId);
        const productOverrides = sourceRoutes.filter((r) => r.menuProductId);
        return (
          <div key={source} className="rounded-lg border p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold capitalize">{source}</h3>
              <Button size="sm" variant="outline" onClick={() => onAddForSource(source)}>
                <Plus className="h-4 w-4 mr-1" /> Add route
              </Button>
            </div>

            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <div className="text-muted-foreground font-medium mb-1">Default location</div>
                {defaultRoute ? (
                  <RoutePill route={defaultRoute} onEdit={onEdit} onDelete={onDelete} />
                ) : (
                  <Badge variant="destructive">unset — blocks deduction</Badge>
                )}
              </div>

              <div>
                <div className="text-muted-foreground font-medium mb-1">Outlet overrides</div>
                {outletOverrides.length > 0 ? (
                  <ul className="space-y-1">
                    {outletOverrides.map((r) => (
                      <li key={r._id}>
                        <RoutePill route={r} onEdit={onEdit} onDelete={onDelete} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-muted-foreground italic">none</span>
                )}
              </div>

              <div>
                <div className="text-muted-foreground font-medium mb-1">Product overrides</div>
                {productOverrides.length > 0 ? (
                  <ul className="space-y-1">
                    {productOverrides.map((r) => (
                      <li key={r._id}>
                        <RoutePill route={r} onEdit={onEdit} onDelete={onDelete} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-muted-foreground italic">none</span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RoutePill({ route, onEdit, onDelete }: {
  route: ChannelRoute;
  onEdit: (r: ChannelRoute) => void;
  onDelete: (id: Id<"channelRouting">) => void;
}) {
  const label = [
    route.outletName,
    route.menuProductName,
    `→ ${route.locationName}`,
  ].filter(Boolean).join(" ");
  return (
    <div className="inline-flex items-center gap-2 rounded-md bg-accent px-2 py-1">
      <span className="text-sm">{label}</span>
      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => onEdit(route)}>
        <Pencil className="h-3 w-3" />
      </Button>
      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => onDelete(route._id)}>
        <Trash2 className="h-3 w-3" />
      </Button>
    </div>
  );
}
```

- [ ] **Step 9.5: Create edit dialog**

Create `src/components/channelRouting/RoutingRowEditDialog.tsx`:

```tsx
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { ChannelRoute } from "./RoutingMatrixTable";

interface Props {
  open: boolean;
  onClose: () => void;
  source: string;
  existing?: ChannelRoute;
  onSave: (args: {
    id?: Id<"channelRouting">;
    source: string;
    outletId?: Id<"externalOutlets">;
    menuProductId?: Id<"menuProducts">;
    storageLocationId: Id<"storageLocations">;
    isDefault: boolean;
  }) => Promise<void>;
}

export function RoutingRowEditDialog({ open, onClose, source, existing, onSave }: Props) {
  const locations = useQuery(api.storageLocations.queries.list);
  const outlets = useQuery(api.externalOutlets.queries.listBySource, { source: source as any });
  const menuProducts = useQuery(api.menuProducts.queries.list);

  const [outletId, setOutletId] = useState<Id<"externalOutlets"> | undefined>(existing?.outletId);
  const [menuProductId, setMenuProductId] = useState<Id<"menuProducts"> | undefined>(existing?.menuProductId);
  const [locationId, setLocationId] = useState<Id<"storageLocations"> | undefined>(existing?.storageLocationId);
  const [isDefault, setIsDefault] = useState(existing?.isDefault ?? !outletId && !menuProductId);

  useEffect(() => {
    if (existing) {
      setOutletId(existing.outletId);
      setMenuProductId(existing.menuProductId);
      setLocationId(existing.storageLocationId);
      setIsDefault(existing.isDefault);
    } else {
      setOutletId(undefined);
      setMenuProductId(undefined);
      setLocationId(undefined);
      setIsDefault(true);
    }
  }, [existing, open]);

  const canSave = !!locationId && (isDefault || outletId || menuProductId);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existing ? "Edit routing" : `Add routing for ${source}`}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Storage location (required)</Label>
            <Select value={locationId ?? ""} onValueChange={(v) => setLocationId(v as Id<"storageLocations">)}>
              <SelectTrigger><SelectValue placeholder="Pick a location" /></SelectTrigger>
              <SelectContent>
                {locations?.map((l) => (
                  <SelectItem key={l._id} value={l._id}>{l.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox checked={isDefault} onCheckedChange={(v) => setIsDefault(!!v)} id="isDefault" />
            <Label htmlFor="isDefault">Source default (applies when no outlet/product override matches)</Label>
          </div>

          {!isDefault && (
            <>
              <div>
                <Label>Outlet (optional)</Label>
                <Select value={outletId ?? ""} onValueChange={(v) => setOutletId((v || undefined) as any)}>
                  <SelectTrigger><SelectValue placeholder="Any outlet" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">— none —</SelectItem>
                    {outlets?.map((o: any) => (
                      <SelectItem key={o._id} value={o._id}>{o.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Menu product (optional)</Label>
                <Select value={menuProductId ?? ""} onValueChange={(v) => setMenuProductId((v || undefined) as any)}>
                  <SelectTrigger><SelectValue placeholder="Any product" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">— none —</SelectItem>
                    {menuProducts?.map((mp: any) => (
                      <SelectItem key={mp._id} value={mp._id}>{mp.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!canSave}
            onClick={async () => {
              await onSave({
                id: existing?._id,
                source,
                outletId: isDefault ? undefined : outletId,
                menuProductId: isDefault ? undefined : menuProductId,
                storageLocationId: locationId!,
                isDefault,
              });
              onClose();
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 9.6: Barrel exports**

Create `src/components/channelRouting/index.ts`:

```ts
export { RoutingMatrixTable } from "./RoutingMatrixTable";
export type { ChannelRoute } from "./RoutingMatrixTable";
export { RoutingRowEditDialog } from "./RoutingRowEditDialog";
```

- [ ] **Step 9.7: Create the page**

Create `src/pages/ChannelRoutingManager.tsx`:

```tsx
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useChannelRoutes, useUpsertChannelRoute, useDeleteChannelRoute } from "@/hooks/convex";
import { RoutingMatrixTable, RoutingRowEditDialog, type ChannelRoute } from "@/components/channelRouting";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";

export default function ChannelRoutingManager() {
  useDocumentTitle("Channel Routing");
  const routes = useChannelRoutes();
  const upsertRoute = useUpsertChannelRoute();
  const deleteRoute = useDeleteChannelRoute();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogSource, setDialogSource] = useState<string>("gofood");
  const [editTarget, setEditTarget] = useState<ChannelRoute | undefined>();
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  if (routes === undefined) {
    return (
      <div className="p-6 space-y-4">
        <PageHeader title="Channel Routing" description="Configure inventory deduction locations per channel." />
        <Skeleton className="h-48" />
      </div>
    );
  }

  const handleAdd = (source: string) => {
    setDialogSource(source);
    setEditTarget(undefined);
    setDialogOpen(true);
  };

  const handleEdit = (route: ChannelRoute) => {
    setDialogSource(route.source);
    setEditTarget(route);
    setDialogOpen(true);
  };

  const handleSave = async (args: Parameters<typeof upsertRoute>[0]) => {
    try {
      await upsertRoute(args);
      toast.success(editTarget ? "Route updated" : "Route added");
    } catch (e: any) {
      toast.error(e.message ?? "Failed to save route");
    }
  };

  const handleDelete = async () => {
    if (!deleteTargetId) return;
    try {
      await deleteRoute(deleteTargetId as any);
      toast.success("Route deleted");
    } catch (e: any) {
      toast.error(e.message ?? "Failed to delete");
    } finally {
      setDeleteTargetId(null);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Channel Routing"
        description="Route each channel's inventory deductions to the right storage location. Most specific match wins: (source, outlet, product) > (source, outlet) > (source, product) > source default."
      />
      <RoutingMatrixTable
        routes={routes as ChannelRoute[]}
        onEdit={handleEdit}
        onDelete={(id) => setDeleteTargetId(id)}
        onAddForSource={handleAdd}
      />
      <RoutingRowEditDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        source={dialogSource}
        existing={editTarget}
        onSave={handleSave}
      />
      <ConfirmDialog
        open={!!deleteTargetId}
        onOpenChange={(v) => !v && setDeleteTargetId(null)}
        title="Delete routing rule?"
        description="This will remove the rule immediately. Unrouted sales for this source+scope will throw on deduction."
        onConfirm={handleDelete}
      />
    </div>
  );
}
```

- [ ] **Step 9.8: Add route + navigation**

Open `src/App.tsx`. Add import:

```tsx
import ChannelRoutingManager from "./pages/ChannelRoutingManager";
```

Add route (admin-only, inside the protected routes block — match the existing pattern used by VouchersManager or UsersManager):

```tsx
<Route
  path="/channel-routing"
  element={
    <ProtectedRoute allowedRoles={["admin"]}>
      <ChannelRoutingManager />
    </ProtectedRoute>
  }
/>
```

Add a nav entry where inventory links live (search `src/components/layout/` for the sidebar/nav component — likely `Header.tsx` or similar).

- [ ] **Step 9.9: Type-check + build**

```bash
npm run type-check
npm run build
```

Expected: 0 errors, build succeeds.

- [ ] **Step 9.10: Manual smoke test**

Start dev server (`npm run dev` + `npx convex dev` in separate terminals). Log in as admin. Navigate to `/channel-routing`. Verify:
- All 8 known sources render
- Sources with no default show the "unset — blocks" badge
- "Add route" opens the dialog; saving creates a row and the UI reflects it
- Edit updates the row
- Delete removes the row with confirmation

If UI breaks, fix inline before committing.

- [ ] **Step 9.11: Commit**

```bash
git add src/pages/ChannelRoutingManager.tsx src/components/channelRouting/ src/hooks/convex/useChannelRouting.ts src/hooks/convex/index.ts src/App.tsx convex/productInventory/channelRouting.ts
git commit -m "feat(999.4): ChannelRoutingManager admin UI"
```

---

## Task 10: `ChannelAuditWorkbench` admin UI

**Files:**
- Create: `src/pages/ChannelAuditWorkbench.tsx`
- Create: `src/components/channelAudit/AuditIssueTabs.tsx`
- Create: `src/components/channelAudit/IssueResolutionRow.tsx`
- Create: `src/components/channelAudit/BackfillTriggerCard.tsx`
- Create: `src/components/channelAudit/index.ts` (barrel)
- Create: `src/hooks/convex/useChannelAudit.ts`
- Modify: `src/hooks/convex/index.ts`
- Modify: `src/App.tsx`
- Create: `convex/productInventory/channelAuditResolution.ts` (admin-authed mutations for resolving issues)

**Reference:** Spec § 10.2 and § 8.2.

Due to length, this task follows the same rhythm as Task 9 (backend query/mutation exports, hook, components, page, route, commit). Abbreviated step list:

- [ ] **Step 10.1: Expose admin queries + mutations for audit**

Create `convex/productInventory/channelAuditResolution.ts`:

```ts
import { v } from "convex/values";
import { query, mutation } from "../_generated/server";
import { requireRole } from "../lib/auth";
import { internal } from "../_generated/api";

export const listReports = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["admin"]);
    return ctx.db.query("channelAuditReports")
      .withIndex("by_status")
      .order("desc")
      .take(20);
  },
});

export const listIssuesForReport = query({
  args: { token: v.string(), reportId: v.id("channelAuditReports") },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["admin"]);
    return ctx.db.query("channelAuditIssues")
      .withIndex("by_report", q => q.eq("reportId", args.reportId))
      .collect();
  },
});

export const runAudit = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const { user } = await requireRole(ctx, args.token, ["admin"]);
    const result: any = await ctx.runMutation(internal.productInventory.channelAudit.runFullAudit, {
      generatedBy: user.name,
    });
    await ctx.runMutation(internal.productInventory.channelAudit.supersedePriorReports, {
      keepReportId: result.reportId,
    });
    return result;
  },
});

export const resolveIssue = mutation({
  args: {
    token: v.string(),
    issueId: v.id("channelAuditIssues"),
    resolution: v.union(
      v.literal("remapped"), v.literal("excluded"),
      v.literal("merged"), v.literal("deleted"), v.literal("ignored")
    ),
    remapToMenuProductId: v.optional(v.id("menuProducts")),
  },
  handler: async (ctx, args) => {
    const { user } = await requireRole(ctx, args.token, ["admin"]);
    const issue = await ctx.db.get(args.issueId);
    if (!issue) throw new Error("Issue not found");

    // Apply resolution side effect
    if (args.resolution === "remapped" && args.remapToMenuProductId && issue.revenueItemId) {
      await ctx.db.patch(issue.revenueItemId, {
        linkedMenuProductId: args.remapToMenuProductId,
      });
      // Also upsert externalProductMappings so future syncs pick up the mapping
      if (issue.externalProductCode || issue.externalProductName) {
        const code = issue.externalProductCode ?? issue.externalProductName ?? "";
        const existing = await ctx.db.query("externalProductMappings")
          .withIndex("by_source_code", q => q.eq("source", issue.source).eq("externalProductCode", code))
          .first();
        if (existing) {
          await ctx.db.patch(existing._id, { menuProductId: args.remapToMenuProductId });
        } else {
          await ctx.db.insert("externalProductMappings", {
            source: issue.source, externalProductCode: code,
            externalProductName: issue.externalProductName ?? code,
            menuProductId: args.remapToMenuProductId,
            isAutoMapped: false,
            createdAt: Date.now(),
          });
        }
      }
    }
    if (args.resolution === "deleted" && issue.revenueItemId) {
      await ctx.db.delete(issue.revenueItemId);
    }

    await ctx.db.patch(args.issueId, {
      resolution: args.resolution,
      resolvedBy: user.name,
      resolvedAt: Date.now(),
    });
  },
});

export const markReportResolved = mutation({
  args: { token: v.string(), reportId: v.id("channelAuditReports") },
  handler: async (ctx, args) => {
    const { user } = await requireRole(ctx, args.token, ["admin"]);
    const issues = await ctx.db.query("channelAuditIssues")
      .withIndex("by_report", q => q.eq("reportId", args.reportId))
      .collect();
    const unresolved = issues.filter(i => !i.resolution).length;
    if (unresolved > 0) {
      throw new Error(`Cannot mark resolved: ${unresolved} issues still pending`);
    }
    await ctx.db.patch(args.reportId, {
      status: "resolved",
      resolvedBy: user.name,
      resolvedAt: Date.now(),
    });
  },
});
```

- [ ] **Step 10.2: Create hook**

Create `src/hooks/convex/useChannelAudit.ts` mirroring the pattern from Task 9.2. Export `useAuditReports`, `useAuditIssues`, `useRunAudit`, `useResolveIssue`, `useMarkReportResolved`.

- [ ] **Step 10.3: Build components**

- `IssueResolutionRow.tsx` — renders one row, accepts `issue` + `onResolve` callback, shows appropriate resolution options per `issueType`.
- `AuditIssueTabs.tsx` — tabs for each of 5 issue types, counts in badges, maps issues into rows.
- `BackfillTriggerCard.tsx` — shows status (audit clean? → button enabled; else disabled + count of pending).

Full component code follows the same patterns as Task 9 (shadcn Tabs, Card, Button, Select). Engineer fills in using the existing codebase conventions — do not stub.

- [ ] **Step 10.4: Create the page**

`src/pages/ChannelAuditWorkbench.tsx` — composes the 3 components above, handles "Run audit" trigger, displays latest report summary.

- [ ] **Step 10.5: Add route + barrel exports + nav entry**

Same pattern as Task 9.8 — `src/App.tsx` gets a new admin-only route at `/channel-audit`.

- [ ] **Step 10.6: Type-check + build + smoke test**

```bash
npm run type-check
npm run build
```

Manual: navigate to `/channel-audit`, click "Run full audit", verify issues render into tabs, resolve one, verify it disappears or is marked.

- [ ] **Step 10.7: Commit**

```bash
git add src/pages/ChannelAuditWorkbench.tsx src/components/channelAudit/ src/hooks/convex/useChannelAudit.ts src/hooks/convex/index.ts src/App.tsx convex/productInventory/channelAuditResolution.ts
git commit -m "feat(999.4): ChannelAuditWorkbench admin UI + resolution mutations"
```

---

## Task 11: Historical backfill migration

**Files:**
- Create: `convex/migrations/channelRoutingSeed.ts`
- Create: `convex/migrations/gofoodSaleToChannelSale.ts`
- Create: `convex/productInventory/channelBackfill.ts`
- Create: `convex/productInventory/__tests__/channelBackfill.test.ts`

**Reference:** Spec § 9.

- [ ] **Step 11.1: Write backfill test**

Create `convex/productInventory/__tests__/channelBackfill.test.ts`:

```ts
import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "../../schema";
import { internal } from "../../_generated/api";

describe("historical backfill", () => {
  async function setup(t: ReturnType<typeof convexTest>) {
    return t.run(async (ctx) => {
      const loc = await ctx.db.insert("storageLocations", { name: "HQ", isDefault: true, isActive: true });
      const mp = await ctx.db.insert("menuProducts", {
        name: "Test", code: "T", defaultPrice: 1000, isActive: true,
      } as any);
      await ctx.db.insert("productInventory", {
        menuProductId: mp, locationId: loc, quantity: 100, lastUpdated: Date.now(),
      });
      await ctx.db.insert("channelRouting", {
        source: "shopee", storageLocationId: loc, isDefault: true,
        updatedBy: "test", updatedAt: Date.now(),
      });

      // Insert 3 historical revenue items with linkedMenuProductId, no deduction yet
      const revIds: any[] = [];
      for (let i = 0; i < 3; i++) {
        const r = await ctx.db.insert("externalRevenue", {
          source: "shopee", revenueGross: 1000, revenueNet: 900,
          transactionDate: Date.now() - (10 - i) * 86_400_000,
          externalTransactionId: `OLD-${i}`,
        } as any);
        await ctx.db.insert("externalRevenueItems", {
          revenueId: r, source: "shopee",
          productName: "Test", unitPrice: 1000, quantity: 1, totalPrice: 1000,
          linkedMenuProductId: mp, isAutoMatched: true, createdAt: Date.now(),
        });
        revIds.push(r);
      }
      return { loc, mp, revIds };
    });
  }

  it("deducts 3 units chronologically with preserved occurredAt", async () => {
    const t = convexTest(schema);
    const { loc, mp } = await setup(t);
    const result = await t.mutation(internal.productInventory.channelBackfill.runBackfillChunk, {
      limit: 100,
    });
    expect(result.processed).toBe(3);
    const inv = await t.run(async (ctx) =>
      ctx.db.query("productInventory").first()
    );
    expect(inv?.quantity).toBe(97);
    const txs = await t.run(async (ctx) =>
      ctx.db.query("productInventoryTransactions")
        .withIndex("by_type", q => q.eq("transactionType", "channel_sale"))
        .collect()
    );
    expect(txs.length).toBe(3);
    // Each tx's createdAt should differ and be < now
    const nowCutoff = Date.now() - 60_000;
    for (const tx of txs) {
      expect(tx.createdAt).toBeLessThan(nowCutoff);
    }
  });

  it("re-running is idempotent (zero new deductions)", async () => {
    const t = convexTest(schema);
    await setup(t);
    await t.mutation(internal.productInventory.channelBackfill.runBackfillChunk, { limit: 100 });
    const before = await t.run(async (ctx) =>
      ctx.db.query("productInventoryTransactions").collect()
    );
    const result2 = await t.mutation(internal.productInventory.channelBackfill.runBackfillChunk, { limit: 100 });
    expect(result2.processed).toBe(0);
    const after = await t.run(async (ctx) =>
      ctx.db.query("productInventoryTransactions").collect()
    );
    expect(after.length).toBe(before.length);
  });

  it("dry-run reports counts without writing transactions", async () => {
    const t = convexTest(schema);
    await setup(t);
    const result = await t.mutation(internal.productInventory.channelBackfill.runBackfillChunk, {
      limit: 100, dryRun: true,
    });
    expect(result.processed).toBe(3);
    const txs = await t.run(async (ctx) =>
      ctx.db.query("productInventoryTransactions").collect()
    );
    expect(txs.length).toBe(0);
  });

  it("skips items without linkedMenuProductId", async () => {
    const t = convexTest(schema);
    await t.run(async (ctx) => {
      const loc = await ctx.db.insert("storageLocations", { name: "HQ", isDefault: true, isActive: true });
      await ctx.db.insert("channelRouting", {
        source: "shopee", storageLocationId: loc, isDefault: true,
        updatedBy: "t", updatedAt: Date.now(),
      });
      const r = await ctx.db.insert("externalRevenue", {
        source: "shopee", revenueGross: 100, revenueNet: 90,
        transactionDate: Date.now() - 86_400_000, externalTransactionId: "UNMAPPED",
      } as any);
      await ctx.db.insert("externalRevenueItems", {
        revenueId: r, source: "shopee",
        productName: "?", unitPrice: 100, quantity: 1, totalPrice: 100,
        linkedMenuProductId: undefined, isAutoMatched: false, createdAt: Date.now(),
      });
    });
    const result = await t.mutation(internal.productInventory.channelBackfill.runBackfillChunk, {
      limit: 100,
    });
    expect(result.processed).toBe(0);
    expect(result.skipped).toBe(1);
  });
});
```

- [ ] **Step 11.2: Run test — fails**

```bash
npm run test -- convex/productInventory/__tests__/channelBackfill.test.ts
```

- [ ] **Step 11.3: Implement backfill chunked runner**

Create `convex/productInventory/channelBackfill.ts`:

```ts
import { v } from "convex/values";
import { internalMutation, internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { processChannelSaleInternal } from "./channelSale";

export const runBackfillChunk = internalMutation({
  args: {
    limit: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const LIMIT = args.limit ?? 200;
    let processed = 0;
    let skipped = 0;

    // Order by transactionDate by scanning and sorting in-memory for the chunk.
    // Only items missing inventoryDeductedAt are eligible.
    const eligible = await ctx.db.query("externalRevenueItems")
      .filter((q) => q.eq(q.field("inventoryDeductedAt"), undefined))
      .collect();

    const revenueCache = new Map<string, any>();
    const withTime: Array<{ item: any; occurredAt: number }> = [];
    for (const item of eligible) {
      const rid = String(item.revenueId);
      let rev = revenueCache.get(rid);
      if (rev === undefined) {
        rev = await ctx.db.get(item.revenueId);
        revenueCache.set(rid, rev);
      }
      withTime.push({ item, occurredAt: rev?.transactionDate ?? item.createdAt ?? Date.now() });
    }
    withTime.sort((a, b) => a.occurredAt - b.occurredAt);

    for (const { item, occurredAt } of withTime.slice(0, LIMIT)) {
      if (!item.linkedMenuProductId || item.quantity <= 0) {
        skipped++;
        continue;
      }
      const rev = revenueCache.get(String(item.revenueId));
      if (!rev) { skipped++; continue; }

      if (args.dryRun) {
        processed++;
        continue;
      }

      const result = await processChannelSaleInternal(ctx, {
        source: rev.source,
        occurredAt,
        externalTransactionId: rev.externalTransactionId ?? "",
        externalItemId: item.externalItemId,
        outletId: rev.outletId,
        menuProductId: item.linkedMenuProductId,
        externalProductCode: item.productName,
        externalProductName: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
      });

      if (result.deducted) {
        await ctx.db.patch(item._id, { inventoryDeductedAt: Date.now() });
        processed++;
      } else {
        skipped++;
      }
    }

    return { processed, skipped, hasMore: withTime.length > LIMIT };
  },
});

/** Loop chunked mutations until done — called from admin "Start backfill" button. */
export const runFullBackfill = internalAction({
  args: { dryRun: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    let totalProcessed = 0;
    let totalSkipped = 0;
    let hasMore = true;
    while (hasMore) {
      const { processed, skipped, hasMore: more } = await ctx.runMutation(
        internal.productInventory.channelBackfill.runBackfillChunk,
        { limit: 200, dryRun: args.dryRun }
      );
      totalProcessed += processed;
      totalSkipped += skipped;
      hasMore = more && processed > 0; // stop if nothing new processed
    }
    return { totalProcessed, totalSkipped };
  },
});
```

- [ ] **Step 11.4: Implement routing seed migration**

Create `convex/migrations/channelRoutingSeed.ts`:

```ts
import { internalMutation } from "../_generated/server";

export const seedChannelRoutingFromOutlets = internalMutation({
  args: {},
  handler: async (ctx) => {
    const outlets = await ctx.db.query("externalOutlets").collect();
    let seeded = 0;
    let skipped = 0;
    for (const outlet of outlets) {
      if (!outlet.linkedStorageLocationId) { skipped++; continue; }
      const existing = await ctx.db.query("channelRouting")
        .withIndex("by_source_outlet", q => q.eq("source", outlet.source).eq("outletId", outlet._id))
        .first();
      if (existing) { skipped++; continue; }
      await ctx.db.insert("channelRouting", {
        source: outlet.source,
        outletId: outlet._id,
        storageLocationId: outlet.linkedStorageLocationId,
        isDefault: false,
        updatedBy: "system:migration",
        updatedAt: Date.now(),
      });
      seeded++;
    }
    return { seeded, skipped };
  },
});
```

- [ ] **Step 11.5: Implement gofood_sale migration**

Create `convex/migrations/gofoodSaleToChannelSale.ts`:

```ts
import { v } from "convex/values";
import { internalMutation, internalAction } from "../_generated/server";
import { internal } from "../_generated/api";

export const migrateGofoodSaleChunk = internalMutation({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const LIMIT = args.limit ?? 500;
    const rows = await ctx.db.query("productInventoryTransactions")
      .withIndex("by_type", q => q.eq("transactionType", "gofood_sale"))
      .take(LIMIT);
    for (const row of rows) {
      await ctx.db.patch(row._id, {
        transactionType: "channel_sale" as any,
        source: "gofood",
        externalRef: row.gofoodOrderRef,
      });
    }
    return { migrated: rows.length, hasMore: rows.length === LIMIT };
  },
});

export const runGofoodSaleMigration = internalAction({
  args: {},
  handler: async (ctx) => {
    let total = 0;
    let hasMore = true;
    while (hasMore) {
      const { migrated, hasMore: more } = await ctx.runMutation(
        internal.migrations.gofoodSaleToChannelSale.migrateGofoodSaleChunk,
        { limit: 500 }
      );
      total += migrated;
      hasMore = more;
    }
    return { total };
  },
});
```

- [ ] **Step 11.6: Run backfill test — passes**

```bash
npm run test -- convex/productInventory/__tests__/channelBackfill.test.ts
```

Expected: 4 pass.

- [ ] **Step 11.7: Commit**

```bash
git add convex/productInventory/channelBackfill.ts convex/migrations/channelRoutingSeed.ts convex/migrations/gofoodSaleToChannelSale.ts convex/productInventory/__tests__/channelBackfill.test.ts
git commit -m "feat(999.4): historical backfill + routing seed + gofood_sale migration"
```

---

## Task 12: Tests + docs + cleanup

**Files:**
- Create: `tests/e2e/channel-routing.spec.ts`
- Create: `tests/e2e/channel-audit.spec.ts`
- Create: `docs/CHANNEL_INTEGRATION.md`
- Modify: `docs/CHANGELOG.md`
- Modify: `docs/SCHEMA.md`
- Modify: `docs/API_REFERENCE.md`
- Modify: `convex/schema.ts` (after successful migration: remove `gofood_sale` literal)

**Reference:** Spec § 12, § 15 success criteria.

- [ ] **Step 12.1: Write E2E — routing manager**

Create `tests/e2e/channel-routing.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

test.describe("Channel routing manager", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    // Use your test admin PIN pattern
    await page.fill('input[name="pin"]', process.env.TEST_ADMIN_PIN!);
    await page.click('button[type="submit"]');
    await page.waitForURL("/");
  });

  test("admin can add, edit, and delete a routing rule", async ({ page }) => {
    await page.goto("/channel-routing");
    await expect(page.getByRole("heading", { name: "Channel Routing" })).toBeVisible();

    // Add a default route for shopee
    await page.getByRole("button", { name: /Add route/i }).first().click();
    // Dialog opens
    await page.getByRole("combobox", { name: /location/i }).click();
    await page.getByRole("option").first().click();
    await page.getByRole("button", { name: "Save" }).click();

    await expect(page.getByText(/→ /)).toBeVisible();

    // Delete it
    await page.getByRole("button").filter({ has: page.locator("svg.lucide-trash-2") }).first().click();
    await page.getByRole("button", { name: /confirm|yes/i }).click();
  });
});
```

- [ ] **Step 12.2: Write E2E — audit workbench**

Create `tests/e2e/channel-audit.spec.ts` with analogous shape (run audit → verify summary appears → resolve an issue).

- [ ] **Step 12.3: Write onboarding docs**

Create `docs/CHANNEL_INTEGRATION.md`:

```markdown
# Channel Integration Guide

This project uses a unified pipeline for all external sales channels. Adding a
new channel (e.g., Tokopedia) requires four steps — no schema changes, no
shared-code changes.

## Architecture

See `docs/superpowers/specs/2026-04-17-unified-channel-integration-architecture-design.md`.
Summary: Adapters → SKU Resolver → Revenue Recognizer → Inventory Deducer → Journal.

## Steps to add a new channel

### 1. Create the adapter

Path: `convex/integrations/<source>/adapter.ts`

Implement the `ChannelAdapter` interface from `convex/integrations/_shared/channelAdapter.ts`.

- `fetch(ctx, args)` — source-specific API call
- `normalize(raw)` — pure function returning `ChannelSaleEvent[]`

Use `buildChannelSaleEvent` and `validateChannelSaleEvent` from the shared helpers.

### 2. Add the source literal

Open `convex/schema.ts`, find the `externalSource` union, add your literal:

```ts
export const externalSource = v.union(
  /* existing… */
  v.literal("tokopedia"),
);
```

### 3. Configure routing

After deploy, log in as admin, go to `/channel-routing`, click "Add route" under the new source. Pick a default storage location. Add per-outlet or per-product overrides as needed.

### 4. Wire the action

In your adapter's action:

```ts
const events = normalizeTokopediaOrders(raw);
for (const event of events) validateChannelSaleEvent(event);
for (const event of events) {
  const revenueId = await ctx.runMutation(internal.externalData.mutations.upsertExternalRevenue, {
    records: [/* revenue row */],
  });
  await ctx.runMutation(internal.externalData.mutations.saveRevenueItems, {
    revenueId: revenueId[0].id,
    items: [eventToRevenueItemArg(event)],
  });
}
```

### 5. Verify

Run a sync, go to `/channel-audit`, click "Run full audit". Fix any unmapped SKUs in the workbench. Check `productInventoryTransactions` has `transactionType="channel_sale"` + `source="tokopedia"` rows.
```

- [ ] **Step 12.4: Update CHANGELOG**

Append to `docs/CHANGELOG.md`:

```markdown
## [Unreleased]

### Phase 999.4 — Unified Channel Integration Architecture

- **NEW** Centralized `ChannelAdapter` interface + `ChannelSaleEvent` canonical event type
- **NEW** `channelRouting` table with 3-tier precedence (source/outlet/product)
- **NEW** Admin UI at `/channel-routing` and `/channel-audit`
- **NEW** `saveRevenueItems` now atomically writes revenue + deducts inventory
- **NEW** Data-hygiene audit + curation workbench before backfill
- **NEW** Historical deduction backfill preserves original sale timestamps for analytics fidelity
- **REFACTOR** All 5 adapters (gobiz/bigseller/internal/k3mart/grabfood) now emit `ChannelSaleEvent[]`
- **SCHEMA** `productInventoryTransactions` gains `source`, `externalRef`, and `channel_sale` transaction type
- **SCHEMA** `externalRevenueItems` gains `inventoryDeductedAt` idempotency flag
- **SCHEMA** New tables: `channelRouting`, `channelAuditReports`, `channelAuditIssues`
- **MIGRATION** Existing `gofood_sale` transactions migrated to `channel_sale` + `source="gofood"`
```

- [ ] **Step 12.5: Update SCHEMA.md + API_REFERENCE.md**

Add new tables and mutations to the relevant sections. Brief — one paragraph per new entity.

- [ ] **Step 12.6: Full suite + build verification**

```bash
npm run test
npm run build
```

Both must be green.

- [ ] **Step 12.7: Commit docs + tests**

```bash
git add tests/e2e/channel-routing.spec.ts tests/e2e/channel-audit.spec.ts docs/CHANNEL_INTEGRATION.md docs/CHANGELOG.md docs/SCHEMA.md docs/API_REFERENCE.md
git commit -m "docs+test(999.4): E2E tests + channel integration guide + changelog"
```

- [ ] **Step 12.8: OPTIONAL — remove `gofood_sale` literal**

**Only do this after** a successful production deploy + confirmed zero `gofood_sale` transactions remain. Run:

```bash
# From Convex dashboard Functions tab, run:
#   migrations.gofoodSaleToChannelSale:runGofoodSaleMigration
# Verify: no rows remain with transactionType="gofood_sale":
npx convex run "productInventoryTransactions:countByType" '{"type":"gofood_sale"}'
# Should return 0
```

Then edit `convex/schema.ts`, remove `v.literal("gofood_sale")` from the transactionType union. Also remove `gofoodOrderRef` field (keep for now if any consumer reads it — otherwise drop).

```bash
npm run type-check
# Fix any compile errors from consumers reading the literal
npm run build
git add convex/schema.ts
git commit -m "chore(999.4): remove gofood_sale literal after migration"
```

---

## Success Criteria (from spec § 15)

- [ ] `npm run type-check` passes
- [ ] `npm run build` succeeds
- [ ] All 5 adapters emit `ChannelSaleEvent[]`; `saveRevenueItems` is the only path to Layer 4
- [ ] Shopee + TikTok sales post-cutover produce `channel_sale` transactions with `source` set and `createdAt = revenue.transactionDate`
- [ ] Running backfill twice produces zero additional transactions
- [ ] `resolveChannelRoute` throws for unconfigured source (no silent default)
- [ ] Audit workbench surfaces all 5 issue types; backfill gated on clean audit
- [ ] GoFood deduction behavior byte-identical (adapter regression tests green)
- [ ] Updated: CHANGELOG, SCHEMA docs, API_REFERENCE, CHANNEL_INTEGRATION guide

---

## Rollout sequence (post-merge)

1. Deploy to production
2. Run `migrations.channelRoutingSeed:seedChannelRoutingFromOutlets` (seeds existing outlet→location rows)
3. Admin logs in, goes to `/channel-routing`, adds default rows for shopee, tiktok, bigseller
4. Admin goes to `/channel-audit`, clicks "Run full audit"
5. Admin resolves all pending issues in the workbench
6. Admin clicks "Start backfill" (dry-run first, then live)
7. Admin does manual stock reset via existing inventory adjustment UI
8. Run `migrations.gofoodSaleToChannelSale:runGofoodSaleMigration`
9. Verify `/sales` and `/inventory` pages render correctly
10. Monitor sync logs for the first few adapter runs
