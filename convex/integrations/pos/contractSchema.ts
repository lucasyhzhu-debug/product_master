import { z } from "zod";
const line = z.object({ productCode: z.string(), productName: z.string(), qty: z.number(),
  unitPrice: z.number(), lineSubtotal: z.number(), taxRate: z.number() }).strict();
export const posTransactionsPageSchema = z.object({
  data: z.array(z.object({
    receiptNumber: z.string(), paidAt: z.number(), subtotal: z.number(),
    voucherCode: z.string().nullable(), voucherDiscount: z.number(), total: z.number(),
    staffCode: z.string(), lines: z.array(line),
  }).strict()),
  nextCursor: z.string().nullable(),
}).strict();
const refundLine = z.object({ productCode: z.string(), qty: z.number(), refundAmount: z.number() }).strict();
export const posRefundsPageSchema = z.object({
  data: z.array(z.object({
    receiptNumber: z.string(), createdAt: z.number(), totalRefund: z.number(),
    reason: z.string(), lines: z.array(refundLine),
  }).strict()),
  nextCursor: z.string().nullable(),
}).strict();
