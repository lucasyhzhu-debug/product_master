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
