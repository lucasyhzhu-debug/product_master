# POS → Frollie Pro Sales Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `"pos"` as the ERP's 9th external revenue source — an hourly pull-sync that lands paid POS transactions as `externalRevenue` parents + per-line `externalRevenueItems`, and refunds as negative-gross `transactionType:"return"` reversals, all behind ship-dark deduction.

**Architecture:** Mirror the K3Mart adapter. Pure `normalize()`/record-builders (fixture-testable) → existing `saveRevenue` upsert + `saveRevenueItemsWithCounts` → opaque-cursor checkpoint persisted per page. New `convex/integrations/pos/` module + `posSyncCheckpoint` table; everything else wires into the Phase 74.5 channel spine.

**Tech Stack:** Convex (TS), `convex-test` + Vitest, `zod` (contract fixture lock), React 19 (one admin-page cascade edit).

**Spec:** `docs/superpowers/specs/2026-06-17-pos-erp-sales-sync-erp-consumer-design.md` (execution-ready; read §3 cascade, §6 write path, §6.4 cursor rules).
**Contract:** `docs/superpowers/specs/2026-06-17-pos-erp-sales-sync-CONTRACT.md` (frozen API shapes — source of truth).

## Global Constraints

- **Source literal** is exactly `"pos"`; **Platform** literal is exactly `"POS"`.
- **Deduction ships OFF:** `channelDeductionEnabled.pos` defaults `false` (ship-dark). No behavior change to inventory in v1.
- **Refund sign:** `revenueGross` for returns is **NEGATIVE** (`= -totalRefund`). The aggregation sums raw (`incomeStatement.ts:299`). Never store a positive refund gross.
- **Refunds are parent-only** — no child `externalRevenueItems` (mirror `k3mart/adapter.ts:650`).
- **Cursor:** opaque, persist verbatim, **after each page, only when non-null** (§6.4). Per-run page budget `MAX_PAGES_PER_RUN = 50`. `limit=500`.
- **Money** = integer rupiah; all `_at` = UTC epoch ms.
- **No live POS calls** anywhere in tests — drive everything from frozen fixtures.
- **NEVER** import the Phase 81-banned legacy exports (CLAUDE.md Pitfall #18). Use `collapseRevenuePeriod` for periods (never set the 3 fields individually).
- Run `npx convex codegen` after any new Convex function file so `_generated/api.d.ts` is current (Phase 76/81 lesson).

## File Structure

| File | Responsibility |
|---|---|
| `convex/integrations/pos/types.ts` | Local TS interfaces mirroring the CONTRACT (NOT imported from POS). |
| `convex/integrations/pos/fixtures.ts` | Frozen JSON fixtures of each endpoint response (single source of truth for tests). |
| `convex/integrations/pos/contractSchema.ts` | `zod` schemas for the bidirectional fixture lock (`.strict()`). |
| `convex/integrations/pos/adapter.ts` | Pure `posAdapter.normalize()` + `normalizeRefunds()`. |
| `convex/integrations/pos/recordBuilders.ts` | Pure `buildPosSalesRecords()` + `buildPosRefundRecords()` (normalized → `saveRevenue` args). |
| `convex/integrations/pos/checkpoint.ts` | `getCheckpoint` query + `persistSalesCursor`/`persistRefundsCursor` mutations. |
| `convex/integrations/pos/sync.ts` | `"use node"` — `syncPosRevenue` internalAction (fetch loop) + `triggerPosSync` admin action. |
| `convex/integrations/pos/__tests__/*.test.ts` | Adapter, builders, contract-lock, dedup, refund-sign, cursor-resume tests. |
| `convex/schema.ts` | `externalSource` union + `channelDeductionEnabled.pos` + new `posSyncCheckpoint` table. |
| `convex/lib/externalSource.ts` + tests | `EXTERNAL_SOURCES` array. |
| `convex/reports/platform.ts` + tests | `PLATFORMS` + `SOURCE_TO_PLATFORM`. |
| `convex/reports/incomeStatement.ts` | `getChannelRevenueConfidence` POS arm. |
| `convex/productInventory/channelFlags.ts` | `DEFAULT_FLAGS.pos`. |
| `convex/integrations/registry.ts` | POS credential-UI card. |
| `convex/crons.ts` | hourly `syncPosRevenue` registration. |
| `src/lib/platformColors.ts` | `pos` + `POS` palette entries. |
| `src/pages/UnlinkedProductsBackfill.tsx` | POS `CHANNEL_SOURCES` entry. |

---

## Task 1: Source-literal cascade + `posSyncCheckpoint` schema

The whole cascade lands as one atomic unit — partial = compile error. Let the type system enumerate misses.

**Files:**
- Modify: `convex/schema.ts:18-27` (union), `convex/schema.ts:1135-1144` (`channelDeductionEnabled`), + new `posSyncCheckpoint` table
- Modify: `convex/lib/externalSource.ts:10-19`, `convex/reports/platform.ts:17-26` & `:48-56`, `convex/reports/incomeStatement.ts:126-142`, `convex/productInventory/channelFlags.ts:42-51`, `convex/integrations/registry.ts:13` & `:40-166`
- Modify: `src/lib/platformColors.ts:19-37`, `src/pages/UnlinkedProductsBackfill.tsx:92-107`
- Test: `convex/lib/__tests__/externalSource.test.ts:5-12`, `convex/reports/__tests__/platform.test.ts:13-24`

**Interfaces:**
- Produces: `externalSource` includes `v.literal("pos")`; `EXTERNAL_SOURCES` includes `"pos"`; `Platform` includes `"POS"`; `posSyncCheckpoint` table `{ salesCursor?: string, refundsCursor?: string, updatedAt: number }`.

- [ ] **Step 1: Update the two cascade tests first (they encode the contract).**

`convex/lib/__tests__/externalSource.test.ts` — bump length and add to sorted array:
```ts
expect(EXTERNAL_SOURCES).toHaveLength(9);                       // was 8
expect([...EXTERNAL_SOURCES].sort()).toEqual([
  "bigseller", "consignment", "gobiz", "grabfood",
  "internal", "k3mart", "pos", "shopee", "tiktok",             // added "pos"
]);
```
`convex/reports/__tests__/platform.test.ts` — add the source→platform row to the `it.each` table:
```ts
["pos", "POS"],
```

- [ ] **Step 2: Run the tests — verify they FAIL.**

Run: `npx vitest run convex/lib/__tests__/externalSource.test.ts convex/reports/__tests__/platform.test.ts`
Expected: FAIL (length 8≠9; `SOURCE_TO_PLATFORM["pos"]` undefined).

- [ ] **Step 3: Add `"pos"` to the source unions/arrays.**

`convex/schema.ts:18-27` — add `v.literal("pos"),` to the `externalSource` union.
`convex/lib/externalSource.ts:10-19` — add `"pos",` to the `EXTERNAL_SOURCES` `as const` array.

- [ ] **Step 4: Add the `"POS"` Platform + source mapping.**

`convex/reports/platform.ts:17-26` — add `"POS",` to the `PLATFORMS` `as const` array.
`convex/reports/platform.ts:48-56` — add to `SOURCE_TO_PLATFORM`:
```ts
pos: "POS",
```
(Typed `Record<Exclude<ExternalSource,"bigseller">, Platform>` — omitting `pos` is now a compile error.)

- [ ] **Step 5: Add the confidence arm + deduction flag.**

`convex/reports/incomeStatement.ts:126-142` — add to the `switch`, alongside the other `"exact"` sources:
```ts
case "pos":
```
(falls into the existing `return "exact";` — POS is system-of-record).
`convex/productInventory/channelFlags.ts:42-51` — add to `DEFAULT_FLAGS`:
```ts
pos: false,
```

- [ ] **Step 6: Add the closed-object schema flag + the new checkpoint table.**

`convex/schema.ts:1135-1144` — inside `channelDeductionEnabled`'s `v.object({...})`, add:
```ts
pos: v.boolean(),
```
Add the new table to the schema (near the other external tables):
```ts
posSyncCheckpoint: defineTable({
  salesCursor: v.optional(v.string()),
  refundsCursor: v.optional(v.string()),
  updatedAt: v.number(),
}),
```

- [ ] **Step 7: Add the frontend + registry cascade entries.**

`src/lib/platformColors.ts:19-37` — add two `PALETTE` entries (raw source + platform aggregate). Match the shape of the existing entries (read lines 20-27 for the exact `PlatformPalette` object shape; reuse cyan `#06b6d4`):
```ts
pos: { hex: "#06b6d4", /* …same keys as siblings… */ },
POS: { hex: "#06b6d4", /* …same keys as siblings… */ },
```
`src/pages/UnlinkedProductsBackfill.tsx:92-107` — add to `CHANNEL_SOURCES`:
```ts
{ value: "pos", label: "POS" },
```
`convex/integrations/registry.ts:13` — add `"pos"` to the `PlatformId` union; `:40-166` — add a minimal `pos` entry to `PLATFORMS` mirroring the `k3mart` entry's `PlatformMeta` shape (read `:41-61` for the exact fields; name "POS", credential-based).

- [ ] **Step 8: Codegen + type-check + tests (the cascade enumerator).**

Run: `npx convex codegen && npm run type-check`
Expected: PASS. (Any remaining `Record<ExternalSource,…>` miss surfaces here — fix it.)
Run: `npx vitest run convex/lib/__tests__/externalSource.test.ts convex/reports/__tests__/platform.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit.**

```bash
git add convex/schema.ts convex/lib/externalSource.ts convex/lib/__tests__/externalSource.test.ts convex/reports/platform.ts convex/reports/__tests__/platform.test.ts convex/reports/incomeStatement.ts convex/productInventory/channelFlags.ts convex/integrations/registry.ts src/lib/platformColors.ts src/pages/UnlinkedProductsBackfill.tsx convex/_generated/
git commit -m "feat(pos): add 'pos' source-literal cascade + posSyncCheckpoint table"
```

---

## Task 2: POS types, frozen fixtures, contract zod lock

**Files:**
- Create: `convex/integrations/pos/types.ts`, `convex/integrations/pos/fixtures.ts`, `convex/integrations/pos/contractSchema.ts`
- Test: `convex/integrations/pos/__tests__/contractLock.test.ts`

**Interfaces:**
- Produces: `PosTransactionsPage`, `PosRefundsPage`, `PosTransaction`, `PosRefund` (types); `salesPageFixture`, `refundsPageFixture` (frozen const objects); `posTransactionsPageSchema`, `posRefundsPageSchema` (zod, `.strict()`).

- [ ] **Step 1: Write `types.ts`** (verbatim from spec §5):
```ts
export interface PosTransactionLine {
  productCode: string; productName: string; qty: number;
  unitPrice: number; lineSubtotal: number; taxRate: number;
}
export interface PosTransaction {
  receiptNumber: string; paidAt: number; subtotal: number;
  voucherCode: string | null; voucherDiscount: number; total: number;
  staffCode: string; lines: PosTransactionLine[];
}
export interface PosTransactionsPage { data: PosTransaction[]; nextCursor: string | null; }
export interface PosRefundLine { productCode: string; qty: number; refundAmount: number; }
export interface PosRefund {
  receiptNumber: string; createdAt: number; totalRefund: number;
  reason: string; lines: PosRefundLine[];
}
export interface PosRefundsPage { data: PosRefund[]; nextCursor: string | null; }
```

- [ ] **Step 2: Write `fixtures.ts`** — frozen, mirroring CONTRACT §5/§6 exactly (the single source of truth for all tests):
```ts
import type { PosTransactionsPage, PosRefundsPage } from "./types";
export const salesPageFixture: PosTransactionsPage = {
  data: [{
    receiptNumber: "R-2026-0042", paidAt: 1718600000000, subtotal: 90000,
    voucherCode: "OPEN10", voucherDiscount: 9000, total: 81000, staffCode: "S-0001",
    lines: [{ productCode: "DUBAI_8PC", productName: "Dubai 8pcs", qty: 2,
              unitPrice: 45000, lineSubtotal: 90000, taxRate: 0 }],
  }],
  nextCursor: "eyJwIjoxNzE4NjAwMDAwMDAwfQ",
};
export const refundsPageFixture: PosRefundsPage = {
  data: [{
    receiptNumber: "R-2026-0042", createdAt: 1718700000000, totalRefund: 45000, reason: "damaged",
    lines: [{ productCode: "DUBAI_8PC", qty: 1, refundAmount: 45000 }],
  }],
  nextCursor: null,
};
```

- [ ] **Step 3: Write `contractSchema.ts`** — `.strict()` so BOTH missing and extra keys fail:
```ts
import { z } from "zod";
const line = z.object({ productCode: z.string(), productName: z.string(), qty: z.number(),
  unitPrice: z.number(), lineSubtotal: z.number(), taxRate: z.number() }).strict();
export const posTransactionsPageSchema = z.object({
  data: z.array(z.object({
    receiptNumber: z.string(), paidAt: z.number(), subtotal: z.number(),
    voucherCode: z.string().nullable(), voucherDiscount: z.number(), total: z.number(),
    staffCode: z.string(), lines: z.array(line),
  }).strict()),
  nextCursor: z.string().nullable(),
}).strict();
const refundLine = z.object({ productCode: z.string(), qty: z.number(), refundAmount: z.number() }).strict();
export const posRefundsPageSchema = z.object({
  data: z.array(z.object({
    receiptNumber: z.string(), createdAt: z.number(), totalRefund: z.number(),
    reason: z.string(), lines: z.array(refundLine),
  }).strict()),
  nextCursor: z.string().nullable(),
}).strict();
```

- [ ] **Step 4: Write the contract-lock test** (`__tests__/contractLock.test.ts`):
```ts
import { describe, it, expect } from "vitest";
import { salesPageFixture, refundsPageFixture } from "../fixtures";
import { posTransactionsPageSchema, posRefundsPageSchema } from "../contractSchema";

describe("POS contract fixture lock", () => {
  it("accepts the frozen sales fixture", () => {
    expect(() => posTransactionsPageSchema.parse(salesPageFixture)).not.toThrow();
  });
  it("accepts the frozen refunds fixture", () => {
    expect(() => posRefundsPageSchema.parse(refundsPageFixture)).not.toThrow();
  });
  it("rejects an EXTRA key (POS-side additive drift tripwire)", () => {
    const drifted = { ...salesPageFixture,
      data: [{ ...salesPageFixture.data[0], surprise: 1 }] };
    expect(() => posTransactionsPageSchema.parse(drifted)).toThrow();
  });
  it("rejects a MISSING key (POS-side removal drift)", () => {
    const { total, ...rest } = salesPageFixture.data[0];
    const drifted = { ...salesPageFixture, data: [rest] };
    expect(() => posTransactionsPageSchema.parse(drifted)).toThrow();
  });
});
```

- [ ] **Step 5: Run — expect PASS.**

Run: `npx vitest run convex/integrations/pos/__tests__/contractLock.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit.**
```bash
git add convex/integrations/pos/types.ts convex/integrations/pos/fixtures.ts convex/integrations/pos/contractSchema.ts convex/integrations/pos/__tests__/contractLock.test.ts
git commit -m "feat(pos): contract types + frozen fixtures + bidirectional zod lock"
```

---

## Task 3: Pure adapter — `normalize()` + `normalizeRefunds()`

**Files:**
- Create: `convex/integrations/pos/adapter.ts`
- Test: `convex/integrations/pos/__tests__/adapter.test.ts`

**Interfaces:**
- Consumes: `ChannelAdapter`/`ChannelSaleEvent` (`convex/integrations/_shared/`), `PosTransactionsPage`/`PosRefundsPage`.
- Produces: `posAdapter: ChannelAdapter<PosTransactionsPage>`; `normalizeRefunds(page): Array<{ receiptNumber: string; createdAt: number; negatedTotal: number; reason: string }>`.

- [ ] **Step 1: Write the failing test** (`__tests__/adapter.test.ts`):
```ts
import { describe, it, expect } from "vitest";
import { posAdapter, normalizeRefunds } from "../adapter";
import { salesPageFixture, refundsPageFixture } from "../fixtures";

describe("posAdapter.normalize", () => {
  it("emits one ChannelSaleEvent per line with correct refs", () => {
    const events = posAdapter.normalize(salesPageFixture);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      source: "pos",
      occurredAt: 1718600000000,                       // = paidAt
      externalTransactionId: "R-2026-0042",
      externalItemId: "R-2026-0042|DUBAI_8PC",
      externalProductCode: "DUBAI_8PC",
      quantity: 2, unitPrice: 45000, totalPrice: 90000, // = lineSubtotal
    });
  });
});
describe("normalizeRefunds", () => {
  it("negates the total and shapes the refund identity", () => {
    const r = normalizeRefunds(refundsPageFixture);
    expect(r).toHaveLength(1);
    expect(r[0]).toEqual({
      receiptNumber: "R-2026-0042", createdAt: 1718700000000,
      negatedTotal: -45000, reason: "damaged",        // ← NEGATIVE
    });
  });
});
```

- [ ] **Step 2: Run — verify FAIL** (`Cannot find module '../adapter'`).

Run: `npx vitest run convex/integrations/pos/__tests__/adapter.test.ts`

- [ ] **Step 3: Write `adapter.ts`** (verbatim from spec §5):
```ts
import type { ChannelAdapter } from "../_shared/channelAdapter";
import type { ChannelSaleEvent } from "../_shared/channelSaleEvent";
import type { PosTransactionsPage, PosRefundsPage } from "./types";

export const posAdapter: ChannelAdapter<PosTransactionsPage> = {
  source: "pos",
  normalize(page): ChannelSaleEvent[] {
    return page.data.flatMap((txn) =>
      txn.lines.map((l) => ({
        source: "pos" as const,
        occurredAt: txn.paidAt,
        externalTransactionId: txn.receiptNumber,
        externalItemId: `${txn.receiptNumber}|${l.productCode}`,
        externalProductCode: l.productCode,
        externalProductName: l.productName,
        quantity: l.qty,
        unitPrice: l.unitPrice,
        totalPrice: l.lineSubtotal,
      })),
    );
  },
};

export function normalizeRefunds(page: PosRefundsPage): Array<{
  receiptNumber: string; createdAt: number; negatedTotal: number; reason: string;
}> {
  return page.data.map((r) => ({
    receiptNumber: r.receiptNumber,
    createdAt: r.createdAt,
    negatedTotal: -r.totalRefund,
    reason: r.reason,
  }));
}
```

- [ ] **Step 4: Run — verify PASS.** `npx vitest run convex/integrations/pos/__tests__/adapter.test.ts`

- [ ] **Step 5: Commit.**
```bash
git add convex/integrations/pos/adapter.ts convex/integrations/pos/__tests__/adapter.test.ts
git commit -m "feat(pos): pure adapter normalize() + normalizeRefunds() (refund sign negated)"
```

---

## Task 4: Pure record builders — normalized → `saveRevenue` args

Encodes the write decisions: `collapseRevenuePeriod`, `confidence:"exact"`, `dataOrigin:"api_revenue"`, `transactionType`, NEGATIVE refund gross, parent-only refunds. Pure → the refund-sign + period tests live here.

**Files:**
- Create: `convex/integrations/pos/recordBuilders.ts`
- Test: `convex/integrations/pos/__tests__/recordBuilders.test.ts`

**Interfaces:**
- Consumes: `collapseRevenuePeriod` (`convex/consignment/helpers.ts:81`), `PosTransactionsPage`/`PosRefundsPage`, `Id<"externalSyncLogs">`.
- Produces:
  - `type SaveRevenueRecord` (matches `saveRevenue`'s record validator, `mutations.ts:58-96`).
  - `type SaveRevenueItem` (matches `saveRevenueItems`' item validator, `mutations.ts:982-996`).
  - `buildPosSalesRecords(page, syncLogId): Array<{ record: SaveRevenueRecord; items: SaveRevenueItem[] }>`
  - `buildPosRefundRecords(page, syncLogId): Array<{ record: SaveRevenueRecord }>` (no items).

- [ ] **Step 1: Write the failing test** (`__tests__/recordBuilders.test.ts`):
```ts
import { describe, it, expect } from "vitest";
import { buildPosSalesRecords, buildPosRefundRecords } from "../recordBuilders";
import { salesPageFixture, refundsPageFixture } from "../fixtures";

const LOG = "log123" as any;

describe("buildPosSalesRecords", () => {
  const [built] = buildPosSalesRecords(salesPageFixture, LOG);
  it("builds a positive sales parent with collapsed period + exact confidence", () => {
    expect(built.record).toMatchObject({
      source: "pos", revenueGross: 81000, transactionType: "sales",
      dataOrigin: "api_revenue", confidence: "exact",
      externalTransactionId: "R-2026-0042",
      periodStart: 1718600000000, periodEnd: 1718600000000, transactionDate: 1718600000000,
    });
    expect(built.record.revenueNet).toBeUndefined();
    expect(built.record.commission).toBeUndefined();
  });
  it("builds one item per line keyed for set-once dedup", () => {
    expect(built.items).toHaveLength(1);
    expect(built.items[0]).toMatchObject({
      externalItemId: "R-2026-0042|DUBAI_8PC", quantity: 2,
      unitPrice: 45000, totalPrice: 90000, isAutoMatched: false,
    });
  });
});
describe("buildPosRefundRecords", () => {
  const [built] = buildPosRefundRecords(refundsPageFixture, LOG);
  it("builds a NEGATIVE-gross return parent, keyed by the refund identity, with NO items", () => {
    expect(built.record).toMatchObject({
      source: "pos", revenueGross: -45000, transactionType: "return",
      dataOrigin: "api_revenue", confidence: "exact",
      externalTransactionId: "R-2026-0042|R|1718700000000",
      periodStart: 1718700000000, periodEnd: 1718700000000, transactionDate: 1718700000000,
    });
    expect("items" in built).toBe(false);
  });
});
```

- [ ] **Step 2: Run — verify FAIL.** `npx vitest run convex/integrations/pos/__tests__/recordBuilders.test.ts`

- [ ] **Step 3: Write `recordBuilders.ts`:**
```ts
import type { Id } from "../../_generated/dataModel";
import { collapseRevenuePeriod } from "../../consignment/helpers";
import type { PosTransactionsPage, PosRefundsPage } from "./types";

export interface SaveRevenueRecord {
  source: "pos"; productName?: string; quantitySold?: number; transactionCount?: number;
  revenueGross?: number; periodStart: number; periodEnd: number; transactionDate?: number;
  dataOrigin: "api_revenue"; confidence: "exact";
  transactionType: "sales" | "return"; externalTransactionId: string;
  syncLogId?: Id<"externalSyncLogs">;
  // revenueNet / commission / fees intentionally omitted → undefined (spec §10 #3)
}
export interface SaveRevenueItem {
  externalItemId: string; productName: string; unitPrice: number;
  quantity: number; totalPrice: number; isAutoMatched: boolean;
}

export function buildPosSalesRecords(
  page: PosTransactionsPage, syncLogId: Id<"externalSyncLogs">,
): Array<{ record: SaveRevenueRecord; items: SaveRevenueItem[] }> {
  return page.data.map((txn) => ({
    record: {
      source: "pos",
      productName: `POS ${txn.receiptNumber}`,
      quantitySold: txn.lines.reduce((n, l) => n + l.qty, 0),
      transactionCount: 1,
      revenueGross: txn.total,
      ...collapseRevenuePeriod(txn.paidAt),
      dataOrigin: "api_revenue",
      confidence: "exact",
      transactionType: "sales",
      externalTransactionId: txn.receiptNumber,
      syncLogId,
    },
    items: txn.lines.map((l) => ({
      externalItemId: `${txn.receiptNumber}|${l.productCode}`,
      productName: l.productName,
      unitPrice: l.unitPrice,
      quantity: l.qty,
      totalPrice: l.lineSubtotal,
      isAutoMatched: false,
    })),
  }));
}

export function buildPosRefundRecords(
  page: PosRefundsPage, syncLogId: Id<"externalSyncLogs">,
): Array<{ record: SaveRevenueRecord }> {
  return page.data.map((r) => ({
    record: {
      source: "pos",
      productName: `POS refund ${r.receiptNumber}`,
      transactionCount: 1,
      revenueGross: -r.totalRefund,                                  // NEGATIVE
      ...collapseRevenuePeriod(r.createdAt),
      dataOrigin: "api_revenue",
      confidence: "exact",
      transactionType: "return",
      externalTransactionId: `${r.receiptNumber}|R|${r.createdAt}`,
      syncLogId,
    },
  }));
}
```

- [ ] **Step 4: Run — verify PASS.** `npx vitest run convex/integrations/pos/__tests__/recordBuilders.test.ts`

- [ ] **Step 5: Commit.**
```bash
git add convex/integrations/pos/recordBuilders.ts convex/integrations/pos/__tests__/recordBuilders.test.ts
git commit -m "feat(pos): pure record builders (negative refund gross, parent-only, collapsed period)"
```

---

## Task 5: Checkpoint table accessors

**Files:**
- Create: `convex/integrations/pos/checkpoint.ts`
- Test: `convex/integrations/pos/__tests__/checkpoint.test.ts`

**Interfaces:**
- Produces: `getCheckpoint` (internalQuery → `{ salesCursor?, refundsCursor? } | null`); `persistSalesCursor`/`persistRefundsCursor` (internalMutations, args `{ cursor: string }`, upsert the singleton + bump `updatedAt`); `assertAdmin` (internalQuery, args `{ token: string }`, runs `requireRole(ctx, token, ["admin"])`, returns null — the action-auth seam, since `requireRole` needs `QueryCtx`/`MutationCtx` not `ActionCtx`, and queries can't live in the `"use node"` `sync.ts`).

- [ ] **Step 1: Write the failing convex-test** (`__tests__/checkpoint.test.ts`):
```ts
import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../../schema";
import { internal } from "../../../_generated/api";

describe("posSyncCheckpoint accessors", () => {
  it("upserts a single row and reads both cursors back", async () => {
    const t = convexTest(schema);
    expect(await t.query(internal.integrations.pos.checkpoint.getCheckpoint, {})).toBeNull();
    await t.mutation(internal.integrations.pos.checkpoint.persistSalesCursor, { cursor: "c-sales-1" });
    await t.mutation(internal.integrations.pos.checkpoint.persistRefundsCursor, { cursor: "c-ref-1" });
    const cp = await t.query(internal.integrations.pos.checkpoint.getCheckpoint, {});
    expect(cp).toMatchObject({ salesCursor: "c-sales-1", refundsCursor: "c-ref-1" });
    // second sales persist updates in place, does not insert a new row
    await t.mutation(internal.integrations.pos.checkpoint.persistSalesCursor, { cursor: "c-sales-2" });
    const all = await t.run(async (ctx) => ctx.db.query("posSyncCheckpoint").collect());
    expect(all).toHaveLength(1);
    expect(all[0].salesCursor).toBe("c-sales-2");
    expect(all[0].refundsCursor).toBe("c-ref-1");
  });
});
```

- [ ] **Step 2: Run — verify FAIL.** `npx vitest run convex/integrations/pos/__tests__/checkpoint.test.ts`

- [ ] **Step 3: Write `checkpoint.ts`:**
```ts
import { v } from "convex/values";
import { internalMutation, internalQuery } from "../../_generated/server";
import type { MutationCtx } from "../../_generated/server";
import { requireRole } from "../../lib/auth";

export const getCheckpoint = internalQuery({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db.query("posSyncCheckpoint").first();
    return row ? { salesCursor: row.salesCursor, refundsCursor: row.refundsCursor } : null;
  },
});

// Action-auth seam: requireRole needs QueryCtx/MutationCtx, and queries can't
// live in the "use node" sync.ts. triggerPosSync calls this via ctx.runQuery.
export const assertAdmin = internalQuery({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    await requireRole(ctx, token, ["admin"]);
    return null;
  },
});

async function upsert(ctx: MutationCtx, patch: { salesCursor?: string; refundsCursor?: string }) {
  const row = await ctx.db.query("posSyncCheckpoint").first();
  if (row) await ctx.db.patch(row._id, { ...patch, updatedAt: Date.now() });
  else await ctx.db.insert("posSyncCheckpoint", { ...patch, updatedAt: Date.now() });
}

export const persistSalesCursor = internalMutation({
  args: { cursor: v.string() },
  handler: (ctx, { cursor }) => upsert(ctx, { salesCursor: cursor }),
});
export const persistRefundsCursor = internalMutation({
  args: { cursor: v.string() },
  handler: (ctx, { cursor }) => upsert(ctx, { refundsCursor: cursor }),
});
```
> `assertAdmin` adds an `assertion`-style test: `await expect(t.query(assertAdmin, { token: "bad" })).rejects.toThrow()`. Add it to the checkpoint test.

- [ ] **Step 4: Codegen + run — verify PASS.**

Run: `npx convex codegen && npx vitest run convex/integrations/pos/__tests__/checkpoint.test.ts`

- [ ] **Step 5: Commit.**
```bash
git add convex/integrations/pos/checkpoint.ts convex/integrations/pos/__tests__/checkpoint.test.ts convex/_generated/
git commit -m "feat(pos): posSyncCheckpoint accessors (singleton upsert)"
```

---

## Task 6: Sync action — fetch loop, write path, cursor discipline, manual trigger

**⚠ Convex constraint (plan-staffreview C2):** a mutation **cannot** call `runMutation`/`runQuery`.
The parent→child orchestration therefore lives in the **action** (mirroring K3Mart
`adapter.ts:617-688`), not in page-apply mutations. Tests drive the action with a stubbed `fetch`.

**Files:**
- Create: `convex/integrations/pos/sync.ts` (`"use node"`)
- Modify: `convex/crons.ts`
- Test: `convex/integrations/pos/__tests__/sync.test.ts`

**Interfaces:**
- Consumes: `saveRevenue` (`internal.externalData.mutations.saveRevenue`), `saveRevenueItemsWithCounts` (`…mutations.saveRevenueItemsWithCounts`), `hasExternalRevenueItemsQuery` (`internal.externalData.queries.hasExternalRevenueItemsQuery`), `createSyncLog`/`updateSyncLog`, `getCredentialsInternal` (`internal.platformCredentials.queries.getCredentialsInternal`), checkpoint accessors + `assertAdmin`, builders.
- Produces: `syncPosRevenue` (internalAction, args `{ triggeredBy?: string }`); `triggerPosSync` (public action, args `{ token: string }`, admin-gated via `ctx.runQuery(assertAdmin)`).

- [ ] **Step 1: Write the failing convex-test** (`__tests__/sync.test.ts`) — drives the **action** with a stubbed `fetch`; covers dedup + refund-sign + parent-only + cursor-resume end-to-end. Set `process.env.POS_API_BASE_URL` and seed the token credential.
```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../../schema";
import { internal } from "../../../_generated/api";
import { salesPageFixture, refundsPageFixture } from "../fixtures";

const seed = async (t: any) =>
  t.run((ctx: any) => ctx.db.insert("platformCredentials", {
    platformId: "pos", currentToken: "frpos_test_x", updatedBy: "test", updatedAt: 0 }));
const posRows = (t: any, table: string) =>
  t.run((ctx: any) => ctx.db.query(table).withIndex("by_source", (q: any) => q.eq("source", "pos")).collect());

beforeEach(() => { process.env.POS_API_BASE_URL = "https://pos.test"; });
afterEach(() => { vi.unstubAllGlobals(); });

describe("syncPosRevenue — write path", () => {
  it("sales: one parent + one item, idempotent across two runs", async () => {
    const t = convexTest(schema); await seed(t);
    vi.stubGlobal("fetch", vi.fn(async (url: string) =>
      url.includes("/transactions")
        ? new Response(JSON.stringify(salesPageFixture), { status: 200 })   // nextCursor null
        : new Response(JSON.stringify({ data: [], nextCursor: null }), { status: 200 })));
    await t.action(internal.integrations.pos.sync.syncPosRevenue, { triggeredBy: "test" });
    await t.action(internal.integrations.pos.sync.syncPosRevenue, { triggeredBy: "test" });
    const parents = await posRows(t, "externalRevenue");
    const items = await posRows(t, "externalRevenueItems");
    expect(parents.filter((p: any) => p.transactionType === "sales")).toHaveLength(1); // upsert, no dup
    expect(items).toHaveLength(1);                                                      // set-once, no dup
    expect(parents[0].revenueGross).toBe(81000);
  });

  it("refund: NEGATIVE-gross parent, NO child items", async () => {
    const t = convexTest(schema); await seed(t);
    vi.stubGlobal("fetch", vi.fn(async (url: string) =>
      url.includes("/refunds")
        ? new Response(JSON.stringify(refundsPageFixture), { status: 200 })  // nextCursor null
        : new Response(JSON.stringify({ data: [], nextCursor: null }), { status: 200 })));
    await t.action(internal.integrations.pos.sync.syncPosRevenue, { triggeredBy: "test" });
    const parents = await posRows(t, "externalRevenue");
    const items = await posRows(t, "externalRevenueItems");
    const ret = parents.find((p: any) => p.transactionType === "return");
    expect(ret.revenueGross).toBe(-45000);      // ← subtracts in financials
    expect(ret.externalTransactionId).toBe("R-2026-0042|R|1718700000000");
    expect(items).toHaveLength(0);              // parent-only
  });
});

describe("syncPosRevenue — cursor discipline", () => {
  it("persists the last NON-NULL cursor mid-drain and resumes after a thrown page", async () => {
    const t = convexTest(schema); await seed(t);
    let call = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("/transactions")) {
        call++;
        if (call === 1) return new Response(JSON.stringify({ ...salesPageFixture, nextCursor: "c1" }), { status: 200 });
        return new Response("boom", { status: 500 });   // page 2 throws
      }
      return new Response(JSON.stringify({ data: [], nextCursor: null }), { status: 200 });
    }));
    await t.action(internal.integrations.pos.sync.syncPosRevenue, { triggeredBy: "test" });
    const cp = await t.query(internal.integrations.pos.checkpoint.getCheckpoint, {});
    expect(cp?.salesCursor).toBe("c1");   // advanced past page 1, NOT reset to ∅; status logged error
  });
});
```

- [ ] **Step 2: Run — verify FAIL.** `npx vitest run convex/integrations/pos/__tests__/sync.test.ts`

- [ ] **Step 3: Write `sync.ts`.** All orchestration is in the action (mirrors K3Mart `adapter.ts:617-688`): per page, one batched `saveRevenue`, then per new parent the existence-guard + `saveRevenueItemsWithCounts`. `limit=500`, `MAX_PAGES_PER_RUN=50`, persist non-null cursor per page, leave it on throw.
```ts
"use node";
import { v } from "convex/values";
import { action, internalAction } from "../../_generated/server";
import { internal } from "../../_generated/api";
import type { ActionCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { buildPosSalesRecords, buildPosRefundRecords } from "./recordBuilders";
import { posTransactionsPageSchema, posRefundsPageSchema } from "./contractSchema";
import type { PosTransactionsPage, PosRefundsPage } from "./types";

const LIMIT = 500;
const MAX_PAGES_PER_RUN = 50;

async function fetchJson(baseUrl: string, token: string, path: string, cursor?: string) {
  const res = await fetch(
    `${baseUrl}${path}?cursor=${encodeURIComponent(cursor ?? "")}&limit=${LIMIT}`,
    { method: "GET", headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`POS ${res.status} on ${path}`);
  return res.json();
}

/** Write one normalized sales page: batched parent upsert + per-new-parent children. */
async function applySalesPage(ctx: ActionCtx, page: PosTransactionsPage, syncLogId: Id<"externalSyncLogs">) {
  const built = buildPosSalesRecords(page, syncLogId);
  if (built.length === 0) return;
  const saved = await ctx.runMutation(internal.externalData.mutations.saveRevenue, {
    records: built.map((b) => b.record),
  });
  for (let i = 0; i < built.length; i++) {
    const { id, isNew } = saved[i];
    if (!isNew) {
      const has = await ctx.runQuery(internal.externalData.queries.hasExternalRevenueItemsQuery, {
        revenueId: id as Id<"externalRevenue">,
      });
      if (has) continue;   // existence guard — re-pulled parent already has children
    }
    await ctx.runMutation(internal.externalData.mutations.saveRevenueItemsWithCounts, {
      revenueId: id as Id<"externalRevenue">, items: built[i].items,
    });
  }
}

/** Write one normalized refunds page: parent-only (negative gross), no children. */
async function applyRefundsPage(ctx: ActionCtx, page: PosRefundsPage, syncLogId: Id<"externalSyncLogs">) {
  const built = buildPosRefundRecords(page, syncLogId);
  if (built.length === 0) return;
  await ctx.runMutation(internal.externalData.mutations.saveRevenue, {
    records: built.map((b) => b.record),
  });
}

export const syncPosRevenue = internalAction({
  args: { triggeredBy: v.optional(v.string()) },
  handler: async (ctx, { triggeredBy }) => {
    const startTime = Date.now();
    const baseUrl = process.env.POS_API_BASE_URL;
    const cred = await ctx.runQuery(internal.platformCredentials.queries.getCredentialsInternal, { platformId: "pos" });
    const token = cred?.currentToken;
    if (!baseUrl || !token) { console.warn("POS sync: missing base URL or token — no-op"); return; }

    const syncLogId = await ctx.runMutation(internal.externalData.mutations.createSyncLog, {
      source: "pos", syncType: triggeredBy === "cron" ? "cron" : "manual",
      status: "started", triggeredBy: triggeredBy ?? "manual", timestamp: startTime,
    });

    try {
      const cp = await ctx.runQuery(internal.integrations.pos.checkpoint.getCheckpoint, {});
      // Phase A — sales
      let cursor = cp?.salesCursor; let pages = 0;
      while (pages < MAX_PAGES_PER_RUN) {
        const page = posTransactionsPageSchema.parse(
          await fetchJson(baseUrl, token, "/api/v1/transactions", cursor)) as PosTransactionsPage;
        await applySalesPage(ctx, page, syncLogId);
        pages++;
        if (page.nextCursor === null) break;             // caught up — leave cursor at last non-null
        cursor = page.nextCursor;
        await ctx.runMutation(internal.integrations.pos.checkpoint.persistSalesCursor, { cursor });
      }
      // Phase B — refunds
      cursor = cp?.refundsCursor; pages = 0;
      while (pages < MAX_PAGES_PER_RUN) {
        const page = posRefundsPageSchema.parse(
          await fetchJson(baseUrl, token, "/api/v1/refunds", cursor)) as PosRefundsPage;
        await applyRefundsPage(ctx, page, syncLogId);
        pages++;
        if (page.nextCursor === null) break;
        cursor = page.nextCursor;
        await ctx.runMutation(internal.integrations.pos.checkpoint.persistRefundsCursor, { cursor });
      }
      await ctx.runMutation(internal.externalData.mutations.updateSyncLog, {
        logId: syncLogId, status: "success", durationMs: Date.now() - startTime,
      });
    } catch (e) {
      await ctx.runMutation(internal.externalData.mutations.updateSyncLog, {
        logId: syncLogId, status: "error", errorMessage: String(e), durationMs: Date.now() - startTime,
      });
      // cursor left at last persisted page — self-healing resume
    }
  },
});

// Public admin trigger. NO protectedAction in this project — gate via an internal
// query that runs requireRole (mirror qrisPayments/actions.ts:29-31).
export const triggerPosSync = action({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    await ctx.runQuery(internal.integrations.pos.checkpoint.assertAdmin, { token });
    await ctx.runAction(internal.integrations.pos.sync.syncPosRevenue, { triggeredBy: "manual" });
  },
});
```
> Cursor rule: `persistSalesCursor` runs **only when `nextCursor` is non-null** (after the break check) — terminal null leaves the checkpoint at the last non-null cursor (spec §6.4).

- [ ] **Step 4: Register the cron** (`convex/crons.ts`, after the internal-orders entry):
```ts
crons.interval(
  "sync pos revenue",
  { hours: 1 },
  internal.integrations.pos.sync.syncPosRevenue,
  { triggeredBy: "cron" },
);
```

- [ ] **Step 5: Codegen + run the sync tests — verify PASS.**

Run: `npx convex codegen && npx vitest run convex/integrations/pos/__tests__/sync.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit.**
```bash
git add convex/integrations/pos/sync.ts convex/crons.ts convex/integrations/pos/__tests__/sync.test.ts convex/_generated/
git commit -m "feat(pos): syncPosRevenue action (drain, per-page cursor, parent-only refunds) + hourly cron + admin trigger"
```

---

## Task 7: Full-suite gate + docs

**Files:**
- Modify: `docs/CHANGELOG.md`, `docs/SCHEMA.md`, `docs/FILE_MAP.md`

- [ ] **Step 1: Full verification gate.**

Run: `npm run type-check && npm run lint && npm run test && npm run build`
Expected: all PASS. (`build` = the merge gate per CLAUDE.md.)

- [ ] **Step 2: Update `docs/CHANGELOG.md`** — add an entry:
```markdown
## 2026-06-18 — POS sales sync (source #9)
- POS becomes the 9th external revenue source (`source: "pos"`, platform `POS`). Hourly pull-sync
  lands paid POS transactions as externalRevenue + per-line items; refunds as negative-gross returns.
- New `posSyncCheckpoint` table (opaque-cursor watermarks). Deduction ships OFF (`channelDeductionEnabled.pos=false`).
- Admin manual trigger `triggerPosSync`. Map ~4 POS SKUs via /admin/unlinked-products.
```

- [ ] **Step 3: Update `docs/SCHEMA.md`** — document the new `posSyncCheckpoint` table + the `externalSource`/`channelDeductionEnabled` `pos` additions.

- [ ] **Step 4: Update `docs/FILE_MAP.md`** — add a POS sync row pointing at `convex/integrations/pos/`.

- [ ] **Step 5: Commit.**
```bash
git add docs/CHANGELOG.md docs/SCHEMA.md docs/FILE_MAP.md
git commit -m "docs(pos): changelog + schema + file map for POS sales sync"
```

---

## Git Workflow
**Branch:** `feature/pos-erp-sales-sync` (cut fresh from synced `main`)
**Checkpoints:** one commit per task (7 commits). `npm run build` must pass before merge.

## Implementation Waves
### Wave 1: Cascade + schema [SEQUENTIAL — foundational]
| Agent | Task | Files |
|-------|------|-------|
| convex-backend | Task 1 | schema + cascade sites |
### Wave 2: Pure units [PARALLEL, after Wave 1]
| Agent | Task | Files |
|-------|------|-------|
| convex-backend | Task 2 (types/fixtures/lock) | `pos/types,fixtures,contractSchema` |
| convex-backend | Task 3 (adapter) | `pos/adapter` |
| convex-backend | Task 4 (record builders) | `pos/recordBuilders` |
### Wave 3: Stateful backend [SEQUENTIAL, after Wave 2]
| Agent | Task | Files |
|-------|------|-------|
| convex-backend | Task 5 (checkpoint) | `pos/checkpoint` |
| convex-backend | Task 6 (sync + cron) | `pos/sync`, `crons.ts` |
### Wave 4: Verification [SEQUENTIAL]
| Agent | Task |
|-------|------|
| code-auditor | type-check + pattern compliance |
| Bash | `npm run build` + full `npm run test` |
| — | Task 7 docs |

## Documentation Updates
- [ ] CHANGELOG.md (ALWAYS)
- [ ] SCHEMA.md (new table + union change)
- [ ] FILE_MAP.md (new feature area)

## Success Criteria
- [ ] `npm run type-check` passes (the cascade enumerator)
- [ ] `npm run build` succeeds
- [ ] All POS tests green: contract lock (4), adapter (2), record builders (3), checkpoint (1), sync (3)
- [ ] Re-applying a sync window inserts zero duplicate parents/items
- [ ] A refund lands as a `transactionType:"return"` parent with NEGATIVE `revenueGross` and subtracts in income-statement aggregation
- [ ] Mid-drain throw leaves the cursor at the last non-null page (not ∅); next run resumes
- [ ] Deduction never fires (flag OFF) — no `inventoryDeductedAt` set on any POS item

## Verify-First (confirm against real code before coding — from the spec staffreview)
- `requireRole` exact signature/import at `convex/lib/auth.ts`.
- `saveRevenueItemsWithCounts` arg shape at `convex/externalData/mutations.ts:1016` (item validator).
- `hasExternalRevenueItemsQuery` path under `internal.externalData.queries`.
- `getCredentialsInternal` path/return at `convex/platformCredentials/queries.ts:129`.
- `registry.ts` `PlatformMeta` shape at `:40-166` (Task 1 Step 7).
- `convex-test` `withIndex`/`by_source` query idiom matches existing tests (e.g. K3Mart tests).
