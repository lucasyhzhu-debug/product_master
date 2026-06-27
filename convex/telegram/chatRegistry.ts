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
import { WIB_OFFSET_MS } from "../lib/periodRange";
import {
  KNOWN_TELEGRAM_ROLES,
  isKnownTelegramRole,
  TELEGRAM_ADMIN_URL,
  TELEGRAM_BOT_USERNAME,
} from "./config";
import type { Doc } from "../_generated/dataModel";

/**
 * Throws ConvexError if `role` is not in KNOWN_TELEGRAM_ROLES. Shared by
 * assignRole, seedChatFromEnv, and seedFromEnvWrite so the allowlist message
 * has a single source (each call site keeps its own defense-in-depth check).
 */
function assertKnownRole(role: string): void {
  if (!isKnownTelegramRole(role)) {
    throw new ConvexError(
      `Unknown telegram role: '${role}'. Must be one of: ${KNOWN_TELEGRAM_ROLES.join(", ")}`,
    );
  }
}

// ─── parseCommand ────────────────────────────────────────────────────────────

export type TelegramCommand = "pack" | "register" | "start" | "sales";

/**
 * Strict-mode command parse. Accepts /pack /register /start /sales with
 * optional @BotName suffix and surrounding whitespace. Rejects trailing args
 * (typo protection inherited from the original /pack strict-match policy).
 */
export function parseCommand(text: string): TelegramCommand | null {
  const m = /^\/(pack|register|start|sales)(@[A-Za-z0-9_]+)?$/.exec(text.trim());
  return m ? (m[1] as TelegramCommand) : null;
}

// ─── envFallback ─────────────────────────────────────────────────────────────

/**
 * Single source of truth for the legacy env-based chat fallback
 * (TELEGRAM_CHAT_ID + TELEGRAM_FALLBACK_ROLE). BOTH resolvers consult this — so
 * delivery (getChatIdByRole: role→chatId) and authorization (getChatAuth:
 * chatId→role) can never drift on which chat the fallback grants which role.
 * That drift is exactly what caused the triple-review C1 dormant-row gap.
 */
function envFallback(): { chatId: string; role: string } | null {
  const role = process.env.TELEGRAM_FALLBACK_ROLE;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  return role && chatId ? { chatId, role } : null;
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

    const fb = envFallback();
    if (fb && fb.role === args.role) return fb.chatId;

    throw new Error(`No Telegram chat assigned to role '${args.role}'`);
  },
});

// ─── getChatAuth ─────────────────────────────────────────────────────────────

/**
 * Authorization lookup for the webhook command gate. One point read on by_chatId.
 * Returns the chat's registration + role + archived state so decideWebhookOutcome
 * can enforce COMMAND_POLICY. Never throws (unknown chat → registered:false).
 *
 * Env-fallback parity with getChatIdByRole: the single TELEGRAM_CHAT_ID chat is
 * authorized for TELEGRAM_FALLBACK_ROLE whenever it has NO *effective* role — i.e.
 * no db row, a dormant row (registered but unassigned), or an archived row. This
 * matches delivery, where getChatIdByRole's `by_role_archived` index skips
 * roleless/archived rows and resolves via env fallback. Without covering the
 * DORMANT case, a self-registered pack-list group would be denied /pack while
 * still being delivered to (triple-review C1). Archived rows expose no effective
 * role (gate also denies via `!archived`), making the contract explicit.
 */
export const getChatAuth = internalQuery({
  args: { chatId: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{ registered: boolean; role?: string; archived: boolean }> => {
    const row = await ctx.db
      .query("telegramChats")
      .withIndex("by_chatId", (q) => q.eq("chatId", args.chatId))
      .unique();
    const archived = row !== null && row.archivedAt !== undefined;

    // Active row with an assigned role → that's the effective role.
    if (row !== null && !archived && row.role !== undefined) {
      return { registered: true, role: row.role, archived: false };
    }

    // No effective role (no row / dormant / archived). Single env-fallback check,
    // sharing envFallback() with getChatIdByRole so the two can't drift — delivery
    // also skips roleless/archived rows and resolves via the same fallback.
    const fb = envFallback();
    if (fb && fb.chatId === args.chatId) {
      return { registered: true, role: fb.role, archived: false };
    }

    return row !== null
      ? { registered: true, role: undefined, archived }
      : { registered: false, archived: false };
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
  handler: async (_ctx, args): Promise<void> => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) throw new Error("TELEGRAM_BOT_TOKEN missing");
    await sendTelegramHtml(
      token,
      args.chatId,
      `Hi! I'm ${TELEGRAM_BOT_USERNAME}. Send /register@${TELEGRAM_BOT_USERNAME} to register this chat.`,
    );
  },
});

// ─── listChats ───────────────────────────────────────────────────────────────

// Auth: explicit `token` arg + requireRole (the QRIS pattern), NOT useSessionQuery
// (which injects sessionId, not token). Spec's API table said useSessionQuery;
// resolved during plan revision — see plan §"Auth pattern".
/**
 * Public-protected query for the admin UI. Returns all rows (filtered client
 * side by includeArchived flag); table is bounded <100 rows so .collect() is
 * cheap. Index lookup on archivedAt alone is unsafe (undefined sorts BEFORE
 * defined values — CLAUDE.md MEMORY).
 */
export const listChats = query({
  args: { token: v.string(), includeArchived: v.boolean() },
  handler: async (ctx, args): Promise<Doc<"telegramChats">[]> => {
    await requireRole(ctx, args.token, ["manager", "admin"]);
    const all = await ctx.db.query("telegramChats").collect();
    if (args.includeArchived) return all;
    return all.filter((r) => r.archivedAt === undefined);
  },
});

// ─── assignRole ──────────────────────────────────────────────────────────────

/**
 * Set, clear, or reassign a chat's role. Two backend guards (spec
 * §"Backend validation invariants"):
 *   1. chatId existence — throws if no row.
 *   2. role allowlist — throws if role not in KNOWN_TELEGRAM_ROLES.
 *
 * Reassignment atomicity: if `forceReassign === true` AND another chat already
 * holds the requested role, BOTH writes happen in this single mutation (Convex
 * serializes on the read set, so no observer sees neither-holder or both-holder).
 */
export const assignRole = mutation({
  args: {
    token: v.string(),
    chatId: v.string(),
    role: v.union(v.string(), v.null()),
    forceReassign: v.optional(v.boolean()),
    // When the target is archived, opt into restoring it (clear archivedAt) as
    // part of the same atomic assign instead of throwing. The admin UI sets this
    // after a "restore and assign?" confirmation.
    restoreIfArchived: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["manager", "admin"]);

    // Guard 2: role allowlist (only when assigning, not clearing)
    if (args.role !== null) assertKnownRole(args.role);

    // Guard 1: target chat exists
    const target = await ctx.db
      .query("telegramChats")
      .withIndex("by_chatId", (q) => q.eq("chatId", args.chatId))
      .unique();
    if (!target) {
      throw new ConvexError(`No registered Telegram chat with id '${args.chatId}'`);
    }

    // Clearing path — allowed even on archived rows (idempotent no-op cleanup).
    if (args.role === null) {
      await ctx.db.patch(target._id, { role: undefined });
      return;
    }

    // Guard 3 (edge case): assigning a role to an archived chat is a silent
    // dead-end (getChatIdByRole skips archived rows) UNLESS the caller opts into
    // restoring it. With restoreIfArchived we clear archivedAt as part of the
    // same atomic assign below; without it we still reject.
    const restoringArchived = target.archivedAt !== undefined;
    if (restoringArchived && !args.restoreIfArchived) {
      throw new ConvexError(
        `Cannot assign a role to an archived chat ('${args.chatId}'). Restore it first.`,
      );
    }

    // Find current holder (if any) of this role (active rows only)
    const currentHolder = await ctx.db
      .query("telegramChats")
      .withIndex("by_role_archived", (q) =>
        q.eq("role", args.role!).eq("archivedAt", undefined),
      )
      .first();

    if (currentHolder && currentHolder._id !== target._id) {
      if (!args.forceReassign) {
        throw new ConvexError(
          `Role '${args.role}' already held by chat '${currentHolder.chatId}'. Pass forceReassign: true to override.`,
        );
      }
      // Atomic reassignment in one mutation
      await ctx.db.patch(currentHolder._id, { role: undefined });
    }
    // Single atomic write: set role, and un-archive if we were asked to restore.
    await ctx.db.patch(target._id, {
      role: args.role,
      ...(restoringArchived ? { archivedAt: undefined } : {}),
    });
  },
});

// ─── archiveChat ─────────────────────────────────────────────────────────────

/**
 * Soft delete: set archivedAt AND clear role atomically. Clearing role
 * prevents archived rows from holding role uniqueness slots, so a new chat
 * can claim the role immediately after archive.
 */
export const archiveChat = mutation({
  args: { token: v.string(), chatId: v.string() },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["manager", "admin"]);
    const row = await ctx.db
      .query("telegramChats")
      .withIndex("by_chatId", (q) => q.eq("chatId", args.chatId))
      .unique();
    if (!row) {
      throw new ConvexError(`No registered Telegram chat with id '${args.chatId}'`);
    }
    await ctx.db.patch(row._id, { archivedAt: Date.now(), role: undefined });
  },
});

// ─── restoreChat ─────────────────────────────────────────────────────────────

export const restoreChat = mutation({
  args: { token: v.string(), chatId: v.string() },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["manager", "admin"]);
    const row = await ctx.db
      .query("telegramChats")
      .withIndex("by_chatId", (q) => q.eq("chatId", args.chatId))
      .unique();
    if (!row) {
      throw new ConvexError(`No registered Telegram chat with id '${args.chatId}'`);
    }
    await ctx.db.patch(row._id, { archivedAt: undefined });
  },
});

// ─── sendTestMessage ─────────────────────────────────────────────────────────

/**
 * Diagnostic test-send from admin UI. Populates `lastError` on failure so the
 * UI can render the inline error row. Truncates error message to 200 chars +
 * ellipsis (spec §"Backend behavior", staffreview refinement).
 */
export const sendTestMessage = action({
  args: { token: v.string(), chatId: v.string() },
  handler: async (ctx, args): Promise<void> => {
    // Step 1: auth + existence check via internal query (mirror QRIS pattern).
    await ctx.runQuery(internal.telegram.chatRegistry.requireChatRow, {
      token: args.token,
      chatId: args.chatId,
    });
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) throw new Error("TELEGRAM_BOT_TOKEN missing");

    const wibTime = new Date(Date.now() + WIB_OFFSET_MS)
      .toISOString().slice(11, 19); // HH:MM:SS in WIB
    const text = `🧪 Test from ${TELEGRAM_BOT_USERNAME} — wiring works! Sent at ${wibTime} WIB.`;

    try {
      await sendTelegramHtml(botToken, args.chatId, text);
      await ctx.runMutation(internal.telegram.chatRegistry.clearLastError, {
        chatId: args.chatId,
      });
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      const message = raw.length > 200 ? raw.slice(0, 199) + "…" : raw;
      await ctx.runMutation(internal.telegram.chatRegistry.recordLastError, {
        chatId: args.chatId,
        message,
      });
      throw err;
    }
  },
});

/**
 * @internal Implementation detail of `sendTestMessage` — do not call externally.
 * Auth-gated existence check (mirror QRIS: the action is a raw `action`, so we
 * gate via an internal query that runs requireRole + the existence check in one
 * place).
 */
export const requireChatRow = internalQuery({
  args: { token: v.string(), chatId: v.string() },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["manager", "admin"]);
    const row = await ctx.db
      .query("telegramChats")
      .withIndex("by_chatId", (q) => q.eq("chatId", args.chatId))
      .unique();
    if (!row) {
      throw new ConvexError(`No registered Telegram chat with id '${args.chatId}'`);
    }
    return row;
  },
});

/**
 * @internal Implementation detail of `sendTestMessage` — do not call externally.
 * Writes `lastError`; the action calls this on caught failure.
 */
export const recordLastError = internalMutation({
  args: { chatId: v.string(), message: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("telegramChats")
      .withIndex("by_chatId", (q) => q.eq("chatId", args.chatId))
      .unique();
    if (!row) return;
    await ctx.db.patch(row._id, {
      lastError: { at: Date.now(), message: args.message },
    });
  },
});

/**
 * @internal Implementation detail of `sendTestMessage` — do not call externally.
 * Clears `lastError` after a successful send so the UI's "Error" badge (24h
 * freshness window) doesn't persist past a recovery.
 */
export const clearLastError = internalMutation({
  args: { chatId: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("telegramChats")
      .withIndex("by_chatId", (q) => q.eq("chatId", args.chatId))
      .unique();
    if (!row || row.lastError === undefined) return;
    await ctx.db.patch(row._id, { lastError: undefined });
  },
});

// ─── sendAnnouncement ────────────────────────────────────────────────────────

/**
 * @internal Auth + role→chat resolution for `sendAnnouncement`. Mirrors
 * `requireChatRow` (manager/admin gate via an internal query so the raw action
 * stays thin) but resolves the destination by ROLE rather than a caller-supplied
 * chatId — so the UI never passes a chat literal and the send always targets
 * whatever chat currently holds the role (same `by_role_archived` lookup as
 * `getChatIdByRole`). Throws if the role is unknown or unassigned.
 */
export const requireRoleAndResolveChat = internalQuery({
  args: { token: v.string(), role: v.string() },
  handler: async (ctx, args): Promise<{ chatId: string; title: string }> => {
    await requireRole(ctx, args.token, ["manager", "admin"]);
    if (!isKnownTelegramRole(args.role)) {
      throw new ConvexError(`Unknown Telegram role '${args.role}'`);
    }
    const row = await ctx.db
      .query("telegramChats")
      .withIndex("by_role_archived", (q) =>
        q.eq("role", args.role).eq("archivedAt", undefined),
      )
      .first();
    if (!row) {
      throw new ConvexError(
        `No active Telegram chat is assigned to role '${args.role}'. Assign one first.`,
      );
    }
    return { chatId: row.chatId, title: row.title };
  },
});

/**
 * Send a one-off announcement (manager/admin) to the chat that currently holds
 * `role`. The destination is resolved server-side by role (never a UI-supplied
 * chat id), and the bot token stays server-side. `text` is sent with Telegram's
 * HTML parse mode — basic tags (<b>, <i>, <a>) are supported; the caller is a
 * trusted admin. Records/clears `lastError` like `sendTestMessage` so the admin
 * table's Error badge reflects delivery health.
 */
export const sendAnnouncement = action({
  args: { token: v.string(), role: v.string(), text: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{ ok: true; chatId: string; title: string }> => {
    if (args.text.trim().length === 0) {
      throw new ConvexError("Announcement text is empty");
    }
    const { chatId, title } = await ctx.runQuery(
      internal.telegram.chatRegistry.requireRoleAndResolveChat,
      { token: args.token, role: args.role },
    );
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) throw new Error("TELEGRAM_BOT_TOKEN missing");

    try {
      await sendTelegramHtml(botToken, chatId, args.text);
      await ctx.runMutation(internal.telegram.chatRegistry.clearLastError, {
        chatId,
      });
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      const message = raw.length > 200 ? raw.slice(0, 199) + "…" : raw;
      await ctx.runMutation(internal.telegram.chatRegistry.recordLastError, {
        chatId,
        message,
      });
      throw err;
    }
    return { ok: true, chatId, title };
  },
});

// ─── seedChatFromEnv ─────────────────────────────────────────────────────────

type SeedResult =
  | { status: "inserted"; chatId: string; title: string; role: string }
  | { status: "graduated-dormant"; chatId: string; title: string; role: string }
  | { status: "already-exists-same-role"; chatId: string; title: string; role: string };

/**
 * One-time bootstrap (Convex dashboard → Functions tab). Reads TELEGRAM_CHAT_ID
 * env, calls Telegram getChat to discover title+type, then INSERT / GRADUATE /
 * NO-OP / THROW per spec §"seedChatFromEnv" 4-row-state table.
 */
export const seedChatFromEnv = internalAction({
  args: { role: v.string() },
  handler: async (ctx, args): Promise<SeedResult> => {
    // 1. Validate role
    assertKnownRole(args.role);
    // 2. Env presence
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!token) throw new Error("TELEGRAM_BOT_TOKEN env var missing");
    if (!chatId) throw new Error("TELEGRAM_CHAT_ID env var missing");

    // 3. Discover title + type via Telegram getChat
    const res = await fetch(
      `https://api.telegram.org/bot${token}/getChat?chat_id=${encodeURIComponent(chatId)}`,
    );
    const json = (await res.json()) as {
      ok: boolean;
      result?: { type: string; title?: string };
      description?: string;
    };
    if (!res.ok || !json.ok || !json.result) {
      throw new Error(
        `Telegram getChat failed: ${res.status} ${json.description ?? "unknown"}`,
      );
    }
    const rawType = json.result.type;
    if (rawType !== "private" && rawType !== "group" && rawType !== "supergroup") {
      throw new Error(`Unsupported chat type from Telegram: ${rawType}`);
    }
    const title = json.result.title ?? "(untitled)";

    // 4. Branch on row state
    return await ctx.runMutation(
      internal.telegram.chatRegistry.seedFromEnvWrite,
      { chatId, chatType: rawType, title, role: args.role },
    );
  },
});

/**
 * @internal Implementation detail of `seedChatFromEnv` — do not call externally.
 * Performs the 4-row-state branch (insert / graduate / no-op / throw) in one
 * atomic mutation after the action discovers title+type from Telegram getChat.
 */
export const seedFromEnvWrite = internalMutation({
  args: {
    chatId: v.string(),
    chatType: v.union(v.literal("private"), v.literal("group"), v.literal("supergroup")),
    title: v.string(),
    role: v.string(),
  },
  handler: async (ctx, args): Promise<SeedResult> => {
    assertKnownRole(args.role);
    const now = Date.now();
    const existing = await ctx.db
      .query("telegramChats")
      .withIndex("by_chatId", (q) => q.eq("chatId", args.chatId))
      .unique();

    if (!existing) {
      await ctx.db.insert("telegramChats", {
        chatId: args.chatId,
        chatType: args.chatType,
        title: args.title,
        role: args.role,
        registeredAt: now,
        lastSeenAt: now,
      });
      return { status: "inserted", chatId: args.chatId, title: args.title, role: args.role };
    }

    if (existing.role === undefined) {
      // Graduate a dormant row. Clear archivedAt too: if this chat was archived,
      // seeding it as the role-holder must reactivate it — otherwise
      // getChatIdByRole (which skips archived rows) would never resolve it and
      // delivery would be silently broken despite the "success" return.
      await ctx.db.patch(existing._id, {
        role: args.role,
        lastSeenAt: now,
        archivedAt: undefined,
      });
      return {
        status: "graduated-dormant",
        chatId: args.chatId,
        title: existing.title,
        role: args.role,
      };
    }

    if (existing.role === args.role) {
      return {
        status: "already-exists-same-role",
        chatId: args.chatId,
        title: existing.title,
        role: args.role,
      };
    }

    throw new ConvexError(
      `Chat ${args.chatId} already registered with role '${existing.role}'. Use /admin/telegram-chats to reassign.`,
    );
  },
});
