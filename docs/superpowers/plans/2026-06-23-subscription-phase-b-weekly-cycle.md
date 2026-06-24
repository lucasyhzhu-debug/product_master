# Subscription Phase B — Automated Ordering Schedule + Weekly Billing Cycle (merged B+C) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete weekly subscription cycle — plan a week in a calendar → confirm → generate real orders + a weekly credit invoice → mark paid → fund credit → orders draw down → reconcile at week-end — on top of the Phase-A credit-wallet spine, manager+admin only.

**Architecture:** The confirmed schedule is the single source of truth; the credit amount is *derived* (`schedule total = invoice total = credit granted`). Phase A shipped the tables + pure credit-math + append-only ledger + CRUD + week-seed. This phase adds: scheduling (validate/align/seed-sources/confirm + order generation), the money loop (weekly invoice, drawdown-on-funded, top-up, reconcile incl. per-tranche FIFO rollover), the `/crm` calendar + invoice + funding UI, and read-only subscription rendering on the kanban. Convex serverless backend + React 19 frontend.

**Tech Stack:** Convex (`protectedMutation`/`protectedQuery` from `convex/lib/functions.ts`), TypeScript, Vitest (pure-function unit tests), React 19 + shadcn/ui + Tailwind 4, `react-router` lazy routes.

**Spec:** `docs/superpowers/specs/2026-06-23-subscription-credit-system-design.md` (merged Phase B = §6 schedule, §7 billing/credit/weekly cycle incl. reconcile, §8 out-of-credit)
**Spec staffreview:** `docs/reviews/staffreview-subscription-phase-b-merged-2026-06-23.md`

## Global Constraints

- **Access control:** every subscription/credit/invoice/CRM query+mutation uses `roles: ["manager", "admin"]`, aligned with the `/crm` route `requiredPermission` (CLAUDE.md Pitfall #19). Never `["admin"]`-only on a manager-reachable surface.
- **Auth wrappers:** `protectedMutation`/`protectedQuery` from `convex/lib/functions.ts` (inject `ctx.user`; sessionId via `SessionIdArg` — do NOT add a `token` arg).
- **Money:** integers (IDR, no decimals). Never floats. Use `computeLineTotal` / `Math.round`.
- **WIB dates:** reuse `convex/lib/periodRange.ts` (`getWibComponents`, `wibMidnightToUtc`, `calculateWeekRange`, `getWibDateStr`). Pitfall #18 bans the deleted alternatives — do not hand-roll week math.
- **Shared line type:** the line `{ menuProductId, productName, qty, unitPrice, lineTotal }` is the Phase-A `ScheduleLine` (`convex/subscriptions/types.ts`) — reuse it; construct ONLY via the new `makeScheduleLine` factory (Task B1).
- **Analytics isolation (C1):** subscription orders are NOT channel revenue. Gate them out of `externalRevenue` sync AND `getDailySalesSummary`. BOM ball-counting (Pitfall #11/#13) must still resolve.
- **Order dual-surface (Pitfall #20):** kanban subscription rendering goes into BOTH `OrderSlideOver.tsx` AND `OrderDetail.tsx`.
- **Ship-dark:** all surfaces manager+admin gated from day one; all changes additive (schema already landed in A — only one new index here). Revert = revert commits.
- **camelCase** Convex field names. **Convex Ids are typed strings** (`Id<"table">`). **Mutations are async — always `await`.**
- **Branch:** `feature/subscription-phase-b` (cut from synced `main`). `npm run build` must pass before merge.
- **Testing convention (grounded):** extract pure functions and unit-test with Vitest; auth-gated convex-test runtime tests are deferred per project convention (see header of `convex/invoices/__tests__/mutations.test.ts`). TDD targets the pure cores; ctx-dependent mutations are verified via their extracted pure helpers + manual UAT.

---

## Execution Strategy — multi-agent, wave-gated (READ BEFORE DISPATCHING)

This phase is built for **`superpowers:subagent-driven-development`**: the orchestrator (you, the executing session) holds the thread and dispatches a **fresh subagent per task**, reviewing the diff between tasks so your own context stays lean. It is feasible in one session, but **only wave-gated** — parallelize *within* a wave, **barrier between waves**. Do NOT spawn all tasks at once.

### Hard rules (these prevent the known failure modes)
1. **`convex/schema.ts` has ONE writer: Task B0.** No other task edits the schema. Run B0 **solo and to completion (incl. `npx convex codegen`) before any other task** — everything downstream reads its new tables/indexes.
2. **`convex/_generated/api.d.ts` is the parallelism hazard.** Every backend task that adds a Convex function regenerates it; parallel agents collide there. Mitigation: give each **parallel backend** subagent its own **git worktree** (`isolation: "worktree"`), and after a wave's fan-out completes, the orchestrator re-runs `npx convex codegen && npm run type-check` once on the merged tree. Pure-fn tasks (B1–B4) add no Convex functions → no contention → no worktree needed.
3. **Serialize shared-file tasks** (never parallel — same file): `convex/subscriptions/invoicing.ts` → **B9 then B10**; `orderCrud.ts` → **B5 then B7**; `convex/invoices/mutations.ts` → B9. B12 after B9/B10.
4. **Manual UAT can't be done headless.** B7/B8/B9/B11 carry "manual smoke in the dev dashboard" steps (project convention defers auth-gated convex-test runtime tests). A subagent lands code + pure-fn tests + type-check + build; the funding/delivery/reconcile UAT **queues for the human** — mark those success-criteria boxes "pending UAT," don't claim them passed.
5. **The QA close-out runs in the MAIN session, never a background agent** (`feedback_background_agents`: background agents skip the Skill tool + quality gates): `/triple-review` → `/simplify xhigh` after all tasks land.

### Wave dispatch map
| Wave | Dispatch | Parallelism | Gate to next wave |
|------|----------|-------------|-------------------|
| **W1** | B0 **solo+barrier** (schema+codegen), then **B1‖B2‖B3‖B4** | 4-wide, no worktrees needed (pure fns) | all green: `npx vitest run convex/subscriptions convex/orders/helpers` |
| **W2** | **B5‖B6‖B8**, then **B7** (after B5) | 3-wide + 1; worktrees for B5/B6/B7 (add functions) | codegen + type-check clean on merged tree |
| **W3** | **B9 solo** (spine), then **B10‖B11‖B12‖B13** | B9 alone, then 4-wide; worktrees | type-check + vitest green; manual UAT queued |
| **W4** | **B14‖B15‖B16** | 3-wide; B16 has a backend half (worktree) | `npm run build` green (watch vendor cap) |
| **W5** | **B17 solo** | — | full gate + code-auditor |
| **close-out** | **main session**: `/triple-review` → `/simplify xhigh` | — | re-run type-check+vitest+build; address findings |

**Critical path** (sets minimum wall-clock): B0 → B5 → B7 → B9 → {B10/B11/B12} → {B14/B15} → B17 → close-out (~7 hops). Everything else fans out off it.

**Budget note:** this is the "everything" merged phase (18 tasks + full money-flow). Expect a long, token-heavy run; the real tail is the **human UAT + the `/triple-review`→`/simplify` close-out**, not the coding. If de-risking, split at the backend/frontend seam: **Waves 1–3 one session, Waves 4–5 a second** — backend is where correctness risk concentrates.

---

## File Structure

**Backend — create:**
- `convex/subscriptions/scheduleLine.ts` — `makeScheduleLine` factory + `validateScheduleTemplate` pure fns.
- `convex/subscriptions/weekBounds.ts` — `computeWeekStart`/`computeWeekBounds` (Monday-WIB) pure wrappers over `periodRange`.
- `convex/subscriptions/reconcileMath.ts` — per-tranche FIFO rollover pure core.
- `convex/subscriptions/scheduling/confirmWeek.ts` — `confirmWeek` mutation (order generation).
- `convex/subscriptions/scheduling/queries.ts` — `getPlanningWeek`, `listWeeks` (calendar reads).
- `convex/subscriptions/invoicing.ts` — `createSubscriptionWeeklyInvoice`, `markWeeklyInvoicePaid`, `createTopupInvoice`.
- `convex/subscriptions/reconcile.ts` — `reconcileWeek` mutation.
- `convex/subscriptions/outOfCredit.ts` — split / apply-partial helpers.
- `convex/subscriptions/revenueGate.ts` — `isSubscriptionOrder` predicate (C1 single source).
- `convex/orders/helpers/insertOrder.ts` — extracted `insertOrderWithItems` helper (I1).
- `convex/orders/helpers/stripSubscriptionPricing.ts` — server-side confidential-price strip for non-managers (gap #2, B16).
- Tests: `convex/subscriptions/__tests__/scheduleLine.test.ts`, `weekBounds.test.ts`, `reconcileMath.test.ts`, `revenueGate.test.ts`; `convex/orders/helpers/__tests__/stripSubscriptionPricing.test.ts`; `convex/bankStatements/__tests__/matchEngine.test.ts` (extend, gap #1).

**Backend — modify:**
- `convex/subscriptions/weeks.ts` — add `source` arg to `seedWeek` (template/previousWeek/blank).
- `convex/subscriptions/creditMath.ts` — re-export `makeScheduleLine` (so all line construction routes through one module is optional; factory lives in `scheduleLine.ts`).
- `convex/orders/mutations/orderCrud.ts` — `create` calls the extracted `insertOrderWithItems`.
- `convex/orders/queries.ts` + `convex/orders/kitchenQueries.ts` — convert kanban order-read queries (`get`/`getKitchenOrders`/`getByOrderNumber`/`getKitchenPackingOrders`) to `protectedQuery` + apply `stripSubscriptionPricing` (gap #2, B16).
- `convex/bankStatements/matchEngine.ts` — match incoming credit lines to subscription weekly invoices by `invoiceNumber` reference (gap #1, B9).
- `convex/integrations/internal/queries.ts:36` — exclude subscription orders (C1).
- `convex/reports/dailySales.ts:13` — exclude subscription orders (C1).
- `convex/schema.ts` (**Task B0, additive**) — new `customerActivity` table (+`by_customer_at`); `invoices` `+customerId` +`by_customer`/`by_subscriptionWeek`/`by_kind_paymentStatus`; `orders` `+by_subscription`; `creditLedger` `+by_invoice`; `customers` `+customerType: "direct_b2c" | "b2b_wholesale"`.
- `convex/subscriptions/mutations.ts` — `createSubscription` sets the customer's `customerType = "b2b_wholesale"`.
- `convex/invoices/mutations.ts` — `finalize` backfills standard-invoice `customerId` from the order (B0/B9).
- `src/hooks/convex/useOrders.ts` (+ kitchen hooks) — session-aware hooks for the converted `protectedQuery`s (gap #2, B16).

**Frontend — create:**
- `src/pages/crm/SubscriptionSchedulePage.tsx` — the schedule calendar.
- `src/pages/crm/SubscriptionWeeklyInvoicePage.tsx` — visual day-by-day invoice + send.
- `src/pages/crm/CrmFundingDashboardPage.tsx` — "who hasn't paid / what needs funding".
- `src/components/crm/WeekCalendarGrid.tsx`, `src/components/crm/DayPlanCell.tsx`, `src/components/crm/ProductLineEditor.tsx`.
- `src/lib/crmActivityTaxonomy.ts` (**Task B0**) — shared `ActivityType` union + `ACTIVITY_TAXONOMY` `Record` + `getActivityVisual` (stub; finalized in Phase D).
- `src/lib/crmPermissions.ts` (if a small helper is needed) — else extend `src/lib/types.ts`.

**Frontend — modify:**
- `src/lib/types.ts` — add `canAccessCrm` to `ROLE_PERMISSIONS` (manager+admin).
- `src/App.tsx` — register `/crm/...` lazy routes under `<ProtectedRoute requiredPermission="canAccessCrm">`.
- `src/components/orders/OrderSlideOver.tsx` AND `src/pages/OrderDetail.tsx` — read-only "🔒 Subscription" rendering (Pitfall #20).

**Docs — modify:** `docs/CHANGELOG.md`, `docs/API_REFERENCE.md`, `docs/FILE_MAP.md`.

---

# Wave 1 — Backend pure cores (TDD) [PARALLEL]

### Task B0: CRM foundational schema additions (additive — land FIRST)

> Source: `docs/superpowers/specs/2026-06-23-crm-foundational-schema-additions.md` (CRM principles-conformance audit fix-now items #2–#6, #13, #14). All additive (new table + optional field + new indexes — no migration). Load-bearing for the CRM timeline, funding dashboard, per-subscription drawdown, gap#1 bank-match, and the confidential-price strip. Landing them in the in-flight schema PR unblocks clean Phase D/E planning. **Run FIRST** so every later task references real indexes.

**Files:**
- Modify: `convex/schema.ts` (one new table + one optional field + 5 new indexes).
- Create: `src/lib/crmActivityTaxonomy.ts` (shared-lib stub — frontend, not a schema change).

- [ ] **Step 1: Add the `customerActivity` table** to `defineSchema({...})`:

```ts
  customerActivity: defineTable({
    customerId: v.id("customers"),
    type: v.union(
      v.literal("whatsapp_drafted"),
      v.literal("note"),
      v.literal("manual_milestone"),
      // extend in lockstep with src/lib/crmActivityTaxonomy.ts (single ActivityType union)
    ),
    subtype: v.optional(v.string()),
    direction: v.optional(
      v.union(v.literal("inbound"), v.literal("outbound"), v.literal("system")),
    ),
    at: v.number(), // explicit WIB ms — business event time, NOT _creationTime
    actor: v.id("users"),
    summary: v.optional(v.string()),
    note: v.optional(v.string()),
    // polymorphic subject-refs (the event's linked object):
    subscriptionId: v.optional(v.id("subscriptions")),
    invoiceId: v.optional(v.id("invoices")),
    orderId: v.optional(v.id("orders")),
    agreementId: v.optional(v.id("supplyAgreements")),
  })
    .index("by_customer_at", ["customerId", "at"]),
```

- [ ] **Step 2: `invoices` — add `customerId` + indexes.** Inside the `invoices` `defineTable({...})` add the field, and add the index chain entries (keep existing `by_order`/`by_status_number`/`by_date`):

```ts
    customerId: v.optional(v.id("customers")),
    // ...index chain:
    .index("by_customer", ["customerId"])
    .index("by_subscriptionWeek", ["subscriptionWeekId"])     // confirm it actually merges (audit #4)
    .index("by_kind_paymentStatus", ["invoiceKind", "paymentStatus"])  // gap#1 match-engine (audit #14)
```

- [ ] **Step 3: `orders` — add `by_subscription`.** (Already has `by_customer` + `by_subscriptionWeek`; this spans weeks for one subscription — drawdown partition + timeline.)

```ts
    .index("by_subscription", ["subscriptionId"])
```

- [ ] **Step 4: `creditLedger` — add `by_invoice`.** (Rows carry `invoiceId?`; gap#1 topup idempotency + "which topup funded this invoice".)

```ts
    .index("by_invoice", ["invoiceId"])
```

- [ ] **Step 5: `customers` — add `customerType`** (the §7.x revenue-category seam):

```ts
    customerType: v.optional(v.union(v.literal("direct_b2c"), v.literal("b2b_wholesale"))),
```

- [ ] **Step 6: Create the shared taxonomy stub** `src/lib/crmActivityTaxonomy.ts` (mirrors `src/lib/orderConstants.ts`/`platformColors.ts`):

```ts
export type ActivityType =
  | "order" | "finance" | "message" | "document" | "schedule" | "milestone";

export type ActivityVisual = {
  icon: string;
  colorClass: string;
  label: string;
  direction?: "inbound" | "outbound" | "system";
};

export const ACTIVITY_TAXONOMY: Record<ActivityType, ActivityVisual> = {
  order:     { icon: "📦", colorClass: "text-blue-500",   label: "Order",     direction: "system" },
  finance:   { icon: "💳", colorClass: "text-green-500",  label: "Finance",   direction: "system" },
  message:   { icon: "💬", colorClass: "text-violet-500", label: "Message",   direction: "outbound" },
  document:  { icon: "📄", colorClass: "text-amber-500",  label: "Document",  direction: "inbound" },
  schedule:  { icon: "📅", colorClass: "text-cyan-500",   label: "Schedule",  direction: "system" },
  milestone: { icon: "🏁", colorClass: "text-rose-500",   label: "Milestone", direction: "system" },
};

export function getActivityVisual(type: ActivityType, _subtype?: string): ActivityVisual {
  return ACTIVITY_TAXONOMY[type]; // subtype icon overrides layered in the Phase D timeline task
}
```

> **Taxonomy reconciliation (flag):** `customerActivity.type` (logged union: `whatsapp_drafted | note | manual_milestone`) and `ActivityType` (category union above) are two granularities. The **Phase D timeline task** reconciles them to a single source-of-truth union (the derived-event mapper + `customerActivity.type` import the same union) and adds the exhaustiveness test (every timeline-produced `type` has a taxonomy entry — `Record<ActivityType,…>` already makes a missing entry a compile error). For Phase B: land the table + this stub as the foundation only.

- [ ] **Step 7: Regenerate + commit.** `npx convex codegen && npm run type-check` → PASS.

```bash
git add convex/schema.ts convex/_generated/ src/lib/crmActivityTaxonomy.ts
git commit -m "feat(crm): foundational additive schema — customerActivity + invoices.customerId/indexes + orders.by_subscription + creditLedger.by_invoice + customerType + taxonomy stub"
```

---

### Task B1: `makeScheduleLine` factory + `validateScheduleTemplate` (I2, I3)

**Files:**
- Create: `convex/subscriptions/scheduleLine.ts`
- Test: `convex/subscriptions/__tests__/scheduleLine.test.ts`

**Interfaces:**
- Consumes: `computeLineTotal` (`convex/subscriptions/creditMath.ts`), `ScheduleLine` (`convex/subscriptions/types.ts`), `Id` (`convex/_generated/dataModel`).
- Produces:
  - `makeScheduleLine(menuProductId: Id<"menuProducts">, productName: string, qty: number, unitPrice: number): ScheduleLine` — the ONLY way to build a `ScheduleLine`; computes `lineTotal` internally.
  - `validateScheduleTemplate(template: { dayOfWeek: number; items: { menuProductId: Id<"menuProducts">; qty: number }[] }[]): { ok: true } | { ok: false; error: string }` — `dayOfWeek ∈ 0..6`, no duplicate `dayOfWeek`, each day non-empty, each `qty` an integer `> 0`.

- [ ] **Step 1: Write the failing test**

`convex/subscriptions/__tests__/scheduleLine.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { makeScheduleLine, validateScheduleTemplate } from "../scheduleLine";

const pid = (s: string) => s as unknown as import("../../_generated/dataModel").Id<"menuProducts">;

describe("makeScheduleLine", () => {
  it("computes lineTotal from qty × unitPrice (integer IDR)", () => {
    expect(makeScheduleLine(pid("p1"), "Dubai", 150, 29000)).toEqual({
      menuProductId: pid("p1"), productName: "Dubai", qty: 150, unitPrice: 29000, lineTotal: 4350000,
    });
  });
});

describe("validateScheduleTemplate", () => {
  const day = (d: number, qty = 150) => ({ dayOfWeek: d, items: [{ menuProductId: pid("p1"), qty }] });
  it("accepts a valid 7-day template", () => {
    expect(validateScheduleTemplate([0,1,2,3,4,5,6].map((d) => day(d)))).toEqual({ ok: true });
  });
  it("rejects dayOfWeek out of range", () => {
    expect(validateScheduleTemplate([day(7)]).ok).toBe(false);
  });
  it("rejects duplicate dayOfWeek", () => {
    expect(validateScheduleTemplate([day(1), day(1)]).ok).toBe(false);
  });
  it("rejects an empty day", () => {
    expect(validateScheduleTemplate([{ dayOfWeek: 1, items: [] }]).ok).toBe(false);
  });
  it("rejects qty <= 0 or non-integer", () => {
    expect(validateScheduleTemplate([day(1, 0)]).ok).toBe(false);
    expect(validateScheduleTemplate([day(1, 1.5)]).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run convex/subscriptions/__tests__/scheduleLine.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `scheduleLine.ts`**

```ts
import type { Id } from "../_generated/dataModel";
import type { ScheduleLine } from "./types";
import { computeLineTotal } from "./creditMath";

export function makeScheduleLine(
  menuProductId: Id<"menuProducts">,
  productName: string,
  qty: number,
  unitPrice: number,
): ScheduleLine {
  return { menuProductId, productName, qty, unitPrice, lineTotal: computeLineTotal(qty, unitPrice) };
}

export function validateScheduleTemplate(
  template: { dayOfWeek: number; items: { menuProductId: Id<"menuProducts">; qty: number }[] }[],
): { ok: true } | { ok: false; error: string } {
  const seen = new Set<number>();
  for (const day of template) {
    if (!Number.isInteger(day.dayOfWeek) || day.dayOfWeek < 0 || day.dayOfWeek > 6)
      return { ok: false, error: `dayOfWeek out of range: ${day.dayOfWeek}` };
    if (seen.has(day.dayOfWeek)) return { ok: false, error: `duplicate dayOfWeek: ${day.dayOfWeek}` };
    seen.add(day.dayOfWeek);
    if (day.items.length === 0) return { ok: false, error: `empty day: ${day.dayOfWeek}` };
    for (const it of day.items) {
      if (!Number.isInteger(it.qty) || it.qty <= 0)
        return { ok: false, error: `qty must be a positive integer (day ${day.dayOfWeek})` };
    }
  }
  return { ok: true };
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `npx vitest run convex/subscriptions/__tests__/scheduleLine.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add convex/subscriptions/scheduleLine.ts convex/subscriptions/__tests__/scheduleLine.test.ts
git commit -m "feat(subscriptions): makeScheduleLine factory + validateScheduleTemplate (TDD)"
```

---

### Task B2: Monday-WIB week bounds (I3)

**Files:**
- Create: `convex/subscriptions/weekBounds.ts`
- Test: `convex/subscriptions/__tests__/weekBounds.test.ts`

**Interfaces:**
- Consumes: `getWibComponents`, `wibMidnightToUtc` (`convex/lib/periodRange.ts`).
- Produces:
  - `computeWeekStart(anyMsInWeek: number): number` — UTC ms of Monday 00:00 WIB for the week containing `anyMsInWeek`.
  - `computeWeekBounds(weekStart: number): { weekStart: number; weekEnd: number }` — `weekEnd` = Sunday 23:59:59.999 WIB (= next Monday 00:00 − 1).
  - `isAlignedWeekStart(ms: number): boolean` — true iff `ms === computeWeekStart(ms)`.

- [ ] **Step 1: Write the failing test**

`convex/subscriptions/__tests__/weekBounds.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeWeekStart, computeWeekBounds, isAlignedWeekStart } from "../weekBounds";

// Mon 30 Jun 2026 00:00 WIB === 2026-06-29T17:00:00Z
const MON_30_JUN_WIB = Date.UTC(2026, 5, 29, 17, 0, 0, 0);

describe("computeWeekStart", () => {
  it("returns the same Monday 00:00 WIB for any instant inside that week", () => {
    const wedNoonWib = Date.UTC(2026, 6, 1, 5, 0, 0, 0); // Wed 1 Jul 12:00 WIB
    expect(computeWeekStart(wedNoonWib)).toBe(MON_30_JUN_WIB);
    expect(computeWeekStart(MON_30_JUN_WIB)).toBe(MON_30_JUN_WIB);
  });
});

describe("computeWeekBounds", () => {
  it("weekEnd is one ms before next Monday 00:00 WIB", () => {
    const { weekStart, weekEnd } = computeWeekBounds(MON_30_JUN_WIB);
    expect(weekStart).toBe(MON_30_JUN_WIB);
    expect(weekEnd).toBe(MON_30_JUN_WIB + 7 * 86400000 - 1);
  });
});

describe("isAlignedWeekStart", () => {
  it("true for an aligned Monday, false otherwise", () => {
    expect(isAlignedWeekStart(MON_30_JUN_WIB)).toBe(true);
    expect(isAlignedWeekStart(MON_30_JUN_WIB + 3600000)).toBe(false);
  });
});
```

- [ ] **Step 2: Run, verify fail.** `npx vitest run convex/subscriptions/__tests__/weekBounds.test.ts` → FAIL.

- [ ] **Step 3: Implement `weekBounds.ts`**

```ts
import { getWibComponents, wibMidnightToUtc } from "../lib/periodRange";

const DAY_MS = 86400000;

export function computeWeekStart(anyMsInWeek: number): number {
  const { year, month, day, dayOfWeek } = getWibComponents(anyMsInWeek);
  // dayOfWeek: 0=Sunday..6=Saturday (JS convention from getWibComponents). Monday = 1.
  const daysSinceMonday = (dayOfWeek + 6) % 7; // Mon→0, Tue→1, ... Sun→6
  const wibMidnightThisDay = wibMidnightToUtc(year, month, day);
  return wibMidnightThisDay - daysSinceMonday * DAY_MS;
}

export function computeWeekBounds(weekStart: number): { weekStart: number; weekEnd: number } {
  return { weekStart, weekEnd: weekStart + 7 * DAY_MS - 1 };
}

export function isAlignedWeekStart(ms: number): boolean {
  return ms === computeWeekStart(ms);
}
```

> **Note:** confirm `getWibComponents` returns `dayOfWeek` with 0=Sunday (the existing convention). If it returns 1=Monday, adjust `daysSinceMonday` to `(dayOfWeek + 6) % 7` accordingly — the test pins the expected Monday so it will catch a wrong convention.

- [ ] **Step 4: Run, verify pass.** → PASS. If the dayOfWeek convention differs, fix `daysSinceMonday` and re-run.

- [ ] **Step 5: Commit**

```bash
git add convex/subscriptions/weekBounds.ts convex/subscriptions/__tests__/weekBounds.test.ts
git commit -m "feat(subscriptions): Monday-WIB week bounds (TDD)"
```

---

### Task B3: Per-tranche FIFO rollover reconcile core (C2)

**Files:**
- Create: `convex/subscriptions/reconcileMath.ts`
- Test: `convex/subscriptions/__tests__/reconcileMath.test.ts`

**Interfaces:**
- Produces: `reconcileTranches(args: { tranches: { weekId: string; amount: number; weeksCarried: number }[]; policy: "expire" | "rollover"; rolloverExpiryWeeks: number | null }): { expire: { weekId: string; amount: number }[]; carry: { weekId: string; amount: number }[] }` — decides, per tranche of leftover credit (oldest first by `weeksCarried` desc), whether it expires (policy `expire`, or rolled past horizon) or carries forward. Pure; `reconcileWeek` (Task B11) turns the result into ledger entries.

- [ ] **Step 1: Write the failing test**

`convex/subscriptions/__tests__/reconcileMath.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { reconcileTranches } from "../reconcileMath";

describe("reconcileTranches", () => {
  it("expires everything under policy=expire", () => {
    const r = reconcileTranches({
      tranches: [{ weekId: "w1", amount: 100, weeksCarried: 0 }],
      policy: "expire", rolloverExpiryWeeks: 4,
    });
    expect(r.expire).toEqual([{ weekId: "w1", amount: 100 }]);
    expect(r.carry).toEqual([]);
  });
  it("carries fresh tranches and expires those at/over the horizon (FIFO oldest-first)", () => {
    const r = reconcileTranches({
      tranches: [
        { weekId: "wOld", amount: 50, weeksCarried: 4 }, // at horizon → expire
        { weekId: "wMid", amount: 30, weeksCarried: 2 }, // carry
        { weekId: "wNew", amount: 20, weeksCarried: 0 }, // carry
      ],
      policy: "rollover", rolloverExpiryWeeks: 4,
    });
    expect(r.expire).toEqual([{ weekId: "wOld", amount: 50 }]);
    expect(r.carry).toEqual([
      { weekId: "wMid", amount: 30 },
      { weekId: "wNew", amount: 20 },
    ]);
  });
  it("never expires when rolloverExpiryWeeks is null (explicit opt-out)", () => {
    const r = reconcileTranches({
      tranches: [{ weekId: "w", amount: 10, weeksCarried: 99 }],
      policy: "rollover", rolloverExpiryWeeks: null,
    });
    expect(r.expire).toEqual([]);
    expect(r.carry).toEqual([{ weekId: "w", amount: 10 }]);
  });
  it("drops zero-amount tranches from both lists", () => {
    const r = reconcileTranches({
      tranches: [{ weekId: "w", amount: 0, weeksCarried: 0 }],
      policy: "rollover", rolloverExpiryWeeks: 4,
    });
    expect(r.expire).toEqual([]);
    expect(r.carry).toEqual([]);
  });
});
```

- [ ] **Step 2: Run, verify fail.** → FAIL.

- [ ] **Step 3: Implement `reconcileMath.ts`**

```ts
export function reconcileTranches(args: {
  tranches: { weekId: string; amount: number; weeksCarried: number }[];
  policy: "expire" | "rollover";
  rolloverExpiryWeeks: number | null;
}): { expire: { weekId: string; amount: number }[]; carry: { weekId: string; amount: number }[] } {
  const expire: { weekId: string; amount: number }[] = [];
  const carry: { weekId: string; amount: number }[] = [];
  // Oldest first (highest weeksCarried) for deterministic FIFO expiry.
  const ordered = [...args.tranches].sort((a, b) => b.weeksCarried - a.weeksCarried);
  for (const t of ordered) {
    if (t.amount <= 0) continue;
    const expired =
      args.policy === "expire" ||
      (args.rolloverExpiryWeeks !== null && t.weeksCarried >= args.rolloverExpiryWeeks);
    (expired ? expire : carry).push({ weekId: t.weekId, amount: t.amount });
  }
  return { expire, carry };
}
```

- [ ] **Step 4: Run, verify pass.** → PASS.

- [ ] **Step 5: Commit**

```bash
git add convex/subscriptions/reconcileMath.ts convex/subscriptions/__tests__/reconcileMath.test.ts
git commit -m "feat(subscriptions): per-tranche FIFO rollover reconcile core (TDD, C2)"
```

---

### Task B4: Subscription-order revenue gate predicate (C1)

**Files:**
- Create: `convex/subscriptions/revenueGate.ts`
- Test: `convex/subscriptions/__tests__/revenueGate.test.ts`

**Interfaces:**
- Produces: `isSubscriptionOrder(order: { fundingSource?: string | null; subscriptionId?: unknown }): boolean` — true when an order is credit-funded subscription fulfilment and must be excluded from channel-revenue aggregations. Single source consumed by the two gate sites (Tasks B5b).

- [ ] **Step 1: Write the failing test**

`convex/subscriptions/__tests__/revenueGate.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isSubscriptionOrder } from "../revenueGate";

describe("isSubscriptionOrder", () => {
  it("true when fundingSource is subscription_credit", () => {
    expect(isSubscriptionOrder({ fundingSource: "subscription_credit" })).toBe(true);
  });
  it("true when subscriptionId is present", () => {
    expect(isSubscriptionOrder({ subscriptionId: "sub1" })).toBe(true);
  });
  it("false for a normal order", () => {
    expect(isSubscriptionOrder({ fundingSource: "normal" })).toBe(false);
    expect(isSubscriptionOrder({})).toBe(false);
  });
});
```

- [ ] **Step 2: Run, verify fail.** → FAIL.

- [ ] **Step 3: Implement `revenueGate.ts`**

```ts
export function isSubscriptionOrder(order: {
  fundingSource?: string | null;
  subscriptionId?: unknown;
}): boolean {
  return order.fundingSource === "subscription_credit" || order.subscriptionId != null;
}
```

- [ ] **Step 4: Run, verify pass.** → PASS.

- [ ] **Step 5: Commit**

```bash
git add convex/subscriptions/revenueGate.ts convex/subscriptions/__tests__/revenueGate.test.ts
git commit -m "feat(subscriptions): isSubscriptionOrder revenue-gate predicate (TDD, C1)"
```

---

# Wave 2 — Scheduling backend [after Wave 1]

### Task B5: Extract `insertOrderWithItems` helper from `orders.create` (I1)

**Files:**
- Create: `convex/orders/helpers/insertOrder.ts`
- Modify: `convex/orders/mutations/orderCrud.ts` (replace the inline order+items+production insert block, lines ~211–267, with a call to the helper)

**Interfaces:**
- Consumes: `createProductionRecordsForItem` (`convex/orders/helpers/productionRecords.ts:155`), `MutationCtx`, `Id`.
- Produces:
  - `insertOrderWithItems(ctx: MutationCtx, args: { orderFields: Record<string, unknown>; items: { productName: string; productVariant?: string; quantity: number; unitPrice: number; unitCost: number; discountAmount: number; lineTotal: number; lineCost: number; lineMargin: number; menuProductId?: Id<"menuProducts"> }[] }): Promise<Id<"orders">>` — inserts the `orders` row (caller supplies the full computed `orderFields`), inserts each `orderItems`, and creates production records for items with a `menuProductId`. The single write path for any order + its lines + production bridge.

- [ ] **Step 1: Implement `insertOrder.ts`** (lift the grounded block verbatim)

```ts
import type { MutationCtx } from "../../_generated/server";
import type { Id, Doc } from "../../_generated/dataModel";
import type { WithoutSystemFields } from "convex/server";
import { createProductionRecordsForItem } from "./productionRecords";

// Typed inserts — the compiler enforces every required orders/orderItems field
// (I1: dropping `as never` is what catches a missing `deliveryType`/`isKitchenVisible`).
export type OrderInsert = WithoutSystemFields<Doc<"orders">>;
export type OrderItemInsert = Omit<WithoutSystemFields<Doc<"orderItems">>, "orderId">;

export async function insertOrderWithItems(
  ctx: MutationCtx,
  args: { orderFields: OrderInsert; items: OrderItemInsert[] },
): Promise<Id<"orders">> {
  const orderId = await ctx.db.insert("orders", args.orderFields);
  for (const item of args.items) {
    const orderItemId = await ctx.db.insert("orderItems", { orderId, ...item });
    if (item.menuProductId) {
      await createProductionRecordsForItem(ctx, orderItemId, item.menuProductId, item.quantity);
    }
  }
  return orderId;
}
```

> The existing `create` mutation builds `itemsToCreate` already shaped like `OrderItemInsert`; if its field set differs, align it. The typed `OrderInsert` means `confirmWeek` (Task B7) **cannot compile** without every required field — that is the point.

- [ ] **Step 2: Refactor `orderCrud.ts` `create` to call the helper**

Replace the inline `ctx.db.insert("orders", {...})` + the `for (const item of itemsToCreate)` loop (grounded at lines ~211–267) with:

```ts
import { insertOrderWithItems } from "../helpers/insertOrder";
// ...inside the handler, after all fields are computed:
const orderId = await insertOrderWithItems(ctx, {
  orderFields: {
    orderNumber, customerId, customerName, customerPhone,
    status: "Draft", isKitchenVisible, paymentStatus: "Unpaid",
    orderDate: Date.now(), dueDate, totalAmount, totalCost, totalMargin,
    orderLevelDiscount, orderLevelDiscountType, finalTotal,
    voucherId, voucherCode, voucherDiscountValue, lowPriceConfirmed,
    soldBy, createdByUserId, ...parseDeliveryAddress(args.deliveryAddress),
    deliveryAddress, contactWa, contactIg, notes, createdBy, itemCount,
  },
  items: itemsToCreate,
});
```

(Keep the surrounding voucher-usage recording and audit-log calls in `create` — they are NOT part of the helper.)

- [ ] **Step 3: Type-check + run the existing order tests**

Run: `npm run type-check && npx vitest run convex/orders`
Expected: PASS — behaviour unchanged (pure refactor). If `orders` create tests are convex-test runtime (deferred), at minimum type-check passes and the create path compiles.

- [ ] **Step 4: Commit**

```bash
git add convex/orders/helpers/insertOrder.ts convex/orders/mutations/orderCrud.ts
git commit -m "refactor(orders): extract insertOrderWithItems shared by create + confirmWeek (I1)"
```

---

### Task B6: `seedWeek` seed-source extension (note r1.c1)

**Files:**
- Modify: `convex/subscriptions/weeks.ts`

**Interfaces:**
- Consumes: `validateScheduleTemplate` (B1), `buildPlannedDays` + existing `seedWeek` (Phase A), `computeWeekBounds` (B2).
- Produces: `seedWeek` gains arg `source: v.optional(v.union(v.literal("template"), v.literal("previousWeek"), v.literal("blank")))` (default `"template"`). `"previousWeek"` reads the most recent prior `subscriptionWeeks` row (by `by_subscription_weekStart`, `weekStart < args.weekStart`, desc) and rebuilds `plannedDays` from its `plannedDays` shape re-priced at the live `unitPrice`; `"blank"` seeds empty `plannedDays`.

- [ ] **Step 1: Add the `source` arg + branch logic to `seedWeek`**

In `convex/subscriptions/weeks.ts`, extend the mutation args and handler. After the existing idempotency check (returns existing week if present), branch on `source`:

```ts
import { computeWeekBounds } from "./weekBounds";
import { makeScheduleLine } from "./scheduleLine";
// args: add
//   source: v.optional(v.union(v.literal("template"), v.literal("previousWeek"), v.literal("blank"))),

const source = args.source ?? "template";
const { weekEnd } = computeWeekBounds(args.weekStart);

let plannedDays;
if (source === "blank") {
  plannedDays = [];
} else if (source === "previousWeek") {
  const prev = await ctx.db
    .query("subscriptionWeeks")
    .withIndex("by_subscription_weekStart", (q) =>
      q.eq("subscriptionId", args.subscriptionId).lt("weekStart", args.weekStart),
    )
    .order("desc")
    .first();
  if (!prev) {
    // No prior week — fall back to template (documented behaviour).
    plannedDays = buildPlannedDays({ /* existing template path */ });
  } else {
    const DAY_MS = 86400000;
    plannedDays = prev.plannedDays.map((d, i) => ({
      date: args.weekStart + i * DAY_MS, // re-date onto the new week by ordinal position
      deliverByTime: sub.deliverByTime,
      locked: false,
      items: d.items.map((it) =>
        makeScheduleLine(it.menuProductId, it.productName, it.qty, sub.unitPrice), // re-price at live unitPrice
      ),
    }));
  }
} else {
  plannedDays = buildPlannedDays({ /* existing template path, unchanged */ });
}
```

Use `weekEnd` from `computeWeekBounds` for the inserted row instead of the hand-rolled `+7*DAY-1`.

> **Re-date note:** `previousWeek` maps prior `plannedDays` onto the new week by **ordinal position** (1st planned day → Monday, etc.). If you need calendar-day-of-week fidelity instead, map by `getWibComponents(d.date).dayOfWeek`; ordinal is simpler and matches "repeat last week's pattern". Pick ordinal for v1.

- [ ] **Step 2: Regenerate API + type-check**

Run: `npx convex codegen && npm run type-check` → PASS; `seedWeek` shows the new `source` arg.

- [ ] **Step 3: Commit**

```bash
git add convex/subscriptions/weeks.ts convex/_generated/
git commit -m "feat(subscriptions): seedWeek source = template/previousWeek/blank (note r1.c1)"
```

---

### Task B7: `confirmWeek` — generate orders atomically

**Files:**
- Create: `convex/subscriptions/scheduling/confirmWeek.ts`

**Interfaces:**
- Consumes: `insertOrderWithItems` (B5), `validateScheduleTemplate` (B1), the subscription + week rows, `generateNextOrderNumber` (`convex/orders/helpers/customerResolution.ts:55`).
- Produces: `confirmWeek` (`protectedMutation`, manager+admin) `args: { subscriptionWeekId: v.id("subscriptionWeeks") }` → generates one `orders` row per `plannedDays` entry (each day = one delivery order carrying that day's lines at partner `unitPrice`), sets `subscriptionId`/`subscriptionWeekId`/`deliveryDate`/`fundingSource: "subscription_credit"`, flips the week `planned → confirmed`, stamps `confirmedAt`/`confirmedBy`. Idempotent: refuses if week status ≠ `planned`. All writes in one mutation (Convex transaction = atomic; forward-carried "ledger atomicity").

- [ ] **Step 1: Implement `confirmWeek.ts`**

```ts
import { v, ConvexError } from "convex/values";
import { protectedMutation } from "../../lib/functions";
import { insertOrderWithItems } from "../../orders/helpers/insertOrder";
import { generateNextOrderNumber } from "../../orders/helpers/customerResolution";

export const confirmWeek = protectedMutation({
  roles: ["manager", "admin"],
  args: { subscriptionWeekId: v.id("subscriptionWeeks") },
  handler: async (ctx, args) => {
    const week = await ctx.db.get(args.subscriptionWeekId);
    if (!week) throw new ConvexError("Subscription week not found");
    if (week.status !== "planned")
      throw new ConvexError(`Week is ${week.status}, can only confirm a planned week`);
    const sub = await ctx.db.get(week.subscriptionId);
    if (!sub) throw new ConvexError("Subscription not found");
    const customer = await ctx.db.get(sub.customerId);
    if (!customer) throw new ConvexError("Customer not found");

    for (const day of week.plannedDays) {
      if (day.items.length === 0) continue;
      const orderNumber = await generateNextOrderNumber(ctx);
      const totalAmount = day.items.reduce((s, it) => s + it.lineTotal, 0);
      await insertOrderWithItems(ctx, {
        orderFields: {
          orderNumber,
          customerId: sub.customerId,
          customerName: customer.name,
          customerPhone: customer.phone ?? "",
          status: "AwaitingPayment",      // canonical literal; awaiting credit funding (NOT legacy "Confirmed")
          paymentStatus: "Unpaid",        // paymentStatus literals are Unpaid|Partial|Paid — funding flips to Paid
          deliveryType: "Delivery",       // REQUIRED (v.string()); subscription = delivery by deliverByTime
          isKitchenVisible: true,         // REQUIRED; staff must see it to produce
          orderDate: Date.now(),
          dueDate: day.date,
          deliveryDate: day.date,
          totalAmount,
          totalCost: 0,                   // COGS resolved by production/BOM, not partner price
          totalMargin: totalAmount,
          finalTotal: totalAmount,
          subscriptionId: sub._id,
          subscriptionWeekId: week._id,
          fundingSource: "subscription_credit",
          createdBy: ctx.user._id,
          createdByUserId: ctx.user._id,
          itemCount: day.items.length,
        },
        items: day.items.map((it) => ({
          productName: it.productName,
          quantity: it.qty,
          unitPrice: it.unitPrice,        // partner price → orders.totalAmount = drawdown
          unitCost: 0,
          discountAmount: 0,
          lineTotal: it.lineTotal,
          lineCost: 0,
          lineMargin: it.lineTotal,
          menuProductId: it.menuProductId,
        })),
      });
    }

    await ctx.db.patch(week._id, {
      status: "confirmed",
      confirmedAt: Date.now(),
      confirmedBy: ctx.user._id,
    });
    return week._id;
  },
});
```

> **Status mapping (grounded, plan-staffreview C1):** confirm sets generated orders to `status:"AwaitingPayment"` + `paymentStatus:"Unpaid"`. (`orders.paymentStatus` is exactly `Unpaid|Partial|Paid` — `schema.ts:215–242`; `"AwaitingPayment"` is a `status` literal, NOT a `paymentStatus`. Use the canonical `"AwaitingPayment"`, not the legacy `"Confirmed"`.) Funding (Task B9 `markWeeklyInvoicePaid`) sets `paymentStatus:"Paid"` and advances `status` to `"PaymentReceived"` (canonical), then posts the drawdown.
> **Atomicity:** all order+item+production writes for the week happen in this one mutation → atomic. 7 days × few products is well within Convex write limits; if a subscription ever spans many products/day, revisit batching.

- [ ] **Step 2: Regenerate API + type-check**

Run: `npx convex codegen && npm run type-check` → PASS.

- [ ] **Step 3: Manual smoke (dev)** — via `npx convex dev` dashboard: seed a week, `confirmWeek`, confirm N orders appear with `fundingSource:"subscription_credit"`, partner price, and production records (check kitchen visibility). Document result in the PR.

- [ ] **Step 4: Commit**

```bash
git add convex/subscriptions/scheduling/confirmWeek.ts convex/_generated/
git commit -m "feat(subscriptions): confirmWeek generates orders atomically at partner price"
```

---

### Task B8: Apply the C1 revenue gates

**Files:**
- Modify: `convex/integrations/internal/queries.ts:36` and `convex/reports/dailySales.ts:13`

**Interfaces:**
- Consumes: `isSubscriptionOrder` (B4).

- [ ] **Step 1: Gate the `externalRevenue` feed**

In `convex/integrations/internal/queries.ts` (the function returning revenue-countable internal orders, ~line 36), add the exclusion:

```ts
import { isSubscriptionOrder } from "../../subscriptions/revenueGate";
// ...
return allOrders.filter(
  (order) =>
    (REVENUE_COUNTABLE_STATUSES as readonly string[]).includes(order.status) &&
    !isSubscriptionOrder(order),
);
```

- [ ] **Step 2: Gate `getDailySalesSummary`**

In `convex/reports/dailySales.ts` (~line 13):

```ts
import { isSubscriptionOrder } from "../subscriptions/revenueGate";
// ...
const validOrders = allOrders.filter(
  (o) => o.status !== "Draft" && o.status !== "Cancelled" && !isSubscriptionOrder(o),
);
```

- [ ] **Step 3: Add the mechanical sentinel test (C1 success criterion)**

`convex/subscriptions/__tests__/revenueGate.test.ts` — extend with a guard that both call sites use the predicate (grep-style assertion is brittle; instead assert the predicate's behaviour is the contract). Add a doc-comment in each gated file: `// C1: subscription orders excluded from channel revenue — see isSubscriptionOrder`. The pure predicate test (B4) is the mechanical proof; the manual UAT (below) confirms wiring.

- [ ] **Step 4: Manual UAT (refined for deferred-revenue model)** — seed + confirm a subscription week, fund it, mark one order **delivered**; then for that period: (a) `getDailySalesSummary` and per-channel `externalRevenue` breakdowns **EXCLUDE** the subscription order (no qty/Rp, confidential price absent); (b) the **income-statement total INCLUDES** the delivered order's revenue under a **B2B Wholesale** bucket (via the at-delivery journal line, B9 Step 3b, keyed on `customerType`) — NOT via `externalRevenue`; (c) kitchen production volume (BOM ball-count) still includes it. Record in PR. (These two gates here cover the channel-exclusion half; the income-statement inclusion is driven by B9's at-delivery journal line.)

- [ ] **Step 5: Type-check + commit**

```bash
npm run type-check
git add convex/integrations/internal/queries.ts convex/reports/dailySales.ts convex/subscriptions/__tests__/revenueGate.test.ts
git commit -m "fix(reports): exclude subscription orders from channel revenue (C1)"
```

---

# Wave 3 — Money loop: invoicing, drawdown, top-up, reconcile [after Wave 2]

### Task B9: Weekly invoice + mark-paid → fund (deferred revenue) + recognize sale on delivery

**Files:**
- Create: `convex/subscriptions/invoicing.ts` (weekly/top-up invoice + `markWeeklyInvoicePaid`), `convex/subscriptions/recognition.ts` (`recognizeSubscriptionDelivery` — at-delivery drawdown + B2B revenue journal line).
- Modify: `convex/schema.ts` (add `.index("by_subscriptionWeek", ["subscriptionWeekId"])` to `invoices`); the order status-change path (e.g. `convex/orders/mutations/` status mutation) to call `recognizeSubscriptionDelivery` when a subscription order reaches its sent/dispatched status.

**Interfaces:**
- Consumes: `getNextInvoiceNumber` (`convex/invoices/mutations.ts:114` — export it if not already exported), `postLedgerEntry` (`convex/subscriptions/ledger.ts`), the week's `plannedDays`, and the project's GL/journal posting API for the B2B revenue line (ground it via the income statement's journal-line scan).
- Produces:
  - `createSubscriptionWeeklyInvoice` (`protectedMutation`, manager+admin) `args: { subscriptionWeekId }` → builds a `final` invoice with `items` from `plannedDays` (each line carries `date`), `invoiceKind: "subscription_weekly"`, `orderId` undefined, `subscriptionWeekId` set, number via `getNextInvoiceNumber`; patches `subscriptionWeeks.weeklyInvoiceId` + status → `invoiced`.
  - `markWeeklyInvoicePaid` (`protectedMutation`) `args: { subscriptionWeekId }` → **cash event only:** posts a `topup` ledger entry (amount = invoice total, = deferred revenue) via `postLedgerEntry`, marks the week's generated orders `paymentStatus:"Paid"` + `paymentMethod:"subscription_credit"`, sets week status → `delivering`, stamps `paymentReceivedAt`. **Posts NO drawdown** (see below).
  - `recognizeSubscriptionDelivery(ctx, orderId)` (internal helper) → **sales event:** posts the per-order `drawdown` + recognizes B2B Wholesale revenue when the order is SENT/delivered; idempotent (once per `orderId`). Wired into the order status-change path.

> **Gap #1 + revenue model:** the `invoiceNumber`-as-transfer-reference + `/financials` matching is fully specified in the **▶ AMENDMENT gap #1** block after Step 5 (don't duplicate here). The deferred-revenue split (cash at funding, sales at delivery) is in the **Revenue-recognition model** note before the `markWeeklyInvoicePaid` code.

- [ ] **Step 1: Export `getNextInvoiceNumber`** from `convex/invoices/mutations.ts` (change `async function getNextInvoiceNumber` → `export async function getNextInvoiceNumber`). Type-check.

- [ ] **Step 2: Implement `createSubscriptionWeeklyInvoice`**

```ts
import { v, ConvexError } from "convex/values";
import { protectedMutation } from "../lib/functions";
import { getNextInvoiceNumber } from "../invoices/mutations";

export const createSubscriptionWeeklyInvoice = protectedMutation({
  roles: ["manager", "admin"],
  args: { subscriptionWeekId: v.id("subscriptionWeeks") },
  handler: async (ctx, args) => {
    const week = await ctx.db.get(args.subscriptionWeekId);
    if (!week) throw new ConvexError("Week not found");
    if (week.weeklyInvoiceId) return week.weeklyInvoiceId; // idempotent
    const sub = await ctx.db.get(week.subscriptionId);
    if (!sub) throw new ConvexError("Subscription not found");
    const customer = await ctx.db.get(sub.customerId);

    const items = week.plannedDays.flatMap((d) =>
      d.items.map((it) => ({
        productName: it.productName, qty: it.qty, unitPrice: it.unitPrice,
        lineTotal: it.lineTotal, date: d.date,
      })),
    );
    const subtotal = items.reduce((s, it) => s + it.lineTotal, 0);
    const invoiceNumber = await getNextInvoiceNumber(ctx);

    // Mirror createDraft's seller/bank snapshot (convex/invoices/mutations.ts:243–270).
    const settings = await ctx.db.query("businessSettings").first();
    const bank = settings?.defaultBankAccountId ? await ctx.db.get(settings.defaultBankAccountId) : null;

    const invoiceId = await ctx.db.insert("invoices", {
      status: "final",
      invoiceNumber,
      invoiceKind: "subscription_weekly",
      subscriptionWeekId: week._id,
      customerId: sub.customerId,            // B0 denormalized field — reachable by customer (no orderId)
      // orderId intentionally omitted (subscription invoice has no single order).
      // orderNumber is REQUIRED on invoices but there is no order — synthesize a stable week label.
      orderNumber: `WEEK-${getWibDateStr(week.weekStart)}`,
      orderDate: week.weekStart,
      generatedAt: Date.now(),
      generatedBy: ctx.user._id,
      updatedAt: Date.now(),
      sellerName: settings?.sellerName ?? "Frollie",
      bankName: bank?.bankName ?? "",
      bankAccountNumber: bank?.accountNumber ?? "",
      bankAccountName: bank?.accountName ?? "",
      buyerName: customer?.name ?? "Customer",
      items,
      subtotal,
      finalTotal: subtotal,        // required field name is finalTotal (no `total` field)
      paymentStatus: "Unpaid",
    });

    await ctx.db.patch(week._id, { weeklyInvoiceId: invoiceId, status: "invoiced" });
    return invoiceId;
  },
});
```

> **Required invoices fields (grounded `schema.ts:2287–2344`):** `status, generatedBy, updatedAt, sellerName, bankName, bankAccountNumber, bankAccountName, buyerName, orderNumber, orderDate, items, subtotal, finalTotal, paymentStatus`. All provided above. Read the exact `businessSettings`/`bankAccounts` field names (`sellerName`, `bankName`, `accountNumber`, `accountName`) from `createDraft` and align if they differ. Do NOT call `createDraft` (it hard-requires `orderId`). Add `import { getWibDateStr } from "../lib/periodRange";`.

- [ ] **Step 3: Implement `markWeeklyInvoicePaid`**

> **Revenue-recognition model (deferred revenue / voucher — user directive 2026-06-23).** The weekly credit is a **prepaid voucher**: the cash and the sales are SEPARATE events. **Cash received** (Monday transfer) = **deferred revenue (a liability)**, NOT sales — the credit pool *is* that liability balance. **Sales are recognized when each order is SENT/delivered** (the per-order `drawdown`), at the partner price. So `markWeeklyInvoicePaid` funds the pool only (`topup` = deferred revenue); it does **NOT** draw down. Drawdown — and revenue recognition — happens per order at delivery (Step 3b). This fixes the earlier model where the whole week was drawn down on Monday before anything shipped.

```ts
// markWeeklyInvoicePaid: CASH event only — fund the deferred-revenue pool, settle the invoice,
// mark orders cash-Paid. NO drawdown here (that is the SALES event, at delivery — Step 3b).
export const markWeeklyInvoicePaid = protectedMutation({
  roles: ["manager", "admin"],
  args: { subscriptionWeekId: v.id("subscriptionWeeks") },
  handler: async (ctx, args) => {
    const week = await ctx.db.get(args.subscriptionWeekId);
    if (!week) throw new ConvexError("Week not found");
    if (!week.weeklyInvoiceId) throw new ConvexError("No weekly invoice to pay");
    if (week.status !== "invoiced") throw new ConvexError(`Week is ${week.status}`);
    const invoice = await ctx.db.get(week.weeklyInvoiceId);
    const total = (invoice?.items ?? []).reduce((s, it) => s + it.lineTotal, 0);

    // Idempotency (B0 by_invoice index): if a topup for this invoice already exists, don't double-fund.
    const existingTopup = await ctx.db.query("creditLedger")
      .withIndex("by_invoice", (q) => q.eq("invoiceId", week.weeklyInvoiceId!)).first();
    if (existingTopup) return week._id;

    // Fund the deferred-revenue pool (cash in → unearned). NOT sales yet.
    await postLedgerEntry(ctx, {
      subscriptionId: week.subscriptionId, subscriptionWeekId: week._id,
      type: "topup", amount: total, createdBy: ctx.user._id,
      invoiceId: week.weeklyInvoiceId, note: "Weekly credit funded (deferred revenue)",
    });
    await ctx.db.patch(week.weeklyInvoiceId, { paymentStatus: "Paid", updatedAt: Date.now() });

    // Orders are cash-settled (paid from the voucher) but NOT yet drawn down / recognized.
    const orders = await ctx.db
      .query("orders")
      .withIndex("by_subscriptionWeek", (q) => q.eq("subscriptionWeekId", week._id))
      .collect();
    for (const order of orders) {
      await ctx.db.patch(order._id, {
        paymentStatus: "Paid",                 // cash settled from prepaid credit
        paymentMethod: "subscription_credit",
        status: "PaymentReceived",             // funded; advances toward delivery normally
      });
    }
    await ctx.db.patch(week._id, { status: "delivering", paymentReceivedAt: Date.now() });
    return week._id;
  },
});
```

- [ ] **Step 3b: Recognize the sale at delivery — drawdown when a subscription order is SENT.** Add `recognizeSubscriptionDelivery(ctx, orderId)` (internal helper) that, when a subscription order transitions to its **sent/dispatched** status, posts the `drawdown` (`-order.totalAmount`, the revenue-recognition event) and records subscription **sales revenue** for the P&L (bucket "B2B Wholesale"). Wire it into the order status-change path so it fires once, idempotently (guard: skip if a `drawdown` for this `orderId` already exists — `creditLedger.by_order`).

```ts
// Fires once when a subscription order is marked sent/delivered.
export async function recognizeSubscriptionDelivery(ctx: MutationCtx, orderId: Id<"orders">) {
  const order = await ctx.db.get(orderId);
  if (!order?.subscriptionId || !order.subscriptionWeekId) return;
  const already = await ctx.db.query("creditLedger")
    .withIndex("by_order", (q) => q.eq("orderId", orderId)).first();
  if (already) return; // idempotent — recognize once
  await postLedgerEntry(ctx, {
    subscriptionId: order.subscriptionId, subscriptionWeekId: order.subscriptionWeekId,
    type: "drawdown", amount: -order.totalAmount, createdBy: ctx.user._id,
    orderId, note: `Sale recognized on delivery ${order.orderNumber}`,
  });
  // P&L: recognize B2B Wholesale sales revenue at delivery — post the revenue journal line via
  // the project's GL/journal API (ground it: the same posting the income statement's
  // `fetchAndAggregate` journal-line scan reads). Bucket on the CUSTOMER'S `customerType`
  // ("b2b_wholesale"), NOT a subscription-specific tag — so future non-subscription wholesale
  // recognizes under the same line (§7.x). Keep it OUT of `externalRevenue` so per-channel
  // analytics stay clean (C1); it lands in the P&L total via the journal line.
}
```

> **Define "sent":** wire `recognizeSubscriptionDelivery` to the status transition that means *dispatched/delivered* (confirm the literal — `AwaitingDelivery` = out for delivery, or `Complete`). Pick the one ops sets when the order physically goes out by `deliverByTime`. The drawdown/revenue must NOT fire at funding (Monday) — only at delivery.
> **Reconciles C1 + categorization (§7.x):** subscription orders stay excluded from `externalRevenue` + per-channel sales dashboards (confidential price, B2B not a retail channel); the *revenue* reaches the income-statement TOTAL via the at-delivery journal line under a **B2B Wholesale** line keyed on `customers.customerType`. Cash-vs-earned: credit pool balance = deferred-revenue liability. The B2B Wholesale bucket is the umbrella — subscription cafe sales are its first occupant; future non-subscription wholesale slots in via the same `customerType` key.

- [ ] **Step 4: Backfill `invoices.customerId` + set `customerType`** (schema fields/indexes already landed in **Task B0** — do NOT re-add):
  - `createSubscriptionWeeklyInvoice` (Step 2) and `createTopupInvoice` (B10) set `customerId: customer._id` on insert (the customer is already loaded). For standard invoices, set `customerId` from the order in `finalize` (`convex/invoices/mutations.ts`). Without this a subscription invoice is unreachable by customer (no `orderId`).
  - In `createSubscription` (Task A5, already shipped — patch it): when a subscription is created for a customer, set `customers.customerType = "b2b_wholesale"` if unset (a subscription customer is, by definition, B2B wholesale; durable — survives if the subscription later ends). The at-delivery journal line (Step 3b) buckets B2B Wholesale on this field.
  - `npx convex codegen && npm run type-check`.

- [ ] **Step 5: Manual smoke + commit**

Manual (deferred-revenue model): invoice a confirmed week, mark paid → verify `creditIssued` = week total (deferred revenue funded), each order cash-`Paid`, and **`creditConsumed` = 0 / `creditRemaining` = full** (nothing recognized yet — no deliveries). Then mark one order **sent/delivered** → verify exactly one `drawdown` posts for it (`creditConsumed` rises by that order's total, idempotent on repeat) and a B2B Wholesale revenue line is recognized.

```bash
git add convex/subscriptions/invoicing.ts convex/subscriptions/recognition.ts convex/invoices/mutations.ts convex/orders/ convex/schema.ts convex/_generated/
git commit -m "feat(subscriptions): weekly invoice + fund (deferred revenue) + recognize sale on delivery"
```

---

#### ▶ AMENDMENT gap #1 — `invoiceNumber` is the customer's bank-transfer reference + `/financials` reconciliation

**Why this lands here (not in D):** B owns the weekly-invoice builder and the funding flow; D only *displays* the number. For a normal order the bank-transfer reference is the order number (`MMDD-NNN`, CLAUDE.md rule #7). A subscription weekly invoice has **no single order**, so its **`invoiceNumber` (`INV-YYMM-NNN`, from `getNextInvoiceNumber`) is the reference the customer puts on the Monday transfer.** Grounded gap: the bank-reconciliation engine (`convex/bankStatements/matchEngine.ts` — `findLinkedRecord:258–377`) matches incoming **credit** lines to `externalRevenue` by fuzzy amount+date and has **no `invoiceNumber`/reference matching at all**; subscription invoices are not in that flow (and subscription orders are deliberately excluded from `externalRevenue` per C1). So an incoming weekly transfer currently matches **nothing** → it sits unreconciled. This amendment closes that.

**Files:**
- Modify: `convex/subscriptions/invoicing.ts` (B9) — surface the reference; ensure `invoiceNumber` is set (already is via `getNextInvoiceNumber`).
- Modify: `convex/bankStatements/matchEngine.ts` — add subscription weekly invoices as a credit-line match candidate.
- Test: `convex/bankStatements/__tests__/matchEngine.test.ts` (extend, pure-fn).

- [ ] **Step A1: Add unpaid subscription weekly invoices as a credit-line match candidate.** In `findLinkedRecord` (`matchEngine.ts:258–377`), extend the credit-line scan (today: `externalRevenue` only) to ALSO consider `invoices` where `invoiceKind === "subscription_weekly"` and `paymentStatus !== "Paid"`, matched first by **`invoiceNumber` appearing in the bank line description** (exact reference match — highest confidence), then by amount+date fuzzy fallback (same ±3-day window as the existing scan). Surface the matched `invoiceNumber` + `subscriptionWeekId` on the link candidate so the operator sees *which week's credit* the transfer funds.

```ts
// inside findLinkedRecord, credit-line branch — BEFORE the externalRevenue fuzzy scan:
// Use the B0 by_kind_paymentStatus index (NOT a full scan of all final invoices).
const candidates = await ctx.db
  .query("invoices")
  .withIndex("by_kind_paymentStatus", (q) =>
    q.eq("invoiceKind", "subscription_weekly").eq("paymentStatus", "Unpaid"))
  .collect();
// 1. Reference match: bank line description contains the invoiceNumber → exact link.
const byRef = candidates.find((inv) => inv.invoiceNumber && line.description.includes(inv.invoiceNumber));
if (byRef) return { kind: "subscriptionWeeklyInvoice", id: byRef._id, invoiceNumber: byRef.invoiceNumber, confidence: "exact" };
// 2. else amount+date fuzzy over `candidates` (same ±3-day window), then the existing externalRevenue scan.
```

- [ ] **Step A2: On confirm-link, fund the week (cash event = deferred revenue).** When the operator confirms a bank line ↔ subscription-weekly-invoice link in `/financials`, call `markWeeklyInvoicePaid({ subscriptionWeekId })` (Task B9) — that posts the `topup` (funds the **deferred-revenue** pool) and marks the week's orders cash-Paid. It does **NOT** recognize sales (that happens per order at delivery — B9 Step 3b). Wire the reconcile-confirm action (wherever bank-line links are confirmed today) to dispatch `markWeeklyInvoicePaid` when `kind === "subscriptionWeeklyInvoice"`.
  > **Revenue recognition (RESOLVED 2026-06-23, user directive):** the weekly credit is a **prepaid voucher** — cash and sales are separate events. **Cash in (this transfer) = deferred revenue (liability), recognized when received.** **Sales = recognized when each order is SENT/delivered** (per-order `drawdown`, B9 Step 3b), bucketed "B2B Wholesale" in the P&L via an at-delivery journal line, kept out of `externalRevenue`/per-channel analytics (C1). The credit-pool balance = the deferred-revenue liability. So this `/financials` match records the **cash/deferred** side only; revenue follows at delivery.

- [ ] **Step A3: Surface the reference on the visual invoice (display spec for B15).** The visual weekly invoice (Task B15) MUST show `invoiceNumber` prominently labelled **"Bank transfer reference"** (the customer copies it into the transfer memo), exactly as a normal invoice surfaces the order number. D (`/crm`) only *reads/links* this number — no logic.

- [ ] **Step A4: Test + commit.** Extend the pure match-engine test: a bank credit line whose description contains an unpaid `subscription_weekly` invoiceNumber links to that invoice with `confidence:"exact"`; an amount-only match falls to fuzzy; a `Paid` weekly invoice is never re-matched.

```bash
git add convex/bankStatements/matchEngine.ts convex/bankStatements/__tests__/matchEngine.test.ts convex/subscriptions/invoicing.ts
git commit -m "feat(subscriptions): subscription weekly invoiceNumber as transfer reference + /financials reconciliation (gap #1)"
```

---

### Task B10: Schedule-driven top-up delta invoice

**Files:**
- Modify: `convex/subscriptions/invoicing.ts`

**Interfaces:**
- Produces: `createTopupInvoice` (`protectedMutation`) `args: { subscriptionWeekId, addedLines: ScheduleLine[] }` (or recompute delta from a re-planned week vs funded credit) → builds an invoice with `invoiceKind: "subscription_topup"`, `items` = only the delta lines, numbered via `getNextInvoiceNumber`, linked to the same `subscriptionWeekId`. On mark-paid it posts another `topup` against the same week (pool = weekly + top-ups). No standalone form — the UI triggers this when a mid-week schedule edit pushes the week total above funded credit.

- [ ] **Step 1: Implement `createTopupInvoice`** — mirror `createSubscriptionWeeklyInvoice` but: `invoiceKind: "subscription_topup"`, `items` = the delta lines only, do NOT change week status (week stays `delivering`/`invoiced`). Reuse `markWeeklyInvoicePaid`-style topup posting (extract a shared `fundWeek(ctx, weekId, invoiceId, amount)` helper if it reduces duplication with Task B9).

- [ ] **Step 2: Type-check + commit**

```bash
npx convex codegen && npm run type-check
git add convex/subscriptions/invoicing.ts convex/_generated/
git commit -m "feat(subscriptions): schedule-driven top-up delta invoice"
```

---

### Task B11: `reconcileWeek` (per-tranche FIFO + refund flag + closed-week guard)

**Files:**
- Create: `convex/subscriptions/reconcile.ts`

**Interfaces:**
- Consumes: `reconcileTranches` (B3), `postLedgerEntry`, `getWeekPool`-style replay (`deriveCreditPool`).
- Produces: `reconcileWeek` (`protectedMutation`) `args: { subscriptionWeekId, shortfallFault: v.union("none","cafe","frollie") }` → at week end computes `shortfall = creditRemaining` (= **undelivered, still-deferred** credit, since drawdowns now fire at delivery — B9 Step 3b), builds the tranche list from `rolloverFromWeekId`-tagged + base topup entries (each tagged with its `weeksCarried`), calls `reconcileTranches`, posts an `expiry` entry for each expired tranche and a carry-forward `topup` (tagged `rolloverFromWeekId`, against the next open week) for each carried tranche; on `shortfallFault:"frollie"` sets `refundDue = shortfall` + `refundStatus:"pending"` (flag only, no payout — I4); sets week status → `reconciled`. **Refuses if week status is `closed`** (closed-week guard, C2).

> **Deferred-revenue accounting at reconcile (user directive 2026-06-23):** `shortfall` is leftover **deferred revenue** (cash held for products never delivered). Its fate maps to the fault:
> - **`cafe` under-ordered → `expiry`:** the cafe forfeits the credit (non-transferable, no refund). This is **breakage** — recognize the expired amount as B2B Wholesale revenue at expiry (Frollie keeps the cash, earns it on forfeiture). Mirror the at-delivery journal-line treatment (B9 Step 3b), bucketed B2B Wholesale.
> - **`rollover` → `carry`:** deferred revenue stays a liability, carried to next week (no recognition).
> - **`frollie` fault → `refund`:** cash is owed back → deferred revenue is reversed, **no** revenue recognized; `refundDue` flags the obligation (payout manual, I4).

- [ ] **Step 1: Implement `reconcileWeek`** following the interface above. Compute `weeksCarried` per tranche from how many reconciles a tranche has survived (base topup = 0; a carried `topup` tagged `rolloverFromWeekId` increments the source tranche's age — read the source week's tranche age + 1). Guard: `if (week.status === "closed") throw new ConvexError("Week already closed")`.

```ts
// sketch of the core decision wiring:
const pool = deriveCreditPool(entries.map((e) => ({ type: e.type, amount: e.amount })));
const leftover = pool.creditRemaining;
const tranches = buildTranchesFromLedger(entries); // [{ weekId, amount, weeksCarried }]
const { expire, carry } = reconcileTranches({
  tranches, policy: sub.creditRolloverPolicy, rolloverExpiryWeeks: sub.rolloverExpiryWeeks ?? null,
});
for (const e of expire) await postLedgerEntry(ctx, { ...base, type: "expiry", amount: -e.amount });
for (const c of carry) {
  // carry forward onto the next open week as a topup tagged rolloverFromWeekId
}
const refundDue = args.shortfallFault === "frollie" ? leftover : 0;
await ctx.db.patch(week._id, {
  status: "reconciled", shortfall: leftover, shortfallFault: args.shortfallFault,
  refundDue, refundStatus: refundDue > 0 ? "pending" : undefined,
});
```

- [ ] **Step 2: Type-check + manual multi-week smoke** (the math is proven by B3's unit tests; smoke confirms wiring): create two weeks with rollover policy, leave leftover in week 1, reconcile, confirm carry-forward `topup` appears on week 2 tagged `rolloverFromWeekId`; reconcile a `frollie`-fault week, confirm `refundDue` set and NO payout entry.

- [ ] **Step 3: Commit**

```bash
git add convex/subscriptions/reconcile.ts convex/_generated/
git commit -m "feat(subscriptions): reconcileWeek per-tranche FIFO + refund flag + closed-week guard (C2, I4)"
```

---

### Task B12: Out-of-credit handling (§8 Paths A/B)

**Files:**
- Create: `convex/subscriptions/outOfCredit.ts`

**Interfaces:**
- Produces:
  - `splitScheduledOrderOnCredit` (`protectedMutation`) — Path A: when a scheduled day's order exceeds remaining credit, split so only the credit-covered qty draws down; the remainder + rest-of-week becomes a top-up invoice (reuse Task B10). Split happens here (scheduler), never on the kanban.
  - `applyPartialCreditToAdHocOrder` (`protectedMutation`) — Path B: apply remaining credit to an ad-hoc order as a `drawdown`, label `fundingSource:"deposit"`, leave the uncovered remainder on normal billing (`AwaitingPayment`) for the existing QRIS/bank flow (no new deposit subsystem — §13.2).

- [ ] **Step 1: Implement both mutations** per the interface. For Path A, compute covered qty = `floor(remainingCredit / unitPrice)`, split the order item, post `drawdown` for the covered portion, route the remainder through `createTopupInvoice`. For Path B, post `drawdown` for `min(remainingCredit, orderTotal)`, set `fundingSource:"deposit"`, leave remainder `AwaitingPayment`.

- [ ] **Step 2: Type-check + commit**

```bash
npx convex codegen && npm run type-check
git add convex/subscriptions/outOfCredit.ts convex/_generated/
git commit -m "feat(subscriptions): out-of-credit split (Path A) + apply-partial (Path B)"
```

---

### Task B13: Calendar read queries

**Files:**
- Create: `convex/subscriptions/scheduling/queries.ts`

**Interfaces:**
- Produces: `getPlanningWeek` (`protectedQuery`) `args: { subscriptionId, weekStart }` → the `subscriptionWeeks` row (or null if unseeded) + the subscription; `listWeeks` (`protectedQuery`) `args: { subscriptionId }` → weeks desc for the subscription; `getFundingDashboard` (`protectedQuery`) → across subscriptions: weeks in `invoiced` (awaiting payment) + `confirmed` (awaiting invoice), for the "who hasn't paid / what needs funding" surface.

- [ ] **Step 1: Implement the three queries** (manager+admin), using `by_subscription_weekStart` / `by_status` indexes.
- [ ] **Step 2: codegen + type-check + commit**

```bash
npx convex codegen && npm run type-check
git add convex/subscriptions/scheduling/queries.ts convex/_generated/
git commit -m "feat(subscriptions): calendar + funding-dashboard read queries"
```

---

# Wave 4 — Frontend [after Wave 3] [PARALLEL within wave]

### Task B14: `/crm` route + permission + schedule calendar page

**Files:**
- Modify: `src/lib/types.ts` (add `canAccessCrm: true` for manager+admin, `false` for kitchen/order_staff in `ROLE_PERMISSIONS`)
- Modify: `src/App.tsx` (lazy routes under `<ProtectedRoute requiredPermission="canAccessCrm">`)
- Create: `src/pages/crm/SubscriptionSchedulePage.tsx`, `src/components/crm/WeekCalendarGrid.tsx`, `src/components/crm/DayPlanCell.tsx`, `src/components/crm/ProductLineEditor.tsx`

**Interfaces:**
- Consumes: `getPlanningWeek`/`seedWeek`/`confirmWeek` (Convex hooks), `menuProducts.list({activeOnly:true})`.
- Produces: the calendar at `/crm/customers/:id/subscriptions/:subId/week` (Mon→Sun real dates, product dropdowns, qty + partner price + line/day/week subtotals, multi-product days, the **3 seed-source actions** "Reset to template / ⧉ Copy last week / Blank", "Confirm → generate orders + invoice").

- [ ] **Step 1: Add `canAccessCrm` to `ROLE_PERMISSIONS`** in `src/lib/types.ts` (mirror an existing manager+admin permission like `canAccessDashboard`). Type-check.
- [ ] **Step 2: Register the lazy route** in `src/App.tsx` following the existing `lazyWithPreload` + `<ProtectedRoute requiredPermission=...>` pattern.
- [ ] **Step 3: Build `WeekCalendarGrid` + `DayPlanCell` + `ProductLineEditor`** — grid of 7 `DayPlanCell`s; each cell lists its `ScheduleLine`s via `ProductLineEditor` (product dropdown from `menuProducts`, qty input, read-only line total), a day subtotal, "+ add product"; the page header has the week label, the 3 seed-source buttons, the week total, and "Confirm → generate orders + invoice" (calls `confirmWeek` then `createSubscriptionWeeklyInvoice`). Loading guard: `if (week === undefined) return <Loading/>`. Partner price shown to manager+admin only (the page is already gated).
- [ ] **Step 4: `npm run build`** → PASS (watch vendor-bundle cap, Pitfall #16). Manual: render the calendar in dev, plan/confirm a week.
- [ ] **Step 5: Commit**

```bash
git add src/lib/types.ts src/App.tsx src/pages/crm/SubscriptionSchedulePage.tsx src/components/crm/
git commit -m "feat(crm): /crm route + schedule calendar (3 seed sources, confirm→orders+invoice)"
```

---

### Task B15: Visual weekly invoice + funding dashboard

**Files:**
- Create: `src/pages/crm/SubscriptionWeeklyInvoicePage.tsx`, `src/pages/crm/CrmFundingDashboardPage.tsx`

**Interfaces:**
- Consumes: the week + its `weeklyInvoiceId` invoice, `markWeeklyInvoicePaid`, `getFundingDashboard`.
- Produces: the day-by-day invoice (group `items` by `date`, per-product unit price + line subtotal, day subtotal, week total = credit), "Mark paid → fund credit" action, 1-click WhatsApp/email/PDF-PNG (reuse any existing invoice-PDF util if present; else a print-to-PDF + a `wa.me`/`mailto` deep link from `customer.whatsapp`/`customer.email`); the funding dashboard listing weeks awaiting payment/funding.

- [ ] **Step 1: Build the invoice page** — group by `items[].date`, render day cards, week total, "Mark paid → fund". Loading guards.
- [ ] **Step 2: Build the funding dashboard** — table from `getFundingDashboard`, each row links to its invoice/customer.
- [ ] **Step 3: `npm run build` + manual + commit**

```bash
git add src/pages/crm/SubscriptionWeeklyInvoicePage.tsx src/pages/crm/CrmFundingDashboardPage.tsx
git commit -m "feat(crm): visual weekly invoice + 1-click send + funding dashboard"
```

---

### Task B16: Read-only subscription rendering on the kanban (Pitfall #20)

**Files:**
- Modify: `src/components/orders/OrderSlideOver.tsx` AND `src/pages/OrderDetail.tsx`

**Interfaces:**
- Consumes: `order.subscriptionId` / `order.fundingSource`.
- Produces: when an order is a subscription order, BOTH surfaces render a distinct "🔒 Subscription" badge, hide/disable the Actions (edit/status/delete) section, and show an "↗ Open in scheduler" link to `/crm/customers/:id/subscriptions/:subId/week`. Staff still see the order for production; they cannot edit it.

#### ▶ AMENDMENT gap #2 — strip the confidential partner price SERVER-SIDE for non-managers

The kanban (`OrderSlideOver`/`OrderDetail`/kitchen board) is reachable by **order_staff and kitchen**, and a subscription order's `orderItems` carry the **confidential partner `unitPrice`** (Task B7). Hiding the Actions section is NOT enough — the line-item price + order total are still rendered. **Required: strip `unitPrice`/`lineTotal` (orderItems) and `totalAmount`/`finalTotal`/`totalMargin`/`totalCost` (order) SERVER-SIDE on subscription orders unless the caller's role ∈ {manager, admin}.** NOT a client-side hide (leaks over the network); NOT a manager-only query (crashes the board for staff on mount — Pitfall #19). Kitchen keeps **qty + product** (BOM/production needs them), just not money. (Phase E's spec AC11/Q11 defers here.)

**Grounded gap:** the order-read queries the kanban consumes are plain `query()` with **no `ctx.user`** — `convex/orders/queries.ts` `get` (`:230`), `getKitchenOrders` (`:296+`), `getByOrderNumber` (`:262`), and `convex/orders/kitchenQueries.ts` `getKitchenPackingOrders` (`:13`). To strip by role they must become `protectedQuery` (roles include `kitchen`/`order_staff`/`manager`/`admin`) so `ctx.user.role` is available. Role literals: `kitchen | order_staff | manager | admin` (`convex/lib/auth.ts:21`).

**Files:**
- Create: `convex/orders/helpers/stripSubscriptionPricing.ts` + test.
- Modify: `convex/orders/queries.ts` (convert `get`/`getKitchenOrders`/`getByOrderNumber` → `protectedQuery` + apply strip), `convex/orders/kitchenQueries.ts` (`getKitchenPackingOrders`).
- Modify: `src/hooks/convex/useOrders.ts` (+ kitchen hooks) — switch the affected `useQuery` calls to the session-aware variant the project uses for `protectedQuery` (e.g. `useSessionQuery`).
- Modify: `src/components/orders/OrderSlideOver.tsx` AND `src/pages/OrderDetail.tsx` (the read-only rendering).

- [ ] **Step 1: TDD the pure strip helper.** `convex/orders/helpers/__tests__/stripSubscriptionPricing.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { stripSubscriptionPricing } from "../stripSubscriptionPricing";

const order = (extra = {}) => ({ fundingSource: "subscription_credit", totalAmount: 4350000, finalTotal: 4350000, totalMargin: 4350000, totalCost: 0, ...extra });
const items = [{ productName: "Dubai", quantity: 150, unitPrice: 29000, lineTotal: 4350000, menuProductId: "p1" }];

describe("stripSubscriptionPricing", () => {
  it("strips price fields for a non-manager on a subscription order", () => {
    const r = stripSubscriptionPricing(order(), items, "kitchen");
    expect(r.order.totalAmount).toBeUndefined();
    expect(r.order.finalTotal).toBeUndefined();
    expect(r.items[0].unitPrice).toBeUndefined();
    expect(r.items[0].lineTotal).toBeUndefined();
    expect(r.items[0].quantity).toBe(150);          // qty + product KEPT
    expect(r.items[0].productName).toBe("Dubai");
  });
  it("keeps prices for a manager", () => {
    expect(stripSubscriptionPricing(order(), items, "manager").items[0].unitPrice).toBe(29000);
  });
  it("keeps prices for a non-manager on a NON-subscription order", () => {
    const r = stripSubscriptionPricing(order({ fundingSource: "normal", subscriptionId: undefined }), items, "order_staff");
    expect(r.items[0].unitPrice).toBe(29000);
  });
});
```

```ts
// stripSubscriptionPricing.ts
import { isSubscriptionOrder } from "../../subscriptions/revenueGate";
const MANAGERIAL = new Set(["manager", "admin"]);
export function stripSubscriptionPricing<O extends Record<string, any>, I extends Record<string, any>>(
  order: O, items: I[], role: string,
): { order: O; items: I[] } {
  if (MANAGERIAL.has(role) || !isSubscriptionOrder(order)) return { order, items };
  return {
    order: { ...order, totalAmount: undefined, finalTotal: undefined, totalMargin: undefined, totalCost: undefined },
    items: items.map((it) => ({ ...it, unitPrice: undefined, lineTotal: undefined })),
  };
}
```

Run `npx vitest run convex/orders/helpers/__tests__/stripSubscriptionPricing.test.ts` → PASS. Reuses `isSubscriptionOrder` (Task B4) so "what counts as a subscription order" stays single-sourced.

- [ ] **Step 2: Convert the kanban order-read queries to `protectedQuery` + apply the strip.** In `convex/orders/queries.ts`, change `get`/`getKitchenOrders`/`getByOrderNumber` from `query(...)` to `protectedQuery({ roles: ["kitchen","order_staff","manager","admin"], ... })` and, before returning, run the result through `stripSubscriptionPricing(order, items, ctx.user.role)`. Mirror in `kitchenQueries.ts` `getKitchenPackingOrders`. **Strip at EVERY query a non-manager uses to see subscription line data** — a single missed query re-leaks the price.

- [ ] **Step 3: Update the frontend hooks.** In `src/hooks/convex/useOrders.ts` (and any kitchen hook), switch the converted queries' `useQuery(api.orders.queries.get, ...)` to the project's session-aware hook (`useSessionQuery`, as used by other `protectedQuery` consumers) so the sessionId is supplied. Type-check — stripped fields are now `T | undefined`; the order-detail/kanban UI must already guard money rendering (render "—" when undefined).

- [ ] **Step 4: Read-only rendering, BOTH surfaces.** Add the read-only branch to `OrderSlideOver.tsx` (Actions ~557–570) and mirror EXACTLY into `OrderDetail.tsx` (Actions ~314–330): on `order.subscriptionId`, render the "🔒 Subscription" locked variant + "↗ Open in scheduler" link instead of `<StatusActionButtons/>`; render money fields as "—" when undefined (stripped for staff). Do NOT share a component — mirror by hand (Pitfall #20).

- [ ] **Step 5: `npm run build` + manual + commit.** Manual: open a subscription order as **kitchen** (no price anywhere, qty+product visible) AND as **manager** (price visible) in BOTH surfaces; confirm a normal order is unaffected.

```bash
git add convex/orders/helpers/stripSubscriptionPricing.ts convex/orders/helpers/__tests__/ convex/orders/queries.ts convex/orders/kitchenQueries.ts src/hooks/convex/useOrders.ts src/components/orders/OrderSlideOver.tsx src/pages/OrderDetail.tsx convex/_generated/
git commit -m "feat(crm): strip confidential subscription pricing server-side for non-managers + read-only kanban (gap #2, Pitfall #20)"
```

---

# Wave 5 — Verification + docs [SEQUENTIAL]

### Task B17: Full gate + access-control audit + docs

- [ ] **Step 1: Full verification gate**

Run: `npm run type-check && npx vitest run convex/subscriptions && npm run build`
Expected: type-check PASS; all subscription unit tests PASS (scheduleLine, weekBounds, reconcileMath, revenueGate, + Phase-A creditMath/rollover/weeks); build PASS (vendor cap OK).

- [ ] **Step 2: `code-auditor` pass** — dispatch `code-auditor`: every new `protectedMutation`/`protectedQuery` is `roles:["manager","admin"]` (Pitfall #19); `canAccessCrm` resolves to manager+admin and the route `requiredPermission` matches; no deprecated `productionType`/`productionUnits` (Pitfall #11); no banned Phase-81 imports (Pitfall #18); both kanban surfaces mirror (Pitfall #20); the C1 gates are present at both sites.

- [ ] **Step 3: Docs** — update:
  - `docs/CHANGELOG.md` — Phase B entry (schedule, weekly cycle, reconcile, CRM calendar/invoice/funding, C1 isolation).
  - `docs/API_REFERENCE.md` — new mutations/queries (`confirmWeek`, `createSubscriptionWeeklyInvoice`, `markWeeklyInvoicePaid`, `createTopupInvoice`, `reconcileWeek`, out-of-credit, calendar queries).
  - `docs/FILE_MAP.md` — CRM feature area + permission row (`canAccessCrm` → manager+admin).

- [ ] **Step 4: Commit docs**

```bash
git add docs/CHANGELOG.md docs/API_REFERENCE.md docs/FILE_MAP.md
git commit -m "docs(subscriptions): Phase B weekly-cycle changelog + API + file map"
```

---

## Phase B Success Criteria

- [ ] `npm run type-check` passes; `npx convex codegen` clean (`_generated/` committed).
- [ ] `npx vitest run convex/subscriptions` passes (scheduleLine, weekBounds, reconcileMath, revenueGate + Phase-A suites).
- [ ] `npm run build` succeeds (vendor cap respected).
- [ ] Schedule total = weekly invoice total = credit granted (enforced via `makeScheduleLine`; proven on a confirmed week).
- [ ] `confirmWeek` generates one order per planned day at partner `unitPrice`; production records created (kanban shows units).
- [ ] **Deferred-revenue model:** `markWeeklyInvoicePaid` funds the pool (`topup` = deferred revenue) + marks orders cash-Paid but posts **NO** drawdown; the `drawdown` (sale recognition, B2B Wholesale P&L) fires **per order at delivery** (idempotent), not at funding. Pool balance = deferred-revenue liability; pool replay matches.
- [ ] Top-up = schedule-driven delta invoice only; no standalone form.
- [ ] Out-of-credit: scheduled split (Path A) + ad-hoc apply-partial (Path B, no new deposit table).
- [ ] **C1 (refined):** subscription order absent from `getDailySalesSummary` + per-channel `externalRevenue` breakdowns, **but** its at-delivery revenue PRESENT in the income-statement total under a **B2B Wholesale** bucket (keyed on `customers.customerType`); BOM ball-count still resolves (sentinel predicate test + manual UAT).
- [ ] **Revenue categorization (§7.x):** `customers.customerType` seam added; subscription create sets `b2b_wholesale`; B2B Wholesale recognized separately from B2C Direct in the P&L (subscription is the first B2B occupant; future non-subscription wholesale uses the same key).
- [ ] **B0 foundational schema (additive):** `customerActivity` table + `by_customer_at`; `invoices` `+customerId`/`by_customer`/`by_subscriptionWeek`/`by_kind_paymentStatus` (customerId backfilled at create + finalize); `orders` `+by_subscription`; `creditLedger` `+by_invoice`; `customers` `+customerType`; `src/lib/crmActivityTaxonomy.ts` stub (`Record<ActivityType,…>` exhaustive); `npx convex codegen` clean + `_generated/` committed. (gap#1 match uses `by_kind_paymentStatus`; topup idempotency uses `by_invoice`.)
- [ ] **C2:** per-tranche FIFO reconcile proven by multi-week unit fixture; `reconcileWeek` rejects a `closed` week.
- [ ] **I4:** Frollie-fault shortfall flags `refundDue` only (no payout mutation).
- [ ] Subscription orders read-only on BOTH kanban surfaces (Pitfall #20); editable only in scheduler.
- [ ] All subscription/credit/invoice/CRM surfaces manager+admin only (Pitfall #19).
- [ ] **Gap #1:** subscription weekly `invoiceNumber` (`INV-YYMM-NNN`) shown as the bank-transfer reference on the visual invoice; `/financials` reconciliation links an incoming transfer to the weekly invoice by that reference and `markWeeklyInvoicePaid` funds the week (match-engine test green). Revenue-recognition decision (a/b) confirmed with user.
- [ ] **Gap #2:** subscription order `unitPrice`/`lineTotal`/`totalAmount` stripped SERVER-SIDE for kitchen/order_staff across ALL kanban order-read queries (strip-helper test green); kitchen still sees qty + product; managers see price.

## Self-Review (writing-plans)

- **Spec coverage:** §4.3/§4.4/§4.5/§4.7/§4.8 schema additions + §5.x taxonomy lib → **B0**; §6 schedule → B6/B7/B13/B14; §7 billing/credit/weekly cycle → B9/B10/B11/B15; §7 reconcile + §13.1 FIFO → B3/B11; §8 out-of-credit → B12; §4.4 analytics isolation (C1) → B4/B8; §4.5 invoices → B9; r1.c1 seed sources → B6/B14; kanban read-only → B16; **gap #1 (transfer ref + /financials match) → B9 amendment (uses B0 `by_kind_paymentStatus`/`by_invoice`); gap #2 (server-side price strip) → B16 amendment.** All merged-phase sections mapped.
- **Placeholder scan:** pure cores (B1–B4) carry full TDD code; ctx-dependent mutations (B5–B13) carry real signatures + grounded code shape + the exact reuse points (per project convention that defers their runtime tests); UI tasks (B14–B16) carry component structure + wiring. The two "mirror createDraft's non-order fields" notes (B9) and "verify status literals" (B7) are explicit read-the-file instructions, not placeholders.
- **Type consistency:** `ScheduleLine`/`PlannedDay`/`CreditPool`/`LedgerType` from Phase-A `types.ts`; `makeScheduleLine`, `validateScheduleTemplate`, `computeWeekBounds`, `reconcileTranches`, `isSubscriptionOrder`, `insertOrderWithItems` signatures consistent across their consumers (B6/B7/B8/B9/B11).
