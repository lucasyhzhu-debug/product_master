/**
 * Phase 85 — Telegram chat registry mechanics.
 *
 * Houses ALL primitives the registry needs: command parsing, role-to-chatId
 * lookup with env fallback, registerChat / replyStartHelp / touchChatLastSeen
 * webhook handlers, listChats / assignRole / archive / restore / sendTestMessage
 * admin-UI surface, seedChatFromEnv one-shot bootstrap.
 *
 * The OSS Convex Telegram Bot Starter ships this file verbatim — the only
 * Frollie-specific surface is convex/telegram/config.ts (role allowlist + URL).
 *
 * See docs/superpowers/specs/2026-05-27-telegram-self-register-design.md.
 */

import { v, ConvexError } from "convex/values";
import {
  internalQuery,
  internalMutation,
  internalAction,
  query,
  mutation,
  action,
} from "../_generated/server";
import { internal } from "../_generated/api";
import { requireRole } from "../lib/auth";
import { sendTelegramHtml, escapeHtml } from "../lib/telegramHtml";
import {
  KNOWN_TELEGRAM_ROLES,
  isKnownTelegramRole,
  TELEGRAM_ADMIN_URL,
} from "./config";
import type { Doc } from "../_generated/dataModel";

// ─── parseCommand ────────────────────────────────────────────────────────────

export type TelegramCommand = "pack" | "register" | "start";

/**
 * Strict-mode command parse. Accepts /pack /register /start with optional
 * @BotName suffix and surrounding whitespace. Rejects trailing args (typo
 * protection inherited from the original /pack strict-match policy).
 */
export function parseCommand(text: string): TelegramCommand | null {
  const m = /^\/(pack|register|start)(@[A-Za-z0-9_]+)?$/.exec(text.trim());
  return m ? (m[1] as TelegramCommand) : null;
}

// ─── getChatIdByRole ─────────────────────────────────────────────────────────

/**
 * Three-step lookup chain (spec §"getChatIdByRole lookup helper"):
 *   1. Active table row (role match, archivedAt undefined)
 *   2. Env fallback IF TELEGRAM_FALLBACK_ROLE === role AND TELEGRAM_CHAT_ID set
 *   3. Throw
 */
export const getChatIdByRole = internalQuery({
  args: { role: v.string() },
  handler: async (ctx, args): Promise<string> => {
    const row = await ctx.db
      .query("telegramChats")
      .withIndex("by_role_archived", (q) =>
        q.eq("role", args.role).eq("archivedAt", undefined),
      )
      .first();
    if (row) return row.chatId;

    if (
      process.env.TELEGRAM_FALLBACK_ROLE === args.role &&
      process.env.TELEGRAM_CHAT_ID
    ) {
      return process.env.TELEGRAM_CHAT_ID;
    }

    throw new Error(`No Telegram chat assigned to role '${args.role}'`);
  },
});

// ─── touchChatLastSeen ───────────────────────────────────────────────────────

/**
 * UPDATE-only "last seen" stamp. Webhook calls this for every non-command
 * message. Pollution prevention: no insert on unknown chatId (only registered
 * chats should appear in the table; an unknown chatId from a privacy-mode
 * mention is not registration intent).
 */
export const touchChatLastSeen = internalMutation({
  args: { chatId: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("telegramChats")
      .withIndex("by_chatId", (q) => q.eq("chatId", args.chatId))
      .unique();
    if (!row) return;                  // never seen this chat — ignore
    if (row.archivedAt !== undefined) return; // archived rows are inert
    await ctx.db.patch(row._id, { lastSeenAt: Date.now() });
  },
});

// ─── registerChat ────────────────────────────────────────────────────────────

/**
 * Three-state behavior driven by existing row (spec §"registerChat action"):
 *   none           → insert + "Chat registered as <title> ..."
 *   dormant        → patch lastSeenAt + "Already registered (no role)"
 *   live           → patch lastSeenAt + "Already registered as role <role>"
 * All three responses HTML-escape the title (parse_mode HTML XSS prevention).
 */
export const registerChat = internalAction({
  args: {
    chatId: v.string(),
    chatType: v.union(
      v.literal("private"),
      v.literal("group"),
      v.literal("supergroup"),
    ),
    title: v.string(),
    registeredBy: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<void> => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) throw new Error("TELEGRAM_BOT_TOKEN missing");

    const result = await ctx.runMutation(
      internal.telegram.chatRegistry.upsertChatRow,
      args,
    );

    const safeTitle = escapeHtml(args.title);
    let html: string;
    if (result.status === "inserted") {
      html = `✅ Chat registered as <b>${safeTitle}</b> (${args.chatType}). Assign a role at ${TELEGRAM_ADMIN_URL}`;
    } else if (result.status === "dormant") {
      html = `ℹ️ Already registered (no role assigned yet). Assign at ${TELEGRAM_ADMIN_URL}`;
    } else {
      const safeRole = escapeHtml(result.role!);
      html = `ℹ️ Already registered as role <b>${safeRole}</b>. Change at ${TELEGRAM_ADMIN_URL}`;
    }

    await sendTelegramHtml(token, args.chatId, html);
  },
});

/**
 * @internal Implementation detail of `registerChat` — do not call externally.
 * The actual DB write for registerChat. Internal mutation so the action's
 * three-state branch is driven by a single atomic read+write.
 */
export const upsertChatRow = internalMutation({
  args: {
    chatId: v.string(),
    chatType: v.union(
      v.literal("private"),
      v.literal("group"),
      v.literal("supergroup"),
    ),
    title: v.string(),
    registeredBy: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<
    { status: "inserted" } | { status: "dormant" } | { status: "live"; role: string }
  > => {
    const existing = await ctx.db
      .query("telegramChats")
      .withIndex("by_chatId", (q) => q.eq("chatId", args.chatId))
      .unique();
    const now = Date.now();
    if (!existing) {
      await ctx.db.insert("telegramChats", {
        chatId: args.chatId,
        chatType: args.chatType,
        title: args.title,
        registeredBy: args.registeredBy,
        registeredAt: now,
        lastSeenAt: now,
      });
      return { status: "inserted" };
    }
    // Patch lastSeenAt regardless of role state.
    await ctx.db.patch(existing._id, { lastSeenAt: now });
    if (existing.role) {
      return { status: "live", role: existing.role };
    }
    return { status: "dormant" };
  },
});

// ─── replyStartHelp ──────────────────────────────────────────────────────────

/**
 * Reply to /start with a one-line intro pointing at /register. /start is
 * Telegram's default intro action; all OTHER unknown commands get a silent
 * 200-ack (no noise; no false discovery of unimplemented commands).
 */
export const replyStartHelp = internalAction({
  args: { chatId: v.string() },
  handler: async (ctx, args): Promise<void> => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) throw new Error("TELEGRAM_BOT_TOKEN missing");
    await sendTelegramHtml(
      token,
      args.chatId,
      `Hi! I'm FrollieProBot. Send /register@FrollieProBot to register this chat.`,
    );
  },
});
