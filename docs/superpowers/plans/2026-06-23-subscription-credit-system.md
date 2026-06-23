# Subscription & Credit System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the per-customer prepaid weekly-credit subscription system (schedule = invoice = credit) for Frollie's B2B supply customers, starting with the backend spine (Phase A) and charting the schedule, invoicing, CRM, and Telegram phases (B–E).

**Architecture:** Two coupled primitives — a **credit wallet** (append-only `creditLedger` → derived per-week pool on `subscriptionWeeks`) and an **automated ordering schedule** (per-day/per-product plan that computes the credit amount). The confirmed schedule is the single source of truth; the credit amount is *derived*, never re-keyed. Convex serverless backend + React 19 frontend. Manager+admin only throughout.

**Tech Stack:** Convex (schema/queries/mutations, `convex-helpers` session auth), TypeScript, Vitest (pure-function unit tests), React 19 + shadcn/ui (later phases).

**Spec:** `docs/superpowers/specs/2026-06-23-subscription-credit-system-design.md` (greenlit; §13 resolved)
**Spec staffreview:** `docs/reviews/staffreview-subscription-credit-system-2026-06-23.md`

## Global Constraints

- **Access control:** every subscription/credit/invoice/CRM/schedule query+mutation uses `roles: ["manager", "admin"]` (or tighter), aligned with the `/crm` route `requiredPermission` (CLAUDE.md Pitfall #19). Never `["admin"]`-only on a manager-reachable surface.
- **Auth wrappers:** use `protectedMutation`/`protectedQuery` from `convex/lib/functions.ts` (inject `ctx.user`; sessionId handled by `SessionIdArg` — do NOT add a `token` arg). Use `requireRole(ctx, token, roles)` from `convex/lib/auth.ts` only for action/internal contexts.
- **Testing convention (grounded):** extract pure functions and unit-test them with Vitest; auth-gated convex-test runtime tests are deferred per project convention (see the header of `convex/invoices/__tests__/mutations.test.ts`). TDD targets the pure credit-math/schedule core.
- **Money:** integers (IDR, no decimals). Never floats.
- **WIB dates:** reuse `convex/lib/periodRange.ts` (`getWibDateStr` + week helpers). Pitfall #18 bans the deleted alternatives — do not hand-roll week math.
- **Shared line type:** the schedule line `{ menuProductId, productName, qty, unitPrice, lineTotal }` is defined ONCE (`convex/subscriptions/types.ts`) and reused by schedule, invoice builder, and order generation (enforces schedule = invoice = credit by types).
- **Ball-count / analytics:** subscription orders must not pollute existing sales/margin/channel reports; BOM ball-counting (Pitfall #11/#13) must still resolve. Identify subscription revenue by `subscriptionId`/`fundingSource`.
- **camelCase** Convex field names. **Convex Ids are typed strings** (`Id<"table">`). **Mutations are async — always `await`.**
- **Ship-dark:** all surfaces manager+admin gated from day one; all schema additions optional/additive (no migration).
- **No direct commits to main for code** — this is `feature/subscription-credit-system`. `npm run build` must pass before merge.

---

# Phase A — Credit wallet + subscriptions (backend spine)

**Phase goal:** Land the 4 new tables + field additions, the pure credit-math core (pool derivation, drawdown, FIFO rollover expiry, schedule-total), the append-only ledger ops, and subscription CRUD — all behind manager+admin, all additive, `npm run build` green. No UI, no order generation yet (Phase B), no invoices (Phase C).

**Branch:** `feature/subscription-credit-system` (this worktree's branch).

## File Structure (Phase A)

- `convex/schema.ts` — **modify**: add `subscriptions`, `subscriptionWeeks`, `creditLedger`, `supplyAgreements` tables; add optional fields to `orders`, `invoices`, `customers`.
- `convex/subscriptions/types.ts` — **create**: shared literal unions + `ScheduleLine`, `LedgerEntryInput`, `CreditPool` types.
- `convex/subscriptions/creditMath.ts` — **create**: pure functions — `computeLineTotal`, `computeScheduleTotal`, `deriveCreditPool`, `nextBalanceAfter`, `planDrawdown`.
- `convex/subscriptions/rollover.ts` — **create**: pure FIFO rollover-expiry calculation (`computeRolloverExpiry`).
- `convex/subscriptions/ledger.ts` — **create**: internal ledger-write helpers (`postLedgerEntry` + typed wrappers).
- `convex/subscriptions/mutations.ts` — **create**: `createSubscription`, `updateSubscription` (protectedMutation, manager+admin).
- `convex/subscriptions/queries.ts` — **create**: `listSubscriptions`, `getSubscription`, `getWeekPool` (protectedQuery, manager+admin).
- `convex/subscriptions/weeks.ts` — **create**: pure `buildWeekFromTemplate` + `seedWeek` mutation.
- `convex/subscriptions/__tests__/creditMath.test.ts`, `rollover.test.ts`, `weeks.test.ts` — **create**: Vitest unit tests.
- `docs/SCHEMA.md`, `docs/CHANGELOG.md` — **modify**: document new tables.

---

### Task A1: Schema — new tables + additive field changes

**Files:**
- Modify: `convex/schema.ts` (add 4 tables; add fields to `customers` ~line 178, `orders` ~line 193, `invoices` ~line 2262)

**Interfaces:**
- Produces: tables `subscriptions`, `subscriptionWeeks`, `creditLedger`, `supplyAgreements` with the indexes named below; optional fields on `orders`/`invoices`/`customers`. All later tasks rely on these.

- [ ] **Step 1: Add the four new tables to the schema object**

In `convex/schema.ts`, inside `defineSchema({ ... })`, add:

```ts
  subscriptions: defineTable({
    customerId: v.id("customers"),
    label: v.string(),
    status: v.union(
      v.literal("draft"),
      v.literal("active"),
      v.literal("terminating"),
      v.literal("ended"),
    ),
    billingModel: v.union(v.literal("prepaid_weekly_credit")),
    unitPrice: v.number(), // confidential partner price (IDR)
    confidentialPrice: v.boolean(),
    baselineDailyQty: v.number(),
    weeklyQty: v.number(),
    deliverByTime: v.string(), // "09:00" WIB
    creditRolloverPolicy: v.union(v.literal("expire"), v.literal("rollover")),
    rolloverExpiryWeeks: v.optional(v.union(v.number(), v.null())), // default 4; null = never
    changeCutoffHour: v.number(), // 13
    changeCutoffDayOffset: v.number(), // -1
    permanentChangeNoticeDays: v.number(), // 14
    terminationNoticeDays: v.number(), // 30
    cogsBasis: v.number(),
    startDate: v.number(),
    terminationNoticeDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    agreementId: v.optional(v.id("supplyAgreements")),
    scheduleTemplate: v.array(
      v.object({
        dayOfWeek: v.number(), // 0-6
        items: v.array(v.object({ menuProductId: v.id("menuProducts"), qty: v.number() })),
      }),
    ),
    createdBy: v.id("users"),
    notes: v.optional(v.string()),
  })
    .index("by_customer", ["customerId"])
    .index("by_status", ["status"]),

  subscriptionWeeks: defineTable({
    subscriptionId: v.id("subscriptions"),
    weekStart: v.number(), // Monday 00:00 WIB
    weekEnd: v.number(), // Sunday 23:59 WIB
    status: v.union(
      v.literal("planned"),
      v.literal("confirmed"),
      v.literal("invoiced"),
      v.literal("paid"),
      v.literal("delivering"),
      v.literal("reconciled"),
      v.literal("closed"),
    ),
    plannedDays: v.array(
      v.object({
        date: v.number(),
        deliverByTime: v.string(),
        items: v.array(
          v.object({
            menuProductId: v.id("menuProducts"),
            productName: v.string(),
            qty: v.number(),
            unitPrice: v.number(),
            lineTotal: v.number(),
          }),
        ),
        locked: v.boolean(),
      }),
    ),
    creditIssued: v.number(),
    creditConsumed: v.number(),
    creditRemaining: v.number(),
    creditExpired: v.number(),
    shortfall: v.number(),
    shortfallFault: v.union(v.literal("none"), v.literal("cafe"), v.literal("frollie")),
    refundDue: v.number(),
    refundStatus: v.optional(v.string()),
    confirmedAt: v.optional(v.number()),
    confirmedBy: v.optional(v.id("users")),
    weeklyInvoiceId: v.optional(v.id("invoices")),
    paymentReceivedAt: v.optional(v.number()),
  })
    .index("by_subscription_weekStart", ["subscriptionId", "weekStart"])
    .index("by_status", ["status"]),

  creditLedger: defineTable({
    subscriptionId: v.id("subscriptions"),
    subscriptionWeekId: v.id("subscriptionWeeks"),
    type: v.union(
      v.literal("topup"),
      v.literal("drawdown"),
      v.literal("expiry"),
      v.literal("refund"),
      v.literal("adjustment"),
    ),
    amount: v.number(), // signed
    balanceAfter: v.number(),
    orderId: v.optional(v.id("orders")),
    invoiceId: v.optional(v.id("invoices")),
    rolloverFromWeekId: v.optional(v.id("subscriptionWeeks")),
    createdBy: v.id("users"),
    note: v.optional(v.string()),
  })
    .index("by_subscriptionWeek", ["subscriptionWeekId"])
    .index("by_subscription", ["subscriptionId"])
    .index("by_order", ["orderId"]),

  supplyAgreements: defineTable({
    customerId: v.id("customers"),
    subscriptionId: v.optional(v.id("subscriptions")),
    fileStorageId: v.id("_storage"),
    fileName: v.string(),
    fileSize: v.number(),
    uploadedBy: v.id("users"),
    uploadedAt: v.number(),
    status: v.union(
      v.literal("draft"),
      v.literal("signed"),
      v.literal("expired"),
      v.literal("terminated"),
    ),
    signedDate: v.optional(v.number()),
    governingLaw: v.optional(v.string()),
    signatories: v.optional(v.string()),
    keyTerms: v.optional(
      v.object({
        weeklyQty: v.number(),
        unitPrice: v.number(),
        weeklyCreditAmount: v.number(),
        baselineDailyQty: v.number(),
        deliverByTime: v.string(),
        permanentChangeNoticeDays: v.number(),
        terminationNoticeDays: v.number(),
        creditRolloverPolicy: v.union(v.literal("expire"), v.literal("rollover")),
        termType: v.string(),
      }),
    ),
    versions: v.optional(
      v.array(
        v.object({
          fileStorageId: v.id("_storage"),
          fileName: v.string(),
          uploadedAt: v.number(),
          lang: v.union(v.literal("id"), v.literal("en")),
        }),
      ),
    ),
  })
    .index("by_customer", ["customerId"])
    .index("by_subscription", ["subscriptionId"]),
```

> **Note on `_creationTime`:** business event time is stored explicitly (`uploadedAt`, `confirmedAt`, etc.) — never rely on `_creationTime` for filtering (project lesson).

- [ ] **Step 2: Add optional fields to `orders`**

In the `orders` table definition, add before its index chain:

```ts
    subscriptionId: v.optional(v.id("subscriptions")),
    subscriptionWeekId: v.optional(v.id("subscriptionWeeks")),
    deliveryDate: v.optional(v.number()),
    fundingSource: v.optional(
      v.union(
        v.literal("subscription_credit"),
        v.literal("deposit"),
        v.literal("normal"),
      ),
    ),
```

And add an index to the `orders` chain: `.index("by_subscriptionWeek", ["subscriptionWeekId"])`.

- [ ] **Step 3: Make `invoices.orderId` optional + add subscription fields (staffreview C1/C2)**

In the `invoices` table: change `orderId: v.id("orders")` → `orderId: v.optional(v.id("orders"))`. Add `date: v.optional(v.number())` inside the `items` object. Add after `orderId`:

```ts
    subscriptionWeekId: v.optional(v.id("subscriptionWeeks")),
    invoiceKind: v.optional(
      v.union(
        v.literal("standard"),
        v.literal("subscription_weekly"),
        v.literal("subscription_topup"),
      ),
    ),
```

- [ ] **Step 4: Add CRM fields to `customers`**

In the `customers` table, add these optional fields:

```ts
    keyContactName: v.optional(v.string()),
    keyContactRole: v.optional(v.string()),
    whatsapp: v.optional(v.string()),
    email: v.optional(v.string()),
    instagram: v.optional(v.string()),
    otherSocials: v.optional(
      v.array(v.object({ platform: v.string(), handle: v.string(), url: v.optional(v.string()) })),
    ),
    deliveryAddress: v.optional(v.string()),
    storeAddress: v.optional(v.string()),
    otherAddresses: v.optional(v.array(v.string())),
    altPhone: v.optional(v.string()),
```

- [ ] **Step 5: Regenerate the typed API + type-check**

Run: `npx convex codegen && npm run type-check`
Expected: codegen writes `convex/_generated/api.d.ts` with no errors; type-check passes. (Pitfall: stale `_generated/api.d.ts` is a recurring Phase-76/81 bug — always regen after schema change and `git add` it.)

- [ ] **Step 6: Guard the one `invoice.orderId` dereference (staffreview C1 — plan-review verified)**

Making `orderId` optional changes its type to `Id<"orders"> | undefined`. Verified: the ONLY break is `finalize` at `convex/invoices/mutations.ts:396` — `const order = await ctx.db.get(invoice.orderId);` (the other `by_order` consumers at lines 150/165/197/239 and `queries.ts:23` use the always-defined `args.orderId`, not `invoice.orderId`). Add a guard so subscription invoices (no order) skip the customer write-back:

```ts
    // 4. Customer write-back (standard order invoices only — subscription invoices have no order)
    const order = invoice.orderId ? await ctx.db.get(invoice.orderId) : null;
    if (order) {
```

Then run: `grep -rn "invoice\.orderId" convex/ src/` and confirm `finalize:396` is the only dereference; type-check catches any missed site.

- [ ] **Step 7: Commit**

```bash
git add convex/schema.ts convex/_generated/
git commit -m "feat(subscriptions): schema — credit wallet tables + additive order/invoice/customer fields"
```

---

### Task A2: Shared types + credit-math pure core (TDD)

**Files:**
- Create: `convex/subscriptions/types.ts`, `convex/subscriptions/creditMath.ts`
- Test: `convex/subscriptions/__tests__/creditMath.test.ts`

**Interfaces:**
- Produces:
  - `types.ts`: `type ScheduleLine = { menuProductId: Id<"menuProducts">; productName: string; qty: number; unitPrice: number; lineTotal: number }`; `type PlannedDay = { date: number; deliverByTime: string; items: ScheduleLine[]; locked: boolean }`; `type LedgerType = "topup"|"drawdown"|"expiry"|"refund"|"adjustment"`; `type CreditPool = { creditIssued: number; creditConsumed: number; creditRemaining: number; creditExpired: number }`.
  - `creditMath.ts`: `computeLineTotal(qty: number, unitPrice: number): number`; `computeScheduleTotal(days: PlannedDay[]): number`; `deriveCreditPool(entries: { type: LedgerType; amount: number }[]): CreditPool`; `nextBalanceAfter(prevBalance: number, amount: number): number`.

- [ ] **Step 1: Write `types.ts`**

```ts
import type { Id } from "../_generated/dataModel";

export type ScheduleLine = {
  menuProductId: Id<"menuProducts">;
  productName: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
};

export type PlannedDay = {
  date: number;
  deliverByTime: string;
  items: ScheduleLine[];
  locked: boolean;
};

export type LedgerType = "topup" | "drawdown" | "expiry" | "refund" | "adjustment";

export type CreditPool = {
  creditIssued: number;
  creditConsumed: number;
  creditRemaining: number;
  creditExpired: number;
};
```

- [ ] **Step 2: Write the failing test for the credit-math core**

`convex/subscriptions/__tests__/creditMath.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  computeLineTotal,
  computeScheduleTotal,
  deriveCreditPool,
  nextBalanceAfter,
} from "../creditMath";
import type { PlannedDay } from "../types";

const line = (qty: number, unitPrice: number) =>
  ({ menuProductId: "x" as never, productName: "Dubai", qty, unitPrice, lineTotal: qty * unitPrice });
const day = (items: ReturnType<typeof line>[]): PlannedDay =>
  ({ date: 0, deliverByTime: "09:00", items, locked: false });

describe("computeLineTotal", () => {
  it("multiplies qty by unit price (integer IDR)", () => {
    expect(computeLineTotal(150, 29000)).toBe(4350000);
  });
});

describe("computeScheduleTotal", () => {
  it("sums every line across every day", () => {
    const days = [day([line(100, 29000), line(50, 29000)]), day([line(150, 29000)])];
    expect(computeScheduleTotal(days)).toBe(8700000); // (100+50+150)*29000
  });
  it("returns 0 for an empty schedule", () => {
    expect(computeScheduleTotal([])).toBe(0);
  });
});

describe("deriveCreditPool", () => {
  it("replays signed ledger entries into a pool (topup +, drawdown/expiry -)", () => {
    const pool = deriveCreditPool([
      { type: "topup", amount: 30450000 },
      { type: "drawdown", amount: -4350000 },
      { type: "drawdown", amount: -4350000 },
      { type: "expiry", amount: -1000000 },
    ]);
    expect(pool.creditIssued).toBe(30450000);
    expect(pool.creditConsumed).toBe(8700000);
    expect(pool.creditExpired).toBe(1000000);
    expect(pool.creditRemaining).toBe(30450000 - 8700000 - 1000000);
  });
  it("counts refund as a reduction of remaining, not consumption", () => {
    const pool = deriveCreditPool([
      { type: "topup", amount: 10000000 },
      { type: "refund", amount: -2000000 },
    ]);
    expect(pool.creditConsumed).toBe(0);
    expect(pool.creditRemaining).toBe(8000000);
  });
});

describe("nextBalanceAfter", () => {
  it("adds the signed amount to the previous balance", () => {
    expect(nextBalanceAfter(30450000, -4350000)).toBe(26100000);
  });
});
```

- [ ] **Step 3: Run the test, verify it fails**

Run: `npx vitest run convex/subscriptions/__tests__/creditMath.test.ts`
Expected: FAIL — `creditMath` module / exports not found.

- [ ] **Step 4: Implement `creditMath.ts`**

```ts
import type { CreditPool, LedgerType, PlannedDay } from "./types";

export function computeLineTotal(qty: number, unitPrice: number): number {
  return Math.round(qty * unitPrice);
}

export function computeScheduleTotal(days: PlannedDay[]): number {
  return days.reduce(
    (sum, d) => sum + d.items.reduce((s, it) => s + computeLineTotal(it.qty, it.unitPrice), 0),
    0,
  );
}

export function nextBalanceAfter(prevBalance: number, amount: number): number {
  return prevBalance + amount;
}

export function deriveCreditPool(entries: { type: LedgerType; amount: number }[]): CreditPool {
  let creditIssued = 0;
  let creditConsumed = 0;
  let creditExpired = 0;
  let creditRemaining = 0;
  for (const e of entries) {
    creditRemaining += e.amount;
    if (e.type === "topup") creditIssued += e.amount;
    else if (e.type === "drawdown") creditConsumed += -e.amount;
    else if (e.type === "expiry") creditExpired += -e.amount;
    // refund / adjustment only move remaining
  }
  return { creditIssued, creditConsumed, creditRemaining, creditExpired };
}
```

- [ ] **Step 5: Run the test, verify it passes**

Run: `npx vitest run convex/subscriptions/__tests__/creditMath.test.ts`
Expected: PASS (all cases).

- [ ] **Step 6: Commit**

```bash
git add convex/subscriptions/types.ts convex/subscriptions/creditMath.ts convex/subscriptions/__tests__/creditMath.test.ts
git commit -m "feat(subscriptions): shared line types + credit-math pure core (TDD)"
```

---

### Task A3: FIFO rollover-expiry calculation (TDD)

**Files:**
- Create: `convex/subscriptions/rollover.ts`
- Test: `convex/subscriptions/__tests__/rollover.test.ts`

**Interfaces:**
- Produces: `computeRolloverExpiry(args: { unconsumed: number; policy: "expire" | "rollover"; rolloverExpiryWeeks: number | null; weeksCarried: number }): { action: "expire" | "carry"; amount: number }` — pure decision for one week's leftover at reconcile time. `weeksCarried` = how many weeks this credit has already rolled.

- [ ] **Step 1: Write the failing test**

`convex/subscriptions/__tests__/rollover.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeRolloverExpiry } from "../rollover";

describe("computeRolloverExpiry", () => {
  it("expires leftover when policy is expire", () => {
    expect(computeRolloverExpiry({ unconsumed: 4350000, policy: "expire", rolloverExpiryWeeks: 4, weeksCarried: 0 }))
      .toEqual({ action: "expire", amount: 4350000 });
  });
  it("carries leftover forward within the horizon", () => {
    expect(computeRolloverExpiry({ unconsumed: 4350000, policy: "rollover", rolloverExpiryWeeks: 4, weeksCarried: 1 }))
      .toEqual({ action: "carry", amount: 4350000 });
  });
  it("expires rolled credit once it reaches the horizon", () => {
    expect(computeRolloverExpiry({ unconsumed: 4350000, policy: "rollover", rolloverExpiryWeeks: 4, weeksCarried: 4 }))
      .toEqual({ action: "expire", amount: 4350000 });
  });
  it("never expires when rolloverExpiryWeeks is null (explicit opt-out)", () => {
    expect(computeRolloverExpiry({ unconsumed: 4350000, policy: "rollover", rolloverExpiryWeeks: null, weeksCarried: 99 }))
      .toEqual({ action: "carry", amount: 4350000 });
  });
  it("is a no-op for zero leftover", () => {
    expect(computeRolloverExpiry({ unconsumed: 0, policy: "rollover", rolloverExpiryWeeks: 4, weeksCarried: 0 }))
      .toEqual({ action: "carry", amount: 0 });
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx vitest run convex/subscriptions/__tests__/rollover.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `rollover.ts`**

```ts
export function computeRolloverExpiry(args: {
  unconsumed: number;
  policy: "expire" | "rollover";
  rolloverExpiryWeeks: number | null;
  weeksCarried: number;
}): { action: "expire" | "carry"; amount: number } {
  const { unconsumed, policy, rolloverExpiryWeeks, weeksCarried } = args;
  if (policy === "expire") return { action: "expire", amount: unconsumed };
  if (rolloverExpiryWeeks === null) return { action: "carry", amount: unconsumed };
  if (weeksCarried >= rolloverExpiryWeeks) return { action: "expire", amount: unconsumed };
  return { action: "carry", amount: unconsumed };
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npx vitest run convex/subscriptions/__tests__/rollover.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add convex/subscriptions/rollover.ts convex/subscriptions/__tests__/rollover.test.ts
git commit -m "feat(subscriptions): FIFO rollover-expiry decision (TDD, §13.1)"
```

---

### Task A4: Append-only ledger write helpers

**Files:**
- Create: `convex/subscriptions/ledger.ts`

**Interfaces:**
- Consumes: `deriveCreditPool`, `nextBalanceAfter` (A2); `creditLedger` + `subscriptionWeeks` tables (A1).
- Produces: `postLedgerEntry(ctx: MutationCtx, args: { subscriptionId; subscriptionWeekId; type: LedgerType; amount: number; createdBy: Id<"users">; orderId?; invoiceId?; rolloverFromWeekId?; note? }): Promise<Id<"creditLedger">>` — appends one immutable entry, computes `balanceAfter` from the running balance, and patches the week's denormalised pool fields. Used by Phases B/C (drawdown on funded order, topup on invoice paid, expiry/refund on reconcile).

- [ ] **Step 1: Implement `ledger.ts`**

```ts
import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import type { LedgerType } from "./types";
import { deriveCreditPool, nextBalanceAfter } from "./creditMath";

export async function postLedgerEntry(
  ctx: MutationCtx,
  args: {
    subscriptionId: Id<"subscriptions">;
    subscriptionWeekId: Id<"subscriptionWeeks">;
    type: LedgerType;
    amount: number; // signed
    createdBy: Id<"users">;
    orderId?: Id<"orders">;
    invoiceId?: Id<"invoices">;
    rolloverFromWeekId?: Id<"subscriptionWeeks">;
    note?: string;
  },
): Promise<Id<"creditLedger">> {
  // Running balance = last entry's balanceAfter for this week (append-only).
  const last = await ctx.db
    .query("creditLedger")
    .withIndex("by_subscriptionWeek", (q) => q.eq("subscriptionWeekId", args.subscriptionWeekId))
    .order("desc")
    .first();
  const prevBalance = last?.balanceAfter ?? 0;
  const balanceAfter = nextBalanceAfter(prevBalance, args.amount);

  const id = await ctx.db.insert("creditLedger", {
    subscriptionId: args.subscriptionId,
    subscriptionWeekId: args.subscriptionWeekId,
    type: args.type,
    amount: args.amount,
    balanceAfter,
    orderId: args.orderId,
    invoiceId: args.invoiceId,
    rolloverFromWeekId: args.rolloverFromWeekId,
    createdBy: args.createdBy,
    note: args.note,
  });

  // Re-derive the week's denormalised pool from the full ledger (source of truth = replay).
  const entries = await ctx.db
    .query("creditLedger")
    .withIndex("by_subscriptionWeek", (q) => q.eq("subscriptionWeekId", args.subscriptionWeekId))
    .collect();
  const pool = deriveCreditPool(entries.map((e) => ({ type: e.type, amount: e.amount })));
  await ctx.db.patch(args.subscriptionWeekId, {
    creditIssued: pool.creditIssued,
    creditConsumed: pool.creditConsumed,
    creditRemaining: pool.creditRemaining,
    creditExpired: pool.creditExpired,
  });

  return id;
}
```

> `postLedgerEntry` is ctx-dependent (no pure-fn unit test per project convention); its math (`deriveCreditPool`, `nextBalanceAfter`) is already covered by A2. The append-only + re-derive pattern keeps the pool consistent with the ledger.

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add convex/subscriptions/ledger.ts
git commit -m "feat(subscriptions): append-only ledger write + pool re-derivation"
```

---

### Task A5: Subscription CRUD (protectedMutation/Query, manager+admin)

**Files:**
- Create: `convex/subscriptions/mutations.ts`, `convex/subscriptions/queries.ts`

**Interfaces:**
- Consumes: `subscriptions` table (A1); `protectedMutation`/`protectedQuery` (`convex/lib/functions.ts`); `ctx.user` from the wrapper.
- Produces: `createSubscription`, `updateSubscription` mutations; `listSubscriptions`, `getSubscription`, `getWeekPool` queries — all `roles: ["manager","admin"]`.

- [ ] **Step 1: Implement `mutations.ts`**

```ts
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { protectedMutation } from "../lib/functions";

const scheduleTemplateArg = v.array(
  v.object({
    dayOfWeek: v.number(),
    items: v.array(v.object({ menuProductId: v.id("menuProducts"), qty: v.number() })),
  }),
);

export const createSubscription = protectedMutation({
  roles: ["manager", "admin"],
  args: {
    customerId: v.id("customers"),
    label: v.string(),
    unitPrice: v.number(),
    confidentialPrice: v.boolean(),
    baselineDailyQty: v.number(),
    deliverByTime: v.string(),
    creditRolloverPolicy: v.union(v.literal("expire"), v.literal("rollover")),
    rolloverExpiryWeeks: v.optional(v.union(v.number(), v.null())),
    cogsBasis: v.number(),
    startDate: v.number(),
    scheduleTemplate: scheduleTemplateArg,
    agreementId: v.optional(v.id("supplyAgreements")),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const customer = await ctx.db.get(args.customerId);
    if (!customer) throw new ConvexError("Customer not found");
    // weeklyQty is DERIVED from the template (staffreview I2 — avoid drift), not re-keyed.
    const weeklyQty = args.scheduleTemplate.reduce(
      (sum, day) => sum + day.items.reduce((s, it) => s + it.qty, 0),
      0,
    );
    return await ctx.db.insert("subscriptions", {
      ...args,
      weeklyQty,
      status: "draft",
      billingModel: "prepaid_weekly_credit",
      changeCutoffHour: 13,
      changeCutoffDayOffset: -1,
      permanentChangeNoticeDays: 14,
      terminationNoticeDays: 30,
      createdBy: ctx.user._id,
    });
  },
});

export const updateSubscription = protectedMutation({
  roles: ["manager", "admin"],
  args: {
    subscriptionId: v.id("subscriptions"),
    label: v.optional(v.string()),
    status: v.optional(
      v.union(v.literal("draft"), v.literal("active"), v.literal("terminating"), v.literal("ended")),
    ),
    unitPrice: v.optional(v.number()),
    baselineDailyQty: v.optional(v.number()),
    weeklyQty: v.optional(v.number()),
    deliverByTime: v.optional(v.string()),
    creditRolloverPolicy: v.optional(v.union(v.literal("expire"), v.literal("rollover"))),
    rolloverExpiryWeeks: v.optional(v.union(v.number(), v.null())),
    terminationNoticeDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    scheduleTemplate: v.optional(scheduleTemplateArg),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { subscriptionId, ...rest } = args;
    const sub = await ctx.db.get(subscriptionId);
    if (!sub) throw new ConvexError("Subscription not found");
    const patch = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
    await ctx.db.patch(subscriptionId, patch);
    return subscriptionId;
  },
});
```

- [ ] **Step 2: Implement `queries.ts`**

```ts
import { v } from "convex/values";
import { protectedQuery } from "../lib/functions";
import { deriveCreditPool } from "./creditMath";

export const listSubscriptions = protectedQuery({
  roles: ["manager", "admin"],
  args: { customerId: v.optional(v.id("customers")) },
  handler: async (ctx, args) => {
    if (args.customerId) {
      return await ctx.db
        .query("subscriptions")
        .withIndex("by_customer", (q) => q.eq("customerId", args.customerId!))
        .collect();
    }
    return await ctx.db.query("subscriptions").collect();
  },
});

export const getSubscription = protectedQuery({
  roles: ["manager", "admin"],
  args: { subscriptionId: v.id("subscriptions") },
  handler: async (ctx, args) => await ctx.db.get(args.subscriptionId),
});

export const getWeekPool = protectedQuery({
  roles: ["manager", "admin"],
  args: { subscriptionWeekId: v.id("subscriptionWeeks") },
  handler: async (ctx, args) => {
    const week = await ctx.db.get(args.subscriptionWeekId);
    if (!week) return null;
    const entries = await ctx.db
      .query("creditLedger")
      .withIndex("by_subscriptionWeek", (q) => q.eq("subscriptionWeekId", args.subscriptionWeekId))
      .collect();
    return { week, pool: deriveCreditPool(entries.map((e) => ({ type: e.type, amount: e.amount }))), entries };
  },
});
```

- [ ] **Step 3: Regenerate API + type-check**

Run: `npx convex codegen && npm run type-check`
Expected: PASS; new functions appear in `convex/_generated/api.d.ts`.

- [ ] **Step 4: Commit**

```bash
git add convex/subscriptions/mutations.ts convex/subscriptions/queries.ts convex/_generated/
git commit -m "feat(subscriptions): CRUD mutations + queries (manager+admin)"
```

---

### Task A6: Week seeding from template (TDD pure builder + mutation)

**Files:**
- Create: `convex/subscriptions/weeks.ts`
- Test: `convex/subscriptions/__tests__/weeks.test.ts`

**Interfaces:**
- Consumes: `computeLineTotal` (A2); `subscriptions`/`subscriptionWeeks` (A1); WIB helpers (`convex/lib/periodRange.ts`).
- Produces: pure `buildPlannedDays(args: { weekStart: number; template: {dayOfWeek:number; items:{menuProductId:Id<"menuProducts">; qty:number}[]}[]; unitPrice: number; deliverByTime: string; productNames: Record<string,string> }): PlannedDay[]`; mutation `seedWeek({ subscriptionId, weekStart })`.

- [ ] **Step 1: Write the failing test for the pure builder**

`convex/subscriptions/__tests__/weeks.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildPlannedDays } from "../weeks";

const DAY = 86400000;

describe("buildPlannedDays", () => {
  it("expands a template into 7 dated days at the partner unit price", () => {
    const template = [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
      dayOfWeek,
      items: [{ menuProductId: "p1" as never, qty: 150 }],
    }));
    const days = buildPlannedDays({
      weekStart: 0,
      template,
      unitPrice: 29000,
      deliverByTime: "09:00",
      productNames: { p1: "Dubai Chewy Cookies" },
    });
    expect(days).toHaveLength(7);
    expect(days[0].date).toBe(0);
    expect(days[6].date).toBe(6 * DAY);
    expect(days[0].items[0]).toMatchObject({ productName: "Dubai Chewy Cookies", qty: 150, unitPrice: 29000, lineTotal: 4350000 });
    expect(days[0].locked).toBe(false);
  });
  it("omits days the template has no entry for", () => {
    const days = buildPlannedDays({
      weekStart: 0,
      template: [{ dayOfWeek: 2, items: [{ menuProductId: "p1" as never, qty: 100 }] }],
      unitPrice: 29000,
      deliverByTime: "09:00",
      productNames: { p1: "Dubai" },
    });
    expect(days).toHaveLength(1);
    expect(days[0].date).toBe(2 * DAY);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx vitest run convex/subscriptions/__tests__/weeks.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `weeks.ts` (pure builder + mutation)**

```ts
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { protectedMutation } from "../lib/functions";
import { computeLineTotal } from "./creditMath";
import type { PlannedDay } from "./types";

const DAY_MS = 86400000;

export function buildPlannedDays(args: {
  weekStart: number;
  template: { dayOfWeek: number; items: { menuProductId: Id<"menuProducts">; qty: number }[] }[];
  unitPrice: number;
  deliverByTime: string;
  productNames: Record<string, string>;
}): PlannedDay[] {
  return [...args.template]
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
    .map((t) => ({
      date: args.weekStart + t.dayOfWeek * DAY_MS,
      deliverByTime: args.deliverByTime,
      locked: false,
      items: t.items.map((it) => ({
        menuProductId: it.menuProductId,
        productName: args.productNames[it.menuProductId as unknown as string] ?? "Unknown",
        qty: it.qty,
        unitPrice: args.unitPrice,
        lineTotal: computeLineTotal(it.qty, args.unitPrice),
      })),
    }));
}

export const seedWeek = protectedMutation({
  roles: ["manager", "admin"],
  args: { subscriptionId: v.id("subscriptions"), weekStart: v.number() },
  handler: async (ctx, args) => {
    const sub = await ctx.db.get(args.subscriptionId);
    if (!sub) throw new ConvexError("Subscription not found");

    // Idempotency: one week row per (subscription, weekStart).
    const existing = await ctx.db
      .query("subscriptionWeeks")
      .withIndex("by_subscription_weekStart", (q) =>
        q.eq("subscriptionId", args.subscriptionId).eq("weekStart", args.weekStart),
      )
      .first();
    if (existing) return existing._id;

    const productIds = [...new Set(sub.scheduleTemplate.flatMap((t) => t.items.map((i) => i.menuProductId)))];
    const productNames: Record<string, string> = {};
    for (const pid of productIds) {
      const p = await ctx.db.get(pid);
      if (p) productNames[pid as unknown as string] = p.name;
    }

    const plannedDays = buildPlannedDays({
      weekStart: args.weekStart,
      template: sub.scheduleTemplate,
      unitPrice: sub.unitPrice,
      deliverByTime: sub.deliverByTime,
      productNames,
    });

    return await ctx.db.insert("subscriptionWeeks", {
      subscriptionId: args.subscriptionId,
      weekStart: args.weekStart,
      weekEnd: args.weekStart + 7 * DAY_MS - 1,
      status: "planned",
      plannedDays,
      creditIssued: 0,
      creditConsumed: 0,
      creditRemaining: 0,
      creditExpired: 0,
      shortfall: 0,
      shortfallFault: "none",
      refundDue: 0,
    });
  },
});
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npx vitest run convex/subscriptions/__tests__/weeks.test.ts`
Expected: PASS.

- [ ] **Step 5: Regenerate API + type-check**

Run: `npx convex codegen && npm run type-check`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add convex/subscriptions/weeks.ts convex/subscriptions/__tests__/weeks.test.ts convex/_generated/
git commit -m "feat(subscriptions): seed week from template (TDD pure builder + idempotent mutation)"
```

---

### Task A7: Phase-A docs + full verification gate

**Files:**
- Modify: `docs/SCHEMA.md`, `docs/CHANGELOG.md`

- [ ] **Step 1: Document the new tables in `docs/SCHEMA.md`**

Add a "Subscription & Credit System" section listing the 4 new tables (fields + indexes) and the additive fields on `orders`/`invoices`/`customers`. Note `invoices.orderId` is now optional (subscription invoices have none).

- [ ] **Step 2: Add a CHANGELOG entry**

```markdown
## [Unreleased] — Subscription & Credit System (Phase A)
### Added
- Schema: `subscriptions`, `subscriptionWeeks`, `creditLedger`, `supplyAgreements` tables.
- Credit-math core (pool derivation, schedule total, FIFO rollover expiry) + append-only ledger.
- Subscription CRUD + week-seed (manager+admin).
### Changed
- `invoices.orderId` is now optional (subscription weekly invoices have no single owning order).
- Additive optional fields on `orders` (subscription/funding) and `customers` (CRM contact data).
```

- [ ] **Step 3: Run the full verification gate**

Run: `npm run type-check && npx vitest run convex/subscriptions && npm run build`
Expected: type-check PASS; all subscription unit tests PASS; build PASS (watch the vendor-bundle cap — Pitfall #16; Phase A is backend-only so it should not move chunks).

- [ ] **Step 4: Code-auditor pass (access control)**

Dispatch `code-auditor`: confirm every new `protectedMutation`/`protectedQuery` uses `roles: ["manager","admin"]`, no `["admin"]`-only on a manager-reachable surface (Pitfall #19), no deprecated `productionType`/`productionUnits` usage, no banned Phase-81 imports (Pitfall #18).

- [ ] **Step 5: Commit**

```bash
git add docs/SCHEMA.md docs/CHANGELOG.md
git commit -m "docs(subscriptions): Phase A schema + changelog"
```

---

## Phase A Success Criteria

- [ ] `npm run type-check` passes; `npx convex codegen` clean (`_generated/` committed).
- [ ] `npx vitest run convex/subscriptions` passes (creditMath, rollover, weeks).
- [ ] `npm run build` succeeds.
- [ ] 4 new tables + additive fields land; `invoices.orderId` optional; all `by_order` consumers null-tolerant.
- [ ] All new functions are `roles: ["manager","admin"]`.
- [ ] No order generation, invoices, or UI yet (those are B/C/D).

---

# Phases B–E — Roadmap (re-plan each via this pipeline as its predecessor merges)

> These are scoped phase charters, NOT executable task lists. Per the writing-plans Scope Check, each is its own feature branch + plan because its detailed signatures depend on the *merged* code of the prior phase. When Phase A merges, run the spec→plan pipeline on the relevant spec section to produce that phase's bite-sized plan. Branch each off freshly-synced `main`.

### Phase B — Automated ordering schedule + weekly cycle
- **Backend (`convex/subscriptions/scheduling/`):** `confirmWeek` (planned→confirmed→generates real `orders`+`orderItems` per `plannedDays`, carrying partner `unitPrice` so `orders.totalAmount` = drawdown; sets `subscriptionId`/`subscriptionWeekId`/`deliveryDate`/`fundingSource:"subscription_credit"`), drawdown-on-funded (calls `postLedgerEntry` type `drawdown`), week status transitions. Reuse WIB week helpers; **confirm must generate orders + the weekly invoice atomically** (spec edge case).
- **Frontend (`src/pages/crm/`):** schedule calendar (Mon→Sun real dates, menu-product dropdowns sourced from `menuProducts`, qty + `defaultPrice`-overridden-by-`unitPrice`, day/week subtotals, multi-product days, "Confirm → generate orders + invoice").
- **Test focus:** order-generation count + line totals = schedule; drawdown writes correct ledger entry + flips order to Paid; analytics isolation assertion (subscription order absent from sales/channel report totals — staffreview I3).
- **Kanban read-only:** subscription orders render distinct "🔒 Subscription" + no edit/status/delete; "Open in scheduler" link. Mirror into BOTH `OrderSlideOver.tsx` AND `OrderDetail.tsx` (Pitfall #20).

### Phase C — Invoicing (consolidated weekly + top-up) + reconciliation
- **Backend:** `createSubscriptionWeeklyInvoice({ subscriptionWeekId })` building `items` from `plannedDays` with `items[].date` (NOT `orderItems`), reusing `getNextInvoiceNumber`/`invoiceCounters`, `invoiceKind:"subscription_weekly"`, `orderId` null (staffreview C1/C2); `markWeeklyInvoicePaid` → `postLedgerEntry` type `topup`; schedule-driven top-up delta invoice (`invoiceKind:"subscription_topup"`); `reconcileWeek` using `computeRolloverExpiry` (A3) → `expiry`/`carry`(rollover `topup` tagged `rolloverFromWeekId`)/`refund` entries; `shortfallFault` attribution.
- **Frontend:** visual day-by-day invoice (group by `items[].date`), 1-click WhatsApp/email/PDF-PNG, CRM funding dashboard ("who hasn't paid / what needs funding").
- **Test focus:** weekly invoice with `orderId` null finalizes + numbers correctly; top-up = delta only; reconcile expire vs FIFO-rollover-within-horizon vs refund (multi-week ledger fixture).

### Phase D — CRM surface + navigation + agreements
- **Frontend (`src/pages/crm/`, `src/components/crm/`):** `/crm` home dashboard, customer record (contact/addresses/credit gauge/subscriptions/invoices/quick actions), chevron breadcrumbs + every-object-is-a-link, drawdown chart (delivered solid / planned dashed, dual-axis, leftover-credit flag, sums the customer's per-subscription pools for display), order history (per customer).
- **Backend:** `supplyAgreements` upload via `_storage` (reuse `convex/businessSettings/mutations.ts` pattern), key-terms→subscription-defaults seeding, bi-directional agreement↔subscription link; CRM customer fields write.
- **Access:** `<ProtectedRoute requiredPermission>` resolving to manager+admin; every CRM `useSessionQuery` backend `roles` superset (Pitfall #19).

### Phase E — Telegram reminders + rule enforcement
- **Backend (`convex/telegram/`, `convex/crons.ts`):** add `"subscription-ops"` to `KNOWN_TELEGRAM_ROLES` (`convex/telegram/config.ts`, Pitfall #21); 5 WIB crons (Sun 17:00 confirm, Mon 08:00 invoice due, daily 07:00 deliveries, daily 12:30 change-cutoff, Mon 09:00 reconcile) reusing the `convex/telegram/salesSummary/` resilient send + watchdog (staffreview I4); any new bot command needs a `COMMAND_POLICY` entry (Pitfall #22).
- **Rule enforcement:** 13:00 prior-day per-day lock (`plannedDays[].locked`), above-baseline → `needsSupplierConfirmation` (uses `baselineDailyQty`), permanent baseline change effective `noticeDate+14d`, termination `noticeDate+30d` stops week generation, COGS-rise alert when product COGS > `cogsBasis`, confidential price hidden from non-managers.
- **Test focus:** cron registration + resilient send; lock flips at cutoff; above-baseline flag; termination stops generation.

---

## Documentation Updates (per phase)
- [ ] CHANGELOG.md (every phase)
- [ ] SCHEMA.md (Phase A — new tables/fields)
- [ ] API_REFERENCE.md (Phases B–C — new queries/mutations)
- [ ] FILE_MAP.md (Phase D — CRM feature area + permission table)
- [ ] CLAUDE.md (Phase E — Telegram `subscription-ops` note), ROADMAP.md (boilerplate-agreement backlog)

## Self-Review (writing-plans)
- **Spec coverage:** §4 data model → A1; §3/§7 credit core → A2/A3/A4; §4.1 subscriptions CRUD → A5; week seed (§4.2) → A6; §6 schedule → B; §7/§8 invoicing/reconcile/out-of-credit → C; §5 CRM + §4.6 agreements + §4.7 customers → D; §9/§11 Telegram + rules → E. All spec sections mapped.
- **Placeholder scan:** Phase A steps contain full code + exact commands; B–E are explicitly charters (not placeholder tasks) to be expanded per-phase.
- **Type consistency:** `ScheduleLine`/`PlannedDay`/`CreditPool`/`LedgerType` defined in A2 `types.ts`; `postLedgerEntry`, `buildPlannedDays`, `computeRolloverExpiry`, `deriveCreditPool` signatures consistent across A4/A5/A6 consumers.
