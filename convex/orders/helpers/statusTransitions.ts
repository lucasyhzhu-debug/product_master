/**
 * Order Status Transitions Helper
 *
 * Centralizes order status management, audit logging, and state machine logic.
 */

import type { MutationCtx } from "../../_generated/server";
import type { Doc, Id } from "../../_generated/dataModel";

// ============================================
// Constants
// ============================================

export const TERMINAL_STATUSES = ["CompleteShipped", "PickedUp", "Cancelled"] as const;
export type TerminalStatus = typeof TERMINAL_STATUSES[number];

export const ALL_ORDER_STATUSES = [
  "Draft",
  "AwaitingPayment",
  "Confirmed",
  "InProduction",
  "Boxed",
  "Labeled",
  "Packaging",
  "WaitingShipment",
  "WaitingPickup",
  "CompleteShipped",
  "PickedUp",
  "Cancelled",
] as const;
export type OrderStatus = typeof ALL_ORDER_STATUSES[number];

// ============================================
// Status Checks
// ============================================

/**
 * Check if status is terminal (cannot be cancelled from).
 */
export function isTerminalStatus(status: string): status is TerminalStatus {
  return TERMINAL_STATUSES.includes(status as TerminalStatus);
}

/**
 * Check if an order can be cancelled.
 */
export function canCancelOrder(order: Doc<"orders">): boolean {
  return !isTerminalStatus(order.status);
}

/**
 * Compute whether an order with the given status should be visible in the kitchen view.
 * Kitchen shows: Draft, Confirmed, InProduction, Packaging, Boxed, Labeled, WaitingShipment, WaitingPickup.
 * Kitchen hides: AwaitingPayment, ProductionComplete, CompleteShipped, PickedUp, Cancelled.
 *
 * Note: CompleteShipped/PickedUp return false here, but the kitchen query separately
 * fetches completed-today orders (terminal status with completedAt >= midnight).
 */
export function computeIsKitchenVisible(status: string): boolean {
  const kitchenVisibleStatuses = new Set([
    "Draft",
    "Confirmed",
    "InProduction",
    "Packaging",
    "Boxed",
    "Labeled",
    "WaitingShipment",
    "WaitingPickup",
  ]);
  return kitchenVisibleStatuses.has(status);
}

// ============================================
// Audit Logging
// ============================================

export interface LogOrderEventOptions {
  fromStatus?: string;
  toStatus?: string;
  reason?: string;
  category?: string;
  metadata?: Record<string, unknown>;
  triggeredBy?: "user" | "kitchen" | "system";
}

/**
 * Log an order event to the audit trail.
 * Used for tracking status changes, auto-transitions, and other significant events.
 */
export async function logOrderEvent(
  ctx: MutationCtx,
  orderId: Id<"orders">,
  eventType: string,
  options: LogOrderEventOptions = {}
): Promise<Id<"orderEvents">> {
  return await ctx.db.insert("orderEvents", {
    orderId,
    eventType,
    fromStatus: options.fromStatus,
    toStatus: options.toStatus,
    reason: options.reason,
    category: options.category,
    metadata: options.metadata ? JSON.stringify(options.metadata) : undefined,
    timestamp: Date.now(),
    triggeredBy: options.triggeredBy ?? "system",
  });
}

/**
 * Log a status transition event.
 * Convenience wrapper for logOrderEvent with status_change type.
 */
export async function logStatusTransition(
  ctx: MutationCtx,
  orderId: Id<"orders">,
  fromStatus: string,
  toStatus: string,
  reason: string,
  triggeredBy: "user" | "kitchen" | "system" = "system"
): Promise<void> {
  await logOrderEvent(ctx, orderId, "status_change", {
    fromStatus,
    toStatus,
    reason,
    triggeredBy,
  });
}

/**
 * Log an auto-transition event (triggered by kitchen/system).
 */
export async function logAutoTransition(
  ctx: MutationCtx,
  orderId: Id<"orders">,
  fromStatus: string,
  toStatus: string,
  reason: string,
  triggeredBy: "kitchen" | "system" = "kitchen"
): Promise<void> {
  await logOrderEvent(ctx, orderId, "status_auto_transition", {
    fromStatus,
    toStatus,
    reason,
    triggeredBy,
  });
}

// ============================================
// Status Transition Helpers
// ============================================

/**
 * Transition order to InProduction status.
 * Used when first ball is filled.
 */
export async function transitionToInProduction(
  ctx: MutationCtx,
  order: Doc<"orders">,
  reason: string = "First ball filled - production started"
): Promise<void> {
  if (order.status !== "Confirmed") {
    return; // Only transition from Confirmed
  }

  await ctx.db.patch(order._id, {
    status: "InProduction",
    isKitchenVisible: computeIsKitchenVisible("InProduction"),
  });
  await logAutoTransition(ctx, order._id, "Confirmed", "InProduction", reason, "kitchen");
}

/**
 * Transition order to Packaging status.
 * DEPRECATED: Use transitionToBoxed instead.
 * Marks all items as production complete.
 */
export async function transitionToPackaging(
  ctx: MutationCtx,
  order: Doc<"orders">,
  items: Doc<"orderItems">[],
  reason: string = "All balls complete - ready for packaging"
): Promise<void> {
  const fromStatus = order.status;

  await ctx.db.patch(order._id, {
    status: "Packaging",
    isKitchenVisible: computeIsKitchenVisible("Packaging"),
  });
  await logAutoTransition(ctx, order._id, fromStatus, "Packaging", reason, "kitchen");

  // Mark all items as production complete
  for (const item of items) {
    await ctx.db.patch(item._id, { isProductionComplete: true });
  }
}

/**
 * Transition order to Boxed status.
 * Triggered when all packages are filled and boxed.
 */
export async function transitionToBoxed(
  ctx: MutationCtx,
  order: Doc<"orders">,
  reason: string = "All packages boxed - ready for stickering"
): Promise<void> {
  const fromStatus = order.status;

  await ctx.db.patch(order._id, {
    status: "Boxed",
    isKitchenVisible: computeIsKitchenVisible("Boxed"),
  });
  await logAutoTransition(ctx, order._id, fromStatus, "Boxed", reason, "kitchen");
}

/**
 * Transition order to Labeled status.
 * Triggered when stickers are applied to all boxes.
 */
export async function transitionToLabeled(
  ctx: MutationCtx,
  order: Doc<"orders">,
  reason: string = "All boxes labeled - ready for shipment"
): Promise<void> {
  if (order.status !== "Boxed") {
    return; // Only transition from Boxed
  }

  await ctx.db.patch(order._id, {
    status: "Labeled",
    isKitchenVisible: computeIsKitchenVisible("Labeled"),
  });
  await logAutoTransition(ctx, order._id, "Boxed", "Labeled", reason, "kitchen");
}
