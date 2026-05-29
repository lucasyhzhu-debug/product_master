import {
  calculatePeriodRange,
  calculateWeekRange,
  calculateMonthRange,
  getWibComponents,
  wibMidnightToUtc,
  WIB_OFFSET_MS,
} from "../../lib/periodRange";

export type Cadence = "daily" | "weekly" | "monthly";

export interface CadenceRange {
  currentStart: number;
  currentEnd: number;
  previousStart: number;
  previousEnd: number;
  periodLabel: string;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Extract WIB date parts from a UTC epoch ms for label building. month is 0-indexed. */
function wibYmd(utcMs: number) {
  const d = new Date(utcMs + WIB_OFFSET_MS);
  return {
    weekday: WEEKDAY[d.getUTCDay()],
    day: d.getUTCDate(),
    month: d.getUTCMonth(), // 0-indexed
    year: d.getUTCFullYear(),
  };
}

/**
 * Resolve a reporting cadence to its WIB-bounded UTC range + a human label.
 *
 * - `daily`   → WIB day containing `now`; currentEnd = now (partial day).
 * - `weekly`  → prior complete Mon–Sun WIB week.
 * - `monthly` → prior complete calendar month (WIB day boundaries).
 *
 * previousStart/previousEnd are set for all cadences (week-before-last / month-before-last).
 * Pure function — `now` is always passed in, never uses Date.now().
 */
export function resolveCadenceRange(cadence: Cadence, now: number): CadenceRange {
  if (cadence === "daily") {
    const r = calculatePeriodRange("today", now);
    const p = wibYmd(r.currentStart);
    return {
      currentStart: r.currentStart,
      currentEnd: r.currentEnd,
      previousStart: r.previousStart,
      previousEnd: r.previousEnd,
      periodLabel: `${p.weekday} ${p.day} ${MONTHS_SHORT[p.month]} ${p.year}`,
    };
  }

  // getWibComponents returns month as 0-indexed (0=Jan, 11=Dec)
  const { year, month, day, dayOfWeek } = getWibComponents(now);

  if (cadence === "weekly") {
    // dayOfWeek: 0=Sun, 1=Mon ... 6=Sat
    const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    // thisWeekMonday: Monday 00:00 WIB of the current WIB week
    const thisWeekMonday = wibMidnightToUtc(year, month, day - daysSinceMonday);
    // lastWeekMonday: one full week prior
    const lastWeekMonday = thisWeekMonday - WEEK_MS;
    const w = calculateWeekRange(lastWeekMonday);
    const s = wibYmd(w.currentStart);
    // w.currentEnd is next Monday 00:00 WIB (exclusive) — subtract 1ms to land on Sunday
    const e = wibYmd(w.currentEnd - 1);
    const sameMonth = s.month === e.month && s.year === e.year;
    const periodLabel = sameMonth
      ? `${s.day}–${e.day} ${MONTHS_SHORT[s.month]} ${s.year}`
      : `${s.day} ${MONTHS_SHORT[s.month]} – ${e.day} ${MONTHS_SHORT[e.month]} ${e.year}`;
    return { ...w, periodLabel };
  }

  // monthly — prior calendar month.
  // month from getWibComponents is 0-indexed. calculateMonthRange also takes 0-indexed month.
  // month - 1 = prior month (Date.UTC handles month=-1 as December of year-1).
  const m = calculateMonthRange(year, month - 1);
  const s = wibYmd(m.currentStart);
  return { ...m, periodLabel: `${MONTHS[s.month]} ${s.year}` };
}
