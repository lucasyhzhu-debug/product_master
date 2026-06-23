import type { Id } from "../_generated/dataModel";

export type ScheduleLine = {
  menuProductId: Id<"menuProducts">;
  productName: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
};

export type PlannedDay = {
  date: number;
  deliverByTime: string;
  items: ScheduleLine[];
  locked: boolean;
};

export type LedgerType = "topup" | "drawdown" | "expiry" | "refund" | "adjustment";

export type CreditPool = {
  creditIssued: number;
  creditConsumed: number;
  creditRemaining: number;
  creditExpired: number;
};
