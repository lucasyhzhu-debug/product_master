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
  // TODO: implement
  throw new Error("Not implemented");
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
  // TODO: implement
  throw new Error("Not implemented");
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
  // TODO: implement
  throw new Error("Not implemented");
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
  // TODO: implement
  throw new Error("Not implemented");
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
  // TODO: implement
  throw new Error("Not implemented");
}
