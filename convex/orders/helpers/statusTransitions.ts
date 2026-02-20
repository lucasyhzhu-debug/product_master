/**
 * Order Status Transitions Helper
 *
 * Phase 14: Rewritten for simplified 7-status Kanban workflow.
 * Centralizes order status management, audit logging, forward/backward transitions.
 */

import type { MutationCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";

// ============================================
// Constants
// ============================================

export const ALL_ORDER_STATUSES = [
  "Draft",
  "AwaitingPayment",
  "PaymentReceived",
  "BeingPrepared",
  "AwaitingDelivery",
  "Complete",
  "Cancelled",
] as const;
export type OrderStatus = typeof ALL_ORDER_STATUSES[number];

export const TERMINAL_STATUSES = ["Complete", "Cancelled"] as const;
export type TerminalStatus = typeof TERMINAL_STATUSES[number];

// ============================================
// Forward/Backward Transition Maps
// ============================================

/**
 * Valid forward transitions (happy path).
 *
 * Note: PaymentReceived -> AwaitingDelivery is valid via fulfillFromInventory
 * (inventory fulfillment path, bypasses BeingPrepared). Not in FORWARD_TRANSITIONS
 * because that map is 1:1 for the standard happy path. fulfillFromInventory performs
 * a direct status patch — it does NOT use isValidForwardTransition().
 */
export const FORWARD_TRANSITIONS: Record<string, string> = {
  Draft: "AwaitingPayment",
  AwaitingPayment: "PaymentReceived",
  PaymentReceived: "BeingPrepared",
  BeingPrepared: "AwaitingDelivery",
  AwaitingDelivery: "Complete",
};

/**
 * Valid backward transitions (reversals).
 * Some statuses can go back multiple steps.
 */
export const BACKWARD_TRANSITIONS: Record<string, string[]> = {
  AwaitingPayment: ["Draft"],
  PaymentReceived: ["AwaitingPayment", "Draft"],
  BeingPrepared: ["PaymentReceived"],
  AwaitingDelivery: ["BeingPrepared"],
  Complete: ["AwaitingDelivery"],
};

// ============================================
// Transition Validation
// ============================================

/**
 * Check if a forward transition from `from` to `to` is valid.
 */
export function isValidForwardTransition(from: string, to: string): boolean {
  return FORWARD_TRANSITIONS[from] === to;
}

/**
 * Check if a backward transition from `from` to `to` is valid.
 */
export function isValidBackwardTransition(from: string, to: string): boolean {
  const allowed = BACKWARD_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

// ============================================
// Status Checks
// ============================================

/**
 * Check if status is terminal (cannot transition further except cancellation).
 */
export function isTerminalStatus(status: string): status is TerminalStatus {
  return TERMINAL_STATUSES.includes(status as TerminalStatus);
}

/**
 * Check if an order can be cancelled (any non-terminal status).
 */
export function canCancelOrder(status: string): boolean {
  return !isTerminalStatus(status);
}

/**
 * Compute whether an order with the given status should be visible in the kitchen view.
 * Kitchen sees: BeingPrepared only.
 * The kitchen query separately fetches completed-today orders.
 */
export function computeIsKitchenVisible(status: string): boolean {
  return status === "BeingPrepared";
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
  userId?: Id<"users">;
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
    userId: options.userId,
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
  triggeredBy: "user" | "kitchen" | "system" = "system",
  userId?: Id<"users">
): Promise<void> {
  await logOrderEvent(ctx, orderId, "status_change", {
    fromStatus,
    toStatus,
    reason,
    triggeredBy,
    userId,
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
