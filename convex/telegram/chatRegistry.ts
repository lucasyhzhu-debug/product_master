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
