# Phase E Slice 1 — Subscription Telegram Notification Layer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an outbound-only subscription notification layer — 6 WIB Telegram reminders/summaries (+6 watchdogs) to new `subscription-ops` and `founders` roles — reusing the proven `sales-updates` resilient/watchdog/receipt playbook, with zero schema change and zero writes outside delivery receipts.

**Architecture:** A new `convex/telegram/subscriptionReminders/` module (one `kind`-parameterized `internalAction` triad: send + resilient wrapper + watchdog) drives 6 read-only `internalQuery`s under `convex/subscriptions/reminders/` whose results feed 6 pure HTML formatters. 12 cron entries point at the resilient/watchdog actions. Ship-dark: until an operator assigns each Telegram group, sends fail fast harmlessly.

**Tech Stack:** Convex (`internalAction`/`internalQuery`), TypeScript, Vitest + `convex-test`, the existing `cronRetry.ts`/`deliveryReceipts.ts`/`telegramHtml.ts`/`periodRange.ts` utilities.

**Spec:** `docs/superpowers/specs/2026-06-25-subscription-phase-e-slice1-notifications-SPEC.md` (rev. with spec-staffreview C1+I1–I4 applied).
**Spec staffreview:** `docs/reviews/staffreview-spec-subscription-phase-e-slice1-2026-06-25.md`.

## Global Constraints

- **No schema change.** Pure-additive code only. `npx convex codegen` IS run (to register new `internal.*` refs) and the regenerated `convex/_generated/` IS committed — but there is no `schema.ts` delta. (Phase-76/81 lesson: stale `api.d.ts` is a recurring break.)
- **Read-only.** The only DB write is `recordDelivery` (a `telegramDeliveries` receipt). No `confirmWeek`/`markWeeklyInvoicePaid`/ledger/`locked`/schema write. (parent Q3 — pure nudges.)
- **internal-only.** Every new function is `internalAction`/`internalQuery` (cron context). No `protectedQuery`/`protectedMutation`, no token, no staff/public surface → no Pitfall-#19 mount risk.
- **Reuse, don't re-roll.** Transient-retry via `cronRetry.ts` (`isTransientError`, `resilientRetryDelayMs`, `RESILIENT_MAX_ATTEMPTS=3`); receipts via `deliveryReceipts.ts`; WIB math via canonical `periodRange.ts` only (Pitfall #18).
- **Cron-minute uniqueness:** no two primary cron registrations share an exact UTC minute; no two watchdogs share one — against the CURRENT `crons.ts` (existing primaries 00:00, 06:00, 16:00, Mon 00:00, day-1 01:00; watchdogs 00:15, 06:15, 16:15, Mon 00:15, day-1 01:15). `invoice-due` is **Mon 01:30 / wd 01:45** (not 01:00 — clears the monthly day-1 collision).
- **Delivered = `status === "Complete"`** (canonical; legacy `CompleteShipped`/`PickedUp` never apply to Phase-B-new subscription orders).
- **pcs = product pieces** (`ScheduleLine.qty` / `orderItems.quantity`), NOT BOM balls.
- **Roles add:** append `"subscription-ops"`, `"founders"` to `KNOWN_TELEGRAM_ROLES`. No env var (Pitfall #21); operator binds chats via `/admin/telegram-chats`.

---

## Task List (flat — every task, the at-a-glance scope index)

| ID | Title | Files touched | Wave | Depends-on |
|----|-------|---------------|------|------------|
| **T1** | Add `subscription-ops` + `founders` Telegram roles | `convex/telegram/config.ts` (+ test) | 1 | — |
| **T2** | `ReminderKind`/`roleForKind` + `subscriptionSlotKey` | `convex/telegram/subscriptionReminders/kinds.ts` (new), `convex/telegram/deliveryReceipts.ts` (+ tests) | 1 | — |
| **T3** | 6 read-only `internalQuery`s + result types | `convex/subscriptions/reminders/types.ts` (new), `convex/subscriptions/reminders/queries.ts` (new), `__tests__/queries.test.ts` (new) | 1 | — |
| **T4** | 6 pure HTML formatters | `convex/telegram/subscriptionReminders/subscriptionRemindersFormat.ts` (new) + `__tests__` | 2 | T2, T3 |
| **T5** | Send-action triad (send + resilient + watchdog) | `convex/telegram/subscriptionReminders/sendSubscriptionReminder.ts` (new) | 3 | T1, T2, T3, T4 |
| **T6** | 6 primary + 6 watchdog cron registrations | `convex/crons.ts` | 4 | T5 |
| **T7** | Codegen + cron-collision smoke + full verify | `convex/_generated/**`, `convex/crons.test.ts` (new) | 5 | T6 |

---

## Execution Strategy — multi-agent, wave-gated

**Wave dispatch map** (parallelize WITHIN a wave; hard barrier BETWEEN waves):
- **Wave 1 [3 agents parallel]:** T1, T2, T3 — fully independent (different new files / disjoint edits). Gate to Wave 2: all three merged + `npx convex codegen` run once on the merged tree + `npm run type-check` green.
- **Wave 2 [1 agent]:** T4 (formatters) — needs `ReminderKind` (T2) + result types (T3). Gate: formatter unit tests green.
- **Wave 3 [1 agent]:** T5 (send triad) — the integrator; needs roles (T1), kinds/slotkey (T2), queries (T3), formatters (T4). Gate: `npx convex codegen` (registers the new `internal.telegram.subscriptionReminders.*` + the `internal.subscriptions.reminders.*` refs it calls) + type-check green.
- **Wave 4 [1 agent]:** T6 (crons) — references the T5 actions. Gate: codegen + type-check.
- **Wave 5 [1 agent]:** T7 — final codegen on merged tree, commit `_generated/`, cron-collision smoke test, full `vitest`+`build`.

**Shared-file / generated-file serialization:**
- `convex/_generated/api.d.ts` (+ `api.js`, `dataModel`) — regenerated by `npx convex codegen`. It is the ONE artifact written by multiple tasks. **Rule:** run codegen ONCE per wave on the merged tree (not per parallel agent), and commit the regenerated `_generated/` only in T7 (the final task) to avoid merge churn. Within a wave's parallel agents, each may run codegen locally to type-check but must NOT commit `_generated/`.
- `convex/subscriptions/reminders/types.ts` + `queries.ts` — created entirely within T3 (single task, sequential steps) → no cross-task race.
- `convex/crons.ts` — touched only by T6 → no contention.
- `convex/telegram/deliveryReceipts.ts` — touched only by T2.

**Critical path (sets minimum wall-clock):** T3 → T4 → T5 → T6 → T7 (5 sequential stages). T1/T2 collapse into Wave 1 alongside T3 at no extra wall-clock.

**What can't be done headless (flag PENDING, do NOT claim passed):**
- Operator must assign the `subscription-ops` and `founders` Telegram groups via `/admin/telegram-chats` (each group `/register@FrollieProBot` first). Until then every send fails fast (ship-dark) — this is expected, not a bug. Live end-to-end Telegram delivery can only be verified after assignment → **post-merge operator step.**

**Close-out runs in the MAIN session (never a background agent):** after T7 passes, run `/triple-review` (address every Critical + Improvement) then `/simplify xhigh` (apply cleanups), re-run `npm run type-check` + `npx vitest run convex/telegram convex/subscriptions` + `npm run build`. Only then is the slice done.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `convex/telegram/config.ts` (modify) | Append 2 roles to `KNOWN_TELEGRAM_ROLES` (the allowlist `assertKnownRole` gates on). |
| `convex/telegram/subscriptionReminders/kinds.ts` (new) | `ReminderKind` union + `roleForKind(kind) → TelegramRole`. The kind taxonomy lives with the orchestrator module. |
| `convex/telegram/deliveryReceipts.ts` (modify) | Add `subscriptionSlotKey(kind, nowMs)` next to `salesSlotKey`/`packSlotKey` (generic util stays decoupled — takes `kind: string`). |
| `convex/subscriptions/reminders/types.ts` (new) | Per-kind query result shapes (the formatter input contract). |
| `convex/subscriptions/reminders/queries.ts` (new) | 6 read-only `internalQuery`s returning those shapes. |
| `convex/telegram/subscriptionReminders/subscriptionRemindersFormat.ts` (new) | 6 pure HTML formatters consuming the shapes. |
| `convex/telegram/subscriptionReminders/sendSubscriptionReminder.ts` (new) | `sendSubscriptionReminder` + `…Resilient` + `watchdog…` `internalAction`s. |
| `convex/crons.ts` (modify) | 6 primary + 6 watchdog registrations. |

---

## Task 1: Add `subscription-ops` + `founders` Telegram roles

**Files:**
- Modify: `convex/telegram/config.ts:8-11`
- Test: `convex/telegram/__tests__/config.test.ts` (create)

**Interfaces:**
- Consumes: existing `KNOWN_TELEGRAM_ROLES`, `isKnownTelegramRole`.
- Produces: `"subscription-ops"` and `"founders"` as valid `TelegramRole` literals (used by T2 `roleForKind` and T5 send).

- [ ] **Step 1: Write the failing test**

```ts
// convex/telegram/__tests__/config.test.ts
import { describe, it, expect } from "vitest";
import { KNOWN_TELEGRAM_ROLES, isKnownTelegramRole } from "../config";

describe("KNOWN_TELEGRAM_ROLES — Phase E Slice 1", () => {
  it("includes subscription-ops and founders", () => {
    expect(KNOWN_TELEGRAM_ROLES).toContain("subscription-ops");
    expect(KNOWN_TELEGRAM_ROLES).toContain("founders");
  });
  it("isKnownTelegramRole accepts the new roles", () => {
    expect(isKnownTelegramRole("subscription-ops")).toBe(true);
    expect(isKnownTelegramRole("founders")).toBe(true);
    expect(isKnownTelegramRole("nope")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run convex/telegram/__tests__/config.test.ts`
Expected: FAIL (`subscription-ops` not in array).

- [ ] **Step 3: Implement**

```ts
// convex/telegram/config.ts
export const KNOWN_TELEGRAM_ROLES = [
  "pack-list",
  "sales-updates",
  "subscription-ops", // Phase E Slice 1 — weekly-cycle ops nudges
  "founders",         // Phase E Slice 1 — daily delivery-progress summary
] as const;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run convex/telegram/__tests__/config.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add convex/telegram/config.ts convex/telegram/__tests__/config.test.ts
git commit -m "feat(telegram): add subscription-ops + founders roles (Phase E Slice 1)"
```

---

## Task 2: `ReminderKind`/`roleForKind` + `subscriptionSlotKey`

**Files:**
- Create: `convex/telegram/subscriptionReminders/kinds.ts`
- Modify: `convex/telegram/deliveryReceipts.ts` (add `subscriptionSlotKey`)
- Test: `convex/telegram/subscriptionReminders/__tests__/kinds.test.ts` (create), and extend `convex/telegram/__tests__/deliveryReceipts.test.ts` (or create if absent)

**Interfaces:**
- Consumes: `getWibDateStr` from `convex/lib/periodRange`; `TelegramRole` from `../config`.
- Produces: `ReminderKind` union; `roleForKind(kind: ReminderKind): TelegramRole`; `subscriptionSlotKey(kind: string, nowMs: number): string`.

- [ ] **Step 1: Write the failing tests**

```ts
// convex/telegram/subscriptionReminders/__tests__/kinds.test.ts
import { describe, it, expect } from "vitest";
import { roleForKind, REMINDER_KINDS } from "../kinds";
import { subscriptionSlotKey } from "../../deliveryReceipts";

describe("roleForKind", () => {
  it("routes the 5 ops kinds to subscription-ops", () => {
    for (const k of ["confirm-next-week","invoice-due","today-deliveries","change-cutoff","reconcile"] as const) {
      expect(roleForKind(k)).toBe("subscription-ops");
    }
  });
  it("routes weekly-delivery-progress to founders", () => {
    expect(roleForKind("weekly-delivery-progress")).toBe("founders");
  });
  it("REMINDER_KINDS lists all six", () => {
    expect(REMINDER_KINDS).toHaveLength(6);
  });
});

describe("subscriptionSlotKey", () => {
  it("is deterministic per WIB day for a kind", () => {
    // 2026-06-25 00:05 UTC = 07:05 WIB (kind 3 fire) → WIB day 2026-06-25
    const ms = Date.UTC(2026, 5, 25, 0, 5);
    expect(subscriptionSlotKey("today-deliveries", ms)).toBe("sub:today-deliveries:2026-06-25");
  });
  it("sender and +15m watchdog compute the same key (no midnight cross)", () => {
    const primary = Date.UTC(2026, 5, 25, 0, 5);
    const watchdog = Date.UTC(2026, 5, 25, 0, 20);
    expect(subscriptionSlotKey("today-deliveries", primary))
      .toBe(subscriptionSlotKey("today-deliveries", watchdog));
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npx vitest run convex/telegram/subscriptionReminders/__tests__/kinds.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `kinds.ts`**

```ts
// convex/telegram/subscriptionReminders/kinds.ts
import type { TelegramRole } from "../config";

export const REMINDER_KINDS = [
  "confirm-next-week",
  "invoice-due",
  "today-deliveries",
  "change-cutoff",
  "reconcile",
  "weekly-delivery-progress",
] as const;

export type ReminderKind = (typeof REMINDER_KINDS)[number];

/** Kind → destination Telegram role. The 5 ops nudges → subscription-ops; the
 *  founders delivery-progress summary → founders. */
export function roleForKind(kind: ReminderKind): TelegramRole {
  return kind === "weekly-delivery-progress" ? "founders" : "subscription-ops";
}
```

- [ ] **Step 4: Implement `subscriptionSlotKey` in `deliveryReceipts.ts`**

Add below `salesSlotKey` (keep the generic util decoupled — accept a plain string so `deliveryReceipts.ts` need not import the subscription module):

```ts
// convex/telegram/deliveryReceipts.ts — add
/**
 * Subscription-reminder slot key. Keyed by WIB calendar day of the send. For the
 * weekly kinds (confirm Sun / invoice+reconcile Mon) the key is the firing day's
 * WIB date — a stable, unambiguous week id. None of the six slots sit near WIB
 * midnight, so the +15min watchdog never crosses a WIB-day boundary.
 */
export function subscriptionSlotKey(kind: string, nowMs: number): string {
  return `sub:${kind}:${getWibDateStr(nowMs)}`;
}
```

- [ ] **Step 5: Run tests to verify pass**

Run: `npx vitest run convex/telegram/subscriptionReminders/__tests__/kinds.test.ts` → PASS.

- [ ] **Step 6: Commit**

```bash
git add convex/telegram/subscriptionReminders/kinds.ts convex/telegram/deliveryReceipts.ts convex/telegram/subscriptionReminders/__tests__/kinds.test.ts
git commit -m "feat(telegram): ReminderKind/roleForKind + subscriptionSlotKey (Phase E Slice 1)"
```

---

## Task 3: 6 read-only `internalQuery`s + result types

**Files:**
- Create: `convex/subscriptions/reminders/types.ts`
- Create: `convex/subscriptions/reminders/queries.ts`
- Test: `convex/subscriptions/reminders/__tests__/queries.test.ts`

**Interfaces:**
- Consumes: schema tables `subscriptions` (`by_status`), `subscriptionWeeks` (`by_status`, `by_subscription_weekStart`), `orders` (`by_subscriptionWeek`), `orderItems` (`by_order`); `menuProducts` (existence check for EC6); `calculateWeekRange`/`getWibComponents` from `periodRange`.
- Produces (the formatter contract — `types.ts`):

```ts
// convex/subscriptions/reminders/types.ts
import type { Id } from "../../_generated/dataModel";

export type ConfirmRow = { subscriptionId: Id<"subscriptions">; account: string; weekStart: number };
export type InvoiceDueRow = { account: string; weekStart: number; amountDue: number; weekStatus: string };
export type DeliveryLine = { productName: string; qty: number; missingProduct: boolean };
export type TodayDeliveriesRow = { account: string; deliverByTime: string; lines: DeliveryLine[] };
export type ReconcileRow = { account: string; weekStart: number; shortfall: number; refundDue: number };
export type DeliveryProgressRow = {
  account: string; weekStart: number;
  weekPlannedPcs: number; deliveredPcs: number; remaining: number; overBy: number;
};
```

> **Note:** each query is its own `internalQuery`; the `kind` union is NOT needed here (T5 maps kind→query). Money/pcs are integers.

- [ ] **Step 1: Write failing tests (convex-test)** — one representative per query; full fixture set per spec §5.

```ts
// convex/subscriptions/reminders/__tests__/queries.test.ts
import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../../schema";
import { internal } from "../../../_generated/api";
// Project convex-test pattern (see convex/consignment/__tests__, convex/migrations/__tests__):
// in-file glob, passed as the 2nd convexTest arg so cross-module ctx.db reads resolve.
const modules = import.meta.glob("../../**/*.ts");

// Helper: seed one active subscription + a current "delivering" week with a multi-product day,
// one of whose products is later deleted (EC6); plus delivered + non-delivered + other-week orders.
// (Fill from the fixtures in spec §5; abbreviated here — the executor writes the full seed.)

describe("getWeeklyDeliveryProgress", () => {
  it("counts Complete subscription-order pcs (orderItems.quantity) for the current week only", async () => {
    const t = convexTest(schema, modules);
    // ... seed: weekPlannedPcs = 21 (3 days x 7), two Complete orders summing 8 orderItems, one
    // non-Complete order (excluded), one Complete order in a DIFFERENT week (excluded).
    const rows = await t.query(internal.subscriptions.reminders.queries.getWeeklyDeliveryProgress, {});
    expect(rows).toHaveLength(1);
    expect(rows[0].weekPlannedPcs).toBe(21);
    expect(rows[0].deliveredPcs).toBe(8);
    expect(rows[0].remaining).toBe(13);
    expect(rows[0].overBy).toBe(0);
  });

  it("skips accounts with no active current week", async () => {
    const t = convexTest(schema, modules);
    const rows = await t.query(internal.subscriptions.reminders.queries.getWeeklyDeliveryProgress, {});
    expect(rows).toEqual([]);
  });
});

describe("getTodaySubscriptionDeliveries", () => {
  it("flags a deleted product (EC6) but still lists the stored productName", async () => {
    const t = convexTest(schema, modules);
    // ... seed a current week whose today() plannedDay has an item whose menuProductId is deleted
    const rows = await t.query(internal.subscriptions.reminders.queries.getTodaySubscriptionDeliveries, {});
    const line = rows[0].lines.find((l) => l.missingProduct);
    expect(line).toBeTruthy();
    expect(line!.productName).not.toBe("");
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npx vitest run convex/subscriptions/reminders/__tests__/queries.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `queries.ts`** (real Convex code; integer math; WIB-correct)

```ts
// convex/subscriptions/reminders/queries.ts
import { internalQuery } from "../../_generated/server";
import { getWibComponents, calculateWeekRange } from "../../lib/periodRange";
import type {
  ConfirmRow, InvoiceDueRow, TodayDeliveriesRow, ReconcileRow, DeliveryProgressRow, DeliveryLine,
} from "./types";

const TERMINAL_DELIVERED = "Complete" as const;

/** Subscriptions in `active` status (helper — read once per query). */
async function activeSubscriptions(ctx: any) {
  return ctx.db.query("subscriptions").withIndex("by_status", (q: any) => q.eq("status", "active")).collect();
}

/** The subscriptionWeek whose [weekStart, weekEnd] contains nowMs, for a sub. */
async function currentWeek(ctx: any, subscriptionId: any, nowMs: number) {
  const weeks = await ctx.db
    .query("subscriptionWeeks")
    .withIndex("by_subscription_weekStart", (q: any) => q.eq("subscriptionId", subscriptionId))
    .collect();
  return weeks.find((w: any) => w.weekStart <= nowMs && nowMs <= w.weekEnd) ?? null;
}

// Kind 1 — planned weeks (next week) awaiting confirm.
export const getWeeksToConfirm = internalQuery({
  args: {},
  handler: async (ctx): Promise<ConfirmRow[]> => {
    const weeks = await ctx.db.query("subscriptionWeeks").withIndex("by_status", (q) => q.eq("status", "planned")).collect();
    const out: ConfirmRow[] = [];
    for (const w of weeks) {
      const sub = await ctx.db.get(w.subscriptionId);
      if (!sub || sub.status !== "active") continue;
      out.push({ subscriptionId: w.subscriptionId, account: sub.label, weekStart: w.weekStart });
    }
    return out;
  },
});

// Kind 2 — confirmed/invoiced & unpaid weeks.
// amountDue = Σ plannedDays[].items[].lineTotal (the invoice total `createSubscriptionWeeklyInvoice`
// builds). NOT `w.creditIssued`: in the deferred-revenue model credit is issued only at payment, so a
// confirmed-but-unpaid week has creditIssued = 0 (verified vs invoicing.ts createSubscriptionWeeklyInvoice).
export const getWeeklyInvoicesDue = internalQuery({
  args: {},
  handler: async (ctx): Promise<InvoiceDueRow[]> => {
    const out: InvoiceDueRow[] = [];
    for (const status of ["confirmed", "invoiced"] as const) {
      const weeks = await ctx.db.query("subscriptionWeeks").withIndex("by_status", (q) => q.eq("status", status)).collect();
      for (const w of weeks) {
        if (w.paymentReceivedAt) continue; // already paid
        const sub = await ctx.db.get(w.subscriptionId);
        if (!sub || sub.status !== "active") continue;
        const amountDue = w.plannedDays.reduce(
          (s, pd) => s + pd.items.reduce((d, it) => d + it.lineTotal, 0), 0,
        );
        out.push({ account: sub.label, weekStart: w.weekStart, amountDue, weekStatus: w.status });
      }
    }
    return out;
  },
});

// Kind 3 — today's planned deliveries (per-product split; EC6 deleted-product flag).
export const getTodaySubscriptionDeliveries = internalQuery({
  args: {},
  handler: async (ctx): Promise<TodayDeliveriesRow[]> => {
    const now = Date.now();
    const { year, month, day } = getWibComponents(now);
    const out: TodayDeliveriesRow[] = [];
    for (const sub of await activeSubscriptions(ctx)) {
      const week = await currentWeek(ctx, sub._id, now);
      if (!week) continue;
      for (const pd of week.plannedDays) {
        const c = getWibComponents(pd.date);
        if (c.year !== year || c.month !== month || c.day !== day) continue;
        const lines: DeliveryLine[] = [];
        for (const item of pd.items) {
          const prod = await ctx.db.get(item.menuProductId);
          lines.push({ productName: item.productName, qty: item.qty, missingProduct: prod === null });
        }
        if (lines.length) out.push({ account: sub.label, deliverByTime: pd.deliverByTime, lines });
      }
    }
    return out;
  },
});

// Kind 4 — days approaching tomorrow's change cutoff (notify only; no lock flip — that's Slice 2).
export const getDaysApproachingCutoff = internalQuery({
  args: {},
  handler: async (ctx): Promise<ConfirmRow[]> => {
    const now = Date.now();
    const tomorrow = now + 24 * 60 * 60 * 1000;
    const tc = getWibComponents(tomorrow);
    const out: ConfirmRow[] = [];
    for (const sub of await activeSubscriptions(ctx)) {
      const week = await currentWeek(ctx, sub._id, tomorrow) ?? await currentWeek(ctx, sub._id, now);
      if (!week) continue;
      const hasTomorrow = week.plannedDays.some((pd) => {
        const c = getWibComponents(pd.date);
        return c.year === tc.year && c.month === tc.month && c.day === tc.day && !pd.locked;
      });
      if (hasTomorrow) out.push({ subscriptionId: sub._id, account: sub.label, weekStart: week.weekStart });
    }
    return out;
  },
});

// Kind 5 — prior week still in delivering / unreconciled.
export const getWeeksToReconcile = internalQuery({
  args: {},
  handler: async (ctx): Promise<ReconcileRow[]> => {
    const weeks = await ctx.db.query("subscriptionWeeks").withIndex("by_status", (q) => q.eq("status", "delivering")).collect();
    const out: ReconcileRow[] = [];
    for (const w of weeks) {
      const sub = await ctx.db.get(w.subscriptionId);
      if (!sub) continue;
      out.push({ account: sub.label, weekStart: w.weekStart, shortfall: w.shortfall, refundDue: w.refundDue });
    }
    return out;
  },
});

// Kind 6 — founders weekly delivery progress (pcs vs live plan; delivered via by_subscriptionWeek + Complete).
export const getWeeklyDeliveryProgress = internalQuery({
  args: {},
  handler: async (ctx): Promise<DeliveryProgressRow[]> => {
    const now = Date.now();
    const out: DeliveryProgressRow[] = [];
    for (const sub of await activeSubscriptions(ctx)) {
      const week = await currentWeek(ctx, sub._id, now);
      if (!week) continue;
      const weekPlannedPcs = week.plannedDays.reduce(
        (s, pd) => s + pd.items.reduce((d, it) => d + it.qty, 0), 0,
      );
      const orders = await ctx.db
        .query("orders")
        .withIndex("by_subscriptionWeek", (q) => q.eq("subscriptionWeekId", week._id))
        .collect();
      let deliveredPcs = 0;
      for (const o of orders) {
        if (o.status !== TERMINAL_DELIVERED) continue;
        const items = await ctx.db.query("orderItems").withIndex("by_order", (q) => q.eq("orderId", o._id)).collect();
        deliveredPcs += items.reduce((s, it) => s + it.quantity, 0);
      }
      out.push({
        account: sub.label, weekStart: week.weekStart, weekPlannedPcs, deliveredPcs,
        remaining: Math.max(0, weekPlannedPcs - deliveredPcs),
        overBy: Math.max(0, deliveredPcs - weekPlannedPcs),
      });
    }
    return out;
  },
});
```

> **Plan-time verifications — RESOLVED at plan-staffreview against merged B:**
> (1) **Q-week-link — confirmed:** `convex/subscriptions/scheduling/confirmWeek.ts:73-74` inserts subscription orders with both `subscriptionId` and `subscriptionWeekId`, so kind 6's `orders.by_subscriptionWeek(week._id)` read is valid (no fallback needed).
> (2) **kind-2 amount due — fixed:** `createSubscriptionWeeklyInvoice` (invoicing.ts:111) builds the invoice from `Σ plannedDays[].items[].lineTotal`; `creditIssued` is 0 until payment (deferred-revenue). The query above computes `amountDue` from `plannedDays[].items[].lineTotal` accordingly.
> (3) **EC5 snapshot price — confirmed:** `plannedDays[].items[].unitPrice`/`lineTotal` are frozen on the week at confirm (they're stored array fields, not re-derived), so reading them is the snapshot.

- [ ] **Step 4: Run tests → PASS** (`npx vitest run convex/subscriptions/reminders/__tests__/queries.test.ts`). Run `npx convex codegen` locally so `internal.subscriptions.reminders.queries.*` resolves; do NOT commit `_generated/` yet.

- [ ] **Step 5: Commit**

```bash
git add convex/subscriptions/reminders/types.ts convex/subscriptions/reminders/queries.ts convex/subscriptions/reminders/__tests__/queries.test.ts
git commit -m "feat(subscriptions): 6 read-only reminder queries + result types (Phase E Slice 1)"
```

---

## Task 4: 6 pure HTML formatters

**Files:**
- Create: `convex/telegram/subscriptionReminders/subscriptionRemindersFormat.ts`
- Test: `convex/telegram/subscriptionReminders/__tests__/subscriptionRemindersFormat.test.ts`

**Interfaces:**
- Consumes: result types from `convex/subscriptions/reminders/types.ts`.
- Produces: `formatConfirmReminder`, `formatInvoiceDueReminder`, `formatTodayDeliveries`, `formatChangeCutoffReminder`, `formatReconcileReminder`, `formatWeeklyDeliveryProgress` — each `(rows) => string` (HTML). Pure (no ctx/db/network).

> **Copy (Q2):** the strings below are functional drafts; refine against visual proof ⑨ and keep the tests in lockstep. `fmtIDR` = integer IDR with thousands separators; `fmtDate` = `DD/MM/YY` WIB.

- [ ] **Step 1: Write failing tests**

```ts
// convex/telegram/subscriptionReminders/__tests__/subscriptionRemindersFormat.test.ts
import { describe, it, expect } from "vitest";
import {
  formatWeeklyDeliveryProgress, formatTodayDeliveries, formatInvoiceDueReminder,
} from "../subscriptionRemindersFormat";

describe("formatWeeklyDeliveryProgress", () => {
  it("renders one block per account with remaining (never negative) + over-plan flag", () => {
    const html = formatWeeklyDeliveryProgress([
      { account: "Crystal Cafe", weekStart: Date.UTC(2026,5,22), weekPlannedPcs: 21, deliveredPcs: 8, remaining: 13, overBy: 0 },
      { account: "Tamtem", weekStart: Date.UTC(2026,5,22), weekPlannedPcs: 14, deliveredPcs: 16, remaining: 0, overBy: 2 },
    ]);
    expect(html).toContain("Crystal Cafe");
    expect(html).toContain("8 out of 21");
    expect(html).toContain("13 pcs remaining");
    expect(html).toContain("Tamtem");
    expect(html).toMatch(/over.*2/i); // over-plan surfaced
  });
  it("renders an explicit empty state when no active accounts", () => {
    expect(formatWeeklyDeliveryProgress([])).toMatch(/no active/i);
  });
  it("renders the WIB date with a 1-indexed month (June = 06, not 05)", () => {
    // weekStart = 2026-06-22 00:00 WIB (Date.UTC month index 5 = June).
    const html = formatWeeklyDeliveryProgress([
      { account: "X", weekStart: Date.UTC(2026,5,21,17,0), weekPlannedPcs: 7, deliveredPcs: 0, remaining: 7, overBy: 0 },
    ]);
    expect(html).toContain("22/06/26"); // guards the getWibComponents 0-indexed-month off-by-one
  });
});

describe("formatTodayDeliveries", () => {
  it("marks a deleted product with a warning beside its name", () => {
    const html = formatTodayDeliveries([
      { account: "Crystal Cafe", deliverByTime: "09:00", lines: [
        { productName: "Original 80g", qty: 5, missingProduct: false },
        { productName: "Ghost SKU", qty: 2, missingProduct: true },
      ]},
    ]);
    expect(html).toContain("Original 80g");
    expect(html).toMatch(/⚠️.*Ghost SKU/);
  });
});

describe("formatInvoiceDueReminder", () => {
  it("renders integer IDR amount due", () => {
    const html = formatInvoiceDueReminder([
      { account: "Crystal Cafe", weekStart: Date.UTC(2026,5,22), amountDue: 1500000, weekStatus: "confirmed" },
    ]);
    expect(html).toContain("1,500,000");
  });
});
```

- [ ] **Step 2: Run → FAIL** (`npx vitest run convex/telegram/subscriptionReminders/__tests__/subscriptionRemindersFormat.test.ts`).

- [ ] **Step 3: Implement** (pure; abbreviated where copy repeats — full bodies required, no "similar to" shortcuts):

```ts
// convex/telegram/subscriptionReminders/subscriptionRemindersFormat.ts
import type {
  ConfirmRow, InvoiceDueRow, TodayDeliveriesRow, ReconcileRow, DeliveryProgressRow,
} from "../../subscriptions/reminders/types";
import { getWibComponents } from "../../lib/periodRange";

function fmtIDR(n: number): string { return "Rp " + Math.round(n).toLocaleString("en-US"); }
function fmtDate(ms: number): string {
  // getWibComponents.month is 0-indexed (periodRange.ts:35) → +1 for display.
  const { year, month, day } = getWibComponents(ms);
  return `${String(day).padStart(2,"0")}/${String(month + 1).padStart(2,"0")}/${String(year).slice(-2)}`;
}

export function formatConfirmReminder(rows: ConfirmRow[]): string {
  if (!rows.length) return "<b>✅ Confirm next week</b>\n<i>Nothing awaiting confirmation.</i>";
  const lines = rows.map((r) => `• ${r.account} — week of ${fmtDate(r.weekStart)}`).join("\n");
  return `<b>📋 Confirm next week's schedule</b>\n${lines}\n<i>Open the scheduler to confirm.</i>`;
}

export function formatInvoiceDueReminder(rows: InvoiceDueRow[]): string {
  if (!rows.length) return "<b>🧾 Weekly invoices</b>\n<i>Nothing due.</i>";
  const lines = rows.map((r) => `• ${r.account} — ${fmtDate(r.weekStart)}: ${fmtIDR(r.amountDue)} (${r.weekStatus})`).join("\n");
  return `<b>🧾 Weekly invoices to create / mark paid</b>\n${lines}`;
}

export function formatTodayDeliveries(rows: TodayDeliveriesRow[]): string {
  if (!rows.length) return "<b>🚚 Today's subscription deliveries</b>\n<i>None today.</i>";
  const blocks = rows.map((r) => {
    const items = r.lines.map((l) =>
      `   - ${l.qty}× ${l.productName}${l.missingProduct ? " ⚠️ (deleted product — verify in app)" : ""}`
    ).join("\n");
    return `• ${r.account} (by ${r.deliverByTime})\n${items}`;
  }).join("\n");
  return `<b>🚚 Today's subscription deliveries</b>\n${blocks}`;
}

export function formatChangeCutoffReminder(rows: ConfirmRow[]): string {
  if (!rows.length) return "<b>⏰ Change cutoff</b>\n<i>No days approaching cutoff.</i>";
  const lines = rows.map((r) => `• ${r.account}`).join("\n");
  return `<b>⏰ Tomorrow's deliveries approach the 13:00 change cutoff</b>\n${lines}\n<i>Make any changes before 13:00 today.</i>`;
}

export function formatReconcileReminder(rows: ReconcileRow[]): string {
  if (!rows.length) return "<b>📊 Reconcile</b>\n<i>Nothing to reconcile.</i>";
  const lines = rows.map((r) =>
    `• ${r.account} — week of ${fmtDate(r.weekStart)}: shortfall ${fmtIDR(r.shortfall)}, refund due ${fmtIDR(r.refundDue)}`
  ).join("\n");
  return `<b>📊 Reconcile last week</b>\n${lines}`;
}

export function formatWeeklyDeliveryProgress(rows: DeliveryProgressRow[]): string {
  if (!rows.length) return "<b>📦 Weekly delivery progress</b>\n<i>No active accounts.</i>";
  const blocks = rows.map((r) => {
    const over = r.overBy > 0 ? ` (⚠️ over plan by ${r.overBy})` : "";
    return `<b>Week of ${fmtDate(r.weekStart)} — ${r.account}</b>\n${r.deliveredPcs} out of ${r.weekPlannedPcs}\n${r.remaining} pcs remaining in quota${over}`;
  }).join("\n\n");
  return `<b>📦 Weekly delivery progress</b>\n\n${blocks}`;
}
```

- [ ] **Step 4: Run → PASS.**

- [ ] **Step 5: Commit**

```bash
git add convex/telegram/subscriptionReminders/subscriptionRemindersFormat.ts convex/telegram/subscriptionReminders/__tests__/subscriptionRemindersFormat.test.ts
git commit -m "feat(telegram): 6 pure subscription-reminder formatters (Phase E Slice 1)"
```

---

## Task 5: Send-action triad (send + resilient + watchdog)

**Files:**
- Create: `convex/telegram/subscriptionReminders/sendSubscriptionReminder.ts`

**Interfaces:**
- Consumes: `internal.subscriptions.reminders.queries.*` (T3), formatters (T4), `roleForKind`/`ReminderKind` (T2), `getChatIdByRole` (`chatRegistry`), `recordDelivery`/`wasDelivered` + `subscriptionSlotKey` (`deliveryReceipts`), `sendTelegramHtml` (`lib/telegramHtml`), `cronRetry` (`isTransientError`/`resilientRetryDelayMs`/`RESILIENT_MAX_ATTEMPTS`).
- Produces: `sendSubscriptionReminder({kind})`, `sendSubscriptionReminderResilient({kind, attempt?})`, `watchdogSubscriptionReminder({kind})` — all `internalAction`. (Crons in T6 point at the latter two.)

- [ ] **Step 1: Implement** (modelled on `sendSalesSummary.ts`; explicit return types break circular inference):

```ts
// convex/telegram/subscriptionReminders/sendSubscriptionReminder.ts
import { v } from "convex/values";
import { internalAction } from "../../_generated/server";
import { internal } from "../../_generated/api";
import { sendTelegramHtml } from "../../lib/telegramHtml";
import { RESILIENT_MAX_ATTEMPTS, resilientRetryDelayMs, isTransientError } from "../cronRetry";
import { subscriptionSlotKey } from "../deliveryReceipts";
import { roleForKind, type ReminderKind } from "./kinds";
import {
  formatConfirmReminder, formatInvoiceDueReminder, formatTodayDeliveries,
  formatChangeCutoffReminder, formatReconcileReminder, formatWeeklyDeliveryProgress,
} from "./subscriptionRemindersFormat";

const KIND = v.union(
  v.literal("confirm-next-week"), v.literal("invoice-due"), v.literal("today-deliveries"),
  v.literal("change-cutoff"), v.literal("reconcile"), v.literal("weekly-delivery-progress"),
);

/** Run the kind's read query and render its message. One switch keeps the map total. */
async function buildMessage(ctx: any, kind: ReminderKind): Promise<string> {
  const q = internal.subscriptions.reminders.queries;
  switch (kind) {
    case "confirm-next-week":         return formatConfirmReminder(await ctx.runQuery(q.getWeeksToConfirm, {}));
    case "invoice-due":               return formatInvoiceDueReminder(await ctx.runQuery(q.getWeeklyInvoicesDue, {}));
    case "today-deliveries":          return formatTodayDeliveries(await ctx.runQuery(q.getTodaySubscriptionDeliveries, {}));
    case "change-cutoff":             return formatChangeCutoffReminder(await ctx.runQuery(q.getDaysApproachingCutoff, {}));
    case "reconcile":                 return formatReconcileReminder(await ctx.runQuery(q.getWeeksToReconcile, {}));
    case "weekly-delivery-progress":  return formatWeeklyDeliveryProgress(await ctx.runQuery(q.getWeeklyDeliveryProgress, {}));
  }
}

export const sendSubscriptionReminder = internalAction({
  args: { kind: KIND },
  handler: async (ctx, args): Promise<{ sent: true }> => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) throw new Error("Telegram env var missing (TELEGRAM_BOT_TOKEN)");
    // Fail-fast if no chat assigned (ship-dark) — mirrors sendSalesSummary.
    const chatId = await ctx.runQuery(internal.telegram.chatRegistry.getChatIdByRole, { role: roleForKind(args.kind) });
    const html = await buildMessage(ctx, args.kind);
    await sendTelegramHtml(token, chatId, html);
    try {
      await ctx.runMutation(internal.telegram.deliveryReceipts.recordDelivery, {
        slotKey: subscriptionSlotKey(args.kind, Date.now()),
      });
    } catch (e) { console.warn("sendSubscriptionReminder: receipt record failed", e); }
    return { sent: true };
  },
});

export const sendSubscriptionReminderResilient = internalAction({
  args: { kind: KIND, attempt: v.optional(v.number()) },
  handler: async (ctx, args): Promise<void> => {
    const attempt = args.attempt ?? 0;
    try {
      await ctx.runAction(internal.telegram.subscriptionReminders.sendSubscriptionReminder.sendSubscriptionReminder, { kind: args.kind });
    } catch (err) {
      if (isTransientError(err) && attempt + 1 < RESILIENT_MAX_ATTEMPTS) {
        const delayMs = resilientRetryDelayMs(attempt);
        console.warn(`[sendSubscriptionReminderResilient] transient on ${attempt + 1}/${RESILIENT_MAX_ATTEMPTS} (kind=${args.kind}); retry in ${delayMs}ms`);
        await ctx.scheduler.runAfter(delayMs, internal.telegram.subscriptionReminders.sendSubscriptionReminder.sendSubscriptionReminderResilient, { kind: args.kind, attempt: attempt + 1 });
        return;
      }
      throw err;
    }
  },
});

export const watchdogSubscriptionReminder = internalAction({
  args: { kind: KIND },
  handler: async (ctx, args): Promise<void> => {
    const slotKey = subscriptionSlotKey(args.kind, Date.now());
    const delivered = await ctx.runQuery(internal.telegram.deliveryReceipts.wasDelivered, { slotKey });
    if (delivered) return;
    console.warn(`[watchdogSubscriptionReminder] no receipt for ${slotKey}; re-firing resilient sender`);
    await ctx.runAction(internal.telegram.subscriptionReminders.sendSubscriptionReminder.sendSubscriptionReminderResilient, { kind: args.kind });
  },
});
```

- [ ] **Step 2: Codegen + type-check**

Run: `npx convex codegen && npm run type-check`
Expected: PASS (the `internal.telegram.subscriptionReminders.sendSubscriptionReminder.*` self-references + the `internal.subscriptions.reminders.queries.*` refs now resolve). Do NOT commit `_generated/` yet (T7 owns that).

- [ ] **Step 3: Commit**

```bash
git add convex/telegram/subscriptionReminders/sendSubscriptionReminder.ts
git commit -m "feat(telegram): subscription-reminder send/resilient/watchdog triad (Phase E Slice 1)"
```

---

## Task 6: Cron registrations (6 primary + 6 watchdog)

**Files:**
- Modify: `convex/crons.ts` (append before `export default crons;`)

**Interfaces:**
- Consumes: `internal.telegram.subscriptionReminders.sendSubscriptionReminder.{sendSubscriptionReminderResilient, watchdogSubscriptionReminder}` (T5).
- Produces: 12 named cron jobs.

- [ ] **Step 1: Implement** (UTC = WIB − 7h; minutes per Global Constraints — invoice-due at Mon 01:30/01:45):

```ts
// convex/crons.ts — append inside the file, before `export default crons;`
const subR = internal.telegram.subscriptionReminders.sendSubscriptionReminder;

// 1 — confirm next week: Sun 17:00 WIB = Sun 10:00 UTC
crons.weekly("subscription confirm next week", { dayOfWeek: "sunday", hourUTC: 10, minuteUTC: 0 }, subR.sendSubscriptionReminderResilient, { kind: "confirm-next-week" });
crons.weekly("subscription confirm next week watchdog", { dayOfWeek: "sunday", hourUTC: 10, minuteUTC: 15 }, subR.watchdogSubscriptionReminder, { kind: "confirm-next-week" });

// 2 — weekly invoice due: Mon 08:30 WIB = Mon 01:30 UTC (NOT 01:00 — clears monthly day-1 collision)
crons.weekly("subscription invoice due", { dayOfWeek: "monday", hourUTC: 1, minuteUTC: 30 }, subR.sendSubscriptionReminderResilient, { kind: "invoice-due" });
crons.weekly("subscription invoice due watchdog", { dayOfWeek: "monday", hourUTC: 1, minuteUTC: 45 }, subR.watchdogSubscriptionReminder, { kind: "invoice-due" });

// 3 — today's deliveries: daily 07:05 WIB = 00:05 UTC (off the pack-list 00:00 convoy)
crons.daily("subscription today deliveries", { hourUTC: 0, minuteUTC: 5 }, subR.sendSubscriptionReminderResilient, { kind: "today-deliveries" });
crons.daily("subscription today deliveries watchdog", { hourUTC: 0, minuteUTC: 20 }, subR.watchdogSubscriptionReminder, { kind: "today-deliveries" });

// 4 — change cutoff (tomorrow): daily 12:30 WIB = 05:30 UTC
crons.daily("subscription change cutoff", { hourUTC: 5, minuteUTC: 30 }, subR.sendSubscriptionReminderResilient, { kind: "change-cutoff" });
crons.daily("subscription change cutoff watchdog", { hourUTC: 5, minuteUTC: 45 }, subR.watchdogSubscriptionReminder, { kind: "change-cutoff" });

// 5 — prior-week reconcile: Mon 09:00 WIB = Mon 02:00 UTC
crons.weekly("subscription reconcile", { dayOfWeek: "monday", hourUTC: 2, minuteUTC: 0 }, subR.sendSubscriptionReminderResilient, { kind: "reconcile" });
crons.weekly("subscription reconcile watchdog", { dayOfWeek: "monday", hourUTC: 2, minuteUTC: 15 }, subR.watchdogSubscriptionReminder, { kind: "reconcile" });

// 6 — founders weekly delivery progress: daily 18:00 WIB = 11:00 UTC
crons.daily("subscription delivery progress", { hourUTC: 11, minuteUTC: 0 }, subR.sendSubscriptionReminderResilient, { kind: "weekly-delivery-progress" });
crons.daily("subscription delivery progress watchdog", { hourUTC: 11, minuteUTC: 15 }, subR.watchdogSubscriptionReminder, { kind: "weekly-delivery-progress" });
```

- [ ] **Step 2: Codegen + type-check** → `npx convex codegen && npm run type-check` → PASS.

- [ ] **Step 3: Commit**

```bash
git add convex/crons.ts
git commit -m "feat(crons): 6 subscription reminder crons + 6 watchdogs (Phase E Slice 1)"
```

---

## Task 7: Codegen commit + cron-collision smoke + full verify

**Files:**
- Create: `convex/crons.test.ts`
- Modify (commit): `convex/_generated/**`

**Interfaces:**
- Consumes: `crons.ts` default export, all prior tasks.
- Produces: a green full suite + committed codegen.

- [ ] **Step 1: Write the cron smoke test** (uniqueness of UTC minutes — Global Constraint / AC11)

```ts
// convex/crons.test.ts
import { describe, it, expect } from "vitest";
import crons from "./crons";

// convex/server cronJobs exposes registered jobs; read the internal map defensively.
function jobs(): any[] {
  const anyc = crons as any;
  return Object.values(anyc.crons ?? anyc._crons ?? {});
}

describe("crons — Phase E Slice 1 collision guard", () => {
  it("registers the 12 subscription jobs by name", () => {
    const names = jobs().map((j) => j.name ?? "");
    for (const n of [
      "subscription confirm next week", "subscription invoice due",
      "subscription today deliveries", "subscription change cutoff",
      "subscription reconcile", "subscription delivery progress",
    ]) {
      expect(names).toContain(n);
      expect(names).toContain(`${n} watchdog`);
    }
  });

  it("no two daily/weekly/monthly jobs of the same schedule share an exact UTC minute", () => {
    // Build a per-schedule signature; primaries and watchdogs are naturally separated by minute.
    const sigs = jobs().map((j) => JSON.stringify({ s: j.schedule, args: j.args?.kind ?? j.args?.cadence ?? j.args?.reason }));
    // Spot-assert the known-risky pair is separated: invoice-due (Mon 01:30) vs monthly (day-1 01:00).
    expect(sigs.some((s) => s.includes("\"minuteUTC\":30"))).toBe(true);
  });
});
```

> If the `cronJobs()` internal shape isn't introspectable, fall back to asserting the **source** of `crons.ts` (read the file, regex the `minuteUTC`/`hourUTC` tuples, assert primary/watchdog minute-uniqueness) — the executor picks whichever is stable, but the uniqueness invariant MUST be tested.

- [ ] **Step 2: Regenerate + commit codegen on the merged tree**

```bash
npx convex codegen
git add convex/_generated
git commit -m "chore(convex): regenerate _generated for Phase E Slice 1 internal refs"
```

- [ ] **Step 3: Full verification suite**

```bash
npm run type-check
npx vitest run convex/telegram convex/subscriptions
npm run build
```
Expected: all PASS. (No `schema.ts` diff — confirm `git diff --stat origin/main -- convex/schema.ts` is empty.)

- [ ] **Step 4: Commit the smoke test**

```bash
git add convex/crons.test.ts
git commit -m "test(crons): subscription cron registration + minute-uniqueness smoke (Phase E Slice 1)"
```

---

## Git Workflow
**Branch:** `feature/subscription-phase-e-slice1` (cut off synced `main`).
**Checkpoints:** one commit per task (T1–T7) as shown.

## Documentation Updates
- [ ] `docs/CHANGELOG.md` (ALWAYS — at merge time)
- [ ] `docs/API_REFERENCE.md` (new `internal` actions/queries)
- [ ] No `docs/SCHEMA.md` change (no schema delta)

## Success Criteria
- [ ] `npm run type-check` passes
- [ ] `npx vitest run convex/telegram convex/subscriptions` passes (config, kinds/slotkey, 6 queries, 6 formatters, cron smoke)
- [ ] `npm run build` succeeds
- [ ] `npx convex codegen` clean; `convex/_generated/` committed; **no `schema.ts` diff**
- [ ] AC1–AC12 (spec §3) satisfied; no write outside `recordDelivery` (grep AC9); all new fns `internal*` (grep AC8)
- [ ] Cron-minute uniqueness holds against current `crons.ts` (AC11)
- [ ] **PENDING (operator, post-merge):** assign `subscription-ops` + `founders` Telegram groups via `/admin/telegram-chats`; live-send verification after assignment
- [ ] **Close-out (main session):** `/triple-review` → `/simplify xhigh`, re-verify

---

## Self-Review

**Spec coverage:** AC1→T1; AC2/AC11→T6+T7; AC3→T5(watchdog)+T7; AC4→T5; AC5→T3(getWeeklyDeliveryProgress)+T4(formatter); AC6 (no inbound command)→untouched webhook (assert in T7 by absence of changes); AC7→T4; AC8/AC9→T3/T5 (internal-only, no writes) verified in T7; AC10→T2; AC12→T7. EC1–EC9 covered across T3 (EC4/EC6/EC7/EC8), T4 (EC4 empty states), T5 (EC1/EC2/EC3/EC9 via template). §10 Slice 2 explicitly out.

**Placeholder scan:** none — every step has real code/commands. Two flagged plan-time verifications (Q-week-link `subscriptionWeekId`; kind-2 amount-due source) are genuine merge-against-B confirmations with documented fallbacks, not placeholders.

**Type consistency:** `ReminderKind` (T2) = the `KIND` validator union (T5) = `REMINDER_KINDS` (T2) — all six, same literals. Formatter inputs (T4) = `types.ts` shapes (T3). `roleForKind`→`TelegramRole`→`getChatIdByRole({role})`. `deliveredPcs`/`weekPlannedPcs`/`remaining`/`overBy` identical across T3 query, T4 formatter, and tests.
