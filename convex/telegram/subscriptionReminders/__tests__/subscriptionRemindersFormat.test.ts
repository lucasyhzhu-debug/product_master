// convex/telegram/subscriptionReminders/__tests__/subscriptionRemindersFormat.test.ts
import { describe, it, expect } from "vitest";
import type { Id } from "../../../_generated/dataModel";
import {
  formatWeeklyDeliveryProgress, formatTodayDeliveries, formatInvoiceDueReminder,
  formatConfirmReminder, formatChangeCutoffReminder, formatReconcileReminder,
} from "../subscriptionRemindersFormat";

describe("formatWeeklyDeliveryProgress", () => {
  it("renders one block per account with remaining (never negative) + over-plan flag", () => {
    const html = formatWeeklyDeliveryProgress([
      { account: "Crystal Cafe", weekStart: Date.UTC(2026,5,22), weekPlannedPcs: 21, deliveredPcs: 8, remaining: 13, overBy: 0,
        shippedTodayPcs: 3, weeklyQty: 21, weeklyLeft: 13, creditRemaining: 100_000 },
      { account: "Tamtem", weekStart: Date.UTC(2026,5,22), weekPlannedPcs: 14, deliveredPcs: 16, remaining: 0, overBy: 2,
        shippedTodayPcs: 2, weeklyQty: 14, weeklyLeft: 0, creditRemaining: 0 },
    ]).join("\n");
    expect(html).toContain("Crystal Cafe");
    expect(html).toContain("8 out of 21");
    expect(html).toContain("13 pcs remaining");
    expect(html).toContain("Tamtem");
    expect(html).toMatch(/over.*2/i); // over-plan surfaced
  });
  it("renders an explicit empty state when no active accounts", () => {
    expect(formatWeeklyDeliveryProgress([])[0]).toMatch(/no active/i);
  });
  it("renders the WIB date with a 1-indexed month (June = 06, not 05)", () => {
    // weekStart = 2026-06-22 00:00 WIB (Date.UTC month index 5 = June).
    const html = formatWeeklyDeliveryProgress([
      { account: "X", weekStart: Date.UTC(2026,5,21,17,0), weekPlannedPcs: 7, deliveredPcs: 0, remaining: 7, overBy: 0,
        shippedTodayPcs: 0, weeklyQty: 7, weeklyLeft: 7, creditRemaining: 0 },
    ]).join("\n");
    expect(html).toContain("22/06/26"); // guards the getWibComponents 0-indexed-month off-by-one
  });

  it("shows shipped-today, weekly allotment left, and credit remaining (the end-of-day KPIs)", () => {
    const html = formatWeeklyDeliveryProgress([
      { account: "Crystal Cafe", weekStart: Date.UTC(2026,5,22), weekPlannedPcs: 21, deliveredPcs: 8, remaining: 13, overBy: 0,
        shippedTodayPcs: 5, weeklyQty: 21, weeklyLeft: 13, creditRemaining: 17_400_000 },
    ]).join("\n");
    expect(html).toContain("Shipped today: 5"); // pieces shipped TODAY
    expect(html).toMatch(/13 left/i);           // weekly allotment remaining (weeklyQty − used)
    expect(html).toMatch(/17[.,]400[.,]000/);   // credit remaining (integer IDR)
  });
});

describe("formatTodayDeliveries", () => {
  it("marks a deleted product with a warning beside its name", () => {
    const html = formatTodayDeliveries([
      { account: "Crystal Cafe", deliverByTime: "09:00", lines: [
        { productName: "Original 80g", qty: 5, missingProduct: false },
        { productName: "Ghost SKU", qty: 2, missingProduct: true },
      ]},
    ]).join("\n");
    expect(html).toContain("Original 80g");
    expect(html).toMatch(/⚠️.*Ghost SKU/);
  });
});

describe("formatInvoiceDueReminder", () => {
  it("renders integer IDR amount due", () => {
    const html = formatInvoiceDueReminder([
      { account: "Crystal Cafe", weekStart: Date.UTC(2026,5,22), amountDue: 1500000, weekStatus: "confirmed" },
    ]).join("\n");
    expect(html).toContain("1,500,000");
  });
});

describe("formatConfirmReminder", () => {
  it("renders account and week date", () => {
    const html = formatConfirmReminder([
      { subscriptionId: "sub1" as unknown as Id<"subscriptions">, account: "Crystal Cafe", weekStart: Date.UTC(2026,5,22) },
    ]).join("\n");
    expect(html).toContain("Crystal Cafe");
  });
  it("renders empty state when no rows", () => {
    expect(formatConfirmReminder([])[0]).toContain("Nothing awaiting confirmation");
  });
});

describe("formatChangeCutoffReminder", () => {
  it("renders account name", () => {
    const html = formatChangeCutoffReminder([
      { subscriptionId: "sub1" as unknown as Id<"subscriptions">, account: "Tamtem", weekStart: Date.UTC(2026,5,22) },
    ]).join("\n");
    expect(html).toContain("Tamtem");
  });
  it("renders empty state when no rows", () => {
    expect(formatChangeCutoffReminder([])[0]).toContain("No days approaching cutoff");
  });
});

describe("formatReconcileReminder", () => {
  it("renders account and formatted IDR amounts", () => {
    const html = formatReconcileReminder([
      { account: "Crystal Cafe", weekStart: Date.UTC(2026,5,22), shortfall: 500000, refundDue: 250000 },
    ]).join("\n");
    expect(html).toContain("Crystal Cafe");
    expect(html).toContain("500,000");
  });
  it("renders empty state when no rows", () => {
    expect(formatReconcileReminder([])[0]).toContain("Nothing to reconcile");
  });
});

describe("chunking — oversized input splits into multiple <= 4096-char chunks", () => {
  it("formatWeeklyDeliveryProgress produces multiple chunks and none exceed 4096 chars", () => {
    // 200 accounts × ~60 chars/block ≈ 12 000 chars of section content; well above 4096.
    const rows = Array.from({ length: 200 }, (_, i) => ({
      account: `Account ${String(i).padStart(3, "0")} — Long Name To Inflate Block Size`,
      weekStart: Date.UTC(2026, 5, 22),
      weekPlannedPcs: 100,
      deliveredPcs: i % 100,
      remaining: 100 - (i % 100),
      overBy: 0,
      shippedTodayPcs: i % 20,
      weeklyQty: 100,
      weeklyLeft: 100 - (i % 100),
      creditRemaining: (i % 50) * 29_000,
    }));
    const chunks = formatWeeklyDeliveryProgress(rows);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(4096);
    }
  });

  it("formatTodayDeliveries produces multiple chunks and none exceed 4096 chars", () => {
    const rows = Array.from({ length: 200 }, (_, i) => ({
      account: `Subscriber Account ${String(i).padStart(3, "0")} Long Name`,
      deliverByTime: "09:00",
      lines: [
        { productName: "Original 80g Snack Pack", qty: 5, missingProduct: false },
        { productName: "Jumbo Bite Triple Pack", qty: 3, missingProduct: false },
      ],
    }));
    const chunks = formatTodayDeliveries(rows);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(4096);
    }
  });
});
