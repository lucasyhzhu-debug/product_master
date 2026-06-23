import { describe, it, expect } from "vitest";
import { buildPlannedDays } from "../weeks";

const DAY = 86400000;

describe("buildPlannedDays", () => {
  it("expands a template into 7 dated days at the partner unit price", () => {
    const template = [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
      dayOfWeek,
      items: [{ menuProductId: "p1" as never, qty: 150 }],
    }));
    const days = buildPlannedDays({
      weekStart: 0,
      template,
      unitPrice: 29000,
      deliverByTime: "09:00",
      productNames: { p1: "Dubai Chewy Cookies" },
    });
    expect(days).toHaveLength(7);
    expect(days[0].date).toBe(0);
    expect(days[6].date).toBe(6 * DAY);
    expect(days[0].items[0]).toMatchObject({ productName: "Dubai Chewy Cookies", qty: 150, unitPrice: 29000, lineTotal: 4350000 });
    expect(days[0].locked).toBe(false);
  });
  it("omits days the template has no entry for", () => {
    const days = buildPlannedDays({
      weekStart: 0,
      template: [{ dayOfWeek: 2, items: [{ menuProductId: "p1" as never, qty: 100 }] }],
      unitPrice: 29000,
      deliverByTime: "09:00",
      productNames: { p1: "Dubai" },
    });
    expect(days).toHaveLength(1);
    expect(days[0].date).toBe(2 * DAY);
  });
});
