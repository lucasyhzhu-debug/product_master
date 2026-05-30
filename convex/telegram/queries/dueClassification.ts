import { WIB_OFFSET_MS } from "../../lib/periodRange";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole-day index in WIB: days since the Unix epoch, shifted into WIB. */
export function wibDayIndex(ms: number): number {
  return Math.floor((ms + WIB_OFFSET_MS) / DAY_MS);
}

export type DueBucket = "overdue" | "today" | "future";

/**
 * Classify a dueDate relative to `nowMs`, in WIB calendar days.
 * Mirrors the kanban board rule (src/components/orders/KanbanCard.tsx →
 * getUrgencyLevel): overdue ⟺ the dueDate's WIB day is strictly before
 * today's WIB day. No grace period.
 */
export function classifyDue(dueDate: number, nowMs: number): DueBucket {
  const due = wibDayIndex(dueDate);
  const today = wibDayIndex(nowMs);
  if (due < today) return "overdue";
  if (due === today) return "today";
  return "future";
}

/** Whole WIB days the dueDate is late by. ≥1 when overdue, ≤0 otherwise. */
export function daysLate(dueDate: number, nowMs: number): number {
  return wibDayIndex(nowMs) - wibDayIndex(dueDate);
}
