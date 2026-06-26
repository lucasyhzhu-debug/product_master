import { describe, it, expect } from "vitest";
import { buildPlannedDays } from "../weeks";
import type { Id } from "../../_generated/dataModel";

const DAY = 86400000;
const PID = "p1" as Id<"menuProducts">;

describe("buildPlannedDays", () => {
  it("expands a template into 7 dated days at the partner unit price", () => {
    const template = [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
      dayOfWeek,
      items: [{ menuProductId: PID, qty: 150 }],
    }));
    const days = buildPlannedDays({
      weekStart: 0,
      template,
      unitPrice: 29000,
      deliverByTime: "09:00",
      productNames: { [PID]: "Dubai Chewy Cookies" },
      baselineDailyQty: 200,
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
      template: [{ dayOfWeek: 2, items: [{ menuProductId: PID, qty: 100 }] }],
      unitPrice: 29000,
      deliverByTime: "09:00",
      productNames: { [PID]: "Dubai" },
      baselineDailyQty: 200,
    });
    expect(days).toHaveLength(1);
    expect(days[0].date).toBe(2 * DAY);
  });
});
