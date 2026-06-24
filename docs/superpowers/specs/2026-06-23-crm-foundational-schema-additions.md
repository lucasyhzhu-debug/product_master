# CRM Foundational Schema Additions — ready-to-paste for the in-flight Phase B PR

**Date:** 2026-06-23
**Source:** `2026-06-23-crm-principles-conformance-audit.md` (fix-now items #2, #3, #4, #5, #13, #14 + shared-lib #6)
**Why now:** Phase B is mid-implementation and already edits `convex/schema.ts`. These are **all additive** (new table + new optional field + new indexes — no migration, no destructive change) and are load-bearing for the CRM timeline, the funding dashboard, the per-subscription drawdown, and the confidential-price strip. Landing them in the in-flight schema PR unblocks clean Phase D/E planning.

> All snippets are additive. After editing `convex/schema.ts`, run `npx convex codegen && npm run type-check` and commit `convex/_generated/` (Pitfall: stale codegen).

---

## 1. NEW table `customerActivity` (audit #2 — Critical, B5)

The timeline's **logged** half (derived events project from existing tables; these are the ones with no other home). Polymorphic subject-refs; explicit `at` business time (NOT `_creationTime` — project lesson: insertion time ≠ event time).

```ts
  customerActivity: defineTable({
    customerId: v.id("customers"),
    // CATEGORY axis — the SINGLE source-of-truth union, shared with crmActivityTaxonomy.ActivityType.
    // Derived events (orders/invoices/ledger) project into this SAME set; facets + visuals key on it.
    type: v.union(
      v.literal("order"),
      v.literal("finance"),
      v.literal("message"),
      v.literal("document"),
      v.literal("schedule"),
      v.literal("milestone"),
      // OPEN: "note" may fold under "message" or become a 7th category — finalize in the Phase D timeline task.
    ),
    // SPECIFIC logged kind (drives per-subtype icon/behaviour override): whatsapp_drafted | note | manual_milestone | …
    subtype: v.optional(v.string()),
    direction: v.optional(
      v.union(v.literal("inbound"), v.literal("outbound"), v.literal("system")),
    ),
    at: v.number(), // explicit WIB ms — business event time, NOT _creationTime
    actor: v.id("users"),
    summary: v.optional(v.string()),
    note: v.optional(v.string()),
    // polymorphic subject-refs (the event's linked object, A1/A4):
    subscriptionId: v.optional(v.id("subscriptions")),
    invoiceId: v.optional(v.id("invoices")),
    orderId: v.optional(v.id("orders")),
    agreementId: v.optional(v.id("supplyAgreements")),
  })
    .index("by_customer_at", ["customerId", "at"]), // windowed feed (B8)
```

> **Reconciliation (flagged by the Phase B review — two granularities were conflated; corrected here).** There is **ONE** source-of-truth union: the **category** axis `ActivityType` (`order | finance | message | document | schedule | milestone`, §7), shared by `customerActivity.type` AND the derived-event mapper. The **specific logged kinds** (`whatsapp_drafted`, `note`, `manual_milestone`) are **NOT a second `type` union** — they live in **`subtype`**, with per-subtype icon overrides (✓ funded / ⚖ reconcile). Derived events (orders/invoices/ledger) are NOT stored here — they project into the same `{ type, subtype }` shape at read time by `getCustomerTimeline`. **Open membership Q (finalize in the Phase D timeline task, where the spec says the taxonomy is locked):** whether `note` folds under `message` or becomes a 7th category, plus the exact `subtype` enumeration. Until then, modelling both as landed is correct — just route them through `type` (category) + `subtype` (kind), not two parallel `type` unions.

## 2. `invoices` — `customerId` + `by_customer` (audit #3 — Important, A4/B8)

Subscription weekly/top-up invoices have `orderId` undefined, so a weekly invoice is **unreachable by customer via any index** today. Add a denormalized `customerId`, backfilled at creation (`createSubscriptionWeeklyInvoice` already loads the customer) and at finalize for standard invoices (from the order).

```ts
  // inside invoices defineTable({ ... }) — add field:
    customerId: v.optional(v.id("customers")),
  // ... and add to the index chain:
    .index("by_customer", ["customerId"])
```

## 3. `invoices` — verify `by_subscriptionWeek` is actually merged (audit #4 — Important, A4)

The Phase B plan promises it (plan:54/723/870, QD11) but `schema.ts:2342-2344` currently has only `by_order`/`by_status_number`/`by_date`. Confirm it lands in the committed schema, not just plan prose:

```ts
    .index("by_subscriptionWeek", ["subscriptionWeekId"])
```

## 4. `invoices` — `by_kind_paymentStatus` (audit #14 — Minor, B8)

The gap#1 bank-match engine full-scans `final` invoices then filters in memory on `invoiceKind === "subscription_weekly" && paymentStatus !== "Paid"`. Index it:

```ts
    .index("by_kind_paymentStatus", ["invoiceKind", "paymentStatus"])
```

## 5. `orders` — `by_subscription` (audit #5 — Important, B8)

`orders` has `by_customer` + `by_subscriptionWeek` but not `by_subscription`. The timeline's order events and the per-subscription drawdown "delivered vs planned" partition (Phase D AC13, `getCustomerDrawdown`) need all orders for one subscription across weeks.

```ts
    .index("by_subscription", ["subscriptionId"])
```

## 6. `creditLedger` — `by_invoice` (audit #13 — Minor, B8)

Rows carry `invoiceId?` but there's no index; gap#1 idempotency and Phase D AC10 ("which topup funded this invoice") scan `by_subscriptionWeek` + in-memory filter.

```ts
    .index("by_invoice", ["invoiceId"])
```

---

## 7. Shared-lib `src/lib/crmActivityTaxonomy.ts` (audit #6 — Important, B6) — NOT a schema change

Single source of `type → { icon, color, direction, label }`, mirroring `src/lib/orderConstants.ts` (`STATUS_COLORS`/`getStatusColor`) and `src/lib/platformColors.ts`. Define the `ActivityType` union ONCE; import it into both `customerActivity.type` (backend) and the derived-event mapper. The `Record<ActivityType, …>` makes a missing entry a compile error (same guard as Pitfall #22's `COMMAND_POLICY`).

```ts
// src/lib/crmActivityTaxonomy.ts  (illustrative — finalize in the Phase D/shared-lib task)
export type ActivityType =
  | "order" | "finance" | "message" | "document" | "schedule" | "milestone";

export type ActivityVisual = {
  icon: string;        // ✓ funded / ⚖ reconcile / 📦 delivered / 💬 / 🧾 / 📄 / 📅 / 🏁
  colorClass: string;  // tailwind/text token, one per type
  label: string;
  direction?: "inbound" | "outbound" | "system";
};

export const ACTIVITY_TAXONOMY: Record<ActivityType, ActivityVisual> = {
  order:     { icon: "📦", colorClass: "...", label: "Order",     direction: "system" },
  finance:   { icon: "💳", colorClass: "...", label: "Finance",   direction: "system" },
  message:   { icon: "💬", colorClass: "...", label: "Message",   direction: "outbound" },
  document:  { icon: "📄", colorClass: "...", label: "Document",  direction: "inbound" },
  schedule:  { icon: "📅", colorClass: "...", label: "Schedule",  direction: "system" },
  milestone: { icon: "🏁", colorClass: "...", label: "Milestone", direction: "system" },
};

// per-subtype icon overrides (e.g. funded ✓ / reconcile ⚖) layered on the type default
export function getActivityVisual(type: ActivityType, subtype?: string): ActivityVisual { /* ... */ }
```

> Add a test asserting every `type` produced by `buildCustomerTimeline` (derived + logged) has a taxonomy entry — so a new event type can't ship without its visual.

---

## Checklist for the Phase B PR
- [ ] Add `customerActivity` table + `by_customer_at`.
- [ ] `invoices`: `+customerId` + `by_customer`; backfill at create/finalize.
- [ ] `invoices`: confirm `by_subscriptionWeek` merged; add `by_kind_paymentStatus`.
- [ ] `orders`: `+by_subscription`.
- [ ] `creditLedger`: `+by_invoice`.
- [ ] `npx convex codegen && npm run type-check`; commit `convex/_generated/`.
- [ ] `src/lib/crmActivityTaxonomy.ts` (shared-lib, with the `ActivityType` union + exhaustive `Record` + test).
