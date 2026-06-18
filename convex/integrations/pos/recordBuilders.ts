import type { Id } from "../../_generated/dataModel";
import { collapseRevenuePeriod } from "../../consignment/helpers";
import type { PosTransactionsPage, PosRefundsPage } from "./types";

export interface SaveRevenueRecord {
  source: "pos"; productName?: string; quantitySold?: number; transactionCount?: number;
  revenueGross?: number; periodStart: number; periodEnd: number; transactionDate?: number;
  dataOrigin: "api_revenue"; confidence: "exact";
  transactionType: "sales" | "return"; externalTransactionId: string;
  syncLogId?: Id<"externalSyncLogs">;
  // revenueNet / commission intentionally not set by builders → undefined at runtime (spec §10 #3)
  revenueNet?: number;
  commission?: number;
}
export interface SaveRevenueItem {
  externalItemId: string; productName: string; unitPrice: number;
  quantity: number; totalPrice: number; isAutoMatched: boolean;
}

export function buildPosSalesRecords(
  page: PosTransactionsPage, syncLogId: Id<"externalSyncLogs">,
): Array<{ record: SaveRevenueRecord; items: SaveRevenueItem[] }> {
  return page.data.map((txn) => ({
    record: {
      source: "pos",
      productName: `POS ${txn.receiptNumber}`,
      quantitySold: txn.lines.reduce((n, l) => n + l.qty, 0),
      transactionCount: 1,
      revenueGross: txn.total,
      ...collapseRevenuePeriod(txn.paidAt),
      dataOrigin: "api_revenue",
      confidence: "exact",
      transactionType: "sales",
      externalTransactionId: txn.receiptNumber,
      syncLogId,
    },
    items: txn.lines.map((l) => ({
      externalItemId: `${txn.receiptNumber}|${l.productCode}`,
      productName: l.productName,
      unitPrice: l.unitPrice,
      quantity: l.qty,
      totalPrice: l.lineSubtotal,
      isAutoMatched: false,
    })),
  }));
}

export function buildPosRefundRecords(
  page: PosRefundsPage, syncLogId: Id<"externalSyncLogs">,
): Array<{ record: SaveRevenueRecord }> {
  return page.data.map((r) => ({
    record: {
      source: "pos",
      productName: `POS refund ${r.receiptNumber}`,
      transactionCount: 1,
      revenueGross: -r.totalRefund,                                  // NEGATIVE
      ...collapseRevenuePeriod(r.createdAt),
      dataOrigin: "api_revenue",
      confidence: "exact",
      transactionType: "return",
      externalTransactionId: `${r.receiptNumber}|R|${r.createdAt}`,
      syncLogId,
    },
  }));
}
