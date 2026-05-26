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

  it("R1: Delivery order with missing address surfaces the data gap visibly", () => {
    const out = formatPackList({
      ...baseInput,
      cards: [card({ deliveryType: "Delivery", deliveryAddress: undefined })],
      counts: { total: 1, delivery: 1, pickup: 0 },
    });
    expect(out.join("\n")).toContain("Delivery → (no address — check order)");
  });

  it("R1: Delivery order with whitespace-only address treated as missing", () => {
    const out = formatPackList({
      ...baseInput,
      cards: [card({ deliveryType: "Delivery", deliveryAddress: "   " })],
      counts: { total: 1, delivery: 1, pickup: 0 },
    });
    expect(out.join("\n")).toContain("(no address — check order)");
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

  it("C1: truncates a single order whose render exceeds MAX_ORDER_LEN so no chunk overflows 4096", () => {
    // Synthesize an order whose `renderOrder()` output alone exceeds 4000 chars
    // via pathological notes (5000 chars). Without the truncation guard, this
    // would produce a chunk = continuation_header + rendered_order ≈ 5030 chars
    // and Telegram would reject it with HTTP 400.
    const out = formatPackList({
      ...baseInput,
      cards: [card({ orderNumber: "0526-BIG", notes: "x".repeat(5000) })],
      counts: { total: 1, delivery: 1, pickup: 0 },
    });
    for (const chunk of out) {
      expect(chunk.length).toBeLessThanOrEqual(4096);
    }
    // Marker shows staff the order was truncated and they need to check the app.
    expect(out.join("\n")).toContain("truncated");
  });
});
