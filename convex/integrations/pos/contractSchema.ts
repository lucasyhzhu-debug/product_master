import { z } from "zod";

// Shared field sets — each schema pair (strict/passthrough) is built from the same object literal.
// strict = fixture-lock drift tripwire (contractLock.test.ts); passthrough = runtime sync tolerance (CONTRACT §8).

const lineFields = {
  productCode: z.string(),
  productName: z.string(),
  qty: z.number(),
  unitPrice: z.number(),
  lineSubtotal: z.number(),
  taxRate: z.number(),
};

const refundLineFields = {
  productCode: z.string(),
  qty: z.number(),
  refundAmount: z.number(),
};

const txnFields = (lineSchema: z.ZodTypeAny) => ({
  receiptNumber: z.string(),
  paidAt: z.number(),
  subtotal: z.number(),
  voucherCode: z.string().nullable(),
  voucherDiscount: z.number(),
  total: z.number(),
  staffCode: z.string(),
  lines: z.array(lineSchema),
});

const refundTxnFields = (refundLineSchema: z.ZodTypeAny) => ({
  receiptNumber: z.string(),
  createdAt: z.number(),
  totalRefund: z.number(),
  reason: z.string(),
  lines: z.array(refundLineSchema),
});

// ── Strict schemas (fixture-lock) ───────────────────────────────────────────
const line = z.object(lineFields).strict();
export const posTransactionsPageSchema = z.object({
  data: z.array(z.object(txnFields(line)).strict()),
  nextCursor: z.string().nullable(),
}).strict();

const refundLine = z.object(refundLineFields).strict();
export const posRefundsPageSchema = z.object({
  data: z.array(z.object(refundTxnFields(refundLine)).strict()),
  nextCursor: z.string().nullable(),
}).strict();

// ── Runtime schemas (passthrough — silently tolerate additive POS-side fields) ──
const lineRuntime = z.object(lineFields).passthrough();
export const posTransactionsPageRuntimeSchema = z.object({
  data: z.array(z.object(txnFields(lineRuntime)).passthrough()),
  nextCursor: z.string().nullable(),
}).passthrough();

const refundLineRuntime = z.object(refundLineFields).passthrough();
export const posRefundsPageRuntimeSchema = z.object({
  data: z.array(z.object(refundTxnFields(refundLineRuntime)).passthrough()),
  nextCursor: z.string().nullable(),
}).passthrough();
