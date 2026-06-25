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
 *  founders delivery-progress summary → founders. */
export function roleForKind(kind: ReminderKind): TelegramRole {
  return kind === "weekly-delivery-progress" ? "founders" : "subscription-ops";
}
