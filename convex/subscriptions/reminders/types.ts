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
};
