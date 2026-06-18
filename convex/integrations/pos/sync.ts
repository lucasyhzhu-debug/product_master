"use node";
import { v } from "convex/values";
import { action, internalAction } from "../../_generated/server";
import { internal } from "../../_generated/api";
import type { ActionCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { buildPosSalesRecords, buildPosRefundRecords } from "./recordBuilders";
import { posTransactionsPageSchema, posRefundsPageSchema } from "./contractSchema";
import type { PosTransactionsPage, PosRefundsPage } from "./types";

const LIMIT = 500;
const MAX_PAGES_PER_RUN = 50;

async function fetchJson(baseUrl: string, token: string, path: string, cursor?: string) {
  const res = await fetch(
    `${baseUrl}${path}?cursor=${encodeURIComponent(cursor ?? "")}&limit=${LIMIT}`,
    { method: "GET", headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`POS ${res.status} on ${path}`);
  return res.json();
}

/** Write one normalized sales page: batched parent upsert + per-new-parent children. */
async function applySalesPage(ctx: ActionCtx, page: PosTransactionsPage, syncLogId: Id<"externalSyncLogs">) {
  const built = buildPosSalesRecords(page, syncLogId);
  if (built.length === 0) return;
  const saved = await ctx.runMutation(internal.externalData.mutations.saveRevenue, {
    records: built.map((b) => b.record),
  });
  for (let i = 0; i < built.length; i++) {
    const { id, isNew } = saved[i];
    if (!isNew) {
      const has = await ctx.runQuery(internal.externalData.queries.hasExternalRevenueItemsQuery, {
        revenueId: id as Id<"externalRevenue">,
      });
      if (has) continue;   // existence guard — re-pulled parent already has children
    }
    await ctx.runMutation(internal.externalData.mutations.saveRevenueItemsWithCounts, {
      revenueId: id as Id<"externalRevenue">, items: built[i].items,
    });
  }
}

/** Write one normalized refunds page: parent-only (negative gross), no children. */
async function applyRefundsPage(ctx: ActionCtx, page: PosRefundsPage, syncLogId: Id<"externalSyncLogs">) {
  const built = buildPosRefundRecords(page, syncLogId);
  if (built.length === 0) return;
  await ctx.runMutation(internal.externalData.mutations.saveRevenue, {
    records: built.map((b) => b.record),
  });
}

export const syncPosRevenue = internalAction({
  args: { triggeredBy: v.optional(v.string()) },
  handler: async (ctx, { triggeredBy }) => {
    const startTime = Date.now();
    const baseUrl = process.env.POS_API_BASE_URL;
    const cred = await ctx.runQuery(internal.platformCredentials.queries.getCredentialsInternal, { platformId: "pos" });
    const token = cred?.currentToken;
    if (!baseUrl || !token) { console.warn("POS sync: missing base URL or token — no-op"); return; }

    const syncLogId = await ctx.runMutation(internal.externalData.mutations.createSyncLog, {
      source: "pos", syncType: triggeredBy === "cron" ? "cron" : "manual",
      status: "started", triggeredBy: triggeredBy ?? "manual", timestamp: startTime,
    });

    try {
      const cp = await ctx.runQuery(internal.integrations.pos.checkpoint.getCheckpoint, {});
      // Phase A — sales
      let cursor = cp?.salesCursor; let pages = 0;
      while (pages < MAX_PAGES_PER_RUN) {
        const page = posTransactionsPageSchema.parse(
          await fetchJson(baseUrl, token, "/api/v1/transactions", cursor)) as PosTransactionsPage;
        await applySalesPage(ctx, page, syncLogId);
        pages++;
        if (page.nextCursor === null) break;             // caught up — leave cursor at last non-null
        cursor = page.nextCursor;
        await ctx.runMutation(internal.integrations.pos.checkpoint.persistSalesCursor, { cursor });
      }
      // Phase B — refunds
      cursor = cp?.refundsCursor; pages = 0;
      while (pages < MAX_PAGES_PER_RUN) {
        const page = posRefundsPageSchema.parse(
          await fetchJson(baseUrl, token, "/api/v1/refunds", cursor)) as PosRefundsPage;
        await applyRefundsPage(ctx, page, syncLogId);
        pages++;
        if (page.nextCursor === null) break;
        cursor = page.nextCursor;
        await ctx.runMutation(internal.integrations.pos.checkpoint.persistRefundsCursor, { cursor });
      }
      await ctx.runMutation(internal.externalData.mutations.updateSyncLog, {
        logId: syncLogId, status: "success", durationMs: Date.now() - startTime,
      });
    } catch (e) {
      await ctx.runMutation(internal.externalData.mutations.updateSyncLog, {
        logId: syncLogId, status: "error", errorMessage: String(e), durationMs: Date.now() - startTime,
      });
      // cursor left at last persisted page — self-healing resume
    }
  },
});

// Public admin trigger. NO protectedAction in this project — gate via an internal
// query that runs requireRole (mirror qrisPayments/actions.ts:29-31).
export const triggerPosSync = action({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    await ctx.runQuery(internal.integrations.pos.checkpoint.assertAdmin, { token });
    await ctx.runAction(internal.integrations.pos.sync.syncPosRevenue, { triggeredBy: "manual" });
  },
});
