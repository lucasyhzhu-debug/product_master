import type { TelegramRole } from "../config";

export const REMINDER_KINDS = [
  "confirm-next-week",
  "invoice-due",
  "today-deliveries",
  "change-cutoff",
  "reconcile",
  "weekly-delivery-progress",
] as const;

export type ReminderKind = (typeof REMINDER_KINDS)[number];

/** Kind → destination Telegram role. The 5 ops nudges → subscription-ops; the
 *  founders delivery-progress summary → founders. A `Record` (not a ternary) so a
 *  new kind added to REMINDER_KINDS is a compile error here until it's routed. */
const ROLE_FOR_KIND: Record<ReminderKind, TelegramRole> = {
  "confirm-next-week": "subscription-ops",
  "invoice-due": "subscription-ops",
  "today-deliveries": "subscription-ops",
  "change-cutoff": "subscription-ops",
  "reconcile": "subscription-ops",
  "weekly-delivery-progress": "founders",
};

export function roleForKind(kind: ReminderKind): TelegramRole {
  return ROLE_FOR_KIND[kind];
}
