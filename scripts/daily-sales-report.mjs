#!/usr/bin/env node
/**
 * Daily Sales Report - CLI formatter
 *
 * Usage:
 *   # Run via Convex (requires deployment):
 *   npx convex run reports/dailySales:getDailySalesSummary --prod | node scripts/daily-sales-report.mjs
 *
 *   # Or fetch from HTTP endpoint:
 *   node scripts/daily-sales-report.mjs --url https://decisive-wombat-7.convex.site/api/daily-sales
 *
 *   # Or pipe JSON directly:
 *   cat data.json | node scripts/daily-sales-report.mjs
 */

import { ConvexHttpClient } from "convex/browser";

const CONVEX_URL = process.env.VITE_CONVEX_URL || "https://decisive-wombat-7.convex.cloud";

async function fetchData() {
  const urlArg = process.argv.find((a) => a.startsWith("--url="));
  if (urlArg) {
    const url = urlArg.split("=")[1];
    const res = await fetch(url);
    return res.json();
  }

  // Check for piped stdin
  if (!process.stdin.isTTY) {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString();
    try {
      return JSON.parse(raw);
    } catch {
      // If it's convex run output, it might have log prefixes
      const jsonStart = raw.indexOf("{");
      if (jsonStart >= 0) return JSON.parse(raw.slice(jsonStart));
      throw new Error("Could not parse input as JSON");
    }
  }

  // Direct Convex query
  console.error("Querying production database...");
  const client = new ConvexHttpClient(CONVEX_URL);
  const { api } = await import("../convex/_generated/api.js");
  return client.query(api.reports.dailySales.getDailySalesSummary);
}

function formatTable(data) {
  const { dates, rows } = data;

  // Shorten dates to MM-DD for display
  const shortDates = dates.map((d) => d.slice(5)); // "2025-01-29" -> "01-29"

  // Column widths
  const productColWidth = Math.max(20, ...rows.map((r) => r.product.length)) + 2;
  const dateColWidth = 6;

  // Header
  const header =
    "Product".padEnd(productColWidth) +
    shortDates.map((d) => d.padStart(dateColWidth)).join("") +
    "  TOTAL".padStart(dateColWidth + 2);

  const separator = "-".repeat(header.length);

  console.log("");
  console.log("=== DAILY SALES SUMMARY REPORT ===");
  console.log(`Orders: ${data.orderCount} | Line items: ${data.itemCount}`);
  console.log(`Date range: ${dates[0]} to ${dates[dates.length - 1]} (${dates.length} days)`);
  console.log("");
  console.log(header);
  console.log(separator);

  // Data rows
  for (const row of rows) {
    const cells = shortDates.map((_, i) => {
      const qty = row.dailySales[dates[i]] || 0;
      return (qty === 0 ? "." : String(qty)).padStart(dateColWidth);
    });
    const line =
      row.product.padEnd(productColWidth) +
      cells.join("") +
      String(row.total).padStart(dateColWidth + 2);
    console.log(line);
  }

  // Totals row
  console.log(separator);
  const dailyTotals = dates.map((d) =>
    rows.reduce((sum, r) => sum + (r.dailySales[d] || 0), 0)
  );
  const grandTotal = rows.reduce((sum, r) => sum + r.total, 0);
  const totalsLine =
    "TOTAL".padEnd(productColWidth) +
    dailyTotals.map((t) => String(t).padStart(dateColWidth)).join("") +
    String(grandTotal).padStart(dateColWidth + 2);
  console.log(totalsLine);
  console.log("");
}

try {
  const data = await fetchData();
  formatTable(data);
} catch (err) {
  console.error("Error:", err.message);
  process.exit(1);
}
