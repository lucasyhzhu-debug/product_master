# Telegram Morning Packing Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Telegram bot that posts the day's pack list (orders due today + overdue, statuses `PaymentReceived` and `BeingPrepared`) to a dedicated Telegram group at 07:00 WIB, with a 13:00 WIB "still pending" follow-up and an on-demand `/pack` command.

**Architecture:** Three callers (morning cron, midday cron, `/pack` webhook command) share a single internal Convex action that runs one query (consuming the existing `KanbanOrderCard` shape) and pipes it through a single pure formatter. Webhook plumbing follows the existing QRIS/GrabFood patterns in `convex/integrations/`. No frontend changes.

**Tech Stack:** Convex 1.x (actions, internal queries, httpActions, cronJobs), TypeScript 5.x, Vitest + convex-test for tests, Telegram Bot API (HTTP, no SDK).

**Branch:** `feature/telegram-pack-list-bot` (per CLAUDE.md branch-per-phase rule).

**Spec:** `docs/superpowers/specs/2026-05-26-telegram-morning-packing-report-design.md`

**Reference docs:**
- `docs/telegram/telegram-bot-integration.md` — portable setup pattern
- `docs/telegram/RUNBOOK-telegram.md` — diagnostic recipes

---

## File Structure

**New files:**
- `convex/lib/telegramHtml.ts` — pure HTML escape + send helper
- `convex/telegram/packListFormat.ts` — pure formatter `KanbanOrderCard[] → string[]`
- `convex/telegram/queries/packListQuery.ts` — internal query, reuses `buildKanbanCard`
- `convex/telegram/sendPackList.ts` — internal action (cron + command entry point)
- `convex/telegram/webhook.ts` — httpAction handler for `/pack` text command
- `convex/lib/__tests__/telegramHtml.test.ts`
- `convex/telegram/__tests__/packListFormat.test.ts`
- `convex/telegram/__tests__/packListQuery.test.ts`
- `convex/telegram/__tests__/webhookHandler.test.ts`

**Modified files:**
- `convex/schema.ts` — add `telegramUpdates` table
- `convex/crons.ts` — add 2 daily cron entries
- `convex/http.ts` — wire `POST /telegram-webhook` route
- `docs/CHANGELOG.md` — record the feature

---

## Task 0: Branch setup

**Files:** none

- [ ] **Step 0.1: Branch from main**

```bash
git switch main
git pull
git switch -c feature/telegram-pack-list-bot
git branch --show-current
```

Expected: `feature/telegram-pack-list-bot`

- [ ] **Step 0.2: Confirm baseline build is green**

```bash
npm run build
```

Expected: `tsc -b && vite build` succeeds with no errors. If it fails, stop and fix `main` first — do not layer this phase onto a broken baseline.

---

## Task 1: Schema — add `telegramUpdates` table

**Files:**
- Modify: `convex/schema.ts` (add a new table before the closing `})` of `defineSchema`)

- [ ] **Step 1.1: Add the table definition**

Add this block to `convex/schema.ts` inside the `defineSchema({ ... })` object, alphabetically positioned (after `tags` or before `users` works). Keep adjacent to other small auxiliary tables.

```ts
// Phase 85: Telegram /pack command idempotency dedupe.
// Telegram retries on non-200 responses for ~24h. We insert by update_id
// and treat duplicate inserts as no-ops, so a retry never re-fires sendPackList.
telegramUpdates: defineTable({
  updateId: v.number(),       // Telegram update.update_id
  receivedAt: v.number(),     // Date.now() when we received it
})
  .index("by_update_id", ["updateId"]),
```

- [ ] **Step 1.2: Verify typegen + build**

```bash
npx convex codegen
npm run type-check
```

Expected: codegen completes, `tsc` reports 0 errors.

- [ ] **Step 1.3: Commit**

```bash
git add convex/schema.ts convex/_generated/
git commit -m "feat(telegram): add telegramUpdates table for webhook idempotency"
```

---

## Task 2: Pure HTML helper + tests

**Files:**
- Create: `convex/lib/telegramHtml.ts`
- Create: `convex/lib/__tests__/telegramHtml.test.ts`

- [ ] **Step 2.1: Write the failing test file**

`convex/lib/__tests__/telegramHtml.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { escapeHtml } from "../telegramHtml";

describe("escapeHtml", () => {
  it("escapes & < > only — quotes and apostrophes are untouched", () => {
    expect(escapeHtml(`Tom & Jerry <b>boss</b> "ok" 'fine'`))
      .toBe(`Tom &amp; Jerry &lt;b&gt;boss&lt;/b&gt; "ok" 'fine'`);
  });

  it("returns the input unchanged when no escapable chars", () => {
    expect(escapeHtml("plain text 123")).toBe("plain text 123");
  });

  it("escapes & before < and > so we don't double-encode entities", () => {
    expect(escapeHtml("&lt;")).toBe("&amp;lt;");
  });

  it("handles empty string", () => {
    expect(escapeHtml("")).toBe("");
  });
});
```

- [ ] **Step 2.2: Run test, expect failure**

```bash
npx vitest run convex/lib/__tests__/telegramHtml.test.ts
```

Expected: all 4 tests fail with `Cannot find module '../telegramHtml'`.

- [ ] **Step 2.3: Create the helper module**

`convex/lib/telegramHtml.ts`:

```ts
/**
 * HTML escape for Telegram messages (parse_mode: "HTML").
 *
 * Telegram's HTML parser only treats &, <, > as special — quotes do NOT need
 * escaping inside text content (per https://core.telegram.org/bots/api#html-style).
 * Order matters: & must be escaped FIRST or we'd double-encode "&lt;" → "&amp;lt;".
 * That double-encode IS the intended behaviour here — if a user types literal "&lt;"
 * we want it to render as the text "&lt;", not as "<".
 */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, (ch) =>
    ch === "&" ? "&amp;" : ch === "<" ? "&lt;" : "&gt;"
  );
}

/**
 * Send a single HTML-formatted message to the configured Telegram chat.
 * Throws on non-2xx or `{ok: false}` — let Convex log the failure (cron will
 * show up as failed in the dashboard; webhook will return 500 to Telegram and
 * be retried).
 */
export async function sendTelegramHtml(
  token: string,
  chatId: string,
  html: string,
): Promise<{ message_id: number }> {
  const response = await fetch(
    `https://api.telegram.org/bot${token}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: html,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    },
  );
  const json = (await response.json()) as { ok: boolean; result?: { message_id: number }; description?: string };
  if (!response.ok || !json.ok || !json.result) {
    throw new Error(
      `Telegram sendMessage failed: ${response.status} ${JSON.stringify(json)}`,
    );
  }
  return { message_id: json.result.message_id };
}
```

- [ ] **Step 2.4: Run tests, expect pass**

```bash
npx vitest run convex/lib/__tests__/telegramHtml.test.ts
```

Expected: 4/4 pass.

- [ ] **Step 2.5: Commit**

```bash
git add convex/lib/telegramHtml.ts convex/lib/__tests__/telegramHtml.test.ts
git commit -m "feat(telegram): add escapeHtml + sendTelegramHtml helpers"
```

---

## Task 3: Pure formatter — `packListFormat.ts`

This task has the most tests because the formatter is the heart of the feature and must remain correct as orders shape evolves.

**Files:**
- Create: `convex/telegram/packListFormat.ts`
- Create: `convex/telegram/__tests__/packListFormat.test.ts`

- [ ] **Step 3.1: Write the failing test file**

`convex/telegram/__tests__/packListFormat.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { formatPackList, type FormatInput } from "../packListFormat";
import type { KanbanOrderCard } from "../../orders/helpers/kanbanBuilders";

// Helper: build a minimal valid KanbanOrderCard for fixtures.
function card(over: Partial<KanbanOrderCard> = {}): KanbanOrderCard {
  return {
    _id: ("ord_" + Math.random()) as unknown as KanbanOrderCard["_id"],
    _creationTime: 1_700_000_000_000,
    orderNumber: "0526-001",
    status: "PaymentReceived",
    customerName: "Test Customer",
    customerPhone: undefined,
    contactWa: undefined,
    dueDate: 1_700_000_000_000,
    completedAt: undefined,
    deliveryType: "Delivery",
    deliveryAddress: "Jl. Test 1",
    totalAmount: 0, totalCost: 0, totalMargin: 0, finalTotal: 0,
    orderLevelDiscount: undefined, orderLevelDiscountType: undefined,
    voucherDiscountValue: undefined, expedited: undefined,
    creatorName: "tester",
    notes: undefined, createdByUserId: undefined,
    items: [{
      _id: ("itm_a" as unknown) as KanbanOrderCard["items"][number]["_id"],
      productName: "Jumbo",
      productVariant: undefined,
      quantity: 1,
      lineTotal: 0,
    }],
    ...over,
  };
}

const baseInput: FormatInput = {
  reason: "morning",
  cards: [],
  counts: { total: 0, delivery: 0, pickup: 0 },
  generatedAt: Date.parse("2026-05-27T00:00:00Z"), // 07:00 WIB
};

describe("formatPackList — empty day", () => {
  it("returns ONE chunk with the empty-day message", () => {
    const out = formatPackList(baseInput);
    expect(out).toHaveLength(1);
    expect(out[0]).toContain("Nothing to pack today");
    expect(out[0]).toContain("Pack List —"); // header still present
  });
});

describe("formatPackList — header per reason", () => {
  it("morning header uses date-only format", () => {
    const out = formatPackList({ ...baseInput, cards: [card()], counts: { total: 1, delivery: 1, pickup: 0 } });
    expect(out[0]).toMatch(/^<b>Pack List — \w+ \d{1,2} \w+ \d{4}<\/b>/);
  });

  it("midday header uses Still Pending + 24h time", () => {
    const out = formatPackList({
      ...baseInput,
      reason: "midday",
      generatedAt: Date.parse("2026-05-27T06:00:00Z"), // 13:00 WIB
      cards: [card()],
      counts: { total: 1, delivery: 1, pickup: 0 },
    });
    expect(out[0]).toContain("Still Pending");
    expect(out[0]).toContain("13:00");
  });

  it("command header uses on-demand + 24h time", () => {
    const out = formatPackList({
      ...baseInput,
      reason: "command",
      generatedAt: Date.parse("2026-05-27T07:35:00Z"), // 14:35 WIB
      cards: [card()],
      counts: { total: 1, delivery: 1, pickup: 0 },
    });
    expect(out[0]).toContain("on-demand");
    expect(out[0]).toContain("14:35");
  });
});

describe("formatPackList — counts line", () => {
  it("shows total/delivery/pickup split", () => {
    const out = formatPackList({
      ...baseInput,
      cards: [card(), card({ deliveryType: "Pickup", pickupLocation: "Office" } as Partial<KanbanOrderCard>)],
      counts: { total: 2, delivery: 1, pickup: 1 },
    });
    expect(out[0]).toContain("2 orders");
    expect(out[0]).toContain("1 delivery");
    expect(out[0]).toContain("1 pickup");
  });
});

describe("formatPackList — order rendering", () => {
  it("renders order number, customer, items, delivery + address", () => {
    const out = formatPackList({
      ...baseInput,
      cards: [card({
        orderNumber: "0526-003",
        customerName: "Sarah K.",
        deliveryType: "Delivery",
        deliveryAddress: "Jl. Kemang Raya 12",
        items: [
          { _id: "a" as never, productName: "Jumbo", productVariant: undefined, quantity: 2, lineTotal: 0 },
          { _id: "b" as never, productName: "Bite Triple", productVariant: undefined, quantity: 1, lineTotal: 0 },
        ],
      })],
      counts: { total: 1, delivery: 1, pickup: 0 },
    });
    const body = out.join("\n");
    expect(body).toContain("<b>0526-003</b>");
    expect(body).toContain("Sarah K.");
    expect(body).toContain("2× Jumbo");
    expect(body).toContain("1× Bite Triple");
    expect(body).toContain("Delivery → Jl. Kemang Raya 12");
  });

  it("renders [rush] badge for expedited orders", () => {
    const out = formatPackList({
      ...baseInput,
      cards: [card({ expedited: true })],
      counts: { total: 1, delivery: 1, pickup: 0 },
    });
    expect(out.join("\n")).toContain("[rush]");
  });

  it("omits address line for Pickup orders (no address)", () => {
    const out = formatPackList({
      ...baseInput,
      cards: [card({ deliveryType: "Pickup", deliveryAddress: undefined })],
      counts: { total: 1, delivery: 0, pickup: 1 },
    });
    expect(out.join("\n")).toContain("Pickup");
    expect(out.join("\n")).not.toContain("→ undefined");
  });

  it("renders notes line with 📝 prefix when notes present", () => {
    const out = formatPackList({
      ...baseInput,
      cards: [card({ notes: "leave at lobby" })],
      counts: { total: 1, delivery: 1, pickup: 0 },
    });
    expect(out.join("\n")).toContain("📝 leave at lobby");
  });

  it("omits notes line when notes absent or empty string", () => {
    const out = formatPackList({
      ...baseInput,
      cards: [card({ notes: "" })],
      counts: { total: 1, delivery: 1, pickup: 0 },
    });
    expect(out.join("\n")).not.toContain("📝");
  });
});

describe("formatPackList — HTML escape", () => {
  it("escapes < > & in customer name, address, notes, item names", () => {
    const out = formatPackList({
      ...baseInput,
      cards: [card({
        customerName: "Tom & Jerry <boss>",
        deliveryAddress: "Jl. <Kemang> & Raya",
        notes: "if &lt; please <ring>",
        items: [{ _id: "x" as never, productName: "A&B <combo>", productVariant: undefined, quantity: 1, lineTotal: 0 }],
      })],
      counts: { total: 1, delivery: 1, pickup: 0 },
    });
    const body = out.join("\n");
    expect(body).toContain("Tom &amp; Jerry &lt;boss&gt;");
    expect(body).toContain("Jl. &lt;Kemang&gt; &amp; Raya");
    expect(body).toContain("A&amp;B &lt;combo&gt;");
    // Notes are escaped too — the literal "&lt;" the user typed becomes "&amp;lt;"
    expect(body).toContain("&amp;lt;");
    expect(body).toContain("&lt;ring&gt;");
  });
});

describe("formatPackList — chunking for 4096 char limit", () => {
  it("splits into multiple chunks when output would exceed 4000 chars", () => {
    // Build 40 orders with ~200 chars each → ~8000 chars total
    const many = Array.from({ length: 40 }, (_, i) =>
      card({
        orderNumber: `0526-${String(i + 1).padStart(3, "0")}`,
        customerName: `Customer ${i + 1} with a reasonably long name`,
        deliveryAddress: `Jl. Address ${i + 1}, with neighbourhood and city detail to take space`,
        items: [
          { _id: ("a" + i) as never, productName: "Jumbo", productVariant: undefined, quantity: 2, lineTotal: 0 },
          { _id: ("b" + i) as never, productName: "Bite Triple", productVariant: undefined, quantity: 1, lineTotal: 0 },
        ],
      })
    );
    const out = formatPackList({
      ...baseInput,
      cards: many,
      counts: { total: 40, delivery: 40, pickup: 0 },
    });
    expect(out.length).toBeGreaterThan(1);
    for (const chunk of out) {
      expect(chunk.length).toBeLessThanOrEqual(4096);
    }
    // The first chunk has the main header; subsequent chunks have a "continued" marker
    expect(out[0]).toContain("Pack List —");
    expect(out[1]).toContain("continued");
  });

  it("never splits a single order across two chunks", () => {
    const many = Array.from({ length: 40 }, (_, i) =>
      card({ orderNumber: `0526-${String(i + 1).padStart(3, "0")}` })
    );
    const out = formatPackList({
      ...baseInput,
      cards: many,
      counts: { total: 40, delivery: 40, pickup: 0 },
    });
    // Each order's opening line "<b>0526-XXX</b>" must appear exactly once across all chunks.
    const all = out.join("\n");
    for (let i = 1; i <= 40; i++) {
      const marker = `<b>0526-${String(i).padStart(3, "0")}</b>`;
      const count = all.split(marker).length - 1;
      expect(count).toBe(1);
    }
  });
});
```

- [ ] **Step 3.2: Run tests, expect all to fail**

```bash
npx vitest run convex/telegram/__tests__/packListFormat.test.ts
```

Expected: all fail with `Cannot find module '../packListFormat'`.

- [ ] **Step 3.3: Implement the formatter**

`convex/telegram/packListFormat.ts`:

```ts
import { escapeHtml } from "../lib/telegramHtml";
import { WIB_OFFSET_MS } from "../lib/periodRange";
import type { KanbanOrderCard } from "../orders/helpers/kanbanBuilders";

export type FormatReason = "morning" | "midday" | "command";

export interface FormatInput {
  reason: FormatReason;
  cards: KanbanOrderCard[];
  counts: { total: number; delivery: number; pickup: number };
  generatedAt: number;       // UTC ms
}

const CHUNK_BUDGET = 4000;   // safety margin under Telegram's 4096-char hard limit
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

function buildHeader(reason: FormatReason, generatedAt: number, counts: FormatInput["counts"]): string {
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
  if (counts.total === 0) {
    return `${title}\n\nNothing to pack today. ✅`;
  }
  const label = reason === "midday" ? "orders not yet shipped" : "orders to pack today";
  return `${title}\n\n${counts.total} ${label} · ${counts.delivery} delivery · ${counts.pickup} pickup`;
}

function renderOrder(card: KanbanOrderCard): string {
  const lines: string[] = [];
  const rush = card.expedited ? "  [rush]" : "";
  lines.push(`<b>${escapeHtml(card.orderNumber)}</b> — ${escapeHtml(card.customerName)}${rush}`);
  for (const it of card.items) {
    lines.push(`  ${it.quantity}× ${escapeHtml(it.productName)}`);
  }
  if (card.deliveryType === "Delivery" && card.deliveryAddress) {
    lines.push(`  Delivery → ${escapeHtml(card.deliveryAddress)}`);
  } else if (card.deliveryType === "Pickup") {
    lines.push(`  Pickup`);
  } else if (card.deliveryType) {
    // Future-proofing: unknown delivery type, render as-is
    lines.push(`  ${escapeHtml(card.deliveryType)}`);
  }
  if (card.notes && card.notes.trim().length > 0) {
    lines.push(`  📝 ${escapeHtml(card.notes)}`);
  }
  return lines.join("\n");
}

export function formatPackList(input: FormatInput): string[] {
  const header = buildHeader(input.reason, input.generatedAt, input.counts);
  if (input.cards.length === 0) {
    return [header];
  }

  // Sort: expedited first, then dueDate ascending (undefined → Infinity).
  // Caller is expected to have applied this already, but we apply defensively.
  const sorted = [...input.cards].sort((a, b) => {
    const ea = a.expedited ? 0 : 1;
    const eb = b.expedited ? 0 : 1;
    if (ea !== eb) return ea - eb;
    return (a.dueDate ?? Infinity) - (b.dueDate ?? Infinity);
  });

  const chunks: string[] = [];
  let current = header;
  for (const c of sorted) {
    const rendered = renderOrder(c);
    const addition = `\n\n${rendered}`;
    if (current.length + addition.length > CHUNK_BUDGET) {
      chunks.push(current);
      current = `<i>…continued (${chunks.length + 1})</i>\n\n${rendered}`;
    } else {
      current += addition;
    }
  }
  chunks.push(current);
  return chunks;
}
```

- [ ] **Step 3.4: Run tests, expect all pass**

```bash
npx vitest run convex/telegram/__tests__/packListFormat.test.ts
```

Expected: 11/11 pass. If chunking test fails, the `CHUNK_BUDGET` may need tuning — keep it at 4000 (test data is calibrated against this).

- [ ] **Step 3.5: Commit**

```bash
git add convex/telegram/packListFormat.ts convex/telegram/__tests__/packListFormat.test.ts
git commit -m "feat(telegram): add pure pack-list formatter with chunking + HTML escape"
```

---

## Task 4: Internal query — `packListQuery.ts`

**Files:**
- Create: `convex/telegram/queries/packListQuery.ts`
- Create: `convex/telegram/__tests__/packListQuery.test.ts`

- [ ] **Step 4.1: Write failing convex-test integration tests**

`convex/telegram/__tests__/packListQuery.test.ts`:

```ts
/**
 * Integration tests for the morning/midday/command pack list query.
 * Uses convex-test against the real schema — verifies index filters, sort order,
 * and the WIB end-of-day boundary computation.
 *
 * Glob from absolute root (Pitfall 5 from convex-test docs): keep keys canonical.
 */
import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "../../schema";
import { internal } from "../../_generated/api";

const modules = import.meta.glob("/convex/**/*.ts");

// Construct a UTC ms for "WIB midnight of date D" — same helper convention as periodRange.test.ts.
function wibMidnight(year: number, month: number, day: number): number {
  return Date.UTC(year, month - 1, day, -7, 0, 0, 0);
}

// 2026-05-27 fixed reference day. End-of-day WIB = 2026-05-28 WIB midnight - 1ms.
const TODAY_START = wibMidnight(2026, 5, 27);
const TOMORROW_START = wibMidnight(2026, 5, 28);
const YESTERDAY_START = wibMidnight(2026, 5, 26);

async function seedOrder(
  t: ReturnType<typeof convexTest>,
  override: Partial<{
    orderNumber: string;
    status: "PaymentReceived" | "BeingPrepared" | "Draft" | "AwaitingDelivery" | "Complete";
    dueDate: number | undefined;
    expedited: boolean;
    deliveryType: "Delivery" | "Pickup";
    notes: string;
  }> = {},
) {
  return await t.run(async (ctx) => {
    const customerId = await ctx.db.insert("customers", {
      name: "Test Customer",
      phone: "0812",
    });
    const orderId = await ctx.db.insert("orders", {
      orderNumber: override.orderNumber ?? "0527-001",
      customerId,
      customerName: "Test Customer",
      status: override.status ?? "PaymentReceived",
      paymentStatus: "Paid",
      orderDate: TODAY_START,
      dueDate: "dueDate" in override ? override.dueDate : TODAY_START + 8 * 3600_000,
      totalAmount: 50000,
      totalCost: 20000,
      totalMargin: 30000,
      finalTotal: 50000,
      deliveryType: override.deliveryType ?? "Delivery",
      deliveryAddress: "Jl. Test",
      notes: override.notes,
      createdBy: "tester",
      expedited: override.expedited,
      itemCount: 1,
    });
    await ctx.db.insert("orderItems", {
      orderId,
      productName: "Jumbo",
      quantity: 2,
      unitPrice: 25000,
      unitCost: 10000,
      discountAmount: 0,
      lineTotal: 50000,
      lineCost: 20000,
      lineMargin: 30000,
    });
    return orderId;
  });
}

describe("getOrdersForPackList — status filter", () => {
  it("includes PaymentReceived + BeingPrepared", async () => {
    const t = convexTest(schema, modules);
    await seedOrder(t, { orderNumber: "0527-001", status: "PaymentReceived" });
    await seedOrder(t, { orderNumber: "0527-002", status: "BeingPrepared" });
    const result = await t.query(
      internal.telegram.queries.packListQuery.getOrdersForPackList,
      { now: TODAY_START + 12 * 3600_000 },
    );
    expect(result.totalCount).toBe(2);
    expect(result.orders.map((o) => o.orderNumber).sort()).toEqual(["0527-001", "0527-002"]);
  });

  it("excludes Draft / AwaitingDelivery / Complete", async () => {
    const t = convexTest(schema, modules);
    await seedOrder(t, { orderNumber: "0527-001", status: "PaymentReceived" });
    await seedOrder(t, { orderNumber: "0527-002", status: "Draft" });
    await seedOrder(t, { orderNumber: "0527-003", status: "AwaitingDelivery" });
    await seedOrder(t, { orderNumber: "0527-004", status: "Complete" });
    const result = await t.query(
      internal.telegram.queries.packListQuery.getOrdersForPackList,
      { now: TODAY_START + 12 * 3600_000 },
    );
    expect(result.totalCount).toBe(1);
    expect(result.orders[0].orderNumber).toBe("0527-001");
  });
});

describe("getOrdersForPackList — dueDate boundary", () => {
  it("includes overdue (dueDate < today's WIB midnight)", async () => {
    const t = convexTest(schema, modules);
    await seedOrder(t, { orderNumber: "0526-001", dueDate: YESTERDAY_START + 8 * 3600_000 });
    const result = await t.query(
      internal.telegram.queries.packListQuery.getOrdersForPackList,
      { now: TODAY_START + 12 * 3600_000 },
    );
    expect(result.totalCount).toBe(1);
  });

  it("includes due-today (dueDate within today's WIB day)", async () => {
    const t = convexTest(schema, modules);
    await seedOrder(t, { orderNumber: "0527-001", dueDate: TODAY_START + 23 * 3600_000 });
    const result = await t.query(
      internal.telegram.queries.packListQuery.getOrdersForPackList,
      { now: TODAY_START + 12 * 3600_000 },
    );
    expect(result.totalCount).toBe(1);
  });

  it("excludes future (dueDate >= tomorrow's WIB midnight)", async () => {
    const t = convexTest(schema, modules);
    await seedOrder(t, { orderNumber: "0528-001", dueDate: TOMORROW_START });
    const result = await t.query(
      internal.telegram.queries.packListQuery.getOrdersForPackList,
      { now: TODAY_START + 12 * 3600_000 },
    );
    expect(result.totalCount).toBe(0);
  });

  it("excludes orders without a dueDate", async () => {
    const t = convexTest(schema, modules);
    await seedOrder(t, { orderNumber: "0527-001", dueDate: undefined });
    const result = await t.query(
      internal.telegram.queries.packListQuery.getOrdersForPackList,
      { now: TODAY_START + 12 * 3600_000 },
    );
    expect(result.totalCount).toBe(0);
  });
});

describe("getOrdersForPackList — sort + counts", () => {
  it("expedited orders come first", async () => {
    const t = convexTest(schema, modules);
    await seedOrder(t, { orderNumber: "0527-001", expedited: false, dueDate: TODAY_START + 8 * 3600_000 });
    await seedOrder(t, { orderNumber: "0527-002", expedited: true, dueDate: TODAY_START + 20 * 3600_000 });
    const result = await t.query(
      internal.telegram.queries.packListQuery.getOrdersForPackList,
      { now: TODAY_START + 12 * 3600_000 },
    );
    expect(result.orders[0].orderNumber).toBe("0527-002");
  });

  it("counts delivery vs pickup correctly", async () => {
    const t = convexTest(schema, modules);
    await seedOrder(t, { orderNumber: "0527-001", deliveryType: "Delivery" });
    await seedOrder(t, { orderNumber: "0527-002", deliveryType: "Delivery" });
    await seedOrder(t, { orderNumber: "0527-003", deliveryType: "Pickup" });
    const result = await t.query(
      internal.telegram.queries.packListQuery.getOrdersForPackList,
      { now: TODAY_START + 12 * 3600_000 },
    );
    expect(result.totalCount).toBe(3);
    expect(result.deliveryCount).toBe(2);
    expect(result.pickupCount).toBe(1);
  });
});
```

- [ ] **Step 4.2: Run tests, expect all to fail**

```bash
npx vitest run convex/telegram/__tests__/packListQuery.test.ts
```

Expected: fail with `Cannot find module ...` for `internal.telegram.queries.packListQuery`.

- [ ] **Step 4.3: Implement the query**

`convex/telegram/queries/packListQuery.ts`:

```ts
import { v } from "convex/values";
import { internalQuery } from "../../_generated/server";
import { wibMidnightToUtc, getWibComponents } from "../../lib/periodRange";
import { buildKanbanCard, type KanbanOrderCard } from "../../orders/helpers/kanbanBuilders";
import type { QueryCtx } from "../../_generated/server";
import type { Doc } from "../../_generated/dataModel";

const ACTIVE_STATUSES = ["PaymentReceived", "BeingPrepared"] as const;

/**
 * Returns orders that need to be packed:
 *   - status ∈ {PaymentReceived, BeingPrepared}
 *   - dueDate is set
 *   - dueDate <= end of today WIB
 *
 * `now` is injectable for tests; production callers pass nothing and we use Date.now().
 */
export const getOrdersForPackList = internalQuery({
  args: { now: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now();
    const wib = getWibComponents(now);
    // End of today WIB = next WIB midnight minus 1 ms.
    const endOfTodayMs = wibMidnightToUtc(wib.year, wib.month - 1, wib.day + 1) - 1;

    // Two scans on by_status_due_date: one per active status, bounded by dueDate.
    // The withIndex upper bound on dueDate also excludes documents where
    // dueDate is undefined (Convex range queries skip undefined values).
    const orders: Doc<"orders">[] = [];
    for (const status of ACTIVE_STATUSES) {
      const slice = await ctx.db
        .query("orders")
        .withIndex("by_status_due_date", (q) =>
          q.eq("status", status).lte("dueDate", endOfTodayMs),
        )
        .collect();
      orders.push(...slice);
    }

    // Sort: expedited first, then dueDate asc, then _creationTime asc.
    orders.sort((a, b) => {
      const ea = a.expedited ? 0 : 1;
      const eb = b.expedited ? 0 : 1;
      if (ea !== eb) return ea - eb;
      const da = a.dueDate ?? Infinity;
      const db = b.dueDate ?? Infinity;
      if (da !== db) return da - db;
      return a._creationTime - b._creationTime;
    });

    // Build cards. Items fetched per order via by_order index.
    const cards: KanbanOrderCard[] = [];
    let deliveryCount = 0;
    let pickupCount = 0;
    for (const order of orders) {
      const items = await ctx.db
        .query("orderItems")
        .withIndex("by_order", (q) => q.eq("orderId", order._id))
        .collect();
      const filtered = items.filter((i) => !i.isCancelled);
      cards.push(buildKanbanCard(order, filtered, order.createdBy));
      if (order.deliveryType === "Delivery") deliveryCount++;
      else if (order.deliveryType === "Pickup") pickupCount++;
    }

    return {
      totalCount: cards.length,
      deliveryCount,
      pickupCount,
      orders: cards,
    };
  },
});
```

- [ ] **Step 4.4: Run tests, expect all to pass**

```bash
npx vitest run convex/telegram/__tests__/packListQuery.test.ts
```

Expected: 8/8 pass.

If any fail, check: (a) the `by_status_due_date` index range bound on `dueDate` — both must be inside `withIndex`, not `.filter()`; (b) `getWibComponents` returns month as 1-indexed (Jan = 1) but `wibMidnightToUtc` takes month 0-indexed (Jan = 0) — note the `-1` conversion.

- [ ] **Step 4.5: Commit**

```bash
git add convex/telegram/queries/ convex/telegram/__tests__/packListQuery.test.ts convex/_generated/
git commit -m "feat(telegram): add getOrdersForPackList internal query"
```

---

## Task 5: Action — `sendPackList.ts`

**Files:**
- Create: `convex/telegram/sendPackList.ts`

This task has no isolated unit tests — the action is a thin orchestrator (query → format → send). Its correctness is covered by Task 3 (formatter) + Task 4 (query) + the manual smoke test in Task 9.

- [ ] **Step 5.1: Implement the action**

`convex/telegram/sendPackList.ts`:

```ts
import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { sendTelegramHtml } from "../lib/telegramHtml";
import { formatPackList } from "./packListFormat";

export const sendPackList = internalAction({
  args: {
    reason: v.union(
      v.literal("morning"),
      v.literal("midday"),
      v.literal("command"),
    ),
  },
  handler: async (ctx, args) => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!token || !chatId) {
      throw new Error("Telegram env vars missing (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID)");
    }

    const data = await ctx.runQuery(
      internal.telegram.queries.packListQuery.getOrdersForPackList,
      {},
    );
    const chunks = formatPackList({
      reason: args.reason,
      cards: data.orders,
      counts: {
        total: data.totalCount,
        delivery: data.deliveryCount,
        pickup: data.pickupCount,
      },
      generatedAt: Date.now(),
    });

    // Sequential send to preserve order — chunks reference each other ("continued (2)" etc).
    for (const chunk of chunks) {
      await sendTelegramHtml(token, chatId, chunk);
    }

    return { chunkCount: chunks.length, orderCount: data.totalCount };
  },
});
```

- [ ] **Step 5.2: Run codegen + type-check**

```bash
npx convex codegen
npm run type-check
```

Expected: codegen completes, `tsc` clean.

- [ ] **Step 5.3: Commit**

```bash
git add convex/telegram/sendPackList.ts convex/_generated/
git commit -m "feat(telegram): add sendPackList internal action"
```

---

## Task 6: Register crons

**Files:**
- Modify: `convex/crons.ts`

- [ ] **Step 6.1: Add cron entries**

Update `convex/crons.ts` to:

```ts
import { cronJobs } from "convex/server";
import { api, internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "sync internal orders revenue",
  { hours: 1 },
  api.integrations.internal.adapter.syncInternalOrders,
  { triggeredBy: "cron" }
);

// Phase 79 (DA-12): Daily BigSeller re-sync at 03:00 WIB (= 20:00 UTC,
// Indonesia UTC+7, no DST). Re-fetches the trailing 7 days so same-day
// Shopee `--` rows auto-backfill once BigSeller catches up (within 24h).
// Skip-if-not-idle guard lives inside nightlySync (D-12).
crons.daily(
  "bigseller nightly 7d resync",
  { hourUTC: 20, minuteUTC: 0 },
  internal.integrations.bigseller.cron.nightlySync,
);

// Phase 85: Morning pack list at 07:00 WIB (= 00:00 UTC).
crons.daily(
  "telegram morning pack list",
  { hourUTC: 0, minuteUTC: 0 },
  internal.telegram.sendPackList.sendPackList,
  { reason: "morning" },
);

// Phase 85: Midday "still pending" reminder at 13:00 WIB (= 06:00 UTC).
crons.daily(
  "telegram midday pack list",
  { hourUTC: 6, minuteUTC: 0 },
  internal.telegram.sendPackList.sendPackList,
  { reason: "midday" },
);

export default crons;
```

- [ ] **Step 6.2: Type-check**

```bash
npm run type-check
```

Expected: clean.

- [ ] **Step 6.3: Commit**

```bash
git add convex/crons.ts
git commit -m "feat(telegram): register morning + midday pack list crons"
```

---

## Task 7: Webhook handler — `/pack` command

**Files:**
- Create: `convex/telegram/webhook.ts`
- Create: `convex/telegram/__tests__/webhookHandler.test.ts`

We follow the QRIS pattern: extract a pure-ish handler core that takes a `WebhookDeps` interface so the message-parsing + dedupe logic is unit-testable without a live Convex runtime, then wrap it in an `httpAction` for the real route. (See `convex/integrations/qris/webhooks.ts:40-50` for the same pattern; this avoids Pitfall 5 — `httpAction` cannot be invoked via `t.action(internal.*)`.)

- [ ] **Step 7.1: Write failing handler-core tests**

`convex/telegram/__tests__/webhookHandler.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { decideWebhookOutcome } from "../webhook";

const SECRET = "a".repeat(64);

function makeUpdate(over: Partial<{ update_id: number; text: string }> = {}) {
  return {
    update_id: over.update_id ?? 123,
    message: {
      message_id: 1,
      date: 1700000000,
      chat: { id: -1001234567890, type: "supergroup" },
      from: { id: 42, is_bot: false, first_name: "Test" },
      text: over.text ?? "/pack",
    },
  };
}

describe("decideWebhookOutcome — auth", () => {
  it("returns 401 when secret missing", async () => {
    const result = await decideWebhookOutcome({
      providedSecret: null,
      expectedSecret: SECRET,
      body: makeUpdate(),
      deps: { isDuplicate: async () => false, recordUpdate: async () => {}, runAction: async () => {} },
    });
    expect(result.status).toBe(401);
  });

  it("returns 401 when secret mismatches", async () => {
    const result = await decideWebhookOutcome({
      providedSecret: "wrong",
      expectedSecret: SECRET,
      body: makeUpdate(),
      deps: { isDuplicate: async () => false, recordUpdate: async () => {}, runAction: async () => {} },
    });
    expect(result.status).toBe(401);
  });

  it("returns 401 when expectedSecret env var missing", async () => {
    const result = await decideWebhookOutcome({
      providedSecret: SECRET,
      expectedSecret: undefined,
      body: makeUpdate(),
      deps: { isDuplicate: async () => false, recordUpdate: async () => {}, runAction: async () => {} },
    });
    expect(result.status).toBe(401);
  });
});

describe("decideWebhookOutcome — command parsing", () => {
  it("triggers sendPackList for /pack", async () => {
    const runAction = vi.fn().mockResolvedValue(undefined);
    const result = await decideWebhookOutcome({
      providedSecret: SECRET,
      expectedSecret: SECRET,
      body: makeUpdate({ text: "/pack" }),
      deps: { isDuplicate: async () => false, recordUpdate: async () => {}, runAction },
    });
    expect(result.status).toBe(200);
    expect(runAction).toHaveBeenCalledTimes(1);
  });

  it("triggers sendPackList for /pack@BotName (group form)", async () => {
    const runAction = vi.fn().mockResolvedValue(undefined);
    const result = await decideWebhookOutcome({
      providedSecret: SECRET,
      expectedSecret: SECRET,
      body: makeUpdate({ text: "/pack@FrolliePackBot" }),
      deps: { isDuplicate: async () => false, recordUpdate: async () => {}, runAction },
    });
    expect(result.status).toBe(200);
    expect(runAction).toHaveBeenCalledTimes(1);
  });

  it("ignores non-/pack text without scheduling action", async () => {
    const runAction = vi.fn().mockResolvedValue(undefined);
    const result = await decideWebhookOutcome({
      providedSecret: SECRET,
      expectedSecret: SECRET,
      body: makeUpdate({ text: "hello" }),
      deps: { isDuplicate: async () => false, recordUpdate: async () => {}, runAction },
    });
    expect(result.status).toBe(200);
    expect(runAction).not.toHaveBeenCalled();
  });

  it("ignores updates with no message field", async () => {
    const runAction = vi.fn().mockResolvedValue(undefined);
    const result = await decideWebhookOutcome({
      providedSecret: SECRET,
      expectedSecret: SECRET,
      body: { update_id: 5 },  // no message
      deps: { isDuplicate: async () => false, recordUpdate: async () => {}, runAction },
    });
    expect(result.status).toBe(200);
    expect(runAction).not.toHaveBeenCalled();
  });
});

describe("decideWebhookOutcome — idempotency", () => {
  it("does not re-fire when update_id is duplicate", async () => {
    const runAction = vi.fn().mockResolvedValue(undefined);
    const result = await decideWebhookOutcome({
      providedSecret: SECRET,
      expectedSecret: SECRET,
      body: makeUpdate({ text: "/pack", update_id: 999 }),
      deps: { isDuplicate: async () => true, recordUpdate: async () => {}, runAction },
    });
    expect(result.status).toBe(200);
    expect(runAction).not.toHaveBeenCalled();
  });

  it("records the update_id before scheduling the action", async () => {
    const calls: string[] = [];
    const result = await decideWebhookOutcome({
      providedSecret: SECRET,
      expectedSecret: SECRET,
      body: makeUpdate({ text: "/pack" }),
      deps: {
        isDuplicate: async () => false,
        recordUpdate: async () => { calls.push("record"); },
        runAction: async () => { calls.push("run"); },
      },
    });
    expect(result.status).toBe(200);
    expect(calls).toEqual(["record", "run"]);
  });
});
```

- [ ] **Step 7.2: Run tests, expect failure**

```bash
npx vitest run convex/telegram/__tests__/webhookHandler.test.ts
```

Expected: fail with `Cannot find module '../webhook'`.

- [ ] **Step 7.3: Implement webhook with pure core + httpAction wrapper**

`convex/telegram/webhook.ts`:

```ts
import { v } from "convex/values";
import { httpAction, internalMutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";

interface WebhookResult {
  status: number;
  body: string;
}

export interface WebhookDeps {
  isDuplicate: (updateId: number) => Promise<boolean>;
  recordUpdate: (updateId: number) => Promise<void>;
  runAction: () => Promise<void>;
}

interface TelegramUpdate {
  update_id?: number;
  message?: {
    message_id?: number;
    text?: string;
    chat?: { id?: number; type?: string };
    from?: { id?: number };
  };
}

/**
 * Constant-time string compare to avoid timing attacks on the webhook secret.
 * (Pattern from convex/integrations/qris/webhooks.ts:18-24.)
 */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

/**
 * Pure handler core — no Convex runtime dependency. Returns the HTTP status
 * and body to send back to Telegram. The real `handleTelegramWebhook` httpAction
 * wires `ctx.db` + `ctx.scheduler` into the `deps` interface.
 */
export async function decideWebhookOutcome(input: {
  providedSecret: string | null;
  expectedSecret: string | undefined;
  body: TelegramUpdate;
  deps: WebhookDeps;
}): Promise<WebhookResult> {
  // Auth — 401 before any state change.
  if (!input.expectedSecret || !input.providedSecret) {
    return { status: 401, body: "unauthorized" };
  }
  if (!constantTimeEqual(input.providedSecret, input.expectedSecret)) {
    return { status: 401, body: "unauthorized" };
  }

  // Validate envelope.
  const updateId = input.body.update_id;
  const text = input.body.message?.text;
  if (typeof updateId !== "number") return { status: 200, body: "ok" };
  if (typeof text !== "string") return { status: 200, body: "ok" };

  // Match /pack or /pack@<botname>. Telegram sends the @bot suffix in groups.
  // Trim trailing args/whitespace ("/pack now" → still match the command).
  const command = text.trim().split(/\s+/)[0];
  const isPackCommand = /^\/pack(@[A-Za-z0-9_]+)?$/.test(command);
  if (!isPackCommand) return { status: 200, body: "ok" };

  // Idempotency: skip if we already processed this update.
  if (await input.deps.isDuplicate(updateId)) {
    return { status: 200, body: "ok" };
  }

  // Record BEFORE scheduling so a re-delivery races correctly.
  await input.deps.recordUpdate(updateId);
  await input.deps.runAction();
  return { status: 200, body: "ok" };
}

// ─── Convex glue: query, mutation, httpAction ────────────────────────────────

export const checkUpdateExists = internalQuery({
  args: { updateId: v.number() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("telegramUpdates")
      .withIndex("by_update_id", (q) => q.eq("updateId", args.updateId))
      .unique();
    return row !== null;
  },
});

export const recordUpdate = internalMutation({
  args: { updateId: v.number() },
  handler: async (ctx, args) => {
    // Use the same query inside the mutation to guard against a race where
    // two concurrent webhook deliveries arrive within the same Convex tick.
    const existing = await ctx.db
      .query("telegramUpdates")
      .withIndex("by_update_id", (q) => q.eq("updateId", args.updateId))
      .unique();
    if (existing) return;
    await ctx.db.insert("telegramUpdates", {
      updateId: args.updateId,
      receivedAt: Date.now(),
    });
  },
});

export const handleTelegramWebhook = httpAction(async (ctx, request) => {
  let body: TelegramUpdate;
  try {
    body = (await request.json()) as TelegramUpdate;
  } catch {
    return new Response("bad request", { status: 400 });
  }

  const outcome = await decideWebhookOutcome({
    providedSecret: request.headers.get("X-Telegram-Bot-Api-Secret-Token"),
    expectedSecret: process.env.TELEGRAM_WEBHOOK_SECRET,
    body,
    deps: {
      isDuplicate: (updateId) =>
        ctx.runQuery(internal.telegram.webhook.checkUpdateExists, { updateId }),
      recordUpdate: (updateId) =>
        ctx.runMutation(internal.telegram.webhook.recordUpdate, { updateId }),
      runAction: async () => {
        await ctx.scheduler.runAfter(0, internal.telegram.sendPackList.sendPackList, {
          reason: "command",
        });
      },
    },
  });
  return new Response(outcome.body, { status: outcome.status });
});
```

- [ ] **Step 7.4: Run tests, expect all to pass**

```bash
npx vitest run convex/telegram/__tests__/webhookHandler.test.ts
```

Expected: 9/9 pass.

- [ ] **Step 7.5: Commit**

```bash
git add convex/telegram/webhook.ts convex/telegram/__tests__/webhookHandler.test.ts convex/_generated/
git commit -m "feat(telegram): add /pack command webhook handler with idempotency"
```

---

## Task 8: Wire HTTP route

**Files:**
- Modify: `convex/http.ts`

- [ ] **Step 8.1: Add the route**

Update `convex/http.ts`. Add the import near the existing webhook imports:

```ts
import { handleTelegramWebhook } from "./telegram/webhook";
```

Add the route at the bottom of the file, before `export default http;`:

```ts
// ─── Telegram Bot Webhook ────────────────────────────────────────────────────
// Single inbound route for the /pack text command. Token-authenticated via
// X-Telegram-Bot-Api-Secret-Token header (constant-time compare). Idempotent
// dedupe by update_id in convex/telegram/webhook.ts.

http.route({
  path: "/telegram-webhook",
  method: "POST",
  handler: handleTelegramWebhook,
});
```

- [ ] **Step 8.2: Type-check + build**

```bash
npm run type-check
npm run build
```

Expected: both clean.

- [ ] **Step 8.3: Commit**

```bash
git add convex/http.ts
git commit -m "feat(telegram): wire POST /telegram-webhook route"
```

---

## Task 9: Pre-smoke gate — collect env vars from user, configure dev bot

**This is a manual checkpoint. The implementing agent MUST stop and ask the user for tokens here — do not proceed without them.**

- [ ] **Step 9.1: Stop and prompt the user**

Post the following message to the user verbatim, then wait:

> Code is on the feature branch and `npm run build` is green. To run the dev smoke test I need:
>
> 1. **Dev bot token** — created via `@BotFather` → `/newbot` with username e.g. `FrolliePackBotDev`. The string like `8XXXXXX:AAFXXX...`.
> 2. **Dev chat id** — the id of the dev Telegram group I should post to. (Create a group, add the bot, send `@FrolliePackBotDev hello` in it; I'll guide you through fetching the id once you have a token.)
> 3. **Webhook secret** — a 64-char hex string. Run this locally and paste the output:
>    ```powershell
>    node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
>    ```
>
> Paste all three when ready. I'll do the rest (set env vars, register webhook, smoke test).

- [ ] **Step 9.2: Verify token (after user pastes it)**

Run from a shell (replace `<TOKEN>`):

```powershell
curl.exe "https://api.telegram.org/bot<TOKEN>/getMe"
```

Expected: `{"ok":true,"result":{"id":...,"is_bot":true,"first_name":"...","username":"FrolliePackBotDev"}}`.

If `Unauthorized` → token is wrong, ask user to re-check BotFather.

- [ ] **Step 9.3: Discover chat id**

Ask user to send `@<botUsername> hello` in the dev group (using Telegram autocomplete so it's a real mention — bot privacy mode is ON by default).

Then run:

```powershell
curl.exe "https://api.telegram.org/bot<TOKEN>/getUpdates?allowed_updates=%5B%22message%22%2C%22callback_query%22%5D&timeout=10"
```

In the response, find the most recent `message.chat.id`. Note the `type` — if `supergroup`, the id starts with `-100`. Copy verbatim.

If `result` is empty: see RUNBOOK §allowed_updates trap. The `allowed_updates` query param is critical.

- [ ] **Step 9.4: Set dev env vars**

```powershell
npx convex env set TELEGRAM_BOT_TOKEN "<TOKEN>"
# Note the `--` separator — required because chat id starts with a minus
npx convex env set TELEGRAM_CHAT_ID -- <CHAT_ID>
npx convex env set TELEGRAM_WEBHOOK_SECRET "<SECRET>"
npx convex env list
```

Expected: all three appear in the listing for the dev deployment (`dev:exciting-fennec-671`).

- [ ] **Step 9.5: Push code to dev deployment**

```powershell
npx convex dev --once
```

Expected: deploys cleanly to `exciting-fennec-671`. Crons appear in `npx convex dashboard` → Crons tab.

- [ ] **Step 9.6: Register the webhook against dev**

```powershell
curl.exe -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" `
  -d "url=https://exciting-fennec-671.convex.site/telegram-webhook" `
  -d "secret_token=<SECRET>" `
  -d 'allowed_updates=["message"]'
```

Expected: `{"ok":true,"result":true,"description":"Webhook was set"}`.

- [ ] **Step 9.7: Set the `/pack` BotFather command (one-time per bot)**

In Telegram, message `@BotFather`:
```
/setcommands
```
Select the dev bot. Send:
```
pack - Generate pack list now
```

Expected: `Success! Command list updated`. This is required so the bot sees `/pack` in groups despite privacy mode being ON.

---

## Task 10: Dev smoke test — all three paths

**This task verifies the feature works end-to-end before triple-review.**

- [ ] **Step 10.1: Seed a few test orders in dev (or use existing data)**

If dev is empty, use the existing Orders page in the dev frontend to create 2-3 orders with status `PaymentReceived` or `BeingPrepared` and `dueDate` set to today.

- [ ] **Step 10.2: Smoke-test the morning path**

```powershell
npx convex run telegram/sendPackList:sendPackList '{"reason":"morning"}'
```

Expected:
- Action returns `{ chunkCount: N, orderCount: M }`.
- A message appears in the dev Telegram group with the morning header, the count line, and the orders.
- Order rendering matches the spec: order number bold, customer name, item lines, delivery/pickup, notes if present, `[rush]` if expedited.

If the message doesn't arrive but the action returned OK: see RUNBOOK §Bot connectivity — most likely bot was removed from the group.

- [ ] **Step 10.3: Smoke-test the midday path**

```powershell
npx convex run telegram/sendPackList:sendPackList '{"reason":"midday"}'
```

Expected: same orders, but header reads `Still Pending — <date> · <HH:MM>` and the count line says "orders not yet shipped".

- [ ] **Step 10.4: Smoke-test the `/pack` command**

In the dev Telegram group, send `/pack` (you should see the autocomplete pop up since BotFather registered the command).

Expected:
- Within ~3 seconds a message appears with the on-demand header.
- Convex logs (dashboard → Logs) show: `handleTelegramWebhook` → `recordUpdate` → scheduled `sendPackList` → action ran.

Send `/pack` again immediately to test dedupe — second response should NOT generate a second pack list message (the bot will still produce one if the `update_id` is different, which it will be for a brand-new send; dedupe only kicks in on Telegram retries of the SAME update_id). To force-test the dedupe path: pull the update_id from the first webhook call's logs and re-POST to the route with the same payload.

- [ ] **Step 10.5: Smoke-test the empty-day path**

Either mark all today's test orders Cancelled or change their status temporarily, then re-run:

```powershell
npx convex run telegram/sendPackList:sendPackList '{"reason":"morning"}'
```

Expected: single message `Pack List — <date>` + `Nothing to pack today. ✅`.

Restore order statuses after.

- [ ] **Step 10.6: Verify `getWebhookInfo` is clean**

```powershell
curl.exe "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
```

Expected:
- `url` = `https://exciting-fennec-671.convex.site/telegram-webhook`
- `pending_update_count: 0`
- No `last_error_message`

If `last_error_message` is present, see RUNBOOK §Webhook not firing.

---

## Task 11: Triple-review gate

Per CLAUDE.md execute-phase `triple_review_gate`, ALL phases must pass triple-review before code-review + `npm run build`.

- [ ] **Step 11.1: Run triple-review on the implementation**

Invoke `Skill(skill="triple-review")` against the diff of `feature/telegram-pack-list-bot` vs `main`.

- [ ] **Step 11.2: Address findings**

For each finding classified Critical or Important: fix in-line, run affected tests, commit per fix.

For Minor / Nitpick: judgement call — fix if cheap, defer with a comment if not.

- [ ] **Step 11.3: Re-verify after fixes**

```bash
npm run test
npm run build
```

Expected: green, green.

---

## Task 12: Code review + final build gate

- [ ] **Step 12.1: Run code-review on the branch**

Invoke `Skill(skill="code-review")` or `/gsd-code-review`. Apply fixes as in Task 11.

- [ ] **Step 12.2: Full test suite**

```bash
npm run test
```

Expected: all suites pass, no flakes. Pay attention to the 4 new suites this phase added (`telegramHtml`, `packListFormat`, `packListQuery`, `webhookHandler`).

- [ ] **Step 12.3: Production build**

```bash
npm run build
```

Expected: `tsc -b && vite build` succeed. No new vendor bundle warnings (this feature ships no frontend code so the chunk-size guards should be unaffected — see Common Pitfall #16).

---

## Task 13: Documentation updates

- [ ] **Step 13.1: Append CHANGELOG entry**

Add to `docs/CHANGELOG.md` under the next-shipping version section:

```markdown
### Added
- **Telegram morning pack list bot** — posts the day's pack list (orders in
  `PaymentReceived` or `BeingPrepared` with `dueDate <= end of today WIB`) to
  a dedicated Telegram group at 07:00 WIB, with a 13:00 WIB "still pending"
  reminder and an on-demand `/pack` command. One-way notifications + a single
  text command; no inline buttons in v1. Uses the existing `KanbanOrderCard`
  shape so the bot mirrors what the kanban UI shows. Spec:
  `docs/superpowers/specs/2026-05-26-telegram-morning-packing-report-design.md`.
```

- [ ] **Step 13.2: Note the new schema table in docs/SCHEMA.md**

Add to the table list (alphabetical or grouped under "Integrations"):

```markdown
| `telegramUpdates` | Telegram webhook idempotency dedupe by `update_id`. |
```

- [ ] **Step 13.3: Update docs/FILE_MAP.md (Telegram section)**

Add a new entry — if no telegram section exists, create one:

```markdown
### Telegram bot (Phase 85)
- Backend: `convex/telegram/{sendPackList,webhook,packListFormat}.ts`, `convex/telegram/queries/packListQuery.ts`, `convex/lib/telegramHtml.ts`
- Crons: `convex/crons.ts` — "telegram morning pack list", "telegram midday pack list"
- HTTP route: `convex/http.ts` — `POST /telegram-webhook`
- Env vars: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `TELEGRAM_WEBHOOK_SECRET`
- Permission: webhook is unauthenticated externally (token in header); no Convex role gate (read-only feature, any group member can `/pack`)
```

- [ ] **Step 13.4: Commit docs**

```bash
git add docs/CHANGELOG.md docs/SCHEMA.md docs/FILE_MAP.md
git commit -m "docs: telegram pack list bot — CHANGELOG + SCHEMA + FILE_MAP"
```

---

## Task 14: Open PR + merge

- [ ] **Step 14.1: Push branch**

```bash
git push -u origin feature/telegram-pack-list-bot
```

- [ ] **Step 14.2: Open PR**

```bash
gh pr create --title "feat(telegram): morning + midday pack list bot with /pack command" --body "$(cat <<'EOF'
## Summary
- New Telegram bot that posts the day's pack list (orders due today + overdue, statuses PaymentReceived + BeingPrepared) at 07:00 WIB.
- Midday "still pending" reminder at 13:00 WIB using the same query.
- On-demand `/pack` text command (webhook-driven, idempotent by update_id).
- Mirrors the existing kanban card shape — no BOM resolution, just orderItems × quantity.

## Test plan
- [ ] Unit tests pass: `npx vitest run convex/lib/__tests__/telegramHtml.test.ts convex/telegram/__tests__/`
- [ ] Type-check clean: `npm run type-check`
- [ ] Build clean: `npm run build`
- [ ] Dev smoke (manual) — morning, midday, /pack, empty-day all post the expected message
- [ ] `getWebhookInfo` reports no `last_error_message` after running the smoke tests

## Spec / plan
- Spec: `docs/superpowers/specs/2026-05-26-telegram-morning-packing-report-design.md`
- Plan: `docs/superpowers/plans/2026-05-26-telegram-morning-packing-report.md`

## Out of scope (v1)
- Per-order "Mark packed" inline buttons (defer to v2)
- Telegram user → Convex user auth mapping
- Posting to multiple groups

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 14.3: Wait for CI green**

CI runs: ESLint, type-check, tests, Convex deploy (against the dev deployment for PRs, prod on main merges).

If CI fails: see RUNBOOK + Common Pitfall #16 (vendor bundle) + the recent split-brain CI lesson (`lesson_convex_vercel_splitbrain.md`).

- [ ] **Step 14.4: Merge to main**

After CI green + review approved, squash-merge via GitHub UI (matches the project's commit history style).

---

## Task 15: Prod cutover

**This is a separate manual ceremony AFTER merge. Treat as Phase 85.1 if you want to split it; otherwise it's the last step of this phase.**

- [ ] **Step 15.1: Prompt user for prod credentials**

Same prompt as Step 9.1, but for prod:

> Need a SEPARATE prod bot (per RUNBOOK §"Promoting Telegram from dev to prod"). Please create `@FrolliePackBot` via BotFather and provide:
> 1. Prod bot token
> 2. Prod group chat id
> 3. A NEW 64-char webhook secret (don't reuse the dev secret)

- [ ] **Step 15.2: Verify token + discover prod chat id**

Same as Steps 9.2 + 9.3 but using the prod token.

- [ ] **Step 15.3: Set prod env vars**

```powershell
npx convex env set TELEGRAM_BOT_TOKEN "<PROD_TOKEN>" --prod
npx convex env set TELEGRAM_CHAT_ID -- <PROD_CHAT_ID> --prod
npx convex env set TELEGRAM_WEBHOOK_SECRET "<PROD_SECRET>" --prod
npx convex env list --prod
```

- [ ] **Step 15.4: Confirm prod deployment shipped via CI**

The merge to main triggers Convex prod deploy via GitHub Actions. Confirm:

```powershell
gh run list --limit 1
```

Expected: most recent run is green and includes `deploy-convex`.

- [ ] **Step 15.5: Register prod webhook**

```powershell
curl.exe -X POST "https://api.telegram.org/bot<PROD_TOKEN>/setWebhook" `
  -d "url=https://decisive-wombat-7.convex.site/telegram-webhook" `
  -d "secret_token=<PROD_SECRET>" `
  -d 'allowed_updates=["message"]'
```

- [ ] **Step 15.6: Register `/pack` BotFather command for prod bot**

Same as Step 9.7 but selecting the prod bot.

- [ ] **Step 15.7: Prod smoke test**

```powershell
npx convex run telegram/sendPackList:sendPackList '{"reason":"command"}' --prod
```

Expected: message appears in prod Telegram group.

Send `/pack` in the prod group too. Confirm webhook fires (Convex prod logs).

- [ ] **Step 15.8: Verify `getWebhookInfo` for prod**

```powershell
curl.exe "https://api.telegram.org/bot<PROD_TOKEN>/getWebhookInfo"
```

Expected: `url` = `decisive-wombat-7.convex.site/telegram-webhook`, no errors, `pending_update_count: 0`.

- [ ] **Step 15.9: Wait for the next morning cron**

The 07:00 WIB cron will fire the day after deployment. Confirm the prod group receives the morning pack list. If you deploy mid-morning, you can wait for the 13:00 midday cron as a faster signal.

- [ ] **Step 15.10: Update memory + CHANGELOG with prod cutover**

Update `docs/CHANGELOG.md` to mark the feature as shipped + the cutover date. If MEMORY.md tracks active work, add the new prod bot username + chat id reference.

---

## Self-Review Checklist (post-write)

Run through these before handing off to execution:

**Spec coverage:**
- [x] Definition of "needs packing" — Task 4 (`packListQuery.ts`) implements `status ∈ {PaymentReceived, BeingPrepared}` + dueDate boundary
- [x] Three callers (morning / midday / command) — Tasks 5 + 6 + 7
- [x] Dedicated Telegram group destination — Task 9 (env var)
- [x] Full per-order detail matching kanban shape — Task 3 (`renderOrder` uses `KanbanOrderCard.items`)
- [x] Header with date + count + delivery/pickup split — Task 3 (`buildHeader`)
- [x] 07:00 + 13:00 WIB schedule — Task 6
- [x] `/pack` command — Tasks 7 + 8
- [x] Empty day "Nothing to pack today" — Task 3 (empty-day branch in `buildHeader`)
- [x] HTML escape on user-supplied fields — Task 2 (`escapeHtml`), used throughout Task 3
- [x] 4096-char chunking — Task 3 (`CHUNK_BUDGET = 4000`)
- [x] Idempotency dedupe — Tasks 1 + 7 (`telegramUpdates` + `decideWebhookOutcome`)
- [x] Constant-time secret compare — Task 7
- [x] Env vars on prod + dev separately — Tasks 9 + 15
- [x] Tests at all 3 levels (unit / convex-test integration / manual smoke) — Tasks 2, 3, 4, 7 + Task 10
- [x] CHANGELOG + SCHEMA + FILE_MAP — Task 13
- [x] Triple-review gate — Task 11

**Placeholder scan:** No "TBD" / "implement later" / "similar to" — every code block is complete.

**Type consistency:** `FormatReason` is the union literal used in both `formatPackList`'s input and `sendPackList`'s args. `KanbanOrderCard` is imported from the existing `convex/orders/helpers/kanbanBuilders.ts` consistently. `WebhookDeps` interface is defined once in Task 7 and consumed by both the pure handler core and the httpAction wrapper.
