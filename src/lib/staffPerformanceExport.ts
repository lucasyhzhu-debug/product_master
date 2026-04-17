/**
 * CSV Export for Staff Performance Report
 *
 * Generates flat-format CSVs with per-staff production summaries
 * suitable for payment calculation in Excel.
 */

import type { StaffPerformanceData } from "@/hooks/convex/useStaffPerformance";
import { downloadCSV, escapeCell } from "./csvExport";

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

    // Component production rows — C1: use per-component unit so pcs entries
    // export with the correct suffix.
    for (const c of staff.componentBreakdown) {
      rows.push([staff.chefName, "Component", c.name, String(c.grams), c.unit ?? "g"]);
    }

    // Component waste rows
    for (const c of staff.componentWasteBreakdown) {
      rows.push([staff.chefName, "Component Waste", c.name, String(c.grams), c.unit ?? "g"]);
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
