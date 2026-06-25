/**
 * Shared CRM status-badge palettes + funding-row sort.
 *
 * Single source of truth for the colour maps and sort previously duplicated
 * across SubscriptionPage, SubscriptionSchedulePage, CrmFundingDashboardPage,
 * and CrmHome (CRM principle B6 — one taxonomy, like platformColors.ts).
 */

/**
 * Week-lifecycle status → Tailwind badge classes.
 *
 * Canonical palette resolves the previous SubscriptionPage vs
 * SubscriptionSchedulePage divergence (delivering: indigo↔teal,
 * reconciled: teal↔gray). Chosen so the lifecycle reads as a clean
 * progression with a distinct colour for the active "delivering" state and
 * muted greys for the terminal "reconciled"/"closed" states:
 *   planned → confirmed → invoiced → paid → delivering → reconciled → closed
 */
export const WEEK_STATUS_BADGE: Record<string, string> = {
  planned: "bg-blue-100 text-blue-700",
  confirmed: "bg-amber-100 text-amber-700",
  invoiced: "bg-purple-100 text-purple-700",
  paid: "bg-green-100 text-green-700",
  delivering: "bg-teal-100 text-teal-700",
  reconciled: "bg-gray-100 text-gray-600",
  closed: "bg-gray-100 text-gray-500",
};

/** Funding-dashboard status → badge classes (subset shown on funding surfaces). */
export const FUNDING_STATUS_BADGE: Record<string, string> = {
  confirmed: "bg-amber-100 text-amber-700",
  invoiced: "bg-purple-100 text-purple-700",
};

/** Funding-dashboard status → human label. */
export const FUNDING_STATUS_LABEL: Record<string, string> = {
  confirmed: "Needs invoice",
  invoiced: "Awaiting payment",
};

/**
 * Sort funding rows: status priority (invoiced first), then weekStart ascending.
 * Stable across reactive updates. Generic over the minimal row shape so both
 * the funding dashboard and CRM home row types satisfy it.
 */
export function sortFundingRows<T extends { week: { status: string; weekStart: number } }>(
  rows: T[],
): T[] {
  return [...rows].sort((a, b) => {
    const statusOrder = (s: string) => (s === "invoiced" ? 0 : 1);
    const sd = statusOrder(a.week.status) - statusOrder(b.week.status);
    if (sd !== 0) return sd;
    return a.week.weekStart - b.week.weekStart;
  });
}
