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

/**
 * Commercial / Sales Dates 2026
 * Includes sequential dates (1/1 through 12/12), Valentine's Day, and Singles' Day.
 * Note: Some overlap with public holidays (e.g., 01-01 is New Year). Public holiday
 * takes precedence for naming but the day still counts for demand patterns.
 */
export const COMMERCIAL_DATES_2026 = [
  { date: "2026-01-01", name: "1.1" },
  { date: "2026-02-02", name: "2.2" },
  { date: "2026-02-14", name: "Valentine's Day" },
  { date: "2026-03-03", name: "3.3" },
  { date: "2026-04-04", name: "4.4" },
  { date: "2026-05-05", name: "5.5" },
  { date: "2026-06-06", name: "6.6" },
  { date: "2026-07-07", name: "7.7" },
  { date: "2026-08-08", name: "8.8" },
  { date: "2026-09-09", name: "9.9" },
  { date: "2026-10-10", name: "10.10" },
  { date: "2026-11-11", name: "11.11 Singles' Day" },
  { date: "2026-12-12", name: "12.12" },
] as const;

const holidayMap: Map<string, string> = new Map(
  INDONESIAN_HOLIDAYS_2026.map((h) => [h.date, h.name])
);

const commercialDateMap: Map<string, string> = new Map(
  COMMERCIAL_DATES_2026.map((c) => [c.date, c.name])
);

/** Check if a YYYY-MM-DD date string is an Indonesian public holiday */
export function isHoliday(date: string): boolean {
  return holidayMap.has(date);
}

/** Get the holiday name for a YYYY-MM-DD date, or undefined if not a holiday */
export function getHolidayName(date: string): string | undefined {
  return holidayMap.get(date);
}

/** Get the commercial date name for a YYYY-MM-DD date, or undefined */
export function getCommercialDateName(date: string): string | undefined {
  return commercialDateMap.get(date);
}

/** Check if a YYYY-MM-DD date is a weekend (Sat/Sun) or public holiday */
export function isWeekendOrHoliday(date: string): boolean {
  if (holidayMap.has(date)) return true;
  const day = new Date(date + "T00:00:00+07:00").getDay();
  return day === 0 || day === 6;
}

/**
 * Classify a YYYY-MM-DD date into a day type for demand pattern purposes.
 * Priority: holiday > sales_date > weekend > weekday
 */
export function getDayType(
  date: string
): "weekday" | "weekend" | "holiday" | "sales_date" {
  if (holidayMap.has(date)) return "holiday";
  if (commercialDateMap.has(date)) return "sales_date";
  const day = new Date(date + "T00:00:00+07:00").getDay();
  if (day === 0 || day === 6) return "weekend";
  return "weekday";
}

/**
 * Get the event name for a date (holiday name or commercial date name).
 * Holiday takes precedence if date is both.
 */
export function getEventName(date: string): string | undefined {
  return holidayMap.get(date) ?? commercialDateMap.get(date);
}

/**
 * Get the demand multiplier for a date based on its day type.
 * - weekday: 1.0 (baseline)
 * - weekend: 2.5
 * - holiday: 2.5
 * - sales_date: 2.5
 */
export function getDemandMultiplier(date: string): number {
  const dayType = getDayType(date);
  if (dayType === "weekday") return 1.0;
  return 2.5;
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
