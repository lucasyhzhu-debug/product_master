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

describe("formatConfirmReminder", () => {
  it("renders account and week date", () => {
    const html = formatConfirmReminder([
      { subscriptionId: "sub1" as unknown as Id<"subscriptions">, account: "Crystal Cafe", weekStart: Date.UTC(2026,5,22) },
    ]);
    expect(html).toContain("Crystal Cafe");
  });
  it("renders empty state when no rows", () => {
    expect(formatConfirmReminder([])).toContain("Nothing awaiting confirmation");
  });
});

describe("formatChangeCutoffReminder", () => {
  it("renders account name", () => {
    const html = formatChangeCutoffReminder([
      { subscriptionId: "sub1" as unknown as Id<"subscriptions">, account: "Tamtem", weekStart: Date.UTC(2026,5,22) },
    ]);
    expect(html).toContain("Tamtem");
  });
  it("renders empty state when no rows", () => {
    expect(formatChangeCutoffReminder([])).toContain("No days approaching cutoff");
  });
});

describe("formatReconcileReminder", () => {
  it("renders account and formatted IDR amounts", () => {
    const html = formatReconcileReminder([
      { account: "Crystal Cafe", weekStart: Date.UTC(2026,5,22), shortfall: 500000, refundDue: 250000 },
    ]);
    expect(html).toContain("Crystal Cafe");
    expect(html).toContain("500,000");
  });
  it("renders empty state when no rows", () => {
    expect(formatReconcileReminder([])).toContain("Nothing to reconcile");
  });
});
