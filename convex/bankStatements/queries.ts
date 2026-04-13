/**
 * bankStatements queries — ALL admin-only per D-19.
 *
 * Bank data is finance-sensitive (account numbers are PII; line details
 * reveal counterparties + amounts). Every query gates on
 * `requireRole(ctx, token, ["admin"])`.
 *
 * `listStatements` returns the 50 most-recent uploads (by_createdAt desc) —
 * typical UI usage is a recent-uploads picker; a bigger page would paginate.
 */

import { v } from "convex/values";
import { query } from "../_generated/server";
import { requireRole } from "../lib/auth";

export const listStatements = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["admin"]);
    return await ctx.db
      .query("bankStatements")
      .withIndex("by_createdAt")
      .order("desc")
      .take(50);
  },
});

export const getStatement = query({
  args: {
    token: v.string(),
    id: v.id("bankStatements"),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["admin"]);
    return await ctx.db.get(args.id);
  },
});

/**
 * Dedup probe — fire after the client computes the file hash, BEFORE showing
 * the review step. Lets the UI surface "already imported on ..." upfront
 * instead of letting the user scroll through preview and click Confirm only
 * to hit the server-side dedup guard in createFromParsedStatement.
 * Returns a minimal shape (no PII leak): { _id, createdAt } or null.
 */
export const findByFileHash = query({
  args: {
    token: v.string(),
    fileHash: v.string(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["admin"]);
    const existing = await ctx.db
      .query("bankStatements")
      .withIndex("by_fileHash", (q) => q.eq("fileHash", args.fileHash))
      .first();
    if (!existing) return null;
    return { _id: existing._id, createdAt: existing.createdAt };
  },
});

export const listLines = query({
  args: {
    token: v.string(),
    statementId: v.id("bankStatements"),
    statusFilter: v.optional(
      v.union(
        v.literal("unmatched"),
        v.literal("auto_matched"),
        v.literal("suggested"),
        v.literal("confirmed"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["admin"]);
    const cursor = args.statusFilter
      ? ctx.db
          .query("bankStatementLines")
          .withIndex("by_statement_status", (q) =>
            q.eq("statementId", args.statementId).eq("status", args.statusFilter!),
          )
      : ctx.db
          .query("bankStatementLines")
          .withIndex("by_statement", (q) => q.eq("statementId", args.statementId));
    return await cursor.order("asc").collect();
  },
});
