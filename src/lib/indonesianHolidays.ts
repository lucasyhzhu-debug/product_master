/**
 * Indonesian Public Holidays 2026
 * Source: timeanddate.com/holidays/indonesia/2026
 * Note: Islamic dates are tentative (based on lunar calendar)
 */

export const INDONESIAN_HOLIDAYS_2026 = [
  { date: "2026-01-01", name: "New Year's Day" },
  { date: "2026-01-16", name: "Isra Mikraj Nabi Muhammad" },
  { date: "2026-02-17", name: "Chinese New Year (Imlek)" },
  { date: "2026-03-19", name: "Nyepi (Bali Hindu New Year)" },
  { date: "2026-03-21", name: "Idul Fitri" },
  { date: "2026-03-22", name: "Idul Fitri Holiday" },
  { date: "2026-04-03", name: "Good Friday" },
  { date: "2026-05-01", name: "International Labor Day" },
  { date: "2026-05-14", name: "Ascension of Jesus Christ" },
  { date: "2026-05-27", name: "Idul Adha" },
  { date: "2026-05-31", name: "Waisak Day" },
  { date: "2026-06-01", name: "Pancasila Day" },
  { date: "2026-06-16", name: "Islamic New Year (Muharram)" },
  { date: "2026-08-17", name: "Independence Day" },
  { date: "2026-08-25", name: "Maulid Nabi Muhammad" },
  { date: "2026-12-25", name: "Christmas Day" },
] as const;

const holidayMap: Map<string, string> = new Map(
  INDONESIAN_HOLIDAYS_2026.map((h) => [h.date, h.name])
);

/** Check if a YYYY-MM-DD date string is an Indonesian public holiday */
export function isHoliday(date: string): boolean {
  return holidayMap.has(date);
}

/** Get the holiday name for a YYYY-MM-DD date, or undefined if not a holiday */
export function getHolidayName(date: string): string | undefined {
  return holidayMap.get(date);
}

/** Check if a YYYY-MM-DD date is a weekend (Sat/Sun) or public holiday */
export function isWeekendOrHoliday(date: string): boolean {
  if (holidayMap.has(date)) return true;
  const day = new Date(date + "T00:00:00+07:00").getDay();
  return day === 0 || day === 6;
}

/** Get ISO week number string like "2026-W07" for a YYYY-MM-DD date */
export function getISOWeekString(date: string): string {
  const d = new Date(date + "T00:00:00+07:00");
  const dayNum = d.getDay() || 7;
  d.setDate(d.getDate() + 4 - dayNum);
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}
