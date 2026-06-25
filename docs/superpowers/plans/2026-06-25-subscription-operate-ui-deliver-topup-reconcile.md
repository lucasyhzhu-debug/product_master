# Subscription operate UI (deliver/recognize, top-up, reconcile, out-of-credit) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface the existing, tested subscription weekly-cycle backend through operator UI so a manager/admin can complete deliver/recognize → top-up → reconcile → out-of-credit from the app, with three thin additive backend seams.

**Architecture:** Four thin backend additions (one mutation, one mutation+pure-helper, one schema field+arg, one query+pure-helper) expose existing internal logic through properly-gated seams; four frontend features wire them onto the existing CRM + order surfaces. All credit/ledger math is unchanged — new money logic is delta-computation only, isolated in unit-tested pure functions (repo convention: extract pure logic, unit-test that; keep Convex registrations thin).

**Tech Stack:** Convex (serverless backend), React 19 + TypeScript + Vite, shadcn/ui + Tailwind 4, `sonner` toasts, vitest + (pure-fn) unit tests, `@testing-library/react` + jsdom for render smoke tests.

## Global Constraints

- **Manager+admin only.** Every new backend fn is `protectedMutation`/`protectedQuery` with `roles: ["manager","admin"]`; every new button is gated `isManagerOrAdmin` in the UI. (Pitfall #19: all touched CRM routes resolve to `canAccessCrm` = manager+admin; order surfaces use a mutation-on-click, not a query-on-mount, so non-manager mounts don't crash.)
- **No credit-math / ledger / deferred-revenue change.** Only additive seams. The one schema change is `subscriptionWeeks.reconcileNote: v.optional(v.string())`.
- **Integer IDR** everywhere; never re-key a money total client-side — delta computed server-side (CRM C10).
- **Dual-surface rule (Pitfall #20):** any order-level affordance lands in BOTH `src/components/orders/OrderSlideOver.tsx` AND `src/pages/OrderDetail.tsx`.
- **Read-only subscription orders stay read-only** — only add scoped actions inside the existing lock block; never re-enable generic edit/cancel.
- **Testing convention:** the existing 52 subscription tests are pure-function tests (no `convexTest`). Follow it: TDD the extracted pure helpers; verify thin Convex wrappers via type-check + build + manual UAT. Frontend gets render smoke tests only where a concrete behavior is assertable (compulsory-comment gating).
- **Bundle:** no new heavy deps; vendor caps untouched.

---

## Task List

| ID | Title | Files touched | Wave | Depends-on |
|----|-------|---------------|------|------------|
| T1 | `markSubscriptionDelivered` mutation + deliverable-status guard | `convex/subscriptions/delivery.ts` (new), `__tests__/delivery.test.ts` (new) | 1 | — |
| T2 | `reconcileNote` schema field + required arg on `reconcileWeek` | `convex/schema.ts`, `convex/subscriptions/reconcile.ts`, `__tests__/reconcileNote.test.ts` (new) | 1 | — |
| T3 | `amendConfirmedWeek` mutation + `computeTopupDelta` pure helper | `convex/subscriptions/amend.ts` (new), `__tests__/amend.test.ts` (new) | 1 | — |
| T4 | `getOrderCreditStatus` query + `isOverCredit` pure helper | `convex/subscriptions/queries.ts`, `__tests__/overCredit.test.ts` (new) | 1 | — |
| T1–T4 gate | Run `npx convex codegen` once on merged tree (regenerates `api.d.ts`) | `convex/_generated/api.d.ts` | 1→2 barrier | T1,T2,T3,T4 |
| T5 | "Mark delivered" button + confirm dialog — BOTH order surfaces | `src/components/orders/OrderSlideOver.tsx`, `src/pages/OrderDetail.tsx` | 2 | T1 |
| T6 | Reconcile button + compulsory-comment dialog | `src/components/crm/ReconcileWeekDialog.tsx` (new), `src/pages/crm/SubscriptionWeeklyInvoicePage.tsx`, `ReconcileWeekDialog.test.tsx` (new) | 2 | T2 |
| T7 | "Amend week" mode (re-open confirmed week → server delta → top-up invoice) | `src/pages/crm/SubscriptionSchedulePage.tsx` | 2 | T3 |
| T8 | Out-of-credit flag + split / apply-credit buttons — BOTH order surfaces | `src/components/orders/OrderSlideOver.tsx`, `src/pages/OrderDetail.tsx` | 2 | T4, **T5 (shared files)** |
| T9 | Verification: code-auditor, build, full test, docs, UAT checklist | `docs/SCHEMA.md`, `docs/API_REFERENCE.md`, `docs/FILE_MAP.md`, `docs/CHANGELOG.md`, `docs/reviews/uat-…` | 3 | T5,T6,T7,T8 |

---

## Execution Strategy — multi-agent, wave-gated

**Wave 1 — Backend (4-wide parallel).** T1–T4 are independent files except: T2 alone touches `convex/schema.ts`, T4 alone touches `convex/subscriptions/queries.ts`, T3 alone may touch `convex/subscriptions/invoicing.ts` (only if `buildTopupInvoice` needs re-export — it is already exported, so likely no). No two Wave-1 tasks write the same file. **Generated-file serialization:** every Wave-1 task regenerates `convex/_generated/api.d.ts`; do NOT merge four diverging `api.d.ts`. Each task runs its own `npx convex codegen` locally to type-check, but the **barrier** re-runs `npx convex codegen` **once on the merged tree** before Wave 2 starts, and that single regenerated `api.d.ts` is the source of truth. (If tasks run in isolated worktrees, discard their `api.d.ts` and regenerate at the barrier.)

**Wave 1→2 barrier:** merge T1–T4, run `npx convex codegen`, run `npm run type-check` — must be green before any Wave-2 task starts (frontend imports the generated `api`).

**Wave 2 — Frontend (3-wide parallel, with one serialized pair).** T6 and T7 are independent (distinct files) and run in parallel with T5. **T5 and T8 both edit `OrderSlideOver.tsx` + `OrderDetail.tsx` → they MUST be serialized: T5 first, then T8 rebases on T5's changes.** Do not run T5 and T8 concurrently. So Wave 2 dispatch = { T5 → T8 } as a chain, alongside { T6 }, { T7 } in parallel.

**Critical path (sets min wall-clock):** T2 → barrier codegen → (frontend) → **T5 → T8** (the serialized order-surface chain) → T9. T5→T8 is the longest Wave-2 chain; T6/T7 finish alongside.

**What can't be done headless (flag "pending", do NOT claim passed):**
- **Manual UAT** of the full operator loop against dev data (deliver → recognize → amend → top-up → reconcile-with-comment → out-of-credit) — requires a running `npx convex dev` + `npm run dev` and a human clicking through. Capture as `docs/reviews/uat-subscription-operate-ui-2026-06-25.md` with the §4/§5/§6 checklist; mark UNTESTED until a human runs it.
- **IMP-4 recognition-timing verification** (see Risk below) — a human must confirm in dev whether surfacing `splitScheduledOrderOnCredit` double-counts/suppresses delivery recognition before relying on Path A in production.

**Close-out runs in the MAIN session (never a background agent):** after T9, run `/triple-review` then `/simplify xhigh`, address findings, re-run `npm run type-check` + `npm run test` + `npm run build`.

### Risk register (carry into plan staffreview + UAT)

- **R1 (IMP-4, financial).** `splitScheduledOrderOnCredit` posts its `drawdown` at split time; recognition idempotency keys on `creditLedger.by_order`, so a split order's later `markSubscriptionDelivered` recognition is **suppressed** (revenue recognized at split, not delivery). The code marks this "dormant, reconcile in Phase D/E." This plan **surfaces** the path but does **not** fix the timing. T8 must label the Path-A button with a clear caveat and T9's UAT must verify recognition timing on a split order. If the plan staffreview deems this unacceptable to ship, **defer Path A (split)** and ship only the over-credit flag (read-only) + Path B (ad-hoc deposit) + everything else.
- **R2.** `markSubscriptionDelivered` transitions an order straight to `AwaitingDelivery`, intentionally bypassing the generic `moveForward` stock/production side-effects (subscription orders are credit-funded; `confirmWeek` already created production records via `insertOrderWithItems`). UAT must confirm no stock/production regression for delivered subscription orders.
- **R3.** Amend updates `plannedDays` and creates an **unpaid** top-up invoice; it does **not** regenerate per-day orders for the added qty (consistent with the existing topup model — `createTopupInvoice` never makes orders). Operators settle the top-up via the existing "Mark paid" flow. Incremental order generation for amended qty is explicitly deferred.

---

## File Structure

**New backend files**
- `convex/subscriptions/delivery.ts` — `markSubscriptionDelivered` mutation + `isDeliverableSubscriptionStatus` pure helper.
- `convex/subscriptions/amend.ts` — `amendConfirmedWeek` mutation + `computeTopupDelta` pure helper.

**Modified backend files**
- `convex/schema.ts` — add `subscriptionWeeks.reconcileNote: v.optional(v.string())`.
- `convex/subscriptions/reconcile.ts` — add required `reconcileNote` arg, persist it, non-empty guard.
- `convex/subscriptions/queries.ts` — add `getOrderCreditStatus` query + `isOverCredit` pure helper (export the helper for tests).

**New frontend files**
- `src/components/crm/ReconcileWeekDialog.tsx` — fault selector + compulsory comment (modeled on `VoidReasonDialog`).

**Modified frontend files**
- `src/components/orders/OrderSlideOver.tsx` + `src/pages/OrderDetail.tsx` — Mark-delivered (T5) and out-of-credit (T8) scoped actions inside the existing subscription lock block.
- `src/pages/crm/SubscriptionWeeklyInvoicePage.tsx` — Reconcile entry point.
- `src/pages/crm/SubscriptionSchedulePage.tsx` — Amend-week mode.

**New test files**
- `convex/subscriptions/__tests__/delivery.test.ts`, `…/reconcileNote.test.ts`, `…/amend.test.ts`, `…/overCredit.test.ts`
- `src/components/crm/ReconcileWeekDialog.test.tsx`

---

## Task Details

### Task 1: `markSubscriptionDelivered` mutation + deliverable-status guard

**Files:**
- Create: `convex/subscriptions/delivery.ts`
- Test: `convex/subscriptions/__tests__/delivery.test.ts`

**Interfaces:**
- Consumes: `recognizeSubscriptionDelivery(ctx, orderId, createdBy?)` from `convex/subscriptions/recognition.ts`; `protectedMutation` from `convex/lib/functions`.
- Produces: `export function isDeliverableSubscriptionStatus(status: string): boolean`; `export const markSubscriptionDelivered` (mutation, args `{ orderId: Id<"orders"> }`, returns `{ orderId: Id<"orders">; recognized: boolean }`).

- [ ] **Step 1: Write the failing test** (pure helper — the repo's testable unit)

```ts
// convex/subscriptions/__tests__/delivery.test.ts
import { describe, it, expect } from "vitest";
import { isDeliverableSubscriptionStatus } from "../delivery";

describe("isDeliverableSubscriptionStatus", () => {
  it("allows funded/in-progress statuses", () => {
    expect(isDeliverableSubscriptionStatus("PaymentReceived")).toBe(true);
    expect(isDeliverableSubscriptionStatus("BeingPrepared")).toBe(true);
    expect(isDeliverableSubscriptionStatus("AwaitingDelivery")).toBe(true); // re-press safe
  });
  it("rejects not-yet-funded and terminal statuses", () => {
    expect(isDeliverableSubscriptionStatus("Draft")).toBe(false);
    expect(isDeliverableSubscriptionStatus("AwaitingPayment")).toBe(false);
    expect(isDeliverableSubscriptionStatus("Complete")).toBe(false);
    expect(isDeliverableSubscriptionStatus("Cancelled")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run convex/subscriptions/__tests__/delivery.test.ts`
Expected: FAIL — `isDeliverableSubscriptionStatus` not exported / module missing.

- [ ] **Step 3: Write the implementation**

```ts
// convex/subscriptions/delivery.ts
import { v, ConvexError } from "convex/values";
import { protectedMutation } from "../lib/functions";
import { recognizeSubscriptionDelivery } from "./recognition";

/**
 * A subscription order is "deliverable" (recognizable) once it is funded and not
 * terminal. AwaitingDelivery is included so re-press is safe — recognition itself
 * is idempotent (creditLedger.by_order).
 */
export function isDeliverableSubscriptionStatus(status: string): boolean {
  return (
    status === "PaymentReceived" ||
    status === "BeingPrepared" ||
    status === "AwaitingDelivery"
  );
}

/**
 * Scoped "Mark delivered" action for subscription orders (order surfaces are
 * otherwise read-only). Transitions the order to AwaitingDelivery and recognizes
 * the sale via the existing helper. Manager+admin; idempotent (re-press = no-op).
 *
 * NOTE (R2): intentionally bypasses generic moveForward stock/production side
 * effects — subscription orders are credit-funded and production rows were created
 * at confirmWeek. recognizeSubscriptionDelivery posts the drawdown + B2B revenue.
 */
export const markSubscriptionDelivered = protectedMutation({
  roles: ["manager", "admin"],
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new ConvexError("Order not found");
    if (!order.subscriptionId) {
      throw new ConvexError("Not a subscription order");
    }
    if (!isDeliverableSubscriptionStatus(order.status)) {
      throw new ConvexError(
        `Order status is ${order.status}; only a funded subscription order can be marked delivered`,
      );
    }
    if (order.status !== "AwaitingDelivery") {
      await ctx.db.patch(order._id, { status: "AwaitingDelivery" });
    }
    // Idempotent: returns early if a ledger entry already exists for this order.
    await recognizeSubscriptionDelivery(ctx, order._id, ctx.user._id);
    const recognized = Boolean(
      await ctx.db
        .query("creditLedger")
        .withIndex("by_order", (q) => q.eq("orderId", order._id))
        .first(),
    );
    return { orderId: order._id, recognized };
  },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run convex/subscriptions/__tests__/delivery.test.ts`
Expected: PASS.

- [ ] **Step 5: Codegen + type-check**

Run: `npx convex codegen && npm run type-check`
Expected: `api.subscriptions.delivery.markSubscriptionDelivered` exists; no type errors.

- [ ] **Step 6: Commit**

```bash
git add convex/subscriptions/delivery.ts convex/subscriptions/__tests__/delivery.test.ts convex/_generated
git commit -m "feat(subscriptions): markSubscriptionDelivered mutation (T1)"
```

---

### Task 2: `reconcileNote` schema field + required arg on `reconcileWeek`

**Files:**
- Modify: `convex/schema.ts` (subscriptionWeeks table)
- Modify: `convex/subscriptions/reconcile.ts` (`reconcileWeek` args + patch)
- Test: `convex/subscriptions/__tests__/reconcileNote.test.ts`

**Interfaces:**
- Produces: `reconcileWeek` gains required `reconcileNote: v.string()`; persists `subscriptionWeeks.reconcileNote`. Export a pure guard `export function assertReconcileNote(note: string): string` (trims, throws on empty) for the unit test and reuse it in the handler.

- [ ] **Step 1: Grep for existing callers (must be none beyond UI we add)**

Run: `git grep -n "reconcileWeek" -- convex/ src/`
Expected: only the definition in `convex/subscriptions/reconcile.ts` (no crons / no other backend callers). If any caller exists, update it to pass `reconcileNote` in this task.

- [ ] **Step 2: Write the failing test**

```ts
// convex/subscriptions/__tests__/reconcileNote.test.ts
import { describe, it, expect } from "vitest";
import { assertReconcileNote } from "../reconcile";

describe("assertReconcileNote", () => {
  it("returns the trimmed note when non-empty", () => {
    expect(assertReconcileNote("  cafe undercounted 2 boxes ")).toBe("cafe undercounted 2 boxes");
  });
  it("throws on empty / whitespace-only", () => {
    expect(() => assertReconcileNote("")).toThrow();
    expect(() => assertReconcileNote("   ")).toThrow();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run convex/subscriptions/__tests__/reconcileNote.test.ts`
Expected: FAIL — `assertReconcileNote` not exported.

- [ ] **Step 4: Add the schema field**

In `convex/schema.ts`, inside the `subscriptionWeeks` table definition, alongside `refundStatus: v.optional(v.string())`, add:

```ts
    reconcileNote: v.optional(v.string()),
```

- [ ] **Step 5: Add the arg + guard + persist in `reconcile.ts`**

In `convex/subscriptions/reconcile.ts`, add near the top (after imports):

```ts
/** Reconcile requires an operator comment. Trims and rejects empty. */
export function assertReconcileNote(note: string): string {
  const trimmed = note.trim();
  if (!trimmed) throw new ConvexError("A reconcile comment is required");
  return trimmed;
}
```

Add `reconcileNote: v.string()` to the `reconcileWeek` args object. At the start of the handler, add:

```ts
    const note = assertReconcileNote(args.reconcileNote);
```

In the existing `ctx.db.patch(week._id, { … })` (the status/shortfall/refund patch), add:

```ts
      reconcileNote: note,
```

Ensure `ConvexError` is imported in `reconcile.ts` (it is used by the existing rejects; confirm the import line includes it).

- [ ] **Step 6: Run test + codegen + type-check**

Run: `npx vitest run convex/subscriptions/__tests__/reconcileNote.test.ts && npx convex codegen && npm run type-check`
Expected: PASS; `reconcileWeek` now requires `reconcileNote`; no type errors.

- [ ] **Step 7: Commit**

```bash
git add convex/schema.ts convex/subscriptions/reconcile.ts convex/subscriptions/__tests__/reconcileNote.test.ts convex/_generated
git commit -m "feat(subscriptions): required reconcileNote on reconcileWeek + schema field (T2)"
```

---

### Task 3: `amendConfirmedWeek` mutation + `computeTopupDelta` pure helper

**Files:**
- Create: `convex/subscriptions/amend.ts`
- Test: `convex/subscriptions/__tests__/amend.test.ts`

**Interfaces:**
- Consumes: `buildTopupInvoice(ctx, { subscriptionWeekId, items, generatedBy })` from `convex/subscriptions/invoicing.ts` (already exported — used by `outOfCredit.ts`); `computeLineTotal` from `convex/subscriptions/creditMath.ts`; `protectedMutation` from `convex/lib/functions`.
- Produces: `export function computeTopupDelta(args): { addedLines: TopupLine[]; deltaTotal: number }` where `TopupLine = { productName: string; qty: number; unitPrice: number; lineTotal: number }`; `export const amendConfirmedWeek` (mutation, args `{ subscriptionWeekId: Id<"subscriptionWeeks">; days: Array<{ date: number; items: Array<{ menuProductId: Id<"menuProducts">; qty: number }> }> }`, returns `{ topupInvoiceId: Id<"invoices"> | null; deltaTotal: number; addedLines: TopupLine[] }`).

- [ ] **Step 1: Write the failing test** (pure delta math — the money-critical, testable unit)

```ts
// convex/subscriptions/__tests__/amend.test.ts
import { describe, it, expect } from "vitest";
import { computeTopupDelta } from "../amend";

const NAMES = { p1: "Original 80g", p2: "Bite 45g" };
const PRICE = 10_000;

describe("computeTopupDelta — server-side delta, integer IDR", () => {
  it("bills only the positive per-product increase", () => {
    const r = computeTopupDelta({
      currentQtyByProduct: { p1: 3, p2: 2 },
      newQtyByProduct: { p1: 5, p2: 2 }, // +2 of p1
      unitPrice: PRICE,
      productNameByProduct: NAMES,
    });
    expect(r.deltaTotal).toBe(20_000);
    expect(r.addedLines).toEqual([{ productName: "Original 80g", qty: 2, unitPrice: PRICE, lineTotal: 20_000 }]);
  });
  it("ignores decreases (v1 supports increases only)", () => {
    const r = computeTopupDelta({
      currentQtyByProduct: { p1: 5 },
      newQtyByProduct: { p1: 3 },
      unitPrice: PRICE,
      productNameByProduct: NAMES,
    });
    expect(r.deltaTotal).toBe(0);
    expect(r.addedLines).toEqual([]);
  });
  it("handles a brand-new product line in the amendment", () => {
    const r = computeTopupDelta({
      currentQtyByProduct: { p1: 1 },
      newQtyByProduct: { p1: 1, p2: 4 },
      unitPrice: PRICE,
      productNameByProduct: NAMES,
    });
    expect(r.deltaTotal).toBe(40_000);
    expect(r.addedLines).toEqual([{ productName: "Bite 45g", qty: 4, unitPrice: PRICE, lineTotal: 40_000 }]);
  });
  it("sums multiple increases", () => {
    const r = computeTopupDelta({
      currentQtyByProduct: { p1: 1, p2: 1 },
      newQtyByProduct: { p1: 3, p2: 4 },
      unitPrice: PRICE,
      productNameByProduct: NAMES,
    });
    expect(r.deltaTotal).toBe(50_000); // (+2 + +3) * 10_000
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run convex/subscriptions/__tests__/amend.test.ts`
Expected: FAIL — module/function missing.

- [ ] **Step 3: Write the implementation**

```ts
// convex/subscriptions/amend.ts
import { v, ConvexError } from "convex/values";
import { protectedMutation } from "../lib/functions";
import { buildTopupInvoice } from "./invoicing";
import { computeLineTotal } from "./creditMath";

export type TopupLine = { productName: string; qty: number; unitPrice: number; lineTotal: number };

/**
 * Pure server-side delta: per-product positive increase between the funded plan
 * and the amended plan, priced at unitPrice. Decreases are ignored (v1 increases
 * only). Integer IDR. C10: money math lives here, unit-tested.
 */
export function computeTopupDelta(args: {
  currentQtyByProduct: Record<string, number>;
  newQtyByProduct: Record<string, number>;
  unitPrice: number;
  productNameByProduct: Record<string, string>;
}): { addedLines: TopupLine[]; deltaTotal: number } {
  const { currentQtyByProduct, newQtyByProduct, unitPrice, productNameByProduct } = args;
  const addedLines: TopupLine[] = [];
  let deltaTotal = 0;
  for (const productId of Object.keys(newQtyByProduct)) {
    const inc = (newQtyByProduct[productId] ?? 0) - (currentQtyByProduct[productId] ?? 0);
    if (inc > 0) {
      const lineTotal = computeLineTotal(inc, unitPrice);
      addedLines.push({
        productName: productNameByProduct[productId] ?? "Unknown product",
        qty: inc,
        unitPrice,
        lineTotal,
      });
      deltaTotal += lineTotal;
    }
  }
  return { addedLines, deltaTotal };
}

/**
 * Amend a confirmed/invoiced/paid week: re-price the plan, persist plannedDays,
 * and bill the positive delta as an UNPAID subscription_topup invoice (settled
 * later via the existing markTopupInvoicePaid flow). Does NOT regenerate per-day
 * orders for the added qty (R3 — consistent with the existing topup model).
 */
export const amendConfirmedWeek = protectedMutation({
  roles: ["manager", "admin"],
  args: {
    subscriptionWeekId: v.id("subscriptionWeeks"),
    days: v.array(
      v.object({
        date: v.number(),
        items: v.array(v.object({ menuProductId: v.id("menuProducts"), qty: v.number() })),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const week = await ctx.db.get(args.subscriptionWeekId);
    if (!week) throw new ConvexError("Subscription week not found");
    if (!["confirmed", "invoiced", "paid", "delivering"].includes(week.status)) {
      throw new ConvexError(
        `Week status is ${week.status}; only a confirmed/invoiced/paid/delivering week can be amended ` +
          `(use the normal Save Plan for a planned week)`,
      );
    }
    const subscription = await ctx.db.get(week.subscriptionId);
    if (!subscription) throw new ConvexError("Subscription not found");
    const unitPrice = subscription.unitPrice;

    // Resolve product names for every menuProductId in the amendment.
    const productNameByProduct: Record<string, string> = {};
    for (const day of args.days) {
      for (const it of day.items) {
        if (!productNameByProduct[it.menuProductId]) {
          const mp = await ctx.db.get(it.menuProductId);
          if (!mp) throw new ConvexError(`Menu product ${it.menuProductId} not found`);
          productNameByProduct[it.menuProductId] = mp.name;
        }
      }
    }

    // Aggregate current (funded) vs new qty per product.
    const currentQtyByProduct: Record<string, number> = {};
    for (const day of week.plannedDays) {
      for (const it of day.items) {
        currentQtyByProduct[it.menuProductId] = (currentQtyByProduct[it.menuProductId] ?? 0) + it.qty;
      }
    }
    const newQtyByProduct: Record<string, number> = {};
    for (const day of args.days) {
      for (const it of day.items) {
        newQtyByProduct[it.menuProductId] = (newQtyByProduct[it.menuProductId] ?? 0) + it.qty;
      }
    }

    const { addedLines, deltaTotal } = computeTopupDelta({
      currentQtyByProduct,
      newQtyByProduct,
      unitPrice,
      productNameByProduct,
    });
    if (deltaTotal <= 0) {
      throw new ConvexError("Amend supports increases only — the amended plan does not add quantity");
    }

    // Re-price + persist the amended plannedDays (mirrors saveWeekPlan pricing).
    const plannedDays = args.days
      .map((day) => ({
        date: day.date,
        deliverByTime: week.plannedDays.find((d) => d.date === day.date)?.deliverByTime ?? "17:00",
        locked: true,
        items: day.items.map((it) => ({
          menuProductId: it.menuProductId,
          productName: productNameByProduct[it.menuProductId],
          qty: it.qty,
          unitPrice,
          lineTotal: computeLineTotal(it.qty, unitPrice),
        })),
      }))
      .filter((d) => d.items.length > 0)
      .sort((a, b) => a.date - b.date);
    await ctx.db.patch(week._id, { plannedDays });

    // Bill the delta as an unpaid top-up invoice (settled via markTopupInvoicePaid).
    const topupInvoiceId = await buildTopupInvoice(ctx, {
      subscriptionWeekId: week._id,
      items: addedLines,
      generatedBy: ctx.user._id,
    });

    return { topupInvoiceId, deltaTotal, addedLines };
  },
});
```

> **Verify-first (from plan staffreview):** confirm `buildTopupInvoice`'s exact param names (`subscriptionWeekId`, `items`, `generatedBy`) against `convex/subscriptions/invoicing.ts:230`; confirm `computeLineTotal(qty, unitPrice)` signature in `creditMath.ts`; confirm `subscription.unitPrice` and `menuProducts.name` field names. Adjust if drifted.

- [ ] **Step 4: Run test + codegen + type-check**

Run: `npx vitest run convex/subscriptions/__tests__/amend.test.ts && npx convex codegen && npm run type-check`
Expected: PASS; `api.subscriptions.amend.amendConfirmedWeek` exists.

- [ ] **Step 5: Commit**

```bash
git add convex/subscriptions/amend.ts convex/subscriptions/__tests__/amend.test.ts convex/_generated
git commit -m "feat(subscriptions): amendConfirmedWeek + computeTopupDelta (T3)"
```

---

### Task 4: `getOrderCreditStatus` query + `isOverCredit` pure helper

**Files:**
- Modify: `convex/subscriptions/queries.ts`
- Test: `convex/subscriptions/__tests__/overCredit.test.ts`

**Interfaces:**
- Consumes: `protectedQuery` from `convex/lib/functions`.
- Produces: `export function isOverCredit(orderFinalTotal: number, creditRemaining: number): boolean`; `export const getOrderCreditStatus` (query, args `{ orderId: Id<"orders"> }`, returns `{ kind: "scheduled" | "adhoc" | "none"; isOverCredit: boolean; creditRemaining: number | null; orderTotal: number; subscriptionWeekId: Id<"subscriptionWeeks"> | null; canSplit: boolean; canApplyCredit: boolean }`).

The two backend mutations both require `order.subscriptionId && order.subscriptionWeekId` and read `week.creditRemaining`. Mirror exactly: `canSplit` = scheduled subscription order, single active item, `finalTotal > creditRemaining`; `canApplyCredit` = subscription order at `AwaitingPayment`, `creditRemaining > 0`.

- [ ] **Step 1: Write the failing test**

```ts
// convex/subscriptions/__tests__/overCredit.test.ts
import { describe, it, expect } from "vitest";
import { isOverCredit } from "../queries";

describe("isOverCredit", () => {
  it("true when the order total exceeds remaining credit", () => {
    expect(isOverCredit(50_000, 30_000)).toBe(true);
  });
  it("false when credit covers the order exactly or more", () => {
    expect(isOverCredit(30_000, 30_000)).toBe(false);
    expect(isOverCredit(20_000, 30_000)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run convex/subscriptions/__tests__/overCredit.test.ts`
Expected: FAIL — `isOverCredit` not exported.

- [ ] **Step 3: Add the helper + query to `queries.ts`**

```ts
// add to convex/subscriptions/queries.ts
export function isOverCredit(orderFinalTotal: number, creditRemaining: number): boolean {
  return orderFinalTotal > creditRemaining;
}

export const getOrderCreditStatus = protectedQuery({
  roles: ["manager", "admin"],
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    const none = {
      kind: "none" as const,
      isOverCredit: false,
      creditRemaining: null as number | null,
      orderTotal: 0,
      subscriptionWeekId: null as Id<"subscriptionWeeks"> | null,
      canSplit: false,
      canApplyCredit: false,
    };
    if (!order || !order.subscriptionId || !order.subscriptionWeekId) return none;
    const week = await ctx.db.get(order.subscriptionWeekId);
    if (!week) return none;

    const creditRemaining = week.creditRemaining;
    const orderTotal = order.finalTotal;
    const over = isOverCredit(orderTotal, creditRemaining);

    const activeItems = (
      await ctx.db
        .query("orderItems")
        .withIndex("by_order", (q) => q.eq("orderId", order._id))
        .collect()
    ).filter((it) => !it.isCancelled);

    // Path A (split): a single-item scheduled order over remaining credit.
    const canSplit = over && activeItems.length === 1 && creditRemaining >= 0;
    // Path B (apply credit): an AwaitingPayment subscription order with some credit left.
    const canApplyCredit = order.status === "AwaitingPayment" && creditRemaining > 0 && order.paymentStatus !== "Paid";

    return {
      kind: (canApplyCredit ? "adhoc" : "scheduled") as "scheduled" | "adhoc",
      isOverCredit: over,
      creditRemaining,
      orderTotal,
      subscriptionWeekId: order.subscriptionWeekId,
      canSplit,
      canApplyCredit,
    };
  },
});
```

> **Verify-first:** confirm `v`, `Id`, and `protectedQuery` are already imported in `queries.ts` (getWeekPool uses them); add any missing import. Confirm `orderItems.by_order` index name and `isCancelled` field.

- [ ] **Step 4: Run test + codegen + type-check**

Run: `npx vitest run convex/subscriptions/__tests__/overCredit.test.ts && npx convex codegen && npm run type-check`
Expected: PASS; `api.subscriptions.queries.getOrderCreditStatus` exists.

- [ ] **Step 5: Commit**

```bash
git add convex/subscriptions/queries.ts convex/subscriptions/__tests__/overCredit.test.ts convex/_generated
git commit -m "feat(subscriptions): getOrderCreditStatus + isOverCredit (T4)"
```

---

### ⟦ Wave 1→2 barrier ⟧

- [ ] Merge T1–T4. Run `npx convex codegen` once on the merged tree. Run `npm run type-check` + `npx vitest run convex/subscriptions` — all green before Wave 2. Commit the single regenerated `convex/_generated/api.d.ts` if changed.

---

### Task 5: "Mark delivered" button + confirm dialog — BOTH order surfaces

**Files:**
- Modify: `src/components/orders/OrderSlideOver.tsx` (subscription lock block ~lines 578–607)
- Modify: `src/pages/OrderDetail.tsx` (subscription lock block ~lines 326–357)

**Interfaces:**
- Consumes: `api.subscriptions.delivery.markSubscriptionDelivered` (from T1); `isManagerOrAdmin` (already in both files); `useSessionMutation`, `toast` (sonner), `getErrorMessage` (`src/lib/utils`).

The action is a confirm-then-call button placed INSIDE the existing subscription lock block (keeps the order read-only otherwise). Shown only when `isManagerOrAdmin && isDeliverableSubscriptionStatus(order.status)`.

- [ ] **Step 1: Add to `OrderSlideOver.tsx`** — inside the `isSubscriptionOrder` branch, above the "Open in scheduler" button:

```tsx
{isManagerOrAdmin &&
  ['PaymentReceived', 'BeingPrepared', 'AwaitingDelivery'].includes(order.status) && (
    <Button
      variant="outline"
      size="sm"
      className="w-full text-green-700 border-green-300 hover:bg-green-50 hover:text-green-800"
      disabled={marketingDelivered}
      onClick={async () => {
        setMarkingDelivered(true);
        try {
          await markDelivered({ orderId: orderId! });
          toast.success('Delivery recognized — sale posted.');
        } catch (err) {
          toast.error(getErrorMessage(err, 'Failed to mark delivered'));
        } finally {
          setMarkingDelivered(false);
        }
      }}
    >
      <CheckCircle2 className="h-4 w-4 mr-2" />
      {markingDelivered ? 'Recognizing…' : 'Mark delivered'}
    </Button>
  )}
```

Add near the other hooks: `const markDelivered = useSessionMutation(api.subscriptions.delivery.markSubscriptionDelivered);` and `const [markingDelivered, setMarkingDelivered] = useState(false);` (rename the typo'd flag in the snippet to `markingDelivered`). Ensure `CheckCircle2` is imported from `lucide-react` (it is used elsewhere; confirm).

- [ ] **Step 2: Mirror the identical action into `OrderDetail.tsx`** inside its `isSubscriptionOrder` branch, above its "Open in scheduler" button. Note `OrderDetail` uses `useOrder(orderId)` and `order.status`; the mutation call is the same `markDelivered({ orderId })`. Add the same hook + state.

- [ ] **Step 3: Type-check + build**

Run: `npm run type-check && npm run build`
Expected: green.

- [ ] **Step 4: Manual smoke (note in UAT doc; cannot assert headless)** — open a `PaymentReceived` subscription order in BOTH surfaces, confirm the button appears for manager, fires once, and re-press toasts success with no second drawdown.

- [ ] **Step 5: Commit**

```bash
git add src/components/orders/OrderSlideOver.tsx src/pages/OrderDetail.tsx
git commit -m "feat(orders): scoped Mark-delivered action on both order surfaces (T5)"
```

---

### Task 6: Reconcile button + compulsory-comment dialog

**Files:**
- Create: `src/components/crm/ReconcileWeekDialog.tsx`
- Test: `src/components/crm/ReconcileWeekDialog.test.tsx`
- Modify: `src/pages/crm/SubscriptionWeeklyInvoicePage.tsx`

**Interfaces:**
- Consumes: `api.subscriptions.reconcile.reconcileWeek` (from T2, now requires `reconcileNote`); `Dialog`, `Textarea`, `Label`, `Button`, `Select` (shadcn) — model the required-text gate on `src/components/shared/VoidReasonDialog.tsx`.
- Produces: `<ReconcileWeekDialog subscriptionWeekId open onOpenChange onReconciled? />`.

- [ ] **Step 1: Write the failing render smoke test** (compulsory-comment gate — the assertable behavior)

```tsx
// src/components/crm/ReconcileWeekDialog.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReconcileWeekDialog } from "./ReconcileWeekDialog";

// Stub the session mutation hook so the dialog renders without a Convex provider.
vi.mock("convex-helpers/react/sessions", () => ({ useSessionMutation: () => vi.fn() }));

describe("ReconcileWeekDialog", () => {
  it("disables Reconcile until a comment is entered", async () => {
    render(
      <ReconcileWeekDialog subscriptionWeekId={"w1" as never} open onOpenChange={() => {}} />,
    );
    const submit = screen.getByRole("button", { name: /reconcile/i });
    expect(submit).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/comment/i), "cafe undercount");
    expect(submit).toBeEnabled();
  });
});
```

> **Confirmed (plan staffreview):** session hooks import from `convex-helpers/react/sessions` (used by `CrmFundingDashboardPage.tsx:24`). The `vi.mock` target and dialog import both use that path.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/crm/ReconcileWeekDialog.test.tsx`
Expected: FAIL — component missing.

- [ ] **Step 3: Implement `ReconcileWeekDialog.tsx`** (fault selector + required comment, submit disabled until non-empty; shows the mutation's outcome on success):

```tsx
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useSessionMutation } from "convex-helpers/react/sessions";
import { api } from "../../../convex/_generated/api";
import { getErrorMessage } from "@/lib/utils";
import type { Id } from "../../../convex/_generated/dataModel";

type Fault = "none" | "cafe" | "frollie";

export function ReconcileWeekDialog({
  subscriptionWeekId,
  open,
  onOpenChange,
  onReconciled,
}: {
  subscriptionWeekId: Id<"subscriptionWeeks">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReconciled?: () => void;
}) {
  const reconcile = useSessionMutation(api.subscriptions.reconcile.reconcileWeek);
  const [fault, setFault] = useState<Fault>("none");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!note.trim() || submitting) return;
    setSubmitting(true);
    try {
      const r = await reconcile({ subscriptionWeekId, shortfallFault: fault, reconcileNote: note.trim() });
      toast.success(
        `Week reconciled — carried ${r.carried.length}, expired ${r.expired.length}` +
          (r.refundDue > 0 ? `, refund due ${r.refundDue.toLocaleString("id-ID")} IDR` : ""),
      );
      setNote("");
      onReconciled?.();
      onOpenChange(false);
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to reconcile week"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reconcile week</DialogTitle>
          <DialogDescription>
            Close the week: roll over / expire remaining credit and record any shortfall fault. A comment is required.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="fault">Shortfall fault</Label>
            <Select value={fault} onValueChange={(v) => setFault(v as Fault)}>
              <SelectTrigger id="fault"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None — credit rolls over</SelectItem>
                <SelectItem value="cafe">Cafe fault — expire (recognize as revenue)</SelectItem>
                <SelectItem value="frollie">Frollie fault — refund due</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reconcileNote">Comment (required)</Label>
            <Textarea
              id="reconcileNote"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Why is this week being reconciled this way?"
              rows={3}
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={!note.trim() || submitting}>
              {submitting ? "Reconciling…" : "Reconcile"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Wire it into `SubscriptionWeeklyInvoicePage.tsx`** — add a "Reconcile" button in the action area, shown when `week.status` is post-payment and not yet reconciled (`['paid','delivering'].includes(week.status)`), opening the dialog:

```tsx
// state
const [showReconcile, setShowReconcile] = useState(false);
// in the actions area:
{['paid', 'delivering'].includes(week.status) && (
  <Button variant="outline" size="sm" onClick={() => setShowReconcile(true)}>
    <RefreshCw className="h-4 w-4 mr-1.5" /> Reconcile week
  </Button>
)}
{week && (
  <ReconcileWeekDialog
    subscriptionWeekId={week._id}
    open={showReconcile}
    onOpenChange={setShowReconcile}
  />
)}
```

> **Verify-first:** confirm the week-status values available on this page (`paid`/`delivering`/`reconciled`) and that `week._id` is in scope. If the invoice page only exposes the invoice (not the week doc), read `week.status` from the `getPlanningWeek` query already used on the page.

- [ ] **Step 5: Run test + type-check + build**

Run: `npx vitest run src/components/crm/ReconcileWeekDialog.test.tsx && npm run type-check && npm run build`
Expected: PASS / green.

- [ ] **Step 6: Commit**

```bash
git add src/components/crm/ReconcileWeekDialog.tsx src/components/crm/ReconcileWeekDialog.test.tsx src/pages/crm/SubscriptionWeeklyInvoicePage.tsx
git commit -m "feat(crm): Reconcile-week dialog with compulsory comment (T6)"
```

---

### Task 7: "Amend week" mode on `SubscriptionSchedulePage`

**Files:**
- Modify: `src/pages/crm/SubscriptionSchedulePage.tsx`

**Interfaces:**
- Consumes: `api.subscriptions.amend.amendConfirmedWeek` (from T3). Reuses the page's existing `LocalWeekPlan → days` conversion (the same `{ date, items: [{ menuProductId, qty }] }` payload `saveWeekPlan` sends).

The page is read-only when `week.status !== "planned"` (`isLocked`). Add an "Amend week" toggle for amendable statuses that overrides the lock locally, and a "Save amendments" action that calls `amendConfirmedWeek` and reports the delta/top-up.

- [ ] **Step 1: Add amend state + derived editability**

```tsx
const [amending, setAmending] = useState(false);
const amendWeek = useSessionMutation(api.subscriptions.amend.amendConfirmedWeek);
const amendable = week !== null && ['confirmed', 'invoiced', 'paid', 'delivering'].includes(week.status);
// editable when a planned week (existing) OR operator opted into amend mode:
const gridLocked = isLocked && !amending;
```

Change the grid's `locked={isLocked}` to `locked={gridLocked}`.

- [ ] **Step 2: Add the Amend toggle + Save-amendments button to the action bar**

```tsx
{amendable && !amending && (
  <Button variant="outline" size="sm" onClick={() => setAmending(true)}>
    <Pencil className="h-4 w-4 mr-1.5" /> Amend week
  </Button>
)}
{amending && (
  <Button
    size="sm"
    onClick={async () => {
      const days = plan
        .map((lines, i) => ({
          date: weekStartMs + i * DAY_MS,
          items: lines.map((l) => ({ menuProductId: l.menuProductId, qty: l.qty })),
        }))
        .filter((d) => d.items.length > 0);
      try {
        const r = await amendWeek({ subscriptionWeekId: weekId, days });
        toast.success(
          `Amended — top-up invoice for ${r.deltaTotal.toLocaleString('id-ID')} IDR created. Mark it paid to fund the credit.`,
        );
        setAmending(false);
      } catch (err) {
        toast.error(getErrorMessage(err, 'Failed to amend week'));
      }
    }}
  >
    Save amendments → bill top-up
  </Button>
)}
{amending && (
  <Button variant="ghost" size="sm" onClick={() => setAmending(false)}>Cancel amend</Button>
)}
```

> **Verify-first:** confirm `plan`, `weekStartMs`, `DAY_MS`, `weekId` identifiers exist in this component (the existing `saveWeekPlanMutation` block uses this exact conversion — reuse it). Confirm `Pencil` import from `lucide-react`.

- [ ] **Step 3: Hide the "cannot be edited" notice while amending** — gate the existing locked-notice on `gridLocked` instead of `isLocked`.

- [ ] **Step 4: Type-check + build**

Run: `npm run type-check && npm run build`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add src/pages/crm/SubscriptionSchedulePage.tsx
git commit -m "feat(crm): Amend-week mode → server-side top-up delta (T7)"
```

---

### Task 8: Out-of-credit flag + split / apply-credit buttons — BOTH order surfaces

> **SERIALIZE: starts only after T5 is merged (shares `OrderSlideOver.tsx` + `OrderDetail.tsx`).**

**Files:**
- Modify: `src/components/orders/OrderSlideOver.tsx`, `src/pages/OrderDetail.tsx`

**Interfaces:**
- Consumes: `api.subscriptions.queries.getOrderCreditStatus` (T4); `api.subscriptions.outOfCredit.splitScheduledOrderOnCredit`, `api.subscriptions.outOfCredit.applyPartialCreditToAdHocOrder` (existing). `useSessionQuery`/`useSessionMutation`.

Inside the subscription lock block (below Mark-delivered), subscribe to credit status and render the flag + the applicable button. **R1 caveat:** the split button carries a warning note that recognition posts at split time.

- [ ] **Step 1: Subscribe + render in `OrderSlideOver.tsx`**

```tsx
const creditStatus = useSessionQuery(
  api.subscriptions.queries.getOrderCreditStatus,
  isSubscriptionOrder && orderId ? { orderId } : 'skip',
);
const splitOrder = useSessionMutation(api.subscriptions.outOfCredit.splitScheduledOrderOnCredit);
const applyCredit = useSessionMutation(api.subscriptions.outOfCredit.applyPartialCreditToAdHocOrder);
// …inside the lock block, manager+admin only:
{isManagerOrAdmin && creditStatus && creditStatus.isOverCredit && (
  <div className="rounded-md border border-amber-200 bg-amber-50 p-2 space-y-2 text-xs text-amber-800">
    <p className="font-medium">Over remaining credit
      ({creditStatus.creditRemaining?.toLocaleString('id-ID')} IDR left, order {creditStatus.orderTotal.toLocaleString('id-ID')} IDR).</p>
    {creditStatus.canSplit && (
      <Button size="sm" variant="outline" className="w-full"
        onClick={async () => {
          try { const r = await splitOrder({ orderId: orderId! });
            toast.success(r.topupInvoiceId ? 'Split — covered drawn down, remainder billed as top-up.' : 'Full drawdown posted.');
          } catch (err) { toast.error(getErrorMessage(err, 'Split failed')); }
        }}>
        Split on credit (covered now, remainder → top-up)
      </Button>
    )}
    {creditStatus.canApplyCredit && (
      <Button size="sm" variant="outline" className="w-full"
        onClick={async () => {
          try { const r = await applyCredit({ orderId: orderId! });
            toast.success(`Applied ${r.coveredAmount.toLocaleString('id-ID')} IDR credit; ${r.remainderAmount.toLocaleString('id-ID')} IDR remains to pay.`);
          } catch (err) { toast.error(getErrorMessage(err, 'Apply credit failed')); }
        }}>
        Apply available credit (deposit)
      </Button>
    )}
    {creditStatus.canSplit && (
      <p className="text-[10px] text-amber-700/80">Note: splitting recognizes the covered sale now (at split), not at delivery.</p>
    )}
  </div>
)}
```

- [ ] **Step 2: Mirror identically into `OrderDetail.tsx`** (same hooks, same JSX, adapted to its `Card` layout inside the subscription lock block).

- [ ] **Step 3: Type-check + build**

Run: `npm run type-check && npm run build`
Expected: green.

- [ ] **Step 4: Commit**

```bash
git add src/components/orders/OrderSlideOver.tsx src/pages/OrderDetail.tsx
git commit -m "feat(orders): out-of-credit flag + split/apply-credit on both surfaces (T8)"
```

---

### Task 9: Verification + docs + UAT checklist (Wave 3, sequential, main session)

**Files:** `docs/SCHEMA.md`, `docs/API_REFERENCE.md`, `docs/FILE_MAP.md`, `docs/CHANGELOG.md`, `docs/reviews/uat-subscription-operate-ui-2026-06-25.md`

- [ ] **Step 1: code-auditor pass** — dispatch `code-auditor` over the diff for type safety + pattern compliance (Pitfalls #19, #20; `isProductionUnit` not relevant here).
- [ ] **Step 2: Full gates** — `npm run type-check && npm run lint && npm run test && npm run build`. All must pass; confirm the existing 52 subscription + 60 matchEngine tests still green plus the 4 new pure-fn suites + the dialog smoke test.
- [ ] **Step 3: Docs** —
  - `docs/SCHEMA.md`: add `subscriptionWeeks.reconcileNote`.
  - `docs/API_REFERENCE.md`: `markSubscriptionDelivered`, `amendConfirmedWeek`, `getOrderCreditStatus`, `reconcileWeek` (new required arg).
  - `docs/FILE_MAP.md`: add the subscription operate-UI surfaces row.
  - `docs/CHANGELOG.md`: dated entry (draft below).
- [ ] **Step 4: Write the UAT checklist** (`docs/reviews/uat-subscription-operate-ui-2026-06-25.md`) covering §4 deliver/recognize (incl. re-press no-op, non-manager hidden, both surfaces), §5 amend→top-up + out-of-credit split/apply (incl. **R1 recognition-timing check**), §6 reconcile-with-comment (submit gated, note persisted, closed-week rejected). Mark every item UNTESTED (human runs it against dev).
- [ ] **Step 5: Commit**

```bash
git add docs/
git commit -m "docs(subscriptions): operate UI — SCHEMA/API/FILE_MAP/CHANGELOG + UAT checklist (T9)"
```

---

## Git Workflow
**Branch:** `feature/subscription-operate-ui` (worktree `worktree-feature+subscription-operate-ui`, off synced `main`).
**Checkpoints:** one commit per task (T1–T9); barrier codegen commit between Wave 1 and Wave 2. Squash-merge the PR.

## Implementation Waves
### Wave 1: Backend [PARALLEL ×4, codegen serialized at barrier]
| Agent | Task | Files |
|-------|------|-------|
| convex-backend | T1 markSubscriptionDelivered | `convex/subscriptions/delivery.ts` |
| convex-backend | T2 reconcileNote | `convex/schema.ts`, `convex/subscriptions/reconcile.ts` |
| convex-backend | T3 amendConfirmedWeek | `convex/subscriptions/amend.ts` |
| convex-backend | T4 getOrderCreditStatus | `convex/subscriptions/queries.ts` |
### Wave 2: Frontend [PARALLEL, after Wave 1 barrier; T5→T8 serialized]
| Agent | Task | Files |
|-------|------|-------|
| react-ui-builder | T5 Mark delivered (both surfaces) | `OrderSlideOver.tsx`, `OrderDetail.tsx` |
| react-ui-builder | T6 Reconcile dialog | `ReconcileWeekDialog.tsx`, `SubscriptionWeeklyInvoicePage.tsx` |
| react-ui-builder | T7 Amend-week mode | `SubscriptionSchedulePage.tsx` |
| react-ui-builder | T8 Out-of-credit (both surfaces, AFTER T5) | `OrderSlideOver.tsx`, `OrderDetail.tsx` |
### Wave 3: Verification [SEQUENTIAL, main session]
| Agent | Task |
|-------|------|
| code-auditor | Type check + pattern compliance (Pitfalls #19/#20) |
| Bash | `npm run type-check && npm run lint && npm run test && npm run build` |
| main session | docs + UAT checklist; then `/triple-review` → `/simplify xhigh` |

## Documentation Updates
- [ ] `docs/SCHEMA.md` — `subscriptionWeeks.reconcileNote`
- [ ] `docs/API_REFERENCE.md` — 3 new fns + `reconcileWeek` arg
- [ ] `docs/FILE_MAP.md` — operate-UI surfaces row
- [ ] `docs/CHANGELOG.md` — entry (draft below)

### CHANGELOG draft
```markdown
## 2026-06-25 — Subscription operate UI (deliver/recognize, top-up, reconcile, out-of-credit)
- Add scoped "Mark delivered" action on both order surfaces → recognizes the subscription sale (idempotent).
- "Amend week" mode re-opens a confirmed week and bills the increase as a server-computed top-up invoice.
- Per-week "Reconcile" action with fault selector + compulsory comment (persisted to `subscriptionWeeks.reconcileNote`).
- Out-of-credit flag + split / apply-credit actions on order surfaces.
- Backend (thin, additive): `markSubscriptionDelivered`, `amendConfirmedWeek`/`computeTopupDelta`,
  `getOrderCreditStatus`/`isOverCredit`, required `reconcileNote` on `reconcileWeek`.
```

## Success Criteria
- [ ] `npm run type-check` passes
- [ ] `npm run build` succeeds; vendor caps untouched
- [ ] `npm run test` green — existing 52 subscription + 60 matchEngine + 4 new pure-fn suites + 1 dialog smoke test
- [ ] All new fns `protectedMutation/Query` with `roles: ["manager","admin"]`; buttons gated `isManagerOrAdmin`
- [ ] Mark-delivered + out-of-credit present in BOTH order surfaces (Pitfall #20)
- [ ] Reconcile submit disabled until comment non-empty; note persisted
- [ ] Empty/loading/error states on every new surface (D12); no confidential price leak (D11)
- [ ] UAT checklist written; R1 (IMP-4 recognition timing) + R2 + R3 flagged for human verification (NOT claimed passed)
