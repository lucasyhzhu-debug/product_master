import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";
import {
  handleGetMenuWebhook,
  handleOrderWebhook,
  handleOrderStateWebhook,
  handleMenuSyncWebhook,
  handleIntegrationStatusWebhook,
  handleMenuPushWebhook,
} from "./integrations/grabfood/webhooks";
import { handleXenditQrPayment } from "./integrations/qris/webhooks";
import { handleTelegramWebhook } from "./telegram/webhook";

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

// ─── GrabFood Webhooks ───────────────────────────────────────────────────────
// 6 webhook routes for GrabFood Partner API integration.
// HMAC validation reads secret from platformCredentials table.

http.route({
  path: "/api/grabfood/menu",
  method: "GET",
  handler: handleGetMenuWebhook,
});

http.route({
  path: "/api/grabfood/order",
  method: "POST",
  handler: handleOrderWebhook,
});

http.route({
  path: "/api/grabfood/order/state",
  method: "POST",
  handler: handleOrderStateWebhook,
});

http.route({
  path: "/api/grabfood/menu-sync",
  method: "POST",
  handler: handleMenuSyncWebhook,
});

http.route({
  path: "/api/grabfood/integration-status",
  method: "POST",
  handler: handleIntegrationStatusWebhook,
});

http.route({
  path: "/api/grabfood/menu/push",
  method: "POST",
  handler: handleMenuPushWebhook,
});

// ─── Xendit QRIS Payment Webhook ─────────────────────────────────────────────
// Inbound paid signal for QRIS orders. PUBLIC endpoint — authenticated by a
// constant-time x-callback-token compare inside the handler (401 on missing/
// invalid token, no state change). The only way a QRIS order reaches
// PaymentReceived; drives the idempotent transition via Plan 03's mutation.

http.route({
  path: "/api/xendit/qr-payment",
  method: "POST",
  handler: handleXenditQrPayment,
});

// ─── Telegram Bot Webhook ────────────────────────────────────────────────────
// Single inbound route for the /pack text command. Token-authenticated via
// X-Telegram-Bot-Api-Secret-Token header (constant-time compare). Idempotent
// dedupe by update_id in convex/telegram/webhook.ts.

http.route({
  path: "/telegram-webhook",
  method: "POST",
  handler: handleTelegramWebhook,
});

export default http;
