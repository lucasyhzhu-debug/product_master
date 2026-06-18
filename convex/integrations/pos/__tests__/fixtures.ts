import type { PosTransactionsPage, PosRefundsPage } from "../types";
export const salesPageFixture: PosTransactionsPage = {
  data: [{
    receiptNumber: "R-2026-0042", paidAt: 1718600000000, subtotal: 90000,
    voucherCode: "OPEN10", voucherDiscount: 9000, total: 81000, staffCode: "S-0001",
    lines: [{ productCode: "DUBAI_8PC", productName: "Dubai 8pcs", qty: 2,
              unitPrice: 45000, lineSubtotal: 90000, taxRate: 0 }],
  }],
  nextCursor: "eyJwIjoxNzE4NjAwMDAwMDAwfQ",
};
export const refundsPageFixture: PosRefundsPage = {
  data: [{
    receiptNumber: "R-2026-0042", createdAt: 1718700000000, totalRefund: 45000, reason: "damaged",
    lines: [{ productCode: "DUBAI_8PC", qty: 1, refundAmount: 45000 }],
  }],
  nextCursor: null,
};
