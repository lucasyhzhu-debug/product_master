/**
 * Phase 85 — single source of truth for app-level Telegram role allowlist
 * and admin-UI URL. Designed portable: when extracted to the OSS Convex
 * Telegram Bot Starter, only this file's contents change (roles become [],
 * URL reads from env). See docs/telegram/self-register-porting.md.
 */

export const KNOWN_TELEGRAM_ROLES = [
  "pack-list",
  "sales-updates",
] as const;

export type TelegramRole = (typeof KNOWN_TELEGRAM_ROLES)[number];

export function isKnownTelegramRole(s: string): s is TelegramRole {
  return (KNOWN_TELEGRAM_ROLES as readonly string[]).includes(s);
}

/**
 * URL the bot includes in `/register` reply — points to the admin UI page.
 * Frollie hardcodes the prod URL; OSS-starter consumers read from env.
 */
export const TELEGRAM_ADMIN_URL = "https://recipe.frollie.com/admin/telegram-chats";

/**
 * Bot username (without @). Used in the /start help reply and test-send message.
 * Frollie hardcodes it here; OSS-starter consumers read from env. Keeping it in
 * config.ts (not chatRegistry.ts) preserves the "chatRegistry ships verbatim" claim.
 */
export const TELEGRAM_BOT_USERNAME = "FrollieProBot";
