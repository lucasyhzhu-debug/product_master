// convex/subscriptions/reminders/types.ts
import type { Id } from "../../_generated/dataModel";

export type ConfirmRow = { subscriptionId: Id<"subscriptions">; account: string; weekStart: number };
export type InvoiceDueRow = { account: string; weekStart: number; amountDue: number; weekStatus: string };
export type DeliveryLine = { productName: string; qty: number; missingProduct: boolean };
export type TodayDeliveriesRow = { account: string; deliverByTime: string; lines: DeliveryLine[] };
export type ReconcileRow = { account: string; weekStart: number; shortfall: number; refundDue: number };
export type DeliveryProgressRow = {
  account: string; weekStart: number;
  weekPlannedPcs: number; deliveredPcs: number; remaining: number; overBy: number;
  /** End-of-day KPIs (2026-06-29): pieces shipped TODAY (WIB), the weekly allotment
   *  (`weeklyQty`) and how much of it is left (`weeklyQty − used this week`), and the
   *  derived credit pool remaining (integer IDR). */
  shippedTodayPcs: number; weeklyQty: number; weeklyLeft: number; creditRemaining: number;
};
