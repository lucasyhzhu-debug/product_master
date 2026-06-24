import type { Id } from "../_generated/dataModel";
import type { ScheduleLine } from "./types";
import { computeLineTotal } from "./creditMath";

export function makeScheduleLine(
  menuProductId: Id<"menuProducts">,
  productName: string,
  qty: number,
  unitPrice: number,
): ScheduleLine {
  return { menuProductId, productName, qty, unitPrice, lineTotal: computeLineTotal(qty, unitPrice) };
}

export function validateScheduleTemplate(
  template: { dayOfWeek: number; items: { menuProductId: Id<"menuProducts">; qty: number }[] }[],
): { ok: true } | { ok: false; error: string } {
  const seen = new Set<number>();
  for (const day of template) {
    if (!Number.isInteger(day.dayOfWeek) || day.dayOfWeek < 0 || day.dayOfWeek > 6)
      return { ok: false, error: `dayOfWeek out of range: ${day.dayOfWeek}` };
    if (seen.has(day.dayOfWeek)) return { ok: false, error: `duplicate dayOfWeek: ${day.dayOfWeek}` };
    seen.add(day.dayOfWeek);
    if (day.items.length === 0) return { ok: false, error: `empty day: ${day.dayOfWeek}` };
    for (const it of day.items) {
      if (!Number.isInteger(it.qty) || it.qty <= 0)
        return { ok: false, error: `qty must be a positive integer (day ${day.dayOfWeek})` };
    }
  }
  return { ok: true };
}
