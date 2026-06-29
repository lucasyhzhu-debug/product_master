# Subscription Credit Drawdown in Order Slide-Over — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let staff fulfil an ad-hoc order from a subscription customer's prepaid weekly credit (eligible products only), at-delivery drawdown with reservation, partial-credit support, a manual WhatsApp summary, and reflection in the subscription week — wired into both order surfaces.

**Architecture:** A new at-creation flow (`getSubscriptionCreditContext` query → `createCreditFundedOrder` mutation) reserves credit on the order row (`orders.subscriptionCreditApplied`) and posts the `drawdown` ledger entry only at delivery (extended `recognizeSubscriptionDelivery`). The existing eager partial-credit path (`applyPartialCreditToAdHocOrder`) is refactored onto the same reservation model (resolving IMP-4). Pure `computeCreditSplit` feeds both the banner and the server re-derivation. Eligible lines are priced at the subscription's partner `unitPrice` (the pool's denomination).

**Tech Stack:** Convex (TS serverless), React 19 + TS, Vitest + convex-test, Tailwind/shadcn.

**Spec:** `docs/superpowers/specs/2026-06-29-subscription-credit-drawdown-order-slideover-design.md`
**Staffreview:** `docs/reviews/staffreview-subscription-credit-drawdown-2026-06-29.md`

## Global Constraints

- **Money is integer IDR** — no floats; `Math.round` on every line/total (CLAUDE.md C10).
- **Eligible lines re-priced to `subscription.unitPrice`** (partner price; pool denomination) — C4.
- **Drawdown ledger `amount` is negative**; `deriveCreditPool` sums signed amounts (`creditMath.ts:52`).
- **Use `ConvexError`, never plain `Error`** in mutations/queries (prod error masking lesson).
- **Server is source of truth** — `createCreditFundedOrder` re-derives the split + available credit; never trust client amounts.
- **Both order surfaces** — any banner/button/dialog lands in BOTH `src/components/orders/OrderSlideOver.tsx` AND `src/pages/OrderDetail.tsx` (Pitfall #20; no shared Actions component).
- **`roles: ["manager", "admin"]`** on every new protected query/mutation (Orders surface permission; Pitfall #19).
- **IMP-3 bypass preserved** — fully-covered orders set the funded status triple via raw `db.patch` (no `statusUpdates`); packaging reservation stays deferred.
- **No new ledger type** — the order row is the reservation (D5).
- **`npm run build` must pass before merge**; CHANGELOG always updated at merge.

---

## Task List

| ID | Title | Files touched | Wave | Depends-on |
|----|-------|---------------|------|------------|
| T1 | Schema field `orders.subscriptionCreditApplied` + codegen | `convex/schema.ts` | W1 | — |
| T2 | Pure `computeCreditSplit` helper + unit tests | `convex/subscriptions/creditMath.ts`, `__tests__/creditMath.test.ts` | W1 | — |
| T3 | Recognition: draw `subscriptionCreditApplied ?? totalAmount` | `convex/subscriptions/recognition.ts`, `__tests__/recognition.test.ts` | W1 | T1 |
| T4 | Refactor Path B to reservation model + `canApplyCredit` guard | `convex/subscriptions/outOfCredit.ts`, `queries.ts`, `__tests__/outOfCredit*.test.ts` | W1 | T1 |
| T5 | `getSubscriptionCreditContext` query (reservation-aware) | `convex/subscriptions/queries.ts`, `__tests__/creditContext.test.ts` | W2 | T1,T2,T4 |
| T6 | `createCreditFundedOrder` mutation | `convex/subscriptions/creditOrder.ts`, `__tests__/creditOrder.test.ts` | W2 | T1,T2,T3 |
| T7 | WhatsApp: shared `renderTemplate` + `SUBSCRIPTION_CREDIT_TOPUP` + draft query | `convex/whatsappTemplates/render.ts`, `convex/orders/whatsapp.ts`, `convex/whatsappTemplates/*seed*`, `convex/subscriptions/creditOrder.ts`, `__tests__/creditWhatsapp.test.ts` | W2 | T1 |
| T8 | `SubscriptionCreditBanner` component + `useSubscriptionCreditContext` hook | `src/components/orders/SubscriptionCreditBanner.tsx`, `src/hooks/useSubscriptionCreditContext.ts` | W3 | T5 |
| T9 | Wire banner + create + WhatsApp into `OrderSlideOver` (creation context) | `src/components/orders/OrderSlideOver.tsx` | W3 | T6,T7,T8 |
| T10 | Mirror into `OrderDetail` | `src/pages/OrderDetail.tsx` | W3 | T6,T7,T8 |
| T11 | Verification: build + type-check + full test + docs | docs + repo-wide | W4 | all |

---

## Execution Strategy — multi-agent, wave-gated

**Wave dispatch map (barrier between waves; parallelize within):**
- **W1 (backend foundations, ≤4 parallel):** T1, T2 fully parallel (different files). T3, T4 each depend on T1's schema field but touch different files — run T3 ∥ T4 **after** T1's schema edit is on the branch. T2 ∥ everything.
- **W2 (backend surface, ≤3 parallel):** T5, T6, T7 after W1. **Shared-file serialization:** T5 edits `convex/subscriptions/queries.ts` (adds `getSubscriptionCreditContext`) — T4 also edits `queries.ts` (`getOrderCreditStatus`), so **T4 (W1) lands before T5 (W2)** — no in-wave collision. T6 and T7 both write `convex/subscriptions/creditOrder.ts` → **serialize T6 then T7** (same agent or ordered), or put T7's draft query in `creditOrder.ts` as an append after T6. 
- **W3 (frontend, ≤3 parallel):** T8 first (component+hook), then T9 ∥ T10 (distinct files, both consume T8).
- **W4 (verification):** T11 solo, last.

**Generated-file serialization:** every backend task that adds/edits a Convex function changes `convex/_generated/api.d.ts`. Run `npx convex codegen` **once per wave on the merged tree** (after W1 tasks merge, again after W2), not per task. If executing in isolated worktrees, re-run codegen on the integration branch before the next wave.

**Critical path (min wall-clock):** T1 → T3/T4 → T6 → T9/T10 → T11. T2, T5, T7, T8 hang off this spine in parallel.

**What can't be done headless:** the final `/persona-uat` gate needs a live env (`npx convex dev` + `npm run dev` + dev seed `subscriptions/_devSeed:resetCrmUat`→`seedCrmUat`→`seedCutoffFixture`, manager PIN `999999`). If the executing session can't bring a live env up, flag persona-UAT `pending: needs live env` — do NOT claim done.

**Close-out runs in the main session (not a background agent):** `/triple-review` → `/simplify xhigh` → `/persona-uat` (FE journeys impacted). Address Critical/Improvement before merge.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `convex/schema.ts` | Add `orders.subscriptionCreditApplied?: v.number()`. |
| `convex/subscriptions/creditMath.ts` | Pure `computeCreditSplit` (+ existing pool math). |
| `convex/subscriptions/recognition.ts` | At-delivery drawdown — draw reserved amount. |
| `convex/subscriptions/outOfCredit.ts` | Path B refactored to reservation (no eager drawdown). |
| `convex/subscriptions/queries.ts` | `getSubscriptionCreditContext`; `getOrderCreditStatus.canApplyCredit` guard. |
| `convex/subscriptions/creditOrder.ts` | NEW — `createCreditFundedOrder` mutation + `getCreditOrderWhatsappDraft` query. |
| `convex/whatsappTemplates/render.ts` | NEW — shared `renderTemplate` (extracted from `orders/whatsapp.ts`). |
| `src/hooks/useSubscriptionCreditContext.ts` | NEW — query hook with skip-until-customer. |
| `src/components/orders/SubscriptionCreditBanner.tsx` | NEW — presentational banner (both surfaces render it). |
| `src/components/orders/OrderSlideOver.tsx` / `src/pages/OrderDetail.tsx` | Wire banner into the creation context. |

---

## Task Details

### Task T1: Schema field `orders.subscriptionCreditApplied`

**Files:**
- Modify: `convex/schema.ts:344` (inside `orders` table, after `fundingSource`)

**Interfaces:**
- Produces: optional field `subscriptionCreditApplied?: number` on `orders` (integer IDR reserved/drawn).

- [ ] **Step 1: Add the field**

In `convex/schema.ts`, within the `orders` `defineTable`, immediately after the `fundingSource` union block (`:338-344`), add:

```ts
    // Phase: subscription credit drawdown — reserved/drawn credit (integer IDR).
    // Reservation lives on the order row (no new ledger type); recognition draws
    // this exact amount at delivery. undefined on planned orders (fall back to totalAmount).
    subscriptionCreditApplied: v.optional(v.number()),
```

- [ ] **Step 2: Regenerate types**

Run: `npx convex codegen`
Expected: `convex/_generated/dataModel.d.ts` now includes `subscriptionCreditApplied` on `orders`. No type errors.

- [ ] **Step 3: Type-check**

Run: `npm run type-check`
Expected: PASS (additive optional field — no existing code breaks).

- [ ] **Step 4: Commit**

```bash
git add convex/schema.ts convex/_generated
git commit -m "feat(subscription): add orders.subscriptionCreditApplied reservation field"
```

---

### Task T2: Pure `computeCreditSplit` helper

**Files:**
- Modify: `convex/subscriptions/creditMath.ts` (append)
- Test: `convex/subscriptions/__tests__/creditMath.test.ts` (append)

**Interfaces:**
- Produces:
  ```ts
  export interface CreditSplitLine {
    menuProductId: Id<"menuProducts">; qty: number;
    retailUnitPrice: number; eligible: boolean;
    effectiveUnitPrice: number; lineTotal: number;
  }
  export interface CreditSplit {
    lines: CreditSplitLine[]; eligibleSubtotal: number; offPlanTotal: number;
    creditCovered: number; eligibleShortfall: number; amountDue: number;
  }
  export function computeCreditSplit(
    items: { menuProductId: Id<"menuProducts">; qty: number; retailUnitPrice: number }[],
    allowedProductIds: Set<string>,
    subscriptionUnitPrice: number,
    availableCredit: number,
  ): CreditSplit
  ```

- [ ] **Step 1: Write the failing tests**

Append to `convex/subscriptions/__tests__/creditMath.test.ts`:

```ts
import { computeCreditSplit } from "../creditMath";
import type { Id } from "../../_generated/dataModel";

const P1 = "p1" as Id<"menuProducts">;   // subscription product
const P2 = "p2" as Id<"menuProducts">;   // off-plan product
const allowed = new Set<string>([P1]);

describe("computeCreditSplit", () => {
  it("all eligible, credit covers full eligible subtotal (partner price)", () => {
    // retail 10000, partner 7000; 8 units eligible
    const s = computeCreditSplit(
      [{ menuProductId: P1, qty: 8, retailUnitPrice: 10000 }],
      allowed, 7000, 1_000_000,
    );
    expect(s.eligibleSubtotal).toBe(56000);   // 8 * 7000 (partner)
    expect(s.creditCovered).toBe(56000);
    expect(s.offPlanTotal).toBe(0);
    expect(s.amountDue).toBe(0);
    expect(s.lines[0].effectiveUnitPrice).toBe(7000);
  });

  it("partial: credit < eligible subtotal", () => {
    const s = computeCreditSplit(
      [{ menuProductId: P1, qty: 8, retailUnitPrice: 10000 }],
      allowed, 7000, 30000,
    );
    expect(s.eligibleSubtotal).toBe(56000);
    expect(s.creditCovered).toBe(30000);
    expect(s.eligibleShortfall).toBe(26000);
    expect(s.amountDue).toBe(26000);
  });

  it("mixed eligible + off-plan: off-plan at retail, always due", () => {
    const s = computeCreditSplit(
      [
        { menuProductId: P1, qty: 2, retailUnitPrice: 10000 }, // partner 7000 -> 14000
        { menuProductId: P2, qty: 1, retailUnitPrice: 25000 }, // off-plan retail 25000
      ],
      allowed, 7000, 1_000_000,
    );
    expect(s.eligibleSubtotal).toBe(14000);
    expect(s.offPlanTotal).toBe(25000);
    expect(s.creditCovered).toBe(14000);
    expect(s.amountDue).toBe(25000); // off-plan only
  });

  it("off-plan only: creditCovered 0", () => {
    const s = computeCreditSplit(
      [{ menuProductId: P2, qty: 1, retailUnitPrice: 25000 }],
      allowed, 7000, 1_000_000,
    );
    expect(s.creditCovered).toBe(0);
    expect(s.amountDue).toBe(25000);
  });

  it("zero / negative available credit clamps to 0 covered", () => {
    const s = computeCreditSplit(
      [{ menuProductId: P1, qty: 2, retailUnitPrice: 10000 }],
      allowed, 7000, -50,
    );
    expect(s.creditCovered).toBe(0);
    expect(s.amountDue).toBe(14000);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npx vitest run convex/subscriptions/__tests__/creditMath.test.ts -t computeCreditSplit`
Expected: FAIL ("computeCreditSplit is not a function").

- [ ] **Step 3: Implement**

Append to `convex/subscriptions/creditMath.ts`:

```ts
import type { Id } from "../_generated/dataModel";

export interface CreditSplitLine {
  menuProductId: Id<"menuProducts">;
  qty: number;
  retailUnitPrice: number;
  eligible: boolean;
  effectiveUnitPrice: number;
  lineTotal: number;
}

export interface CreditSplit {
  lines: CreditSplitLine[];
  eligibleSubtotal: number;
  offPlanTotal: number;
  creditCovered: number;
  eligibleShortfall: number;
  amountDue: number;
}

/**
 * Split a draft cart into credit-eligible (subscription products, re-priced to the
 * partner unitPrice — the pool's denomination, C4) and off-plan (retail) buckets,
 * then apply available credit to the eligible subtotal. Integer IDR; no item splitting.
 */
export function computeCreditSplit(
  items: { menuProductId: Id<"menuProducts">; qty: number; retailUnitPrice: number }[],
  allowedProductIds: Set<string>,
  subscriptionUnitPrice: number,
  availableCredit: number,
): CreditSplit {
  const lines: CreditSplitLine[] = items.map((it) => {
    const eligible = allowedProductIds.has(it.menuProductId as unknown as string);
    const effectiveUnitPrice = eligible ? subscriptionUnitPrice : it.retailUnitPrice;
    return {
      menuProductId: it.menuProductId,
      qty: it.qty,
      retailUnitPrice: it.retailUnitPrice,
      eligible,
      effectiveUnitPrice,
      lineTotal: Math.round(it.qty * effectiveUnitPrice),
    };
  });
  const eligibleSubtotal = lines.filter((l) => l.eligible).reduce((s, l) => s + l.lineTotal, 0);
  const offPlanTotal = lines.filter((l) => !l.eligible).reduce((s, l) => s + l.lineTotal, 0);
  const creditCovered = Math.min(eligibleSubtotal, Math.max(0, availableCredit));
  const eligibleShortfall = eligibleSubtotal - creditCovered;
  return {
    lines, eligibleSubtotal, offPlanTotal, creditCovered,
    eligibleShortfall, amountDue: eligibleShortfall + offPlanTotal,
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run convex/subscriptions/__tests__/creditMath.test.ts -t computeCreditSplit`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add convex/subscriptions/creditMath.ts convex/subscriptions/__tests__/creditMath.test.ts
git commit -m "feat(subscription): computeCreditSplit pure helper (partner-priced eligible lines)"
```

---

### Task T3: Recognition draws the reserved amount

**Files:**
- Modify: `convex/subscriptions/recognition.ts:73-102`
- Test: `convex/subscriptions/__tests__/recognition.test.ts` (append)

**Interfaces:**
- Consumes: `orders.subscriptionCreditApplied` (T1).
- Produces: behavior — drawdown `= subscriptionCreditApplied ?? totalAmount`.

- [ ] **Step 1: Write the failing test**

Append to `convex/subscriptions/__tests__/recognition.test.ts` a case mirroring the existing setup, asserting an order with `subscriptionCreditApplied` set draws down THAT amount, and a planned order (field undefined) still draws `totalAmount`:

```ts
it("ad-hoc credit order draws subscriptionCreditApplied, not totalAmount", async () => {
  const t = convexTest(schema);
  // ...seed sub + funded week with topup so pool has credit (mirror existing test setup)...
  const { orderId, weekId, subId } = await seedAdHocCreditOrder(t, {
    totalAmount: 50000,            // full order (e.g. eligible partner + off-plan)
    subscriptionCreditApplied: 14000, // only the credit-covered eligible part
  });
  await t.run(async (ctx) => {
    const { recognizeSubscriptionDelivery } = await import("../recognition");
    await recognizeSubscriptionDelivery(ctx, orderId);
  });
  const entries = await t.run(async (ctx) =>
    ctx.db.query("creditLedger").withIndex("by_order", (q) => q.eq("orderId", orderId)).collect());
  expect(entries).toHaveLength(1);
  expect(entries[0].amount).toBe(-14000); // reserved amount, NOT -50000
});
```

> Add `seedAdHocCreditOrder` as a local helper in the test file (insert order with
> `subscriptionId`, `subscriptionWeekId`, `subscriptionCreditApplied`, `totalAmount`,
> `createdByUserId`). Keep the existing planned-order regression test (asserts `-totalAmount`).

- [ ] **Step 2: Run to verify fail**

Run: `npx vitest run convex/subscriptions/__tests__/recognition.test.ts -t "subscriptionCreditApplied"`
Expected: FAIL (drawdown is `-50000`).

- [ ] **Step 3: Implement**

In `convex/subscriptions/recognition.ts`, replace the drawdown amount derivation. Before the `priorEntries` block, add:

```ts
  const drawdownAmount = order.subscriptionCreditApplied ?? order.totalAmount;
```

Change the under-funded warning comparison (`recognition.ts:83`) from `order.totalAmount` to `drawdownAmount`, the warning string's `drawdown=${order.totalAmount}` to `drawdown=${drawdownAmount}`, and the `postLedgerEntry` `amount` (`recognition.ts:98`) from `-order.totalAmount` to `-drawdownAmount`.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run convex/subscriptions/__tests__/recognition.test.ts`
Expected: PASS (new case + existing planned-order regression both green).

- [ ] **Step 5: Commit**

```bash
git add convex/subscriptions/recognition.ts convex/subscriptions/__tests__/recognition.test.ts
git commit -m "feat(subscription): recognition draws subscriptionCreditApplied, planned orders unchanged"
```

---

### Task T4: Refactor Path B to reservation model

**Files:**
- Modify: `convex/subscriptions/outOfCredit.ts:251-304` (`applyPartialCreditToAdHocOrder`)
- Modify: `convex/subscriptions/queries.ts:162-165` (`getOrderCreditStatus.canApplyCredit`)
- Test: `convex/subscriptions/__tests__/outOfCredit.test.ts` (create or append)

**Interfaces:**
- Consumes: `orders.subscriptionCreditApplied` (T1).
- Produces: `applyPartialCreditToAdHocOrder` now reserves (no ledger entry); `canApplyCredit` false once reserved.

- [ ] **Step 1: Write the failing tests**

Create/append `convex/subscriptions/__tests__/outOfCredit.test.ts`:

```ts
it("applyPartialCreditToAdHocOrder reserves (no eager ledger entry)", async () => {
  const t = convexTest(schema);
  const { orderId, weekId } = await seedAwaitingPaymentSubOrder(t, { finalTotal: 30000, creditRemaining: 50000 });
  await t.mutation(api.subscriptions.outOfCredit.applyPartialCreditToAdHocOrder, { orderId }, asManager);
  const order = await t.run((ctx) => ctx.db.get(orderId));
  expect(order!.subscriptionCreditApplied).toBe(30000); // reserved
  expect(order!.fundingSource).toBe("deposit");
  const ledger = await t.run((ctx) =>
    ctx.db.query("creditLedger").withIndex("by_order", (q) => q.eq("orderId", orderId)).collect());
  expect(ledger).toHaveLength(0); // NO eager drawdown — posts at delivery
});

it("getOrderCreditStatus.canApplyCredit is false once reserved", async () => {
  const t = convexTest(schema);
  const { orderId } = await seedReservedSubOrder(t, { subscriptionCreditApplied: 30000 });
  const status = await t.query(api.subscriptions.queries.getOrderCreditStatus, { orderId }, asManager);
  expect(status.canApplyCredit).toBe(false);
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npx vitest run convex/subscriptions/__tests__/outOfCredit.test.ts`
Expected: FAIL (current code posts a ledger entry; `canApplyCredit` still true).

- [ ] **Step 3: Implement reservation refactor**

In `applyPartialCreditToAdHocOrder` (`outOfCredit.ts`), replace the drawdown + patch block (`:285-300`) with a reservation:

```ts
    // RESERVE (no eager drawdown — recognition posts the drawdown at delivery, D5/IMP-4 fix).
    const coveredAmount = Math.min(remaining, order.finalTotal);
    const remainderAmount = order.finalTotal - coveredAmount;

    await ctx.db.patch(order._id, {
      fundingSource: "deposit",
      subscriptionCreditApplied: coveredAmount,
      // status stays AwaitingPayment — remainder via QRIS/bank; credit drawn at delivery.
    });

    return { coveredAmount, remainderAmount };
```

Remove the now-unused `postLedgerEntry` import if no longer referenced in the file (keep it if `splitScheduledOrderOnCredit` still uses it — it does; leave the import).

In `getOrderCreditStatus` (`queries.ts:162`), add a guard so an already-reserved order isn't offered another application:

```ts
    const canApplyCredit =
      order.status === "AwaitingPayment" &&
      order.paymentStatus !== "Paid" &&
      (order.subscriptionCreditApplied ?? 0) === 0 &&   // not already reserved
      creditRemaining > 0;
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run convex/subscriptions/__tests__/outOfCredit.test.ts`
Expected: PASS. Also re-run `npx vitest run convex/subscriptions` — existing Path A split tests unaffected.

- [ ] **Step 5: Commit**

```bash
git add convex/subscriptions/outOfCredit.ts convex/subscriptions/queries.ts convex/subscriptions/__tests__/outOfCredit.test.ts
git commit -m "fix(subscription): Path B reserves instead of eager drawdown (IMP-4); guard canApplyCredit"
```

---

### Task T5: `getSubscriptionCreditContext` query

**Files:**
- Modify: `convex/subscriptions/queries.ts` (new export)
- Test: `convex/subscriptions/__tests__/creditContext.test.ts` (create)

**Interfaces:**
- Consumes: `computeCreditSplit` (T2), `deriveCreditPool`, `orders.subscriptionCreditApplied` (T1).
- Produces:
  ```ts
  // getSubscriptionCreditContext({ customerId, dueDate, draftItems }) =>
  Array<{
    subscriptionId: Id<"subscriptions">; label: string;
    weekId: Id<"subscriptionWeeks"> | null;
    allowedProductIds: string[];
    availableCredit: number;
    split: CreditSplit | null;
    plannedDeliveriesRemaining: number;
  }>
  ```

- [ ] **Step 1: Write the failing tests**

Create `convex/subscriptions/__tests__/creditContext.test.ts` covering: (a) no subscription → empty array; (b) active sub, funded `delivering` week, all-eligible cart → `availableCredit` = pool remaining, `split.creditCovered` correct (partner price); (c) reservation netting — an un-recognized credit order in the week reduces `availableCredit`; (d) a recognized order (has `by_order` ledger row) does NOT double-reduce; (e) a `Cancelled` reserved order is excluded.

```ts
it("nets an un-recognized reserved order out of availableCredit", async () => {
  const t = convexTest(schema);
  const { customerId, weekId } = await seedFundedWeek(t, { creditRemaining: 100000, unitPrice: 7000 });
  await seedReservedOrder(t, { weekId, subscriptionCreditApplied: 40000 }); // un-recognized
  const ctx = await t.query(api.subscriptions.queries.getSubscriptionCreditContext,
    { customerId, dueDate: midWeekTs, draftItems: [] }, asManager);
  expect(ctx[0].availableCredit).toBe(60000); // 100000 − 40000 reserved
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npx vitest run convex/subscriptions/__tests__/creditContext.test.ts`
Expected: FAIL ("getSubscriptionCreditContext is not a function").

- [ ] **Step 3: Implement**

Add to `convex/subscriptions/queries.ts`:

```ts
import { computeCreditSplit } from "./creditMath";
import { getWibDateStr } from "../lib/periodRange";

export const getSubscriptionCreditContext = protectedQuery({
  roles: ["manager", "admin"],
  args: {
    customerId: v.id("customers"),
    dueDate: v.number(),
    draftItems: v.array(v.object({
      menuProductId: v.id("menuProducts"),
      qty: v.number(),
      retailUnitPrice: v.number(),
    })),
  },
  handler: async (ctx, args) => {
    const subs = (await ctx.db
      .query("subscriptions")
      .withIndex("by_customer", (q) => q.eq("customerId", args.customerId))
      .collect()).filter((s) => s.status === "active");

    const out = [];
    for (const sub of subs) {
      // Resolve the funded, still-open week covering dueDate.
      const weeks = await ctx.db
        .query("subscriptionWeeks")
        .withIndex("by_subscription_weekStart", (q) => q.eq("subscriptionId", sub._id))
        .collect();
      const week = weeks.find(
        (w) => w.weekStart <= args.dueDate && args.dueDate <= w.weekEnd &&
               (w.status === "paid" || w.status === "delivering"),
      ) ?? null;

      const allowedProductIds = Array.from(new Set(
        sub.scheduleTemplate.flatMap((d) => d.items.map((it) => it.menuProductId as unknown as string)),
      ));

      let availableCredit = 0;
      let split = null;
      let plannedDeliveriesRemaining = 0;

      if (week) {
        const entries = await ctx.db
          .query("creditLedger")
          .withIndex("by_subscriptionWeek", (q) => q.eq("subscriptionWeekId", week._id))
          .collect();
        const pool = deriveCreditPool(entries.map((e) => ({ type: e.type, amount: e.amount })));

        // Reserve: un-recognized credit orders in this week (no by_order ledger row).
        const weekOrders = await ctx.db
          .query("orders")
          .withIndex("by_subscriptionWeek", (q) => q.eq("subscriptionWeekId", week._id))
          .collect();
        let reserved = 0;
        for (const o of weekOrders) {
          const applied = o.subscriptionCreditApplied ?? 0;
          if (applied <= 0 || o.status === "Cancelled") continue;
          const recognized = await ctx.db
            .query("creditLedger")
            .withIndex("by_order", (q) => q.eq("orderId", o._id))
            .first();
          if (!recognized) reserved += applied;
        }
        availableCredit = Math.max(0, pool.creditRemaining - reserved);

        split = computeCreditSplit(
          args.draftItems, new Set(allowedProductIds), sub.unitPrice, availableCredit,
        );

        const today = getWibDateStr(args.dueDate);
        plannedDeliveriesRemaining = week.plannedDays.filter((d) => {
          const dStr = getWibDateStr(d.date);
          return dStr >= today; // not-yet-due deliveries (delivery-state refinement below)
        }).length;
      }

      out.push({
        subscriptionId: sub._id, label: sub.label, weekId: week?._id ?? null,
        allowedProductIds, availableCredit, split, plannedDeliveriesRemaining,
      });
    }
    return out;
  },
});
```

> **Refinement (review I1):** if a planned day's generated order has already reached
> `AwaitingDelivery`/`Complete`, exclude it from `plannedDeliveriesRemaining`. Match `weekOrders`
> by `deliveryDate`/date and check status; the `dStr >= today` filter is the documented fallback.
> Implement the status-aware version if a clean date→order match exists, else keep the fallback and
> note it.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run convex/subscriptions/__tests__/creditContext.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add convex/subscriptions/queries.ts convex/subscriptions/__tests__/creditContext.test.ts
git commit -m "feat(subscription): getSubscriptionCreditContext (reservation-aware available credit)"
```

---

### Task T6: `createCreditFundedOrder` mutation

**Files:**
- Create: `convex/subscriptions/creditOrder.ts`
- Test: `convex/subscriptions/__tests__/creditOrder.test.ts`

**Interfaces:**
- Consumes: `computeCreditSplit` (T2), `insertOrderWithItems` (`orders/helpers/insertOrder.ts`), `subscriptionCreditApplied` (T1).
- Produces:
  ```ts
  // createCreditFundedOrder({ customerId, subscriptionId, items, dueDate, soldBy?, notes? }) =>
  { orderId: Id<"orders">; creditCovered: number; amountDue: number;
    offPlanTotal: number; eligibleShortfall: number }
  ```

- [ ] **Step 1: Write the failing tests**

Create `convex/subscriptions/__tests__/creditOrder.test.ts` covering: (a) full cover → order gets `{fundingSource:"subscription_credit", paymentStatus:"Paid", paymentMethod:"subscription_credit", status:"PaymentReceived"}`, `subscriptionCreditApplied == eligibleSubtotal(partner)`, NO ledger entry yet; (b) partial → `{fundingSource:"deposit", status:"AwaitingPayment", paymentStatus:"Unpaid"}`, `subscriptionCreditApplied == availableCredit`; (c) off-plan-only → `ConvexError`; (d) tampered client price ignored (server re-prices eligible lines to `unitPrice`); (e) no funded week → `ConvexError`.

```ts
it("full cover sets funded triple + reserves, no ledger entry", async () => {
  const t = convexTest(schema);
  const { customerId, subId } = await seedActiveSubFundedWeek(t, { unitPrice: 7000, creditRemaining: 100000, productId: P1 });
  const res = await t.mutation(api.subscriptions.creditOrder.createCreditFundedOrder, {
    customerId, subscriptionId: subId, dueDate: midWeekTs,
    items: [{ productName: "Original", quantity: 8, unitPrice: 10000, unitCost: 0, menuProductId: P1 }],
  }, asManager);
  expect(res.creditCovered).toBe(56000); // 8*7000 partner
  expect(res.amountDue).toBe(0);
  const order = await t.run((ctx) => ctx.db.get(res.orderId));
  expect(order!.fundingSource).toBe("subscription_credit");
  expect(order!.status).toBe("PaymentReceived");
  expect(order!.paymentStatus).toBe("Paid");
  expect(order!.subscriptionCreditApplied).toBe(56000);
  const ledger = await t.run((ctx) =>
    ctx.db.query("creditLedger").withIndex("by_order", (q) => q.eq("orderId", res.orderId)).collect());
  expect(ledger).toHaveLength(0);
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npx vitest run convex/subscriptions/__tests__/creditOrder.test.ts`
Expected: FAIL (module/function missing).

- [ ] **Step 3: Implement**

Create `convex/subscriptions/creditOrder.ts`. Build the full `OrderInsert` modeled on `scheduling/confirmWeek.ts` (which already constructs a subscription order via `insertOrderWithItems`). Re-derive split server-side; set the funded state per branch.

```ts
import { v, ConvexError } from "convex/values";
import { protectedMutation } from "../lib/functions";
import { orderItemInput } from "../orders/validators";
import { insertOrderWithItems, type OrderInsert, type OrderItemInsert } from "../orders/helpers/insertOrder";
import { generateNextOrderNumber } from "../orders/helpers/index";
import { computeCreditSplit } from "./creditMath";
import { deriveCreditPool } from "./creditMath";

export const createCreditFundedOrder = protectedMutation({
  roles: ["manager", "admin"],
  args: {
    customerId: v.id("customers"),
    subscriptionId: v.id("subscriptions"),
    items: v.array(orderItemInput),
    dueDate: v.number(),
    soldBy: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const sub = await ctx.db.get(args.subscriptionId);
    if (!sub || sub.status !== "active") throw new ConvexError("Subscription is not active");
    if (sub.customerId !== args.customerId) throw new ConvexError("Subscription does not belong to customer");

    // Resolve funded, open week (mirror getSubscriptionCreditContext).
    const weeks = await ctx.db.query("subscriptionWeeks")
      .withIndex("by_subscription_weekStart", (q) => q.eq("subscriptionId", sub._id)).collect();
    const week = weeks.find((w) => w.weekStart <= args.dueDate && args.dueDate <= w.weekEnd &&
      (w.status === "paid" || w.status === "delivering"));
    if (!week) throw new ConvexError("No funded subscription week covers this date");

    // Reservation-aware available credit (same logic as the context query).
    const entries = await ctx.db.query("creditLedger")
      .withIndex("by_subscriptionWeek", (q) => q.eq("subscriptionWeekId", week._id)).collect();
    const pool = deriveCreditPool(entries.map((e) => ({ type: e.type, amount: e.amount })));
    const weekOrders = await ctx.db.query("orders")
      .withIndex("by_subscriptionWeek", (q) => q.eq("subscriptionWeekId", week._id)).collect();
    let reserved = 0;
    for (const o of weekOrders) {
      const applied = o.subscriptionCreditApplied ?? 0;
      if (applied <= 0 || o.status === "Cancelled") continue;
      const recognized = await ctx.db.query("creditLedger")
        .withIndex("by_order", (q) => q.eq("orderId", o._id)).first();
      if (!recognized) reserved += applied;
    }
    const availableCredit = Math.max(0, pool.creditRemaining - reserved);

    const allowed = new Set(sub.scheduleTemplate.flatMap((d) =>
      d.items.map((it) => it.menuProductId as unknown as string)));
    const split = computeCreditSplit(
      args.items.map((it) => ({ menuProductId: it.menuProductId!, qty: it.quantity, retailUnitPrice: it.unitPrice })),
      allowed, sub.unitPrice, availableCredit,
    );
    if (split.creditCovered <= 0) throw new ConvexError("No credit-eligible lines for this subscription");

    // Build order items at effective price (eligible -> partner price).
    const items: OrderItemInsert[] = args.items.map((it, i) => {
      const line = split.lines[i];
      const lineTotal = line.lineTotal;
      return {
        productName: it.productName,
        productVariant: it.productVariant,
        quantity: it.quantity,
        unitPrice: line.effectiveUnitPrice,
        unitCost: it.unitCost,
        lineTotal,
        lineCost: 0,
        lineMargin: lineTotal,
        menuProductId: it.menuProductId,
        isCancelled: false,
        // ...any other required orderItems fields per schema — copy from confirmWeek's item build.
      } as OrderItemInsert;
    });
    const totalAmount = split.eligibleSubtotal + split.offPlanTotal;

    const fullyCovered = split.amountDue === 0;
    const orderNumber = await generateNextOrderNumber(ctx);
    const orderFields: OrderInsert = {
      // ↓↓↓ copy the full required field set from confirmWeek.ts's order build, then override: ↓↓↓
      orderNumber,
      customerId: args.customerId,
      // status/payment per branch (C2 / IMP-3 raw values):
      status: fullyCovered ? "PaymentReceived" : "AwaitingPayment",
      paymentStatus: fullyCovered ? "Paid" : "Unpaid",
      paymentMethod: fullyCovered ? "subscription_credit" : undefined,
      fundingSource: fullyCovered ? "subscription_credit" : "deposit",
      subscriptionId: sub._id,
      subscriptionWeekId: week._id,
      subscriptionCreditApplied: split.creditCovered,
      deliveryDate: args.dueDate,
      dueDate: args.dueDate,
      totalAmount,
      totalCost: 0,
      totalMargin: totalAmount,
      finalTotal: totalAmount,
      itemCount: items.length,
      soldBy: args.soldBy,
      notes: args.notes,
      orderDate: args.dueDate,
      // ...remaining required fields (channel, deliveryType, isKitchenVisible, etc.) — confirmWeek parity.
    } as OrderInsert;

    const orderId = await insertOrderWithItems(ctx, { orderFields, items });
    return {
      orderId,
      creditCovered: split.creditCovered,
      amountDue: split.amountDue,
      offPlanTotal: split.offPlanTotal,
      eligibleShortfall: split.eligibleShortfall,
    };
  },
});
```

> **Execution note:** `OrderInsert` is `WithoutSystemFields<Doc<"orders">>` — the compiler will
> demand every required `orders` field. Open `scheduling/confirmWeek.ts`, copy its exact
> `orderFields` object (it already satisfies the type for a subscription order), then override the
> status/payment/funding/credit fields above. Do NOT route through `statusUpdates` (IMP-3 bypass —
> packaging reservation deferred). This is the documented headless gotcha; let `npm run type-check`
> drive the missing-field list.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run convex/subscriptions/__tests__/creditOrder.test.ts && npm run type-check`
Expected: PASS + type-check clean.

- [ ] **Step 5: Commit**

```bash
git add convex/subscriptions/creditOrder.ts convex/subscriptions/__tests__/creditOrder.test.ts
git commit -m "feat(subscription): createCreditFundedOrder (reservation at creation, funded triple)"
```

---

### Task T7: WhatsApp summary draft

**Files:**
- Create: `convex/whatsappTemplates/render.ts` (extract `renderTemplate`)
- Modify: `convex/orders/whatsapp.ts` (import the shared `renderTemplate`)
- Modify: the `whatsappTemplates` seed (add `SUBSCRIPTION_CREDIT_TOPUP`)
- Modify: `convex/subscriptions/creditOrder.ts` (append `getCreditOrderWhatsappDraft` query)
- Test: `convex/subscriptions/__tests__/creditWhatsapp.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function renderTemplate(t: string, vars: Record<string, string>): string // shared
  // getCreditOrderWhatsappDraft({ orderId }) => { text: string } | null
  ```

- [ ] **Step 1: Write the failing test**

```ts
it("renders the credit top-up summary with correct figures", async () => {
  const t = convexTest(schema);
  const { orderId } = await seedDeliveredCreditOrder(t, {
    customerName: "Amsterdam!", creditUsed: 56000, creditRemaining: 44000, plannedRemaining: 3,
  });
  const draft = await t.query(api.subscriptions.creditOrder.getCreditOrderWhatsappDraft, { orderId }, asManager);
  expect(draft!.text).toContain("Amsterdam!");
  expect(draft!.text).toContain("56"); // creditUsed
  expect(draft!.text).toContain("44"); // creditRemaining
  expect(draft!.text).toContain("3");  // deliveries left
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npx vitest run convex/subscriptions/__tests__/creditWhatsapp.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

(a) Create `convex/whatsappTemplates/render.ts` with the exact `renderTemplate` body lifted from `orders/whatsapp.ts:53-62`; re-export from `orders/whatsapp.ts` (`import { renderTemplate } from "../whatsappTemplates/render"`) and delete the local copy (no behavior change — keep its existing tests green).

(b) Add a `SUBSCRIPTION_CREDIT_TOPUP` template to the `whatsappTemplates` seed (follow the existing seed entries' shape: `{code, name, body}`). Body:

```
Halo {customerName}! 🙏 Terima kasih.
Pesanan hari ini: {itemsText}
Kami pakai kredit langganan Rp {creditUsed} untuk pesanan ini.
Sisa kredit minggu ini: Rp {creditRemaining} · Pengiriman terjadwal tersisa: {plannedDeliveriesRemaining}.
```

(c) Append `getCreditOrderWhatsappDraft` to `creditOrder.ts`: load order → subscription/week → compute `creditRemaining` (reservation-aware available credit AFTER this order, i.e. pool − reserved incl. this order) and `plannedDeliveriesRemaining`; fetch the template by code; `renderTemplate(body, vars)`; return `{ text }`. Format IDR with thousands separators via the repo's existing money formatter if one exists (else `toLocaleString("id-ID")`).

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run convex/subscriptions/__tests__/creditWhatsapp.test.ts && npx vitest run convex/orders` (WhatsApp render regression)
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add convex/whatsappTemplates/render.ts convex/orders/whatsapp.ts convex/subscriptions/creditOrder.ts convex/subscriptions/__tests__/creditWhatsapp.test.ts convex/whatsappTemplates
git commit -m "feat(subscription): SUBSCRIPTION_CREDIT_TOPUP whatsapp draft + shared renderTemplate"
```

---

### Task T8: Banner component + hook

**Files:**
- Create: `src/hooks/useSubscriptionCreditContext.ts`
- Create: `src/components/orders/SubscriptionCreditBanner.tsx`

**Interfaces:**
- Consumes: `api.subscriptions.queries.getSubscriptionCreditContext` (T5).
- Produces: `<SubscriptionCreditBanner contexts={...} selectedSubId onSelectSub onFulfilWithCredit busy />` and `useSubscriptionCreditContext(customerId, dueDate, draftItems)` returning `{ contexts, isLoading }`.

- [ ] **Step 1: Hook**

```ts
// src/hooks/useSubscriptionCreditContext.ts
import { useSessionQuery } from "...";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

export function useSubscriptionCreditContext(
  customerId: Id<"customers"> | null,
  dueDate: number,
  draftItems: { menuProductId: Id<"menuProducts">; qty: number; retailUnitPrice: number }[],
) {
  const contexts = useSessionQuery(
    api.subscriptions.queries.getSubscriptionCreditContext,
    customerId && draftItems.length > 0 ? { customerId, dueDate, draftItems } : "skip",
  );
  return { contexts: contexts ?? null, isLoading: customerId != null && contexts === undefined };
}
```

- [ ] **Step 2: Component** — `SubscriptionCreditBanner.tsx`, presentational only. Render per spec §5.5 states: hidden when no active sub; "no credit available this week" when `weekId == null`; per-line ✓/✗ from `split.lines[].eligible`; "Credit covers Rp X · Rp Y due" using `split.creditCovered`/`amountDue`; multi-sub list with radio select (button disabled until one picked); loading/error states. Use existing money formatter + Tailwind/shadcn `Card`/`Button` patterns from neighboring order components.

- [ ] **Step 3: Smoke test (RTL)** — `SubscriptionCreditBanner.test.tsx`: renders nothing for empty contexts; renders "Rp" + due figure for a partial context; disables button until a sub is selected when 2 contexts. Run `npx vitest run src/components/orders/SubscriptionCreditBanner.test.tsx` → PASS.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useSubscriptionCreditContext.ts src/components/orders/SubscriptionCreditBanner.tsx src/components/orders/SubscriptionCreditBanner.test.tsx
git commit -m "feat(orders): subscription credit banner component + hook"
```

---

### Task T9: Wire into `OrderSlideOver` (creation context)

**Files:**
- Modify: `src/components/orders/OrderSlideOver.tsx`

- [ ] **Step 1:** In the **order-creation** branch (customer selected, building items, no existing `orderId`), call `useSubscriptionCreditContext(customerId, dueDateTs, draftItems)` where `draftItems` maps the in-progress cart to `{menuProductId, qty, retailUnitPrice}`. Gate on `isManagerOrAdmin`.

- [ ] **Step 2:** Render `<SubscriptionCreditBanner>` beneath the customer selector. On "Fulfil … using credit", call `useSessionMutation(api.subscriptions.creditOrder.createCreditFundedOrder)` with the selected `subscriptionId` + cart, instead of the normal `orders.create`. On success, toast + open the WhatsApp summary (fetch `getCreditOrderWhatsappDraft`, reuse the existing WhatsApp template UI to copy/open), then `logCustomerInteraction({type:"whatsapp_drafted", customerId, subscriptionId, orderId, summary})`.

- [ ] **Step 3:** Keep the existing `getOrderCreditStatus` operate UI (existing `orderId`) untouched — distinct context (review I3).

- [ ] **Step 4: Manual smoke** (live env): select sub customer → banner shows → fulfil with credit (full + partial) → order appears. `npm run build` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/orders/OrderSlideOver.tsx
git commit -m "feat(orders): subscription credit drawdown in OrderSlideOver creation flow"
```

---

### Task T10: Mirror into `OrderDetail`

**Files:**
- Modify: `src/pages/OrderDetail.tsx`

- [ ] **Step 1:** Mirror T9 exactly in `OrderDetail.tsx`'s creation/related context using the same `SubscriptionCreditBanner` + hook + mutation + WhatsApp draft. (Pitfall #20 — surfaces are not shared; mirror by hand.)

- [ ] **Step 2:** `npm run build` → PASS.

- [ ] **Step 3: Commit**

```bash
git add src/pages/OrderDetail.tsx
git commit -m "feat(orders): mirror subscription credit drawdown into OrderDetail (Pitfall #20)"
```

---

### Task T11: Verification + docs

**Files:** docs + repo-wide.

- [ ] **Step 1:** `npx convex codegen` on the integration branch; `npm run type-check` → PASS.
- [ ] **Step 2:** `npm run test` (full suite) → PASS; note any pre-existing unrelated failures.
- [ ] **Step 3:** `npm run build` → PASS (watch vendor bundle cap — Pitfall #16; this feature adds no heavy dep).
- [ ] **Step 4: Docs** — update `docs/CHANGELOG.md` (always), `docs/SCHEMA.md` (`orders.subscriptionCreditApplied`), `docs/API_REFERENCE.md` (`getSubscriptionCreditContext`, `createCreditFundedOrder`, `getCreditOrderWhatsappDraft`), `docs/FILE_MAP.md` (orders row), and a CLAUDE.md note (credit-at-creation flow + IMP-4 resolution). Remove the slice from `docs/ROADMAP.md`.
- [ ] **Step 5: Commit** docs.

---

## Documentation Updates

- [ ] `docs/CHANGELOG.md` (ALWAYS)
- [ ] `docs/SCHEMA.md` — `orders.subscriptionCreditApplied`
- [ ] `docs/API_REFERENCE.md` — 3 new functions + Path B behavior change
- [ ] `docs/FILE_MAP.md` — orders feature row (new banner + creditOrder.ts)
- [ ] `CLAUDE.md` — credit-at-creation flow; IMP-4 resolution; eligible-line partner pricing
- [ ] `docs/ROADMAP.md` — remove the slice once shipped

---

## Success Criteria

- [ ] `npm run type-check` passes.
- [ ] `npm run build` succeeds.
- [ ] `npm run test` green (new + regression; planned-order recognition unchanged).
- [ ] Banner shows in BOTH OrderSlideOver and OrderDetail with reservation-netted available credit.
- [ ] Eligible lines drawn at partner `unitPrice`; off-plan lines paid normally; partial works.
- [ ] No double-spend across two un-delivered credit orders in one week.
- [ ] Drawdown posts at delivery for exactly `subscriptionCreditApplied`; planned orders regress green.
- [ ] CRM week shows the ad-hoc credit order + drawdown ledger row; `plannedDays` unchanged.
- [ ] WhatsApp summary renders correct figures + logs `whatsapp_drafted`.
- [ ] Path B refactored to reservation; both surfaces still render; IMP-4 resolved.
- [ ] `/triple-review` + `/simplify xhigh` findings addressed; `/persona-uat` passed (or flagged `pending: needs live env`).
