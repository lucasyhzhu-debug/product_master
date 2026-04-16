/**
 * Phase 74 Staff Attendance — tunable constants.
 *
 * Exported from a dedicated module so that tuning (e.g. lifting the open-shift
 * threshold to 18h if kitchen regularly pulls legitimate 14-16h days) requires
 * no consumer changes.
 */

/** D-18 threshold for "open shift too long" auto-flag. Tunable. */
export const OPEN_SHIFT_THRESHOLD_MS = 16 * 60 * 60 * 1000;

/** WIB (Western Indonesia Time, UTC+7) offset in milliseconds. */
export const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
