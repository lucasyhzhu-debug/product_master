import { describe, it, expect } from "vitest";
import { formatPackList, formatUnpaidAlert, type FormatInput } from "../packListFormat";
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
  overdue: [],
  dueToday: [],
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
    const out = formatPackList({ ...baseInput, dueToday: [card()], counts: { total: 1, delivery: 1, pickup: 0 } });
    expect(out[0]).toMatch(/^<b>Pack List — \w+ \d{1,2} \w+ \d{4}<\/b>/);
  });

  it("midday header uses Still Pending + 24h time", () => {
    const out = formatPackList({
      ...baseInput,
      reason: "midday",
      generatedAt: Date.parse("2026-05-27T06:00:00Z"), // 13:00 WIB
      dueToday: [card()],
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
      dueToday: [card()],
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
      dueToday: [card(), card({ deliveryType: "Pickup", pickupLocation: "Office" } as Partial<KanbanOrderCard>)],
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
      dueToday: [card({
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
      dueToday: [card({ expedited: true })],
      counts: { total: 1, delivery: 1, pickup: 0 },
    });
    expect(out.join("\n")).toContain("[rush]");
  });

  it("omits address line for Pickup orders (no address)", () => {
    const out = formatPackList({
      ...baseInput,
      dueToday: [card({ deliveryType: "Pickup", deliveryAddress: undefined })],
      counts: { total: 1, delivery: 0, pickup: 1 },
    });
    expect(out.join("\n")).toContain("Pickup");
    expect(out.join("\n")).not.toContain("→ undefined");
  });

  it("R1: Delivery order with missing address surfaces the data gap visibly", () => {
    const out = formatPackList({
      ...baseInput,
      dueToday: [card({ deliveryType: "Delivery", deliveryAddress: undefined })],
      counts: { total: 1, delivery: 1, pickup: 0 },
    });
    expect(out.join("\n")).toContain("Delivery → (no address — check order)");
  });

  it("R1: Delivery order with whitespace-only address treated as missing", () => {
    const out = formatPackList({
      ...baseInput,
      dueToday: [card({ deliveryType: "Delivery", deliveryAddress: "   " })],
      counts: { total: 1, delivery: 1, pickup: 0 },
    });
    expect(out.join("\n")).toContain("(no address — check order)");
  });

  it("renders notes line with 📝 prefix when notes present", () => {
    const out = formatPackList({
      ...baseInput,
      dueToday: [card({ notes: "leave at lobby" })],
      counts: { total: 1, delivery: 1, pickup: 0 },
    });
    expect(out.join("\n")).toContain("📝 leave at lobby");
  });

  it("omits notes line when notes absent or empty string", () => {
    const out = formatPackList({
      ...baseInput,
      dueToday: [card({ notes: "" })],
      counts: { total: 1, delivery: 1, pickup: 0 },
    });
    expect(out.join("\n")).not.toContain("📝");
  });
});

describe("formatPackList — HTML escape", () => {
  it("escapes < > & in customer name, address, notes, item names", () => {
    const out = formatPackList({
      ...baseInput,
      dueToday: [card({
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
      dueToday: many,
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
      dueToday: many,
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

  it("C1: truncates a single order whose render exceeds MAX_ORDER_LEN so no chunk overflows 4096", () => {
    // Synthesize an order whose `renderOrder()` output alone exceeds 4000 chars
    // via pathological notes (5000 chars). Without the truncation guard, this
    // would produce a chunk = continuation_header + rendered_order ≈ 5030 chars
    // and Telegram would reject it with HTTP 400.
    const out = formatPackList({
      ...baseInput,
      dueToday: [card({ orderNumber: "0526-BIG", notes: "x".repeat(5000) })],
      counts: { total: 1, delivery: 1, pickup: 0 },
    });
    for (const chunk of out) {
      expect(chunk.length).toBeLessThanOrEqual(4096);
    }
    // Marker shows staff the order was truncated and they need to check the app.
    expect(out.join("\n")).toContain("truncated");
  });
});

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

  // Section headers are new chunkBlocks participants — verify they survive a 4096-char
  // chunk split (no overflow, exactly one of each header, no orphaning/dropping).
  it("chunks correctly across OVERDUE + Due Today sections", () => {
    const mk = (n: string) =>
      card({
        orderNumber: n,
        customerName: `Customer ${n} with a reasonably long name`,
        deliveryAddress: `Jl. ${n}, neighbourhood and city detail to take space`,
        dueDate: Date.parse("2026-05-25T01:00:00Z"), // past → days-late line renders for overdue
      });
    const out = formatPackList({
      ...baseInput,
      overdue: Array.from({ length: 25 }, (_, i) => mk(`OD-${i}`)),
      dueToday: Array.from({ length: 25 }, (_, i) => mk(`DT-${i}`)),
      counts: { total: 50, delivery: 50, pickup: 0 },
    });
    for (const chunk of out) expect(chunk.length).toBeLessThanOrEqual(4096);
    const all = out.join("\n");
    expect(all.split("⚠️ OVERDUE (25)").length - 1).toBe(1);
    expect(all.split("Due Today (25)").length - 1).toBe(1);
    for (let i = 0; i < 25; i++) {
      expect(all.split(`<b>OD-${i}</b>`).length - 1).toBe(1);
      expect(all.split(`<b>DT-${i}</b>`).length - 1).toBe(1);
    }
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
    expect(formatUnpaidAlert({ unpaidOverdue: [], generatedAt: baseInput.generatedAt })).toEqual([]);
  });

  it("renders header, amount, days-late, and contact", () => {
    const out = formatUnpaidAlert({
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
      unpaidOverdue: [card({ orderNumber: "0525-008", status: "AwaitingPayment", finalTotal: 80000, dueDate: Date.parse("2026-05-26T01:00:00Z"), contactWa: undefined, customerPhone: "0813-1111-2222" })],
      generatedAt: baseInput.generatedAt,
    });
    expect(withPhone.join("\n")).toContain("📞 0813-1111-2222");

    const noContact = formatUnpaidAlert({
      unpaidOverdue: [card({ orderNumber: "0525-009", status: "AwaitingPayment", finalTotal: 90000, dueDate: Date.parse("2026-05-26T01:00:00Z"), contactWa: undefined, customerPhone: undefined })],
      generatedAt: baseInput.generatedAt,
    });
    expect(noContact.join("\n")).toContain("(no contact — check order)");
  });

  it("uses totalAmount when finalTotal is absent", () => {
    const out = formatUnpaidAlert({
      unpaidOverdue: [card({ orderNumber: "0525-010", status: "AwaitingPayment", finalTotal: undefined, totalAmount: 42000, dueDate: Date.parse("2026-05-26T01:00:00Z") })],
      generatedAt: baseInput.generatedAt,
    });
    expect(out.join("\n")).toContain("Rp 42.000");
  });
});
