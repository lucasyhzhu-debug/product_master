/**
 * Indonesian date helpers. Used by BCA bank statement parsing (Phase 72)
 * and any future Indonesian-format parsing pipelines.
 */

/**
 * Indonesian month abbreviations → 0-indexed month. Keys MUST exactly match
 * BCA's output tokens. Note Indonesian forms: Mei (not May), Agu (not Aug),
 * Okt (not Oct), Des (not Dec).
 */
export const INDONESIAN_MONTHS: Record<string, number> = {
  Jan: 0,
  Feb: 1,
  Mar: 2,
  Apr: 3,
  Mei: 4,
  Jun: 5,
  Jul: 6,
  Agu: 7,
  Sep: 8,
  Okt: 9,
  Nov: 10,
  Des: 11,
};

/**
 * Parse "DD-Mon" (e.g. "28-Des") with a supplied year into epoch-ms UTC midnight.
 * Throws on invalid month token or day out of range.
 */
export function parseIndonesianDate(ddMon: string, year: number): number {
  const trimmed = ddMon.trim();
  const parts = trimmed.split("-");
  if (parts.length !== 2) {
    throw new Error(`Invalid Indonesian date: ${ddMon}`);
  }
  const dayStr = parts[0].trim();
  const monStr = parts[1].trim();
  const day = parseInt(dayStr, 10);
  if (!Number.isFinite(day) || day < 1 || day > 31) {
    throw new Error(`Invalid Indonesian date: ${ddMon}`);
  }
  const monthIdx = INDONESIAN_MONTHS[monStr];
  if (monthIdx === undefined) {
    throw new Error(`Invalid Indonesian date: ${ddMon}`);
  }
  return Date.UTC(year, monthIdx, day);
}

/**
 * Year-rollover inference (D-29): given a transaction's month index and the
 * statement period's start/end epochs, return the correct year for the transaction.
 *
 * Rule: if the period crosses a year boundary (periodStart month > periodEnd
 * month, i.e. Dec→Jan), then transactions whose month index is >= the period
 * start's month belong to the start year; otherwise the end year. When no
 * rollover is present, always return the period start's year.
 */
export function resolveYearForRollover(args: {
  monthIdx: number;
  periodStart: number;
  periodEnd: number;
}): number {
  const { monthIdx, periodStart, periodEnd } = args;
  const startDate = new Date(periodStart);
  const endDate = new Date(periodEnd);
  const startMonth = startDate.getUTCMonth();
  const endMonth = endDate.getUTCMonth();
  const startYear = startDate.getUTCFullYear();
  const endYear = endDate.getUTCFullYear();

  const rollover = startMonth > endMonth;
  if (!rollover) {
    return startYear;
  }
  return monthIdx >= startMonth ? startYear : endYear;
}
