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
  const revShareAmount = totalRevenue * revSharePercent / 100;
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
 * Build an externalRevenue record for the revenue bridge.
 * Links consignment settlements to the unified analytics pipeline.
 * @param params - Revenue record parameters
 * @returns Object suitable for inserting into externalRevenue table
 */
export function buildRevenueRecord(params: {
  totalRevenue: number;
  frolliePayment: number;
  periodStart: number;
  periodEnd: number;
  outletId?: string;
}): {
  source: "consignment";
  outletId: string | undefined;
  revenueGross: number;
  revenueNet: number;
  periodStart: number;
  periodEnd: number;
  dataOrigin: "manual_entry";
  confidence: "manual";
  transactionType: "sales";
} {
  return {
    source: "consignment" as const,
    outletId: params.outletId,
    revenueGross: params.totalRevenue,
    revenueNet: params.frolliePayment,
    periodStart: params.periodStart,
    periodEnd: params.periodEnd,
    dataOrigin: "manual_entry" as const,
    confidence: "manual" as const,
    transactionType: "sales" as const,
  };
}
