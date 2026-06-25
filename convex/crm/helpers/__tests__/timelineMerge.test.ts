import { describe, it, expect } from "vitest";
import { buildCustomerTimeline, TimelineItem } from "../timelineMerge";
import { EVENT_TYPES, eventTypeToCategory } from "../../../lib/activityEvents";

// Fixed "now" reference: 2026-06-25 12:00:00 UTC
const NOW = Date.UTC(2026, 5, 25, 12, 0, 0, 0);
const DAY = 24 * 3600_000;

// Items INSIDE the 14-day window (within sinceDays=14 before NOW)
const orderPlaced: TimelineItem = {
  id: "item-01",
  eventType: "order_placed",
  at: NOW - 2 * DAY,        // 2 days ago — inside
  title: "Order #001 placed",
  detail: "5 boxes",
  linkTo: { kind: "order", id: "order-id-01" },
};

const invoiceSent: TimelineItem = {
  id: "item-02",
  eventType: "invoice_sent",
  at: NOW - 5 * DAY,        // 5 days ago — inside
  actor: "manager",
  title: "Invoice #001 sent",
  detail: "Rp 145.000",
  linkTo: { kind: "invoice", id: "invoice-id-01" },
};

const topup: TimelineItem = {
  id: "item-03",
  eventType: "topup",
  at: NOW - 7 * DAY,        // 7 days ago — inside
  title: "Top-up received",
  detail: "+Rp 500.000",
  linkTo: { kind: "week", id: "week-id-01" },
};

const subscriptionStarted: TimelineItem = {
  id: "item-04",
  eventType: "subscription_started",
  at: NOW - 10 * DAY,       // 10 days ago — inside
  title: "Subscription started",
  detail: "Weekly prepaid",
  linkTo: { kind: "subscription", id: "sub-id-01" },
};

// Items OUTSIDE the 14-day window (older than sinceDays=14 before NOW)
const oldOrder: TimelineItem = {
  id: "item-05",
  eventType: "order_delivered",
  at: NOW - 20 * DAY,       // 20 days ago — OUTSIDE
  title: "Order #000 delivered",
  detail: "3 boxes",
  linkTo: { kind: "order", id: "order-id-old" },
};

// Logged items (customerActivity style)
const whatsappDrafted: TimelineItem = {
  id: "item-06",
  eventType: "whatsapp_drafted",
  at: NOW - 3 * DAY,        // 3 days ago — inside
  actor: "staff-01",
  title: "WhatsApp drafted",
  detail: "Confirmed delivery for Thursday",
  linkTo: { kind: "activity", id: "activity-id-01" },
};

const oldNote: TimelineItem = {
  id: "item-07",
  eventType: "note",
  at: NOW - 30 * DAY,       // 30 days ago — OUTSIDE
  title: "Note",
  detail: "First contact",
  linkTo: { kind: "activity", id: "activity-id-02" },
};

// Tiebreaker items: same `at`, different `id`
const tieA: TimelineItem = {
  id: "tiebreaker-aaa",
  eventType: "topup",
  at: NOW - 4 * DAY,
  title: "Top-up A",
  detail: "+Rp 100.000",
  linkTo: { kind: "week", id: "week-id-02" },
};

const tieB: TimelineItem = {
  id: "tiebreaker-bbb",
  eventType: "payment_funded",
  at: NOW - 4 * DAY,        // same timestamp as tieA
  title: "Payment funded B",
  detail: "+Rp 200.000",
  linkTo: { kind: "invoice", id: "invoice-id-02" },
};

describe("buildCustomerTimeline", () => {
  it("merges derived + logged, sorts DESC by at, windows at sinceDays=14", () => {
    const { items } = buildCustomerTimeline(
      [orderPlaced, invoiceSent, topup, subscriptionStarted, oldOrder],
      [whatsappDrafted, oldNote],
      { sinceDays: 14, now: NOW },
    );

    // Old items (>14d ago) must be excluded
    expect(items.find((i) => i.id === "item-05")).toBeUndefined();
    expect(items.find((i) => i.id === "item-07")).toBeUndefined();

    // 5 items inside the window
    expect(items).toHaveLength(5);

    // Sorted DESC by `at`
    for (let i = 1; i < items.length; i++) {
      expect(items[i - 1].at).toBeGreaterThanOrEqual(items[i].at);
    }

    // Exact order: orderPlaced(2d), whatsappDrafted(3d), invoiceSent(5d), topup(7d), subscriptionStarted(10d)
    expect(items.map((i) => i.id)).toEqual([
      "item-01",
      "item-06",
      "item-02",
      "item-03",
      "item-04",
    ]);
  });

  it("applies types (category) filter correctly", () => {
    const { items } = buildCustomerTimeline(
      [orderPlaced, invoiceSent, topup, subscriptionStarted, oldOrder],
      [whatsappDrafted, oldNote],
      { sinceDays: 14, types: ["finance"], now: NOW },
    );

    // Only finance-category items
    items.forEach((item) => {
      expect(eventTypeToCategory(item.eventType)).toBe("finance");
    });

    // invoiceSent + topup are finance (orderPlaced is order, subscriptionStarted is milestone, whatsapp is message)
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.id)).toEqual(["item-02", "item-03"]);
  });

  it("applies multi-category filter", () => {
    const { items } = buildCustomerTimeline(
      [orderPlaced, invoiceSent, topup, subscriptionStarted],
      [whatsappDrafted],
      { sinceDays: 14, types: ["order", "message"], now: NOW },
    );

    items.forEach((item) => {
      const cat = eventTypeToCategory(item.eventType);
      expect(["order", "message"]).toContain(cat);
    });

    expect(items).toHaveLength(2);
  });

  it("applies stable tiebreaker: same at → sort id DESC", () => {
    const { items } = buildCustomerTimeline(
      [tieA, tieB],
      [],
      { sinceDays: 14, now: NOW },
    );

    expect(items).toHaveLength(2);
    // Both same `at`. id desc: "tiebreaker-bbb" > "tiebreaker-aaa"
    expect(items[0].id).toBe("tiebreaker-bbb");
    expect(items[1].id).toBe("tiebreaker-aaa");
  });

  it("returns empty when all items are outside the window", () => {
    const { items } = buildCustomerTimeline(
      [oldOrder],
      [oldNote],
      { sinceDays: 14, now: NOW },
    );
    expect(items).toHaveLength(0);
  });

  it("returns all items when sinceDays is very large", () => {
    const { items } = buildCustomerTimeline(
      [orderPlaced, oldOrder],
      [oldNote],
      { sinceDays: 365, now: NOW },
    );
    expect(items).toHaveLength(3);
  });

  it("TAXONOMY COVERAGE: every EventType resolves via eventTypeToCategory", () => {
    // This is the critical coverage assertion: if a new EventType is added to activityEvents
    // without a category mapping, this test will catch it at build time.
    // We produce one TimelineItem per EventType and verify it resolves.
    EVENT_TYPES.forEach((eventType) => {
      const item: TimelineItem = {
        id: `coverage-${eventType}`,
        eventType,
        at: NOW - 1 * DAY,
        title: `Coverage ${eventType}`,
        detail: "taxonomy check",
        linkTo: { kind: "activity", id: `id-${eventType}` },
      };

      const { items } = buildCustomerTimeline([item], [], { sinceDays: 14, now: NOW });
      expect(items).toHaveLength(1);
      const category = eventTypeToCategory(items[0].eventType);
      expect(category).toBeTruthy();
      // Also verify it's a known category string
      expect(["order", "finance", "message", "document", "schedule", "milestone"]).toContain(
        category,
      );
    });
  });

  it("TAXONOMY COVERAGE: types filter with each category passes through matching items", () => {
    // Build one item per EventType, all within window
    const allItems: TimelineItem[] = EVENT_TYPES.map((eventType) => ({
      id: `all-${eventType}`,
      eventType,
      at: NOW - 1 * DAY,
      title: `Item ${eventType}`,
      detail: "filter check",
      linkTo: { kind: "activity", id: `id-${eventType}` },
    }));

    const categories = ["order", "finance", "message", "document", "schedule", "milestone"] as const;
    categories.forEach((cat) => {
      const expected = EVENT_TYPES.filter((et) => eventTypeToCategory(et) === cat);
      const { items } = buildCustomerTimeline(allItems, [], {
        sinceDays: 14,
        types: [cat],
        now: NOW,
      });
      expect(items.map((i) => i.eventType).sort()).toEqual(expected.sort());
    });
  });
});
