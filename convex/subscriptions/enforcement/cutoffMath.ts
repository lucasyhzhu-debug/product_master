import { getWibComponents, wibMidnightToUtc } from "../../lib/periodRange";
import { DAY_MS } from "./effectiveDates";

const HOUR_MS = 3_600_000;

/** UTC epoch ms of the change-cutoff for a delivery on deliveryDateMs.
 *  cutoff = WIB midnight of (deliveryDay + changeCutoffDayOffset) + changeCutoffHour hours. */
export function cutoffMs(
  deliveryDateMs: number,
  changeCutoffDayOffset: number,
  changeCutoffHour: number,
): number {
  const cutoffDay = deliveryDateMs + changeCutoffDayOffset * DAY_MS;
  const { year, month, day } = getWibComponents(cutoffDay);
  return wibMidnightToUtc(year, month, day) + changeCutoffHour * HOUR_MS;
}

/** Has the change-cutoff for this delivery day already passed as of `now`? */
export function isPastCutoff(
  deliveryDateMs: number,
  changeCutoffDayOffset: number,
  changeCutoffHour: number,
  now: number,
): boolean {
  return cutoffMs(deliveryDateMs, changeCutoffDayOffset, changeCutoffHour) <= now;
}
