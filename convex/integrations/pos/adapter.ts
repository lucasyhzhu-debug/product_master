import type { ChannelAdapter } from "../_shared/channelAdapter";
import type { ChannelSaleEvent } from "../_shared/channelSaleEvent";
import type { PosTransactionsPage, PosRefundsPage } from "./types";

export const posAdapter: ChannelAdapter<PosTransactionsPage> = {
  source: "pos",
  normalize(page): ChannelSaleEvent[] {
    return page.data.flatMap((txn) =>
      txn.lines.map((l) => ({
        source: "pos" as const,
        occurredAt: txn.paidAt,
        externalTransactionId: txn.receiptNumber,
        externalItemId: `${txn.receiptNumber}|${l.productCode}`,
        externalProductCode: l.productCode,
        externalProductName: l.productName,
        quantity: l.qty,
        unitPrice: l.unitPrice,
        totalPrice: l.lineSubtotal,
      })),
    );
  },
};

export function normalizeRefunds(page: PosRefundsPage): Array<{
  receiptNumber: string; createdAt: number; negatedTotal: number; reason: string;
}> {
  return page.data.map((r) => ({
    receiptNumber: r.receiptNumber,
    createdAt: r.createdAt,
    negatedTotal: -r.totalRefund,
    reason: r.reason,
  }));
}
