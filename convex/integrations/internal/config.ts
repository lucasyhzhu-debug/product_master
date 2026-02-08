/**
 * Internal Orders Integration Configuration
 *
 * Revenue from our own Convex orders database.
 * No external API calls, no auth tokens, no env vars needed.
 */

/** Order statuses that count as revenue (anything past AwaitingPayment, excluding Cancelled) */
export const REVENUE_COUNTABLE_STATUSES = [
  "Confirmed",
  "InProduction",
  "Boxed",
  "Labeled",
  "WaitingShipment",
  "WaitingPickup",
  "CompleteShipped",
  "PickedUp",
] as const;

export type RevenueCountableStatus = (typeof REVENUE_COUNTABLE_STATUSES)[number];

/** Number of orders to process per saveRevenue mutation call */
export const BATCH_SIZE = 100;
