import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";

const http = httpRouter();

http.route({
  path: "/api/daily-sales",
  method: "GET",
  handler: httpAction(async (ctx) => {
    const data = await ctx.runQuery(api.reports.dailySales.getDailySalesSummary);
    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }),
});

http.route({
  path: "/api/daily-sales-csv",
  method: "GET",
  handler: httpAction(async (ctx) => {
    const data = await ctx.runQuery(api.reports.dailySales.getDailySalesSummary);

    // Build CSV
    const headers = ["Product", ...data.dates, "TOTAL"];
    const csvRows = [headers.join(",")];
    for (const row of data.rows) {
      const cells = [
        `"${row.product.replace(/"/g, '""')}"`,
        ...data.dates.map((d: string) => String(row.dailySales[d] || 0)),
        String(row.total),
      ];
      csvRows.push(cells.join(","));
    }

    // Add totals row
    const dailyTotals = data.dates.map((d: string) =>
      String(data.rows.reduce((sum: number, r: { dailySales: Record<string, number> }) => sum + (r.dailySales[d] || 0), 0))
    );
    const grandTotal = String(data.rows.reduce((sum: number, r: { total: number }) => sum + r.total, 0));
    csvRows.push(['"TOTAL"', ...dailyTotals, grandTotal].join(","));

    return new Response(csvRows.join("\n"), {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": 'attachment; filename="daily_sales_report.csv"',
        "Access-Control-Allow-Origin": "*",
      },
    });
  }),
});

export default http;
