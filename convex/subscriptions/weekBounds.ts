import { getWibComponents, wibMidnightToUtc } from "../lib/periodRange";

const DAY_MS = 86400000;

export function computeWeekStart(anyMsInWeek: number): number {
  const { year, month, day, dayOfWeek } = getWibComponents(anyMsInWeek);
  // dayOfWeek: 0=Sunday..6=Saturday (JS convention). Monday = 1.
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const wibMidnightThisDay = wibMidnightToUtc(year, month, day);
  return wibMidnightThisDay - daysSinceMonday * DAY_MS;
}

export function computeWeekBounds(weekStart: number): { weekStart: number; weekEnd: number } {
  return { weekStart, weekEnd: weekStart + 7 * DAY_MS - 1 };
}

export function isAlignedWeekStart(ms: number): boolean {
  return ms === computeWeekStart(ms);
}
