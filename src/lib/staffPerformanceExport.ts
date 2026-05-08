/**
 * CSV Export for Staff Performance Report
 *
 * Generates flat-format CSVs with per-staff production summaries
 * suitable for payment calculation in Excel.
 */

import type { StaffPerformanceData } from "@/hooks/convex/useStaffPerformance";
import { downloadCSV, escapeCell } from "./csvExport";
import { utcToWibTimeStr } from "./dateUtils";
import { formatHoursMinutes } from "./utils";

function formatBreakdown(
  items: Array<{ name: string; quantity?: number; grams?: number; unit?: "g" | "pcs" }>,
  unit: string
): string {
  return items
    .map((item) => {
      const value = item.quantity ?? item.grams ?? 0;
      // C1: when the caller supplies a per-item unit, use it; otherwise fall
      // back to the column-wide unit label.
      const suffix = item.unit ? (item.unit === "pcs" ? " pcs" : "g") : unit;
      return `${item.name}: ${String(value)}${suffix}`;
    })
    .join("; ");
}

export function generateStaffPerformanceCSV(data: StaffPerformanceData): string {
  const rows: string[][] = [];

  // Header — C1: grams and pcs are separate columns so aggregation in Excel
  // stays honest when some components are tracked in pcs.
  rows.push([
    "Staff Name",
    "Total Balls Produced",
    "Total Component Grams",
    "Total Component Pieces",
    "Total Component Waste (g)",
    "Total Component Waste (pcs)",
    "Total Product Waste (units)",
    "Shifts",
    "Days Worked",
    "Product Breakdown",
    "Component Breakdown",
    "Component Waste Breakdown",
    "Waste by Reason",
    "Waste by Product",
  ]);

  // Per-staff rows
  for (const staff of data.staff) {
    rows.push([
      staff.chefName,
      String(staff.totalBallsProduced),
      String(staff.totalComponentGrams),
      String(staff.totalComponentPieces),
      String(staff.totalComponentWasteGrams),
      String(staff.totalComponentWastePieces),
      String(staff.totalWaste),
      String(staff.shiftCount),
      String(staff.daysWorked),
      formatBreakdown(staff.productBreakdown.map((p) => ({ name: p.name, quantity: p.ballCount })), " balls"),
      formatBreakdown(staff.componentBreakdown, "g"),
      formatBreakdown(staff.componentWasteBreakdown, "g"),
      staff.wasteByReason.map((w) => `${w.reason}: ${String(w.quantity)}`).join("; "),
      formatBreakdown(staff.wasteProductBreakdown, ""),
    ]);
  }

  // Totals row
  const totals = data.staff.reduce(
    (acc, s) => ({
      balls: acc.balls + s.totalBallsProduced,
      grams: acc.grams + s.totalComponentGrams,
      pieces: acc.pieces + s.totalComponentPieces,
      compWaste: acc.compWaste + s.totalComponentWasteGrams,
      compWastePieces: acc.compWastePieces + s.totalComponentWastePieces,
      waste: acc.waste + s.totalWaste,
      shifts: acc.shifts + s.shiftCount,
    }),
    { balls: 0, grams: 0, pieces: 0, compWaste: 0, compWastePieces: 0, waste: 0, shifts: 0 }
  );

  rows.push([]);
  rows.push([
    "TOTAL",
    String(totals.balls),
    String(totals.grams),
    String(totals.pieces),
    String(totals.compWaste),
    String(totals.compWastePieces),
    String(totals.waste),
    String(totals.shifts),
    "",
    "",
    "",
    "",
    "",
    "",
  ]);

  // Footer
  rows.push([]);
  rows.push([`# Period: ${data.startDate} to ${data.endDate}`]);
  rows.push([`# Total shift records: ${data.totalRecords}`]);
  rows.push([`# Staff count: ${data.staff.length}`]);

  return rows.map((row) => row.map(escapeCell).join(",")).join("\n");
}

export function downloadStaffPerformanceCSV(
  data: StaffPerformanceData,
  periodLabel: string
): void {
  const csv = generateStaffPerformanceCSV(data);
  downloadCSV(csv, `staff-performance-${periodLabel}.csv`);
}

/**
 * Generate a detailed per-staff per-day CSV — one row per (staff, day) submission.
 *
 * Mirrors the per-day breakdown shown on /staff-performance when a staff row is
 * expanded. Designed for overtime / bonus payout calculation in Excel:
 * decimal hours sit alongside HH:MM so SUM formulas work directly, and component
 * columns are pivoted wide so each ball/component type has its own SUM-able column.
 *
 * Component columns are dynamic — the union of `componentTotals[].code` across
 * all staff×days, in first-seen order — matching `PerDayBreakdownTable` (D-14).
 * Each header reads `<name> (<unit>)`, never mixing units in a single column (D-11).
 */
export function generateDetailedStaffCSV(data: StaffPerformanceData): string {
  // Build union of component columns across all staff×days, preserving
  // first-seen order so the CSV layout is stable run-to-run for the same data.
  const columnDefs: Array<{ code: string; name: string; unit: "g" | "pcs" }> = [];
  const seen = new Map<string, number>();
  for (const staff of data.staff) {
    for (const day of staff.perDayBreakdown) {
      for (const c of day.componentTotals) {
        if (!seen.has(c.code)) {
          seen.set(c.code, columnDefs.length);
          columnDefs.push({ code: c.code, name: c.name, unit: c.unit });
        }
      }
    }
  }

  const rows: string[][] = [];

  // Header row
  const header = [
    "Staff Name",
    "Date",
    "Hours (decimal)",
    "Hours (HH:MM)",
    "Sessions",
    "Time Range",
    "Balls",
    ...columnDefs.map((c) => `${c.name} (${c.unit})`),
    "Flagged",
    "Flag Reasons",
  ];
  rows.push(header);

  // Per-staff blocks. Within each staff, perDayBreakdown is already sorted
  // newest-first by aggregateStaffPerformance — preserve that order so CSV
  // matches the on-screen table exactly.
  for (const staff of data.staff) {
    // Per-day rows
    for (const day of staff.perDayBreakdown) {
      const componentByCode = new Map(
        day.componentTotals.map((c) => [c.code, c.quantity]),
      );
      const timeRange = day.sessions
        .map(
          (s) =>
            `${utcToWibTimeStr(s.clockIn)}-${s.clockOut !== null ? utcToWibTimeStr(s.clockOut) : "open"}`,
        )
        .join(", ");
      const flagged = day.sessions.some((s) => s.isFlagged);
      const flagReasons = Array.from(
        new Set(day.sessions.flatMap((s) => s.flagReasons)),
      ).join("; ");

      rows.push([
        staff.chefName,
        day.date,
        day.hoursWorked.toFixed(2),
        formatHoursMinutes(day.hoursWorked),
        String(day.sessions.length),
        timeRange,
        String(day.ballsProduced),
        ...columnDefs.map((c) => {
          const q = componentByCode.get(c.code);
          return q === undefined ? "" : String(q);
        }),
        flagged ? "TRUE" : "FALSE",
        flagReasons,
      ]);
    }

    // Per-staff TOTAL row (matches the UI's TOTAL row inside each expanded staff).
    const totalHours = staff.perDayBreakdown.reduce((a, d) => a + d.hoursWorked, 0);
    const totalSessions = staff.perDayBreakdown.reduce(
      (a, d) => a + d.sessions.length,
      0,
    );
    const totalBalls = staff.perDayBreakdown.reduce(
      (a, d) => a + d.ballsProduced,
      0,
    );
    const totalByCode = new Map<string, number>();
    for (const day of staff.perDayBreakdown) {
      for (const c of day.componentTotals) {
        totalByCode.set(c.code, (totalByCode.get(c.code) ?? 0) + c.quantity);
      }
    }
    rows.push([
      staff.chefName,
      "TOTAL",
      totalHours.toFixed(2),
      formatHoursMinutes(totalHours),
      String(totalSessions),
      "",
      String(totalBalls),
      ...columnDefs.map((c) => {
        const q = totalByCode.get(c.code);
        return q === undefined ? "" : String(q);
      }),
      "",
      "",
    ]);

    // Blank separator between staff blocks
    rows.push([]);
  }

  // Footer metadata
  rows.push([`# Period: ${data.startDate} to ${data.endDate}`]);
  rows.push([`# Staff count: ${data.staff.length}`]);
  rows.push([`# Total shift records: ${data.totalRecords}`]);

  return rows.map((row) => row.map(escapeCell).join(",")).join("\n");
}

export function downloadDetailedStaffCSV(
  data: StaffPerformanceData,
  periodLabel: string
): void {
  const csv = generateDetailedStaffCSV(data);
  downloadCSV(csv, `staff-performance-detailed-${periodLabel}.csv`);
}
