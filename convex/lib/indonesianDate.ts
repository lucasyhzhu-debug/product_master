/**
 * Indonesian date helpers. Used by BCA bank statement parsing (Phase 72)
 * and any future Indonesian-format parsing pipelines.
 * Stubs — implemented in Task 2 (GREEN).
 */

/**
 * Indonesian month abbreviations → 0-indexed month. Keys MUST exactly match
 * BCA's output tokens (`Jan, Feb, Mar, Apr, Mei, Jun, Jul, Agu, Sep, Okt, Nov, Des`).
 * Note Indonesian forms: Mei (not May), Agu (not Aug), Okt (not Oct), Des (not Dec).
 */
export const INDONESIAN_MONTHS: Record<string, number> = {};

/**
 * Parse "DD-Mon" (e.g. "28-Des") with a supplied year into epoch-ms UTC midnight.
 * Throws on invalid month token or day out of range.
 */
export function parseIndonesianDate(_ddMon: string, _year: number): number {
  throw new Error("NOT IMPLEMENTED");
}

/**
 * Year-rollover inference: given a transaction's month index and the statement
 * period's start/end epochs, return the correct year for the transaction.
 *
 * Rule (D-29): if the period crosses a year boundary (periodStart month >
 * periodEnd month, i.e. Dec→Jan), then transactions whose month index is >=
 * the period start's month belong to the start year; otherwise the end year.
 * When no rollover is present, always return the period start's year.
 */
export function resolveYearForRollover(_args: {
  monthIdx: number;
  periodStart: number;
  periodEnd: number;
}): number {
  throw new Error("NOT IMPLEMENTED");
}
