export interface PosTransactionLine {
  productCode: string; productName: string; qty: number;
  unitPrice: number; lineSubtotal: number; taxRate: number;
}
export interface PosTransaction {
  receiptNumber: string; paidAt: number; subtotal: number;
  voucherCode: string | null; voucherDiscount: number; total: number;
  staffCode: string; lines: PosTransactionLine[];
}
export interface PosTransactionsPage { data: PosTransaction[]; nextCursor: string | null; }
export interface PosRefundLine { productCode: string; qty: number; refundAmount: number; }
export interface PosRefund {
  receiptNumber: string; createdAt: number; totalRefund: number;
  reason: string; lines: PosRefundLine[];
}
export interface PosRefundsPage { data: PosRefund[]; nextCursor: string | null; }
