# Subscription Backend Consolidation Implementation Plan (Phase D · Slice 0)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate five duplicated patterns in the merged Phase B subscription/credit backend into single shared seams — behavior-preserving — so the upcoming Phase D CRM surface consumes clean APIs.

**Architecture:** Five independent refactors (R1 recognition entry point, R2 price-strip seam, R3 `creditLedger.by_type` index, R4 invoice-snapshot helper, R5 COGS-accumulation helper). Each replaces an N-way duplication with one source of truth and is proven behavior-preserving by characterization tests (capture current output → refactor → assert unchanged). No new functionality, no new wire data, no contract changes.

**Tech Stack:** Convex (serverless TS backend), `convex-test` + Vitest for backend integration/unit tests, TypeScript strict.

**Spec:** `docs/superpowers/specs/2026-06-24-subscription-backend-consolidation-spec.md` (rev. with spec-staffreview C1/C2/C3 + I1–I4 folded in).
**Spec staffreview:** `docs/reviews/staffreview-subscription-backend-consolidation-spec-2026-06-24.md`.

## Global Constraints

- **Behavior-preserving:** identical observable behavior before/after every refactor. Any behavior change is a defect (the sole exception — a discovered confidential-pricing leak — ships as a SEPARATE flagged task, never folded into a refactor; see R2).
- **Money is integer IDR.** No floats introduced.
- **No dynamic `import()`** in Convex (Pitfall #8) — static imports only.
- **`no-restricted-imports`** (Pitfall #18): use canonical helpers; do not reintroduce banned legacy exports. New helpers live beside their domain.
- **Codegen:** R3 adds a schema index → run `npx convex codegen` once on the merged tree and commit `convex/_generated/api.d.ts` (Phase-76/81 recurring lesson).
- **Order dual-surface (Pitfall #20):** R2 feeds queries used by BOTH `OrderSlideOver` and `OrderDetail` — both must still render for manager + non-manager.
- **No new ledger type / invoice kind / order status / recognition trigger.**

---

## Execution Strategy — multi-agent, wave-gated

**Wave dispatch map:**

| Wave | Tasks | Parallelism | Gate to next wave |
|------|-------|-------------|-------------------|
| **Wave 1** | R1 (Task 1), R2 (Tasks 2a→2b), R4 (Task 4) | **3 agents in parallel** — disjoint files | All three green (`vitest` per task) + each committed |
| **Wave 2** | R3 (Task 3) → R5 (Task 5) | **Sequential** (shared file `incomeStatement.ts`) | R3 committed before R5 starts |
| **Wave 3** | Verification (Task 6) | **Sequential, main session** | — |

**Shared / generated-file serialization:**
- `convex/reports/incomeStatement.ts` is written by **R3** (scan lines ~928/933) **and R5** (Site B lambda ~981-997). These MUST be the same agent or strictly sequential (Wave 2). NEVER parallelize them.
- `convex/_generated/api.d.ts` (codegen artifact): regenerated **once** in Wave 3 on the merged tree after R3's index lands — not per-task.
- All other files are disjoint across tasks: R1 = `orders/mutations/{orderCrud,packaging,statusUpdates}.ts` + `subscriptions/recognition.ts`; R2 = `orders/queries.ts` + `orders/helpers/stripSubscriptionPricing.ts` (+ new seam file); R4 = `subscriptions/invoicing.ts`; R3 = `schema.ts` + `incomeStatement.ts`; R5 = `lib/costCalculator.ts` + `incomeStatement.ts`.

**Critical path:** Wave 1 (R1 ∥ R2 ∥ R4) → barrier → **R3 → R5** → codegen → build/test. The R3→R5 sequential spine sets minimum wall-clock for Wave 2.

**Headless-impossible (flag "pending", do not claim passed):** none — this is a backend-only, fully-automatable slice. No manual UAT, no live dashboard, no external creds. The only human-gated step is the standard close-out review (Wave 3, main session).

**Close-out runs in the MAIN session (never a background agent):** after Wave 3 build+test green → `/triple-review` (address every Critical + Improvement) → `/simplify xhigh` (apply cleanups) → re-run type-check/test. Only then is the slice done.

**Recommended agents:** R1/R3/R4/R5 → `convex-backend`; R2 → `convex-backend` + `tdd-test-architect` (leak-proof characterization discipline); Wave 3 grep-gates → `code-auditor`.

---

## File Structure

| File | Refactor | Responsibility after change |
|------|----------|------------------------------|
| `convex/subscriptions/recognition.ts` | R1 | Adds `recognizeOnDelivery` — the single recognition entry point wrapping `recognizeSubscriptionDelivery` |
| `convex/orders/mutations/orderCrud.ts` | R1 | `completeOrder` calls `recognizeOnDelivery` (undefined author) |
| `convex/orders/mutations/packaging.ts` | R1 | `completePackaging` calls `recognizeOnDelivery` (undefined author) |
| `convex/orders/mutations/statusUpdates.ts` | R1 | 3 sites call `recognizeOnDelivery` with acting user |
| `convex/orders/helpers/stripOrders.ts` | R2 | NEW — batch/single strip seam wrapping `stripSubscriptionPricing` |
| `convex/orders/queries.ts` | R2 | 10 inline strip calls → `stripOrders`/`stripOrder` |
| `convex/orders/helpers/__tests__/stripSubscriptionPricing.test.ts` | R2 | Extended characterization matrix |
| `convex/schema.ts` | R3 | `creditLedger` gains `.index("by_type", ["type"])` |
| `convex/reports/incomeStatement.ts` | R3 + R5 | drawdown/expiry scans use `by_type`; Site B uses `accumulateOrderCogs` |
| `convex/subscriptions/invoicing.ts` | R4 | `buildInvoiceSnapshot` helper; weekly + topup builders use it |
| `convex/lib/costCalculator.ts` | R5 | NEW `accumulateOrderCogs(items, cogsMap)` beside `buildProductCOGSMap` |

---

## Task 1 (R1): Single recognition entry point — `recognizeOnDelivery`

**Files:**
- Modify: `convex/subscriptions/recognition.ts` (add export)
- Modify: `convex/orders/mutations/orderCrud.ts:441`
- Modify: `convex/orders/mutations/packaging.ts:235`
- Modify: `convex/orders/mutations/statusUpdates.ts:227,536,759`
- Test: `convex/subscriptions/__tests__/recognition.test.ts` (create if absent; else extend)

**Interfaces:**
- Produces: `recognizeOnDelivery(ctx: MutationCtx, orderId: Id<"orders">, actingUserId?: Id<"users">): Promise<void>` — single entry point. `actingUserId` optional (2 token-less mutations pass `undefined`).
- Consumes: existing `recognizeSubscriptionDelivery(ctx, orderId, createdBy?)` (unchanged).

- [ ] **Step 1: Write the failing test** in `convex/subscriptions/__tests__/recognition.test.ts`

```ts
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "../../schema";
import { recognizeOnDelivery } from "../recognition";

// recognizeOnDelivery delegates to recognizeSubscriptionDelivery: no-op for
// non-subscription orders, idempotent, authors via explicit id OR fallback.
test("recognizeOnDelivery no-ops for a non-subscription order", async () => {
  const t = convexTest(schema);
  await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { name: "U", role: "kitchen", pin: "0000" } as any);
    const orderId = await ctx.db.insert("orders", {
      orderNumber: "0101-001", status: "AwaitingDelivery", createdByUserId: userId,
      totalAmount: 1000, /* ...minimal required order fields... */
    } as any);
    await recognizeOnDelivery(ctx, orderId, userId);
    const ledger = await ctx.db.query("creditLedger").withIndex("by_order", q => q.eq("orderId", orderId)).collect();
    expect(ledger).toHaveLength(0); // no subscriptionId → no recognition
  });
});
```

> NOTE for implementer: fill the order/subscription fixture with the exact required fields from `convex/schema.ts` (`orders` + `subscriptions` + `subscriptionWeeks`). Mirror the fixture already used by Phase B's recognition/reconcile tests — copy from `convex/subscriptions/__tests__/` if those tests exist; otherwise build the minimal funded-week fixture.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run convex/subscriptions/__tests__/recognition.test.ts`
Expected: FAIL — `recognizeOnDelivery is not exported`.

- [ ] **Step 3: Add `recognizeOnDelivery` to `recognition.ts`** (below `recognizeSubscriptionDelivery`)

```ts
/**
 * Single delivery-recognition entry point (Phase D Slice 0, R1). All order
 * status mutations that reach "delivered" call THIS, not recognizeSubscriptionDelivery
 * directly, so the recognition trigger has one home. actingUserId is OPTIONAL:
 * the 3 status mutations pass their acting user; completeOrder/completePackaging
 * (plain mutations with no token in scope) pass undefined → recognizeSubscriptionDelivery
 * falls back to order.createdByUserId, exactly as before. Behavior-preserving.
 */
export async function recognizeOnDelivery(
  ctx: MutationCtx,
  orderId: Id<"orders">,
  actingUserId?: Id<"users">,
): Promise<void> {
  await recognizeSubscriptionDelivery(ctx, orderId, actingUserId);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run convex/subscriptions/__tests__/recognition.test.ts`
Expected: PASS.

- [ ] **Step 5: Add an idempotency + funded-subscription test** (extend the same file) asserting two `recognizeOnDelivery` calls on a funded subscription order produce exactly ONE `drawdown` row, and that the row's `createdBy` is the explicit `actingUserId` when passed, and `order.createdByUserId` when `undefined`. Run it; expect PASS.

- [ ] **Step 6: Repoint the 5 call sites** — replace each `recognizeSubscriptionDelivery(...)` call (NOT the import of the underlying fn — repoint imports to `recognizeOnDelivery`):
  - `orderCrud.ts:441`: `await recognizeOnDelivery(ctx, args.orderId);`
  - `packaging.ts:235`: `await recognizeOnDelivery(ctx, args.orderId);`
  - `statusUpdates.ts:227`: `await recognizeOnDelivery(ctx, args.orderId, args.userId);`
  - `statusUpdates.ts:536`: `await recognizeOnDelivery(ctx, args.orderId, userId);`
  - `statusUpdates.ts:759`: `await recognizeOnDelivery(ctx, args.orderId, user._id);`
  Update the three import statements to import `recognizeOnDelivery`.

- [ ] **Step 7: Verify `recognizeSubscriptionDelivery` is now called ONLY from inside `recognizeOnDelivery`**

Run: `grep -rn "recognizeSubscriptionDelivery(" convex --include=*.ts | grep -v "_generated"`
Expected: exactly ONE call site (inside `recognizeOnDelivery`); plus the definition + comments.

- [ ] **Step 8: Run full recognition + status-mutation tests**

Run: `npx vitest run convex/subscriptions convex/orders/mutations`
Expected: PASS (existing tests unchanged).

- [ ] **Step 9: Commit**

```bash
git add convex/subscriptions/recognition.ts convex/subscriptions/__tests__/recognition.test.ts convex/orders/mutations/orderCrud.ts convex/orders/mutations/packaging.ts convex/orders/mutations/statusUpdates.ts
git commit -m "refactor(subscriptions): single recognizeOnDelivery entry point (R1, behavior-preserving)"
```

---

## Task 2a (R2): Characterization test — pin TODAY's strip behavior FIRST

**Files:**
- Test: `convex/orders/helpers/__tests__/stripSubscriptionPricing.test.ts` (extend)

**Interfaces:**
- Consumes: existing `stripSubscriptionPricing(order, items, role)`.
- Produces: a green safety net the R2 seam must keep green.

- [ ] **Step 1: Write the characterization matrix test** — assert current behavior across {manager, admin, kitchen, order_staff} × {subscription order, non-subscription order} × {order-level + item-level money fields}:

```ts
import { stripSubscriptionPricing } from "../stripSubscriptionPricing";
import { expect, test, describe } from "vitest";

const subOrder = { subscriptionId: "s1", fundingSource: "subscription_credit", totalAmount: 5000, finalTotal: 5000, totalMargin: 1000, totalCost: 4000 } as any;
const normalOrder = { totalAmount: 5000, finalTotal: 5000, totalMargin: 1000, totalCost: 4000 } as any;
const items = [{ unitPrice: 2500, lineTotal: 5000, lineMargin: 500, lineCost: 2000, quantity: 2, productName: "X" }] as any[];

describe("stripSubscriptionPricing characterization (pre-R2)", () => {
  for (const role of ["kitchen", "order_staff"]) {
    test(`${role} sees subscription money nulled`, () => {
      const { order, items: it } = stripSubscriptionPricing(subOrder, items, role);
      expect(order.totalAmount).toBeUndefined();
      expect(order.finalTotal).toBeUndefined();
      expect(order.totalMargin).toBeUndefined();
      expect(order.totalCost).toBeUndefined();
      expect(it[0].unitPrice).toBeUndefined();
      expect(it[0].lineTotal).toBeUndefined();
      expect(it[0].lineMargin).toBeUndefined();
      expect(it[0].lineCost).toBeUndefined();
      expect(it[0].quantity).toBe(2); // non-money preserved
    });
    test(`${role} sees NON-subscription money untouched`, () => {
      const { order } = stripSubscriptionPricing(normalOrder, items, role);
      expect(order.totalAmount).toBe(5000);
    });
  }
  for (const role of ["manager", "admin"]) {
    test(`${role} sees subscription money in full`, () => {
      const { order, items: it } = stripSubscriptionPricing(subOrder, items, role);
      expect(order.totalAmount).toBe(5000);
      expect(it[0].unitPrice).toBe(2500);
    });
  }
});
```

- [ ] **Step 2: Run — expect PASS** (this captures current behavior; it is the baseline).

Run: `npx vitest run convex/orders/helpers/__tests__/stripSubscriptionPricing.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit the safety net**

```bash
git add convex/orders/helpers/__tests__/stripSubscriptionPricing.test.ts
git commit -m "test(orders): characterize subscription price-strip behavior before R2 seam"
```

## Task 2b (R2): Extract the `stripOrders` seam, repoint 10 call sites

**Files:**
- Create: `convex/orders/helpers/stripOrders.ts`
- Modify: `convex/orders/queries.ts` (10 call sites: lines 150, 218, 280, 314, 372, 399, 462, 735, 934, 1002)
- Test: `convex/orders/helpers/__tests__/stripOrders.test.ts` (create)

**Interfaces:**
- Produces:
  ```ts
  stripOrder<O extends Record<string, any>, I extends Record<string, any>>(
    role: string, order: O, items?: I[]): { order: O; items: I[] }
  stripOrders<O extends Record<string, any>, I extends Record<string, any>>(
    role: string, orders: O[], itemsByOrder?: Map<Id<"orders">, I[]>): { orders: O[]; itemsByOrder: Map<Id<"orders">, I[]> }
  ```
- Consumes: `stripSubscriptionPricing` (the existing field-list source of truth — do NOT reimplement the field list).

- [ ] **Step 1: Write the failing test** in `stripOrders.test.ts` — assert `stripOrder` and `stripOrders` produce identical results to calling `stripSubscriptionPricing` per row, are generic over item shape (plain, empty `[]`, extra-field "enriched"), and tolerate `items` omitted.

```ts
import { stripOrder, stripOrders } from "../stripOrders";
import { stripSubscriptionPricing } from "../stripSubscriptionPricing";
import { expect, test } from "vitest";

const sub = { subscriptionId: "s1", totalAmount: 5000 } as any;
const enriched = [{ unitPrice: 100, lineTotal: 100, production: { balls: 3 }, quantity: 1 }] as any[];

test("stripOrder matches stripSubscriptionPricing for kitchen", () => {
  expect(stripOrder("kitchen", sub, enriched))
    .toEqual(stripSubscriptionPricing(sub, enriched, "kitchen"));
});
test("stripOrder tolerates omitted items", () => {
  const { items } = stripOrder("kitchen", sub);
  expect(items).toEqual([]);
});
test("stripOrders strips a batch, preserves enriched non-money fields", () => {
  const { orders, itemsByOrder } = stripOrders("kitchen", [sub], new Map([["o1" as any, enriched]]));
  expect(orders[0].totalAmount).toBeUndefined();
  expect(itemsByOrder.get("o1" as any)![0].production.balls).toBe(3);
});
```

- [ ] **Step 2: Run — expect FAIL** (`stripOrders` not defined).

- [ ] **Step 3: Implement `stripOrders.ts`**

```ts
import type { Id } from "../../_generated/dataModel";
import { stripSubscriptionPricing } from "./stripSubscriptionPricing";

export function stripOrder<O extends Record<string, any>, I extends Record<string, any>>(
  role: string, order: O, items?: I[],
): { order: O; items: I[] } {
  return stripSubscriptionPricing(order, items ?? [], role);
}

export function stripOrders<O extends Record<string, any>, I extends Record<string, any>>(
  role: string, orders: O[], itemsByOrder?: Map<Id<"orders">, I[]>,
): { orders: O[]; itemsByOrder: Map<Id<"orders">, I[]> } {
  const outItems = new Map<Id<"orders">, I[]>();
  const outOrders = orders.map((o) => {
    const id = o._id as Id<"orders">;
    const { order, items } = stripSubscriptionPricing(o, itemsByOrder?.get(id) ?? [], role);
    if (itemsByOrder) outItems.set(id, items);
    return order;
  });
  return { orders: outOrders, itemsByOrder: outItems };
}
```

- [ ] **Step 4: Run — expect PASS.**

- [ ] **Step 5: Repoint the 10 call sites in `queries.ts`** to `stripOrder(ctx.user.role, order, items)` (single) — preserving each site's current shape. Examples:
  - `:150` `const stripped = stripOrder(ctx.user.role, order, items);`
  - `:218` `const stripped = stripOrder(ctx.user.role, order);` (no items)
  - `:462` `(order) => stripOrder(ctx.user.role, order).order`
  Replace the import `stripSubscriptionPricing` → `stripOrder`/`stripOrders` from `./helpers/stripOrders`. (Single-order sites use `stripOrder`; only adopt the batch `stripOrders` where a site already builds a per-order item map — do not force batching.)

- [ ] **Step 6: Enforce no inline strip remains**

Run: `grep -rn "stripSubscriptionPricing(" convex/orders/queries.ts`
Expected: ZERO matches (all routed through `stripOrders.ts`).

- [ ] **Step 7: Run the characterization matrix + new seam tests + order query tests**

Run: `npx vitest run convex/orders`
Expected: PASS — Task 2a's matrix still green (behavior-preserving proof).

- [ ] **Step 8: Commit**

```bash
git add convex/orders/helpers/stripOrders.ts convex/orders/helpers/__tests__/stripOrders.test.ts convex/orders/queries.ts
git commit -m "refactor(orders): single stripOrders seam for subscription price-strip (R2, behavior-preserving)"
```

> **If a leak is discovered** (a `queries.ts` surface that today does NOT strip for a non-manager): STOP, do not fold it into Task 2b. Create a separate task + commit `fix(orders): strip subscription pricing on <surface> (security)` with a test asserting the NEW stripped behavior + a CHANGELOG security line. Per spec DD-R2 protocol.

---

## Task 3 (R3): `creditLedger.by_type` index + switch the two incomeStatement scans

**Files:**
- Modify: `convex/schema.ts` (`creditLedger` table, ~line 2606 — after `by_invoice`)
- Modify: `convex/reports/incomeStatement.ts:928,933`
- Test: `convex/reports/__tests__/incomeStatement.test.ts` (extend — golden value)

**Interfaces:**
- Produces: index `by_type: ["type"]` on `creditLedger`.
- Consumes: nothing new.

- [ ] **Step 1: Write/extend a golden-value test** asserting the income statement's B2B Wholesale revenue total for a fixture with ≥1 drawdown + ≥1 expiry equals a known number. Run — expect PASS (baseline, pre-index).

- [ ] **Step 2: Add the index** in `schema.ts`:

```ts
  creditLedger: defineTable({ /* ...unchanged... */ })
    .index("by_subscriptionWeek", ["subscriptionWeekId"])
    .index("by_subscription", ["subscriptionId"])
    .index("by_order", ["orderId"])
    .index("by_invoice", ["invoiceId"])
    .index("by_type", ["type"]),
```

- [ ] **Step 3: Switch the two scans** in `incomeStatement.ts` (currently `.filter((q) => q.eq(q.field("type"), "drawdown"|"expiry"))`):

```ts
const drawdowns = await ctx.db.query("creditLedger")
  .withIndex("by_type", (q) => q.eq("type", "drawdown")).collect();
const expiries = await ctx.db.query("creditLedger")
  .withIndex("by_type", (q) => q.eq("type", "expiry")).collect();
```

> Do NOT add a `_creationTime` range — recognition attributes revenue by `deliveryDate`, not `_creationTime` (spec CR3). This is a scan-narrowing change only.

- [ ] **Step 4: Enforce no post-scan type filter remains on creditLedger**

Run: `grep -rn 'q.eq(q.field("type")' convex/reports/incomeStatement.ts`
Expected: ZERO matches.

- [ ] **Step 5: Regenerate Convex types + run the golden test**

Run: `npx convex codegen && npx vitest run convex/reports`
Expected: PASS — B2B total bit-identical to Step 1.

- [ ] **Step 6: Commit**

```bash
git add convex/schema.ts convex/reports/incomeStatement.ts convex/reports/__tests__/incomeStatement.test.ts convex/_generated
git commit -m "perf(subscriptions): creditLedger.by_type index; switch incomeStatement scans (R3, behavior-preserving)"
```

---

## Task 4 (R4): `buildInvoiceSnapshot` helper

**Files:**
- Modify: `convex/subscriptions/invoicing.ts` (add helper; repoint `createSubscriptionWeeklyInvoice` ~72-105 + `buildTopupInvoice` ~260-293)
- Test: `convex/subscriptions/__tests__/invoicing.test.ts` (extend — full-shape assertion per kind)

**Interfaces:**
- Produces:
  ```ts
  async function buildInvoiceSnapshot(ctx: MutationCtx, args: {
    week: Doc<"subscriptionWeeks">; sub: Doc<"subscriptions">; customer: Doc<"customers"> | null;
    invoiceKind: "subscription_weekly" | "subscription_topup";
    orderNumber: string; invoiceNumber: string;
    items: Array<{ productName: string; qty: number; unitPrice: number; lineTotal: number; date?: number }>;
    generatedBy: Id<"users">; now: number;
  }): Promise<Omit<Doc<"invoices">, "_id" | "_creationTime">>  // the full insert object; NO db writes
  ```
- Consumes: `businessSettings` + default `bankAccount` (read inside helper). Caller passes `invoiceNumber` (allocated via `getNextInvoiceNumber`) — helper does NOT allocate.

- [ ] **Step 1: Write/extend a test** asserting both `createSubscriptionWeeklyInvoice` and `createTopupInvoice` insert invoices with the full expected field set (seller/bank/buyer snapshot + `invoiceKind`/`orderNumber` prefix + `subtotal`/`finalTotal`/`paymentStatus:"Unpaid"`). Run — expect PASS (baseline).

- [ ] **Step 2: Add `buildInvoiceSnapshot`** — lift the shared object literal (the 14 snapshot fields + computed subtotal/finalTotal) from the two builders into one function that reads settings/bank and returns the insert object. NO `ctx.db.insert`, NO `getNextInvoiceNumber` inside.

- [ ] **Step 3: Repoint `createSubscriptionWeeklyInvoice`** — keep the early idempotency return (`if (week.weeklyInvoiceId) return week.weeklyInvoiceId;`) and `getNextInvoiceNumber` allocation BEFORE building; call `buildInvoiceSnapshot({ ..., invoiceKind: "subscription_weekly", orderNumber: \`WEEK-${getWibDateStr(week.weekStart)}\`, generatedBy: ctx.user._id })`; `ctx.db.insert("invoices", snapshot)`; then patch the week (`weeklyInvoiceId` + `status:"invoiced"`) as today.

- [ ] **Step 4: Repoint `buildTopupInvoice`** — allocate `invoiceNumber`, call `buildInvoiceSnapshot({ ..., invoiceKind: "subscription_topup", orderNumber: \`TOPUP-${getWibDateStr(week.weekStart)}\`, generatedBy: args.generatedBy })`; `return ctx.db.insert("invoices", snapshot)`. No week-status change (as today).

- [ ] **Step 5: Run the full-shape tests**

Run: `npx vitest run convex/subscriptions/__tests__/invoicing.test.ts`
Expected: PASS — both invoice kinds field-identical to baseline.

- [ ] **Step 6: Commit**

```bash
git add convex/subscriptions/invoicing.ts convex/subscriptions/__tests__/invoicing.test.ts
git commit -m "refactor(subscriptions): buildInvoiceSnapshot helper for weekly+topup invoices (R4, behavior-preserving)"
```

---

## Task 5 (R5): `accumulateOrderCogs` helper — adopt at Site B only

**Files:**
- Modify: `convex/lib/costCalculator.ts` (add export beside `buildProductCOGSMap`)
- Modify: `convex/reports/incomeStatement.ts:981-997` (replace the `resolveOrderCogs` lambda)
- Test: `convex/lib/__tests__/costCalculator.test.ts` (extend)

**Interfaces:**
- Produces: `accumulateOrderCogs(items: Array<{ menuProductId?: string; quantity: number; isCancelled?: boolean }>, cogsMap: Map<string, { production: number; packaging: number; total: number }>): { production: number; packaging: number; total: number }`
- Consumes: `cogsMap` from `buildProductCOGSMap` (unchanged).

- [ ] **Step 1: Write the failing unit test** — cancelled items skipped, missing `menuProductId` skipped, missing `cogsMap` entry skipped, multi-item sum correct (integer IDR):

```ts
import { accumulateOrderCogs } from "../costCalculator";
import { expect, test } from "vitest";
const map = new Map([["p1", { production: 100, packaging: 20, total: 120 }]]);
test("sums mapped items, skips cancelled/unmapped/missing-id", () => {
  const items = [
    { menuProductId: "p1", quantity: 2 },
    { menuProductId: "p1", quantity: 1, isCancelled: true },
    { menuProductId: "p2", quantity: 5 },        // not in map → skip
    { quantity: 9 },                              // no id → skip
  ] as any[];
  expect(accumulateOrderCogs(items, map)).toEqual({ production: 200, packaging: 40, total: 240 });
});
```

- [ ] **Step 2: Run — expect FAIL** (not exported).

- [ ] **Step 3: Implement `accumulateOrderCogs`** in `costCalculator.ts` with the exact Site-B semantics:

```ts
export function accumulateOrderCogs(
  items: Array<{ menuProductId?: string; quantity: number; isCancelled?: boolean }>,
  cogsMap: Map<string, { production: number; packaging: number; total: number }>,
): { production: number; packaging: number; total: number } {
  const cogs = { production: 0, packaging: 0, total: 0 };
  for (const item of items) {
    if (item.isCancelled) continue;
    const id = item.menuProductId;
    if (!id) continue;
    const pc = cogsMap.get(id);
    if (!pc) continue;
    cogs.production += pc.production * item.quantity;
    cogs.packaging += pc.packaging * item.quantity;
    cogs.total += pc.total * item.quantity;
  }
  return cogs;
}
```

- [ ] **Step 4: Run — expect PASS.**

- [ ] **Step 5: Adopt at Site B** — replace the inline `resolveOrderCogs(orderId)` lambda body (`incomeStatement.ts:981-997`) with a call to `accumulateOrderCogs(orderItemsByOrder.get(orderId) ?? [], cogsMap)`. Leave Site A (`resolveItemsCOGS`, ~214-267) UNTOUCHED — it tracks unmapped products + builds `ProductDetail[]` and cannot adopt the helper (document this with a one-line comment at Site A).

- [ ] **Step 6: Run the income-statement golden test (from Task 3) + cost tests**

Run: `npx vitest run convex/reports convex/lib`
Expected: PASS — B2B Wholesale COGS bit-identical.

- [ ] **Step 7: Commit**

```bash
git add convex/lib/costCalculator.ts convex/lib/__tests__/costCalculator.test.ts convex/reports/incomeStatement.ts
git commit -m "refactor(reports): shared accumulateOrderCogs adopted at income-statement Site B (R5, behavior-preserving)"
```

---

## Task 6 (Wave 3): Verification + close-out (MAIN session)

- [ ] **Step 1: Regenerate codegen on the merged tree** (once): `npx convex codegen` — commit any `_generated` delta.
- [ ] **Step 2: Type-check:** `npm run type-check` — expect clean.
- [ ] **Step 3: Full test suite:** `npm run test` — expect all green (existing + new).
- [ ] **Step 4: `code-auditor` grep-gates** — confirm: `recognizeSubscriptionDelivery(` called only inside `recognizeOnDelivery`; zero `stripSubscriptionPricing(` in `queries.ts`; zero `q.eq(q.field("type")` on creditLedger; one `buildInvoiceSnapshot`; one `accumulateOrderCogs`.
- [ ] **Step 5: Build:** `npm run build` — MUST pass (tsc + vite + bundlesize).
- [ ] **Step 6: Close-out (main session, NOT a background agent):** `/triple-review` → address every Critical + Improvement → `/simplify xhigh` → apply cleanups → re-run `npm run type-check` + `npm run test`. Only then is the slice done.

---

## Documentation Updates

- [ ] `docs/CHANGELOG.md` — ALWAYS. Entry: "Subscription backend consolidation (Phase D Slice 0): single recognizeOnDelivery entry point, stripOrders seam, creditLedger.by_type index, buildInvoiceSnapshot, accumulateOrderCogs — all behavior-preserving."
- [ ] `docs/SCHEMA.md` — `creditLedger` gains `by_type` index.
- [ ] `docs/API_REFERENCE.md` — new helpers `recognizeOnDelivery`, `stripOrders`/`stripOrder`, `buildInvoiceSnapshot`, `accumulateOrderCogs`.
- [ ] `docs/FILE_MAP.md` — subscription-consolidation row.
- [ ] (If a leak-fix shipped) CHANGELOG security line, separate from the refactor entry.

## Success Criteria

- [ ] `npm run type-check`, `npm run build`, `npm run test` all pass.
- [ ] `npx convex codegen` clean; `_generated` committed.
- [ ] AC grep-gates all green (R1 single caller, R2 no inline strip, R3 no post-scan type filter, R4 one snapshot builder, R5 one COGS helper).
- [ ] Every refactor behavior-preserving — characterization/golden tests prove unchanged output (strip matrix, income-statement B2B total, invoice shape per kind).
- [ ] CRM surface (D1/D2/D3) NOT started.
- [ ] `/triple-review` + `/simplify xhigh` close-out complete; findings addressed.
