/**
 * Consignment Settlement Helpers
 *
 * Pure business logic for consignment settlement calculations,
 * validation, and revenue bridge building.
 * All functions are ctx-free for easy unit testing.
 */

export interface SettlementMath {
  revShareAmount: number;
  frolliePayment: number;
}

/**
 * Compute revenue share split for a consignment settlement.
 * @param totalRevenue - Total revenue from the period
 * @param revSharePercent - Outlet's revenue share percentage (0-100)
 * @returns Object with revShareAmount (to outlet) and frolliePayment (to Frollie)
 */
export function computeSettlementMath(
  totalRevenue: number,
  revSharePercent: number
): SettlementMath {
  const revShareAmount = Math.round(totalRevenue * revSharePercent / 100);
  const frolliePayment = totalRevenue - revShareAmount;
  return { revShareAmount, frolliePayment };
}

/**
 * Determine if an outlet should be auto-archived after payment.
 * Event-type outlets are one-offs (bazaars, pop-ups) and should
 * auto-deactivate after settlement is marked paid.
 * @param type - Outlet type: cafe, retail, or event
 * @returns true if the outlet should be auto-archived
 */
export function shouldAutoArchive(
  type: "cafe" | "retail" | "event"
): boolean {
  return type === "event";
}

/**
 * Guard: Assert a settlement is in an editable state.
 * Paid settlements are locked and cannot be modified.
 * @param status - Current settlement status
 * @throws Error if settlement is paid
 */
export function assertSettlementEditable(
  status: "pending" | "paid"
): void {
  if (status === "paid") {
    throw new Error("Cannot modify paid settlement");
  }
}

/**
 * Validate settlement input data before creation/update.
 * @param input - Settlement input with revenue and period dates
 * @throws Error if validation fails
 */
export function validateSettlementInput(input: {
  totalRevenue: number;
  periodStart: number;
  periodEnd: number;
}): void {
  if (input.totalRevenue < 0) {
    throw new Error("Revenue cannot be negative");
  }
  if (input.periodStart > input.periodEnd) {
    throw new Error("Period start must be before period end");
  }
}

/**
 * Build the three-field collapse for a consignment externalRevenue row.
 * Consignment recognition uses a single date — periodStart, periodEnd,
 * and transactionDate on externalRevenue all carry it. The full accrual
 * span lives on consignmentSettlements as the source of truth. Spreading
 * this helper guarantees the three fields are always written together.
 */
export function collapseRevenuePeriod(target: number): {
  periodStart: number;
  periodEnd: number;
  transactionDate: number;
} {
  return { periodStart: target, periodEnd: target, transactionDate: target };
}

/**
 * Recognition date for a consignment settlement: cash-receipt date when
 * known (paidAt), expected receipt (periodEnd) otherwise.
 */
export function consignmentRecognitionDate(s: {
  paidAt?: number;
  periodEnd: number;
}): number {
  return s.paidAt ?? s.periodEnd;
}
