# Pack-list Overdue Flagging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the daily Telegram pack-list call out overdue paid orders in a dedicated section, and send a separate alert for orders that are both unpaid and past their delivery date.

**Architecture:** A new pure helper (`dueClassification.ts`) owns the overdue threshold — mirroring the kanban board's "dueDate's WIB day strictly before today's WIB day" rule, computed in WIB. The pack-list query buckets paid orders into `overdue`/`dueToday` and adds an `AwaitingPayment + past-due` scan. The formatter renders an `⚠️ OVERDUE` section + days-late lines and a separate unpaid alert. `sendPackList` threads one timestamp through both and sends the alert as a separate message.

**Tech Stack:** Convex (internalQuery/internalAction), TypeScript, Vitest + convex-test, Telegram HTML messages.

---

## Git Workflow
**Branch:** `feature/packlist-overdue-flagging` (branch from `main` — `git switch main && git pull` first)
**Checkpoints:** After each task (atomic commit). Full `npm run test` + `npm run build` before PR.

## Implementation Waves
### Wave 1: Backend [SEQUENTIAL — shared files]
| Agent | Task | Files |
|-------|------|-------|
| convex-backend | Task 1: `dueClassification` helper | `convex/telegram/queries/dueClassification.ts` |
| convex-backend | Task 2: query bucketing + unpaid scan | `convex/telegram/queries/packListQuery.ts` |
| convex-backend | Task 3: formatter sections + unpaid alert | `convex/telegram/packListFormat.ts` |
| convex-backend | Task 4: send wiring | `convex/telegram/sendPackList.ts` |

### Wave 2: Verification [SEQUENTIAL]
| Agent | Task |
|-------|------|
| Bash | Task 5: `npm run test` (full) + `npm run build` |
| code-auditor | Type check + pattern compliance |

## Documentation Updates
- [ ] `docs/CHANGELOG.md` (always)
- [ ] `docs/API_REFERENCE.md` if `getOrdersForPackList` return shape is documented there (grep first)

## Success Criteria
- [ ] `npm run type-check` passes
- [ ] `npm run build` succeeds
- [ ] Full `npm run test` passes (not a filtered subset)
- [ ] Overdue paid orders render under `⚠️ OVERDUE (n)` with `n day(s) late`
- [ ] Unpaid + past-due orders sent as a separate `🚨 OVERDUE — Unpaid & Past Due` message
- [ ] When nothing is overdue, pack-list output is byte-identical to today's

---

## File Structure

- **Create** `convex/telegram/queries/dueClassification.ts` — pure WIB day-index helpers (`wibDayIndex`, `classifyDue`, `daysLate`). The single source of truth for the overdue threshold.
- **Create** `convex/telegram/queries/__tests__/dueClassification.test.ts` — unit tests for the helper.
- **Modify** `convex/telegram/queries/packListQuery.ts` — bucket paid orders; add `AwaitingPayment` past-due scan; return new shape with `generatedAt`.
- **Modify** `convex/telegram/__tests__/packListQuery.test.ts` — migrate `result.orders` → buckets; add bucketing + unpaid tests.
- **Modify** `convex/telegram/packListFormat.ts` — sectioned `formatPackList`; new `formatUnpaidAlert`; days-late + precise IDR helpers.
- **Modify** `convex/telegram/__tests__/packListFormat.test.ts` — field rename; add section + alert tests.
- **Modify** `convex/telegram/sendPackList.ts` — thread `generatedAt`; append unpaid-alert chunks.

---

### Task 1: `dueClassification` pure helper

**Files:**
- Create: `convex/telegram/queries/dueClassification.ts`
- Test: `convex/telegram/queries/__tests__/dueClassification.test.ts`

- [ ] **Step 1: Write the failing test**

Create `convex/telegram/queries/__tests__/dueClassification.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { wibDayIndex, classifyDue, daysLate } from "../dueClassification";

// UTC ms for "WIB midnight of date D" — same convention as periodRange.test.ts.
function wibMidnight(year: number, month: number, day: number): number {
  return Date.UTC(year, month - 1, day, -7, 0, 0, 0);
}

const TODAY = wibMidnight(2026, 5, 27);
const YESTERDAY = wibMidnight(2026, 5, 26);
const TOMORROW = wibMidnight(2026, 5, 28);
const NOON_TODAY = TODAY + 12 * 3600_000;

describe("wibDayIndex", () => {
  it("is constant across a whole WIB day and increments at WIB midnight", () => {
    expect(wibDayIndex(TODAY)).toBe(wibDayIndex(TODAY + 23 * 3600_000));
    expect(wibDayIndex(TOMORROW)).toBe(wibDayIndex(TODAY) + 1);
  });
});

describe("classifyDue", () => {
  it("classifies a due date from yesterday as overdue", () => {
    expect(classifyDue(YESTERDAY + 8 * 3600_000, NOON_TODAY)).toBe("overdue");
  });
  it("classifies any time today as today (00:00 and 23:00 WIB)", () => {
    expect(classifyDue(TODAY, NOON_TODAY)).toBe("today");
    expect(classifyDue(TODAY + 23 * 3600_000, NOON_TODAY)).toBe("today");
  });
  it("classifies tomorrow as future", () => {
    expect(classifyDue(TOMORROW, NOON_TODAY)).toBe("future");
  });
});

describe("daysLate", () => {
  it("returns whole WIB days late, ignoring time-of-day", () => {
    expect(daysLate(YESTERDAY + 8 * 3600_000, NOON_TODAY)).toBe(1);
    expect(daysLate(wibMidnight(2026, 5, 25) + 20 * 3600_000, NOON_TODAY)).toBe(2);
  });
  it("returns 0 for a due date that is today", () => {
    expect(daysLate(TODAY + 23 * 3600_000, NOON_TODAY)).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- dueClassification`
Expected: FAIL — `Cannot find module '../dueClassification'`.

- [ ] **Step 3: Write minimal implementation**

Create `convex/telegram/queries/dueClassification.ts`:

```ts
import { WIB_OFFSET_MS } from "../../lib/periodRange";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole-day index in WIB: days since the Unix epoch, shifted into WIB. */
export function wibDayIndex(ms: number): number {
  return Math.floor((ms + WIB_OFFSET_MS) / DAY_MS);
}

export type DueBucket = "overdue" | "today" | "future";

/**
 * Classify a dueDate relative to `nowMs`, in WIB calendar days.
 * Mirrors the kanban board rule (src/components/orders/KanbanCard.tsx →
 * getUrgencyLevel): overdue ⟺ the dueDate's WIB day is strictly before
 * today's WIB day. No grace period.
 */
export function classifyDue(dueDate: number, nowMs: number): DueBucket {
  const due = wibDayIndex(dueDate);
  const today = wibDayIndex(nowMs);
  if (due < today) return "overdue";
  if (due === today) return "today";
  return "future";
}

/** Whole WIB days the dueDate is late by. ≥1 when overdue, ≤0 otherwise. */
export function daysLate(dueDate: number, nowMs: number): number {
  return wibDayIndex(nowMs) - wibDayIndex(dueDate);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- dueClassification`
Expected: PASS (all 6 assertions).

- [ ] **Step 5: Commit**

```bash
git add convex/telegram/queries/dueClassification.ts convex/telegram/queries/__tests__/dueClassification.test.ts
git commit -m "feat(telegram): add WIB dueDate classification helper for overdue flagging"
```

---

### Task 2: Bucket paid orders + scan unpaid past-due in the query

**Files:**
- Modify: `convex/telegram/queries/packListQuery.ts` (full rewrite of handler + add helpers)
- Test: `convex/telegram/__tests__/packListQuery.test.ts`

- [ ] **Step 1: Write the failing tests (append new describe blocks)**

Append to `convex/telegram/__tests__/packListQuery.test.ts` (before the final closing — these are new top-level `describe` blocks). They reference `AwaitingPayment` status, so widen the `seedOrder` status union first.

In `seedOrder`'s `override` type, change the `status` union to include `AwaitingPayment`:

```ts
    status: "PaymentReceived" | "BeingPrepared" | "Draft" | "AwaitingDelivery" | "Complete" | "AwaitingPayment";
```

Then append:

```ts
describe("getOrdersForPackList — overdue vs dueToday buckets", () => {
  it("splits paid orders into overdue and dueToday by WIB day", async () => {
    const t = convexTest(schema, modules);
    await seedOrder(t, { orderNumber: "0526-001", dueDate: YESTERDAY_START + 8 * 3600_000 });   // overdue
    await seedOrder(t, { orderNumber: "0527-001", dueDate: TODAY_START + 20 * 3600_000 });       // today
    const result = await t.query(
      internal.telegram.queries.packListQuery.getOrdersForPackList,
      { now: TODAY_START + 12 * 3600_000 },
    );
    expect(result.totalCount).toBe(2);
    expect(result.overdueCount).toBe(1);
    expect(result.overdue.map((o) => o.orderNumber)).toEqual(["0526-001"]);
    expect(result.dueToday.map((o) => o.orderNumber)).toEqual(["0527-001"]);
  });

  it("echoes the injected now as generatedAt", async () => {
    const t = convexTest(schema, modules);
    const now = TODAY_START + 12 * 3600_000;
    const result = await t.query(
      internal.telegram.queries.packListQuery.getOrdersForPackList,
      { now },
    );
    expect(result.generatedAt).toBe(now);
  });
});

describe("getOrdersForPackList — unpaid past-due scan", () => {
  it("includes AwaitingPayment orders past their delivery date", async () => {
    const t = convexTest(schema, modules);
    await seedOrder(t, {
      orderNumber: "0525-007",
      status: "AwaitingPayment",
      dueDate: YESTERDAY_START + 8 * 3600_000,
    });
    const result = await t.query(
      internal.telegram.queries.packListQuery.getOrdersForPackList,
      { now: TODAY_START + 12 * 3600_000 },
    );
    expect(result.unpaidOverdue.map((o) => o.orderNumber)).toEqual(["0525-007"]);
    expect(result.totalCount).toBe(0); // unpaid does NOT count toward the pack list
  });

  it("excludes AwaitingPayment orders due today (not yet past delivery)", async () => {
    const t = convexTest(schema, modules);
    await seedOrder(t, {
      orderNumber: "0527-009",
      status: "AwaitingPayment",
      dueDate: TODAY_START + 8 * 3600_000,
    });
    const result = await t.query(
      internal.telegram.queries.packListQuery.getOrdersForPackList,
      { now: TODAY_START + 12 * 3600_000 },
    );
    expect(result.unpaidOverdue).toHaveLength(0);
  });

  it("excludes AwaitingPayment orders without a dueDate", async () => {
    const t = convexTest(schema, modules);
    await seedOrder(t, { orderNumber: "0527-010", status: "AwaitingPayment", dueDate: undefined });
    const result = await t.query(
      internal.telegram.queries.packListQuery.getOrdersForPackList,
      { now: TODAY_START + 12 * 3600_000 },
    );
    expect(result.unpaidOverdue).toHaveLength(0);
  });

  it("does not surface paid past-due orders in the unpaid bucket", async () => {
    const t = convexTest(schema, modules);
    await seedOrder(t, {
      orderNumber: "0526-001",
      status: "PaymentReceived",
      dueDate: YESTERDAY_START + 8 * 3600_000,
    });
    const result = await t.query(
      internal.telegram.queries.packListQuery.getOrdersForPackList,
      { now: TODAY_START + 12 * 3600_000 },
    );
    expect(result.unpaidOverdue).toHaveLength(0);
    expect(result.overdue).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Migrate the existing query tests to the new return shape**

The handler no longer returns `orders`. In `convex/telegram/__tests__/packListQuery.test.ts`, replace the three `result.orders` reads:

- In `"includes PaymentReceived + BeingPrepared"`:
  ```ts
    expect([...result.overdue, ...result.dueToday].map((o) => o.orderNumber).sort()).toEqual(["0527-001", "0527-002"]);
  ```
- In `"excludes Draft / AwaitingDelivery / Complete"`:
  ```ts
    expect(result.dueToday[0].orderNumber).toBe("0527-001");
  ```
- In `"expedited orders come first"`:
  ```ts
    expect([...result.overdue, ...result.dueToday][0].orderNumber).toBe("0527-002");
  ```
- In `"excludes orderItems flagged isCancelled from the rendered card"`:
  ```ts
    expect(result.dueToday[0].items).toHaveLength(1);
    expect(result.dueToday[0].items[0].productName).toBe("Jumbo");
  ```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm run test -- packListQuery`
Expected: FAIL — handler still returns `orders`, and `result.overdue` / `result.unpaidOverdue` / `result.generatedAt` are undefined.

- [ ] **Step 4: Rewrite the query handler**

Replace the entire body of `convex/telegram/queries/packListQuery.ts` with:

```ts
import { v } from "convex/values";
import { internalQuery } from "../../_generated/server";
import type { QueryCtx } from "../../_generated/server";
import { wibMidnightToUtc, getWibComponents } from "../../lib/periodRange";
import { buildKanbanCard, type KanbanOrderCard } from "../../orders/helpers/kanbanBuilders";
import { classifyDue } from "./dueClassification";
import type { Doc } from "../../_generated/dataModel";

// I3 (triple-review): only PaymentReceived + BeingPrepared per plan/spec — these are
// the two CURRENT statuses an order sits in between "paid" and "packed". The
// schema retains 7 legacy "in-progress" statuses for unmigrated production docs,
// but the pack list intentionally ignores them. See SEED-001 design.
const ACTIVE_STATUSES = ["PaymentReceived", "BeingPrepared"] as const;

// Sort: expedited first, then dueDate ascending, then creation time ascending.
function packListComparator(a: Doc<"orders">, b: Doc<"orders">): number {
  const ea = a.expedited ? 0 : 1;
  const eb = b.expedited ? 0 : 1;
  if (ea !== eb) return ea - eb;
  const da = a.dueDate ?? Infinity;
  const db = b.dueDate ?? Infinity;
  if (da !== db) return da - db;
  return a._creationTime - b._creationTime;
}

// Build a lean kanban card for one order, excluding cancelled line items.
async function buildCard(ctx: QueryCtx, order: Doc<"orders">): Promise<KanbanOrderCard> {
  const items = await ctx.db
    .query("orderItems")
    .withIndex("by_order", (q) => q.eq("orderId", order._id))
    .collect();
  const filtered = items.filter((i) => !i.isCancelled);
  return buildKanbanCard(order, filtered, order.createdBy);
}

/**
 * Returns the data for the pack-list report, in three buckets:
 *   - overdue:       PaymentReceived/BeingPrepared, dueDate's WIB day < today
 *   - dueToday:      PaymentReceived/BeingPrepared, dueDate within today's WIB day
 *   - unpaidOverdue: AwaitingPayment, dueDate's WIB day < today (unpaid AND past due)
 *
 * `now` is injectable for tests; production callers pass nothing and we use Date.now().
 * `generatedAt` echoes the `now` used so the formatter renders days-late against the
 * SAME instant the buckets were computed against (no Date.now() drift).
 */
export const getOrdersForPackList = internalQuery({
  args: { now: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now();
    const wib = getWibComponents(now);
    // Both getWibComponents AND wibMidnightToUtc use 0-indexed month — pass wib.month directly.
    // Day-of-month overflow (day + 1 = 32) is safe; Date.UTC normalizes it.
    const startOfTodayMs = wibMidnightToUtc(wib.year, wib.month, wib.day);
    const endOfTodayMs = wibMidnightToUtc(wib.year, wib.month, wib.day + 1) - 1;

    // ── Paid pack list: two scans on by_status_due_date, bounded by dueDate <= end of today.
    // Convex sorts absent optional fields BEFORE all numbers, so lte("dueDate", X) would
    // include unset dueDate rows — filter those out after collecting.
    const paid: Doc<"orders">[] = [];
    for (const status of ACTIVE_STATUSES) {
      const slice = await ctx.db
        .query("orders")
        .withIndex("by_status_due_date", (q) =>
          q.eq("status", status).lte("dueDate", endOfTodayMs),
        )
        .collect();
      for (const o of slice) {
        if (o.dueDate !== undefined) paid.push(o);
      }
    }
    paid.sort(packListComparator);

    // ── Unpaid past-due: AwaitingPayment, dueDate strictly before start of today WIB.
    const unpaidRaw: Doc<"orders">[] = [];
    const unpaidSlice = await ctx.db
      .query("orders")
      .withIndex("by_status_due_date", (q) =>
        q.eq("status", "AwaitingPayment").lt("dueDate", startOfTodayMs),
      )
      .collect();
    for (const o of unpaidSlice) {
      if (o.dueDate !== undefined) unpaidRaw.push(o);
    }
    unpaidRaw.sort(packListComparator);

    // Build paid cards, split into overdue vs dueToday, count delivery/pickup.
    const overdue: KanbanOrderCard[] = [];
    const dueToday: KanbanOrderCard[] = [];
    let deliveryCount = 0;
    let pickupCount = 0;
    for (const order of paid) {
      const card = await buildCard(ctx, order);
      // dueDate is guaranteed defined here (filtered above); classifyDue → "overdue" | "today".
      if (classifyDue(order.dueDate as number, now) === "overdue") overdue.push(card);
      else dueToday.push(card);
      if (order.deliveryType === "Delivery") deliveryCount++;
      else if (order.deliveryType === "Pickup") pickupCount++;
    }

    const unpaidOverdue: KanbanOrderCard[] = [];
    for (const order of unpaidRaw) {
      unpaidOverdue.push(await buildCard(ctx, order));
    }

    return {
      generatedAt: now,
      totalCount: overdue.length + dueToday.length,
      overdueCount: overdue.length,
      deliveryCount,
      pickupCount,
      overdue,
      dueToday,
      unpaidOverdue,
    };
  },
});
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test -- packListQuery`
Expected: PASS (existing migrated tests + new bucket/unpaid tests).

- [ ] **Step 6: Commit**

```bash
git add convex/telegram/queries/packListQuery.ts convex/telegram/__tests__/packListQuery.test.ts
git commit -m "feat(telegram): bucket pack-list into overdue/dueToday + unpaid past-due scan"
```

---

### Task 3: Formatter sections + unpaid alert

**Files:**
- Modify: `convex/telegram/packListFormat.ts`
- Test: `convex/telegram/__tests__/packListFormat.test.ts`

- [ ] **Step 1: Migrate existing format tests to the new input shape**

The `FormatInput` field `cards` is replaced by `overdue` + `dueToday`. When `overdue` is empty, output is unchanged, so this is a pure field rename for existing tests.

In `convex/telegram/__tests__/packListFormat.test.ts`:

1. Update `baseInput`:
   ```ts
   const baseInput: FormatInput = {
     reason: "morning",
     overdue: [],
     dueToday: [],
     counts: { total: 0, delivery: 0, pickup: 0 },
     generatedAt: Date.parse("2026-05-27T00:00:00Z"), // 07:00 WIB
   };
   ```
2. Replace every test override key `cards:` with `dueToday:` (≈17 occurrences — all the `{ ...baseInput, cards: [...] }` spreads, including the two chunking tests that pass `cards: many`).

- [ ] **Step 2: Add new failing tests (append describe blocks)**

Append to `convex/telegram/__tests__/packListFormat.test.ts`. Add `formatUnpaidAlert` to the import on line 2:

```ts
import { formatPackList, formatUnpaidAlert, type FormatInput } from "../packListFormat";
```

Then append:

```ts
describe("formatPackList — OVERDUE section", () => {
  // now = 2026-05-27 07:00 WIB (baseInput.generatedAt); a dueDate two WIB days earlier.
  const overdueCard = () =>
    card({ orderNumber: "0525-001", dueDate: Date.parse("2026-05-25T01:00:00Z") }); // 08:00 WIB May 25

  it("renders an ⚠️ OVERDUE section header with the count", () => {
    const out = formatPackList({
      ...baseInput,
      overdue: [overdueCard()],
      dueToday: [card({ orderNumber: "0527-001" })],
      counts: { total: 2, delivery: 2, pickup: 0 },
    });
    const body = out.join("\n");
    expect(body).toContain("⚠️ OVERDUE (1)");
    expect(body).toContain("Due Today (1)");
  });

  it("renders a days-late line for overdue orders", () => {
    const out = formatPackList({
      ...baseInput,
      overdue: [overdueCard()],
      dueToday: [],
      counts: { total: 1, delivery: 1, pickup: 0 },
    });
    expect(out.join("\n")).toContain("2 days late");
    expect(out.join("\n")).toContain("due Mon 25 May");
  });

  it("adds the overdue count to the header line", () => {
    const out = formatPackList({
      ...baseInput,
      overdue: [overdueCard()],
      dueToday: [card({ orderNumber: "0527-001" })],
      counts: { total: 2, delivery: 2, pickup: 0 },
    });
    expect(out[0]).toContain("2 orders to pack today · 1 overdue · 2 delivery · 0 pickup");
  });

  it("omits the OVERDUE section and header segment when nothing is overdue", () => {
    const out = formatPackList({
      ...baseInput,
      overdue: [],
      dueToday: [card({ orderNumber: "0527-001" })],
      counts: { total: 1, delivery: 1, pickup: 0 },
    });
    const body = out.join("\n");
    expect(body).not.toContain("OVERDUE");
    expect(body).not.toContain("Due Today");
    expect(out[0]).not.toContain("overdue");
  });
});

describe("formatUnpaidAlert", () => {
  const unpaidCard = () =>
    card({
      orderNumber: "0525-007",
      customerName: "Andi",
      status: "AwaitingPayment",
      finalTotal: 150000,
      dueDate: Date.parse("2026-05-25T01:00:00Z"), // 08:00 WIB May 25
      contactWa: "0812-3456-7890",
    });

  it("returns [] when there are no unpaid past-due orders", () => {
    expect(formatUnpaidAlert({ reason: "morning", unpaidOverdue: [], generatedAt: baseInput.generatedAt })).toEqual([]);
  });

  it("renders header, amount, days-late, and contact", () => {
    const out = formatUnpaidAlert({
      reason: "morning",
      unpaidOverdue: [unpaidCard()],
      generatedAt: baseInput.generatedAt,
    });
    const body = out.join("\n");
    expect(body).toContain("🚨 OVERDUE — Unpaid &amp; Past Due");
    expect(body).toContain("<b>0525-007</b> — Andi · Rp 150.000");
    expect(body).toContain("2 days late");
    expect(body).toContain("📞 0812-3456-7890");
  });

  it("falls back to customerPhone, then a no-contact marker", () => {
    const withPhone = formatUnpaidAlert({
      reason: "morning",
      unpaidOverdue: [card({ orderNumber: "0525-008", status: "AwaitingPayment", finalTotal: 80000, dueDate: Date.parse("2026-05-26T01:00:00Z"), contactWa: undefined, customerPhone: "0813-1111-2222" })],
      generatedAt: baseInput.generatedAt,
    });
    expect(withPhone.join("\n")).toContain("📞 0813-1111-2222");

    const noContact = formatUnpaidAlert({
      reason: "morning",
      unpaidOverdue: [card({ orderNumber: "0525-009", status: "AwaitingPayment", finalTotal: 90000, dueDate: Date.parse("2026-05-26T01:00:00Z"), contactWa: undefined, customerPhone: undefined })],
      generatedAt: baseInput.generatedAt,
    });
    expect(noContact.join("\n")).toContain("(no contact — check order)");
  });

  it("uses totalAmount when finalTotal is absent", () => {
    const out = formatUnpaidAlert({
      reason: "morning",
      unpaidOverdue: [card({ orderNumber: "0525-010", status: "AwaitingPayment", finalTotal: undefined, totalAmount: 42000, dueDate: Date.parse("2026-05-26T01:00:00Z") })],
      generatedAt: baseInput.generatedAt,
    });
    expect(out.join("\n")).toContain("Rp 42.000");
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm run test -- packListFormat`
Expected: FAIL — `formatUnpaidAlert` is not exported; `FormatInput` has no `overdue`/`dueToday`.

- [ ] **Step 4: Rewrite the formatter**

Replace the entire `convex/telegram/packListFormat.ts` with:

```ts
import { escapeHtml } from "../lib/telegramHtml";
import { WIB_OFFSET_MS } from "../lib/periodRange";
import { daysLate } from "./queries/dueClassification";
import type { KanbanOrderCard } from "../orders/helpers/kanbanBuilders";

export type FormatReason = "morning" | "midday" | "command";

export interface FormatInput {
  reason: FormatReason;
  overdue: KanbanOrderCard[];   // paid, dueDate's WIB day < today
  dueToday: KanbanOrderCard[];  // paid, dueDate within today's WIB day
  counts: { total: number; delivery: number; pickup: number };
  generatedAt: number;          // UTC ms — the instant buckets were computed against
}

export interface UnpaidAlertInput {
  reason: FormatReason;
  unpaidOverdue: KanbanOrderCard[];
  generatedAt: number;
}

const CHUNK_BUDGET = 4000;   // safety margin under Telegram's 4096-char hard limit
// A single rendered block must fit under CHUNK_BUDGET - continuation_header so that
// starting a new chunk for it can't blow past 4096. 3800 leaves headroom.
const MAX_ORDER_LEN = 3800;
const TRUNCATE_MARKER = "\n  …[truncated — check order in app]";
const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function wibParts(utcMs: number) {
  const d = new Date(utcMs + WIB_OFFSET_MS);
  return {
    weekday: WEEKDAY[d.getUTCDay()],
    day: d.getUTCDate(),
    month: MONTHS[d.getUTCMonth()],
    year: d.getUTCFullYear(),
    hh: String(d.getUTCHours()).padStart(2, "0"),
    mm: String(d.getUTCMinutes()).padStart(2, "0"),
  };
}

function formatDueDate(utcMs: number): string {
  const p = wibParts(utcMs);
  return `${p.weekday} ${p.day} ${p.month}`;
}

function formatDaysLate(n: number): string {
  return `${n} ${n === 1 ? "day" : "days"} late`;
}

// Indonesian thousands separator is ".", e.g. 150000 → "Rp 150.000". Precise (not
// abbreviated like salesSummary) because this is an actionable amount-owed for chasing.
function formatIdr(n: number): string {
  return "Rp " + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function buildHeader(
  reason: FormatReason,
  generatedAt: number,
  counts: FormatInput["counts"],
  overdueCount: number,
  isEmpty: boolean,
): string {
  const p = wibParts(generatedAt);
  const dateStr = `${p.weekday} ${p.day} ${p.month} ${p.year}`;
  let title: string;
  if (reason === "morning") {
    title = `<b>Pack List — ${dateStr}</b>`;
  } else if (reason === "midday") {
    title = `<b>Still Pending — ${dateStr} · ${p.hh}:${p.mm}</b>`;
  } else {
    title = `<b>Pack List (on-demand) — ${dateStr} · ${p.hh}:${p.mm}</b>`;
  }
  if (isEmpty) {
    return `${title}\n\nNothing to pack today. ✅`;
  }
  const label = reason === "midday" ? "orders not yet shipped" : "orders to pack today";
  const overdueSeg = overdueCount > 0 ? ` · ${overdueCount} overdue` : "";
  return `${title}\n\n${counts.total} ${label}${overdueSeg} · ${counts.delivery} delivery · ${counts.pickup} pickup`;
}

function truncate(rendered: string): string {
  if (rendered.length > MAX_ORDER_LEN) {
    return rendered.slice(0, MAX_ORDER_LEN - TRUNCATE_MARKER.length) + TRUNCATE_MARKER;
  }
  return rendered;
}

// Render one packing order. When `nowForDueLine` is provided (overdue orders), append
// a "due {date} · N days late" line; pass null for due-today orders.
function renderOrder(card: KanbanOrderCard, nowForDueLine: number | null): string {
  const lines: string[] = [];
  const rush = card.expedited ? "  [rush]" : "";
  lines.push(`<b>${escapeHtml(card.orderNumber)}</b> — ${escapeHtml(card.customerName)}${rush}`);
  for (const it of card.items) {
    lines.push(`  ${it.quantity}× ${escapeHtml(it.productName)}`);
  }
  if (card.deliveryType === "Delivery") {
    const addr = card.deliveryAddress && card.deliveryAddress.trim().length > 0
      ? escapeHtml(card.deliveryAddress)
      : "(no address — check order)";
    lines.push(`  Delivery → ${addr}`);
  } else if (card.deliveryType === "Pickup") {
    lines.push(`  Pickup`);
  } else if (card.deliveryType) {
    lines.push(`  ${escapeHtml(card.deliveryType)}`);
  }
  if (card.notes && card.notes.trim().length > 0) {
    lines.push(`  📝 ${escapeHtml(card.notes)}`);
  }
  if (nowForDueLine !== null && card.dueDate !== undefined) {
    lines.push(`  due ${formatDueDate(card.dueDate)} · ${formatDaysLate(daysLate(card.dueDate, nowForDueLine))}`);
  }
  return truncate(lines.join("\n"));
}

function renderUnpaidOrder(card: KanbanOrderCard, now: number): string {
  const amount = card.finalTotal ?? card.totalAmount;
  const lines: string[] = [];
  lines.push(`<b>${escapeHtml(card.orderNumber)}</b> — ${escapeHtml(card.customerName)} · ${formatIdr(amount)}`);
  if (card.dueDate !== undefined) {
    lines.push(`  due ${formatDueDate(card.dueDate)} · ${formatDaysLate(daysLate(card.dueDate, now))}`);
  }
  const wa = card.contactWa && card.contactWa.trim().length > 0 ? card.contactWa.trim() : undefined;
  const phone = card.customerPhone && card.customerPhone.trim().length > 0 ? card.customerPhone.trim() : undefined;
  const contact = wa ?? phone;
  lines.push(`  📞 ${contact ? escapeHtml(contact) : "(no contact — check order)"}`);
  return truncate(lines.join("\n"));
}

// Pack a header + ordered blocks into <=4096-char chunks, preserving block boundaries.
function chunkBlocks(header: string, blocks: string[]): string[] {
  const chunks: string[] = [];
  let current = header;
  for (const block of blocks) {
    const addition = `\n\n${block}`;
    if (current.length + addition.length > CHUNK_BUDGET) {
      chunks.push(current);
      current = `<i>…continued (${chunks.length + 1})</i>\n\n${block}`;
    } else {
      current += addition;
    }
  }
  chunks.push(current);
  return chunks;
}

export function formatPackList(input: FormatInput): string[] {
  const isEmpty = input.overdue.length + input.dueToday.length === 0;
  const header = buildHeader(input.reason, input.generatedAt, input.counts, input.overdue.length, isEmpty);
  if (isEmpty) {
    return [header];
  }

  const blocks: string[] = [];
  if (input.overdue.length > 0) {
    // Sectioned: OVERDUE first (with days-late lines), then Due Today.
    blocks.push(`<b>⚠️ OVERDUE (${input.overdue.length})</b>`);
    for (const c of input.overdue) blocks.push(renderOrder(c, input.generatedAt));
    blocks.push(`<b>Due Today (${input.dueToday.length})</b>`);
    for (const c of input.dueToday) blocks.push(renderOrder(c, null));
  } else {
    // Nothing overdue → flat list, byte-identical to the pre-SEED-001 output.
    for (const c of input.dueToday) blocks.push(renderOrder(c, null));
  }
  return chunkBlocks(header, blocks);
}

export function formatUnpaidAlert(input: UnpaidAlertInput): string[] {
  if (input.unpaidOverdue.length === 0) return [];
  const p = wibParts(input.generatedAt);
  const dateStr = `${p.weekday} ${p.day} ${p.month} ${p.year}`;
  const n = input.unpaidOverdue.length;
  const header =
    `<b>🚨 OVERDUE — ${escapeHtml("Unpaid & Past Due")} — ${dateStr}</b>\n\n` +
    `${n} ${n === 1 ? "order" : "orders"} past their delivery date with no payment — chase now.`;
  const blocks = input.unpaidOverdue.map((c) => renderUnpaidOrder(c, input.generatedAt));
  return chunkBlocks(header, blocks);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test -- packListFormat`
Expected: PASS (migrated + new section/alert tests).

- [ ] **Step 6: Commit**

```bash
git add convex/telegram/packListFormat.ts convex/telegram/__tests__/packListFormat.test.ts
git commit -m "feat(telegram): render OVERDUE section + unpaid past-due alert formatter"
```

---

### Task 4: Wire the buckets + alert into sendPackList

**Files:**
- Modify: `convex/telegram/sendPackList.ts:35-77` (the `sendPackList` handler body)

- [ ] **Step 1: Update the imports and handler**

In `convex/telegram/sendPackList.ts`, change the formatter import (line 5) to include the alert:

```ts
import { formatPackList, formatUnpaidAlert } from "./packListFormat";
```

Replace the block from `const data = await ctx.runQuery(...)` through the `return` (lines 35–76) with:

```ts
    const data = await ctx.runQuery(
      internal.telegram.queries.packListQuery.getOrdersForPackList,
      {},
    );
    // Use the SAME instant the query bucketed against — avoids a Date.now() drift
    // where an order buckets as overdue but renders "0 days late" near WIB midnight.
    const packChunks = formatPackList({
      reason: args.reason,
      overdue: data.overdue,
      dueToday: data.dueToday,
      counts: {
        total: data.totalCount,
        delivery: data.deliveryCount,
        pickup: data.pickupCount,
      },
      generatedAt: data.generatedAt,
    });
    // Unpaid past-due alert is a SEPARATE message (own header) — empty array sends nothing.
    const alertChunks = formatUnpaidAlert({
      reason: args.reason,
      unpaidOverdue: data.unpaidOverdue,
      generatedAt: data.generatedAt,
    });
    const chunks = [...packChunks, ...alertChunks];

    // Sequential send to preserve order — chunks reference each other ("continued (2)" etc).
    // I2 (triple-review): if chunk N+1 fails after chunk N already sent, staff
    // see a truncated message and /pack retry is dedupe-blocked. Send a best-effort
    // breadcrumb so staff know to re-run /pack later.
    let sentCount = 0;
    try {
      for (const chunk of chunks) {
        await sendTelegramHtml(token, chatId, chunk);
        sentCount++;
      }
    } catch (err) {
      if (sentCount > 0) {
        try {
          await sendTelegramHtml(
            token,
            chatId,
            `<i>⚠️ Pack list send failed after ${sentCount}/${chunks.length} chunks. Check Convex logs.</i>`,
          );
        } catch {
          // best-effort — primary throw is what matters
        }
      }
      throw err;
    }

    return { chunkCount: chunks.length, orderCount: data.totalCount };
```

- [ ] **Step 2: Verify type-check passes**

Run: `npm run type-check`
Expected: PASS (no errors). The `internalAction` return type `{ chunkCount; orderCount }` is unchanged.

- [ ] **Step 3: Commit**

```bash
git add convex/telegram/sendPackList.ts
git commit -m "feat(telegram): send overdue-sectioned pack list + unpaid alert message"
```

---

### Task 5: Full verification + docs

**Files:**
- Modify: `docs/CHANGELOG.md`

- [ ] **Step 1: Run the FULL test suite**

Run: `npm run test`
Expected: PASS — all suites (a filtered subset masked a fixture-path break last session; run the whole thing).

- [ ] **Step 2: Run the build gate**

Run: `npm run build`
Expected: tsc + vite build succeed, no bundle-cap violation (no new deps added).

- [ ] **Step 3: Update CHANGELOG**

Add an entry to `docs/CHANGELOG.md` under the current unreleased/dated section:

```markdown
### Added
- **Pack-list overdue flagging (SEED-001):** the daily Telegram pack list now separates
  genuinely-overdue paid orders into a dedicated `⚠️ OVERDUE` section with a days-late
  count, and sends a separate `🚨 OVERDUE — Unpaid & Past Due` alert for `AwaitingPayment`
  orders past their delivery date. Overdue is defined as the dueDate's WIB calendar day
  being strictly before today's — the same rule the kanban board uses. Backend/report-only;
  no schema or index changes.
```

- [ ] **Step 4: Commit docs**

```bash
git add docs/CHANGELOG.md
git commit -m "docs: changelog for pack-list overdue flagging (SEED-001)"
```

- [ ] **Step 5: Push and open PR**

```bash
git push origin feature/packlist-overdue-flagging
gh pr create --title "feat(telegram): pack-list overdue flagging + unpaid past-due alert (SEED-001)" --body "Implements SEED-001. See docs/superpowers/specs/2026-05-30-telegram-packlist-overdue-flagging-design.md"
```

---

## Notes for the executor

- **No schema/index changes.** All three scans reuse the existing `by_status_due_date` index.
- **Single source of truth for "overdue":** `classifyDue` in `dueClassification.ts`. Do not
  re-derive the threshold elsewhere; the formatter only computes `daysLate` (same module).
- **`generatedAt` discipline:** the query returns the `now` it used; `sendPackList` passes
  it to both formatters. Never call `Date.now()` in the formatter.
- **Backward compatibility:** when `overdue` is empty the pack-list output is byte-identical
  to the pre-SEED-001 message (no section headers, no overdue header segment).
- **No order-surface dual-wiring:** this is backend + report formatting only. `OrderSlideOver`
  and `OrderDetail` are untouched (Pitfall #20 does not apply).
- After merge, this feeds `/triple-review` then `/simplify` per the agreed workflow.
```