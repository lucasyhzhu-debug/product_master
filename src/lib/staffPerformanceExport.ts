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

  // Header
  rows.push([
    "Staff Name",
    "Total Balls Produced",
    "Total Component Grams",
    "Total Component Waste (g)",
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
      String(staff.totalComponentWasteGrams),
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
      compWaste: acc.compWaste + s.totalComponentWasteGrams,
      waste: acc.waste + s.totalWaste,
      shifts: acc.shifts + s.shiftCount,
    }),
    { balls: 0, grams: 0, compWaste: 0, waste: 0, shifts: 0 }
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
