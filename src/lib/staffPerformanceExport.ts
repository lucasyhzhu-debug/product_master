/**
 * CSV Export for Staff Performance Report
 *
 * Generates flat-format CSVs with per-staff production summaries
 * suitable for payment calculation in Excel.
 */

import type { StaffPerformanceData } from "@/hooks/convex/useStaffPerformance";
import { downloadCSV, escapeCell } from "./csvExport";

function formatBreakdown(
  items: Array<{ name: string; quantity?: number; grams?: number }>,
  unit: string
): string {
  return items
    .map((item) => {
      const value = item.quantity ?? item.grams ?? 0;
      return `${item.name}: ${String(value)}${unit}`;
    })
    .join("; ");
}

export function generateStaffPerformanceCSV(data: StaffPerformanceData): string {
  const rows: string[][] = [];

  // Header — Phase 74 additive columns inserted after "Days Worked":
  //   "Hours Worked" | "Days Attended" | "Flagged Shifts" (D-11 / D-12).
  // Columns are additive — existing downstream consumers see no renames or
  // reorderings of the pre-74 layout.
  rows.push([
    "Staff Name",
    "Total Balls Produced",
    "Total Component Grams",
    "Total Component Waste (g)",
    "Total Product Waste (units)",
    "Shifts",
    "Days Worked",
    "Hours Worked",
    "Days Attended",
    "Flagged Shifts",
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
      String(staff.totalComponentWasteGrams),
      String(staff.totalWaste),
      String(staff.shiftCount),
      String(staff.daysWorked),
      // Phase 74 additive fields (default-0 safe for legacy-shape inputs)
      (staff.totalHoursWorked ?? 0).toFixed(1),
      String(staff.daysAttended ?? 0),
      String(staff.flaggedShiftCount ?? 0),
      formatBreakdown(staff.productBreakdown.map((p) => ({ name: p.name, quantity: p.ballCount })), " balls"),
      formatBreakdown(staff.componentBreakdown, "g"),
      formatBreakdown(staff.componentWasteBreakdown, "g"),
      staff.wasteByReason.map((w) => `${w.reason}: ${String(w.quantity)}`).join("; "),
      formatBreakdown(staff.wasteProductBreakdown, ""),
    ]);
  }

  // Totals row — include Phase 74 additive totals for consistency.
  const totals = data.staff.reduce(
    (acc, s) => ({
      balls: acc.balls + s.totalBallsProduced,
      grams: acc.grams + s.totalComponentGrams,
      compWaste: acc.compWaste + s.totalComponentWasteGrams,
      waste: acc.waste + s.totalWaste,
      shifts: acc.shifts + s.shiftCount,
      hours: acc.hours + (s.totalHoursWorked ?? 0),
      daysAttended: acc.daysAttended + (s.daysAttended ?? 0),
      flagged: acc.flagged + (s.flaggedShiftCount ?? 0),
    }),
    { balls: 0, grams: 0, compWaste: 0, waste: 0, shifts: 0, hours: 0, daysAttended: 0, flagged: 0 }
  );

  rows.push([]);
  rows.push([
    "TOTAL",
    String(totals.balls),
    String(totals.grams),
    String(totals.compWaste),
    String(totals.waste),
    String(totals.shifts),
    "",
    totals.hours.toFixed(1),
    String(totals.daysAttended),
    String(totals.flagged),
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
 * Generate a detailed per-staff CSV with one row per product per staff member.
 * Better for Excel pivot tables and payment modelling.
 */
export function generateDetailedStaffCSV(data: StaffPerformanceData): string {
  const rows: string[][] = [];

  rows.push([
    "Staff Name",
    "Type",
    "Item",
    "Quantity",
    "Unit",
  ]);

  for (const staff of data.staff) {
    // Product production rows
    for (const p of staff.productBreakdown) {
      rows.push([staff.chefName, "Production", p.name, String(p.ballCount), "balls"]);
    }

    // Component production rows
    for (const c of staff.componentBreakdown) {
      rows.push([staff.chefName, "Component", c.name, String(c.grams), "g"]);
    }

    // Component waste rows
    for (const c of staff.componentWasteBreakdown) {
      rows.push([staff.chefName, "Component Waste", c.name, String(c.grams), "g"]);
    }

    // Product waste rows (with reason)
    for (const w of staff.wasteByReason) {
      rows.push([staff.chefName, "Product Waste", w.reason, String(w.quantity), "units"]);
    }

    // Summary row
    rows.push([
      staff.chefName,
      "Summary",
      `${staff.shiftCount} shifts / ${staff.daysWorked} days`,
      String(staff.totalBallsProduced),
      "total balls",
    ]);

    // Phase 74 — Attendance section (per-day breakdown). Additive; legacy
    // consumers that only read the 5-column [Staff/Type/Item/Quantity/Unit]
    // header see new rows typed as Type="Attendance" and can ignore them.
    const perDayBreakdown = staff.perDayBreakdown ?? [];
    if (perDayBreakdown.length > 0) {
      for (const day of perDayBreakdown) {
        const flaggedCount = day.sessions.filter((s) => s.isFlagged).length;
        rows.push([
          staff.chefName,
          "Attendance",
          `${day.date} (${day.sessions.length} session${day.sessions.length === 1 ? "" : "s"}${flaggedCount > 0 ? `, ${flaggedCount} flagged` : ""})`,
          day.hoursWorked.toFixed(2),
          "hours",
        ]);
      }
      // Attendance subtotal row — hours + days attended + flagged
      rows.push([
        staff.chefName,
        "Attendance Summary",
        `${staff.daysAttended ?? 0} days attended / ${staff.flaggedShiftCount ?? 0} flagged`,
        (staff.totalHoursWorked ?? 0).toFixed(2),
        "total hours",
      ]);
    }
  }

  // Footer metadata
  rows.push([]);
  rows.push([`# Period: ${data.startDate} to ${data.endDate}`]);
  rows.push([`# Staff count: ${data.staff.length}`]);

  return rows.map((row) => row.map(escapeCell).join(",")).join("\n");
}

export function downloadDetailedStaffCSV(
  data: StaffPerformanceData,
  periodLabel: string
): void {
  const csv = generateDetailedStaffCSV(data);
  downloadCSV(csv, `staff-performance-detailed-${periodLabel}.csv`);
}
