/**
 * Time series bucketing and label formatting helpers.
 * Pure functions for grouping revenue records by time granularity.
 */
import { utcToWibDateStr, utcToWibHourStr, getIsoWeekNumber, utcToWibMonthStr } from "../../lib/periodRange";

export type Granularity = "hourly" | "daily" | "weekly" | "monthly";

/** Get bucket key for a UTC timestamp at the given granularity (WIB-adjusted). */
export function bucketKey(utcMs: number, granularity: Granularity): string {
  switch (granularity) {
    case "hourly": return utcToWibHourStr(utcMs);
    case "daily": return utcToWibDateStr(utcMs);
    case "weekly": return getIsoWeekNumber(utcMs);
    case "monthly": return utcToWibMonthStr(utcMs);
  }
}

/** Format a bucket key into a human-readable label. */
export function formatBucketLabel(key: string, granularity: Granularity): string {
  switch (granularity) {
    case "hourly": {
      // "2026-02-16 14" -> "2pm"
      const hour = parseInt(key.split(" ")[1], 10);
      const suffix = hour >= 12 ? "pm" : "am";
      const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
      return `${h12}${suffix}`;
    }
    case "daily": {
      // YYYY-MM-DD -> "Feb 10"
      const d = new Date(key + "T00:00:00Z");
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    }
    case "weekly":
      return key; // "W06"
    case "monthly": {
      // "2026-02" -> "Feb"
      const d = new Date(key + "-01T00:00:00Z");
      return d.toLocaleDateString("en-US", { month: "short" });
    }
  }
}
