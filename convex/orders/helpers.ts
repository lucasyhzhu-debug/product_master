/**
 * Pure helper functions for order calculations.
 * Extracted for testability - no database dependencies.
 */

// ============================================
// Order Number Generation
// ============================================

/**
 * Generate order number in MMDD-NNN format.
 * @param date - The date for the order
 * @param existingOrdersToday - Count of orders already placed today
 * @returns Order number string (e.g., "0131-001")
 */
export function generateOrderNumber(
  date: Date,
  existingOrdersToday: number
): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const datePrefix = `${month}${day}`;
  const sequenceNumber = String(existingOrdersToday + 1).padStart(3, "0");
  return `${datePrefix}-${sequenceNumber}`;
}

// ============================================
// Line Total Calculations
// ============================================

export interface LineTotals {
  lineTotal: number;
  lineCost: number;
  lineMargin: number;
}

/**
 * Calculate totals for a single order line item.
 * @param quantity - Number of items
 * @param unitPrice - Price per item (before discount)
 * @param unitCost - Cost per item
 * @param discountAmount - Discount per item (defaults to 0)
 * @returns Object with lineTotal, lineCost, lineMargin
 */
export function calculateLineTotals(
  quantity: number,
  unitPrice: number,
  unitCost: number,
  discountAmount: number = 0
): LineTotals {
  const discountedPrice = unitPrice - discountAmount;
  const lineTotal = quantity * discountedPrice;
  const lineCost = quantity * unitCost;
  const lineMargin = lineTotal - lineCost;
  return { lineTotal, lineCost, lineMargin };
}

// ============================================
// Order Total Calculations
// ============================================

export interface OrderItem {
  quantity: number;
  unitPrice: number;
  unitCost: number;
  discountAmount?: number;
}

export interface OrderTotals {
  totalAmount: number;
  totalCost: number;
  totalMargin: number;
}

/**
 * Calculate order totals by summing all line items.
 * @param items - Array of order items
 * @returns Object with totalAmount, totalCost, totalMargin
 */
export function calculateOrderTotals(items: OrderItem[]): OrderTotals {
  let totalAmount = 0;
  let totalCost = 0;

  for (const item of items) {
    const discount = item.discountAmount ?? 0;
    const { lineTotal, lineCost } = calculateLineTotals(
      item.quantity,
      item.unitPrice,
      item.unitCost,
      discount
    );
    totalAmount += lineTotal;
    totalCost += lineCost;
  }

  return {
    totalAmount,
    totalCost,
    totalMargin: totalAmount - totalCost,
  };
}

// ============================================
// Final Total Calculations (with Discounts)
// ============================================

/**
 * Recalculate finalTotal when totalAmount changes.
 * Handles both percentage and amount-based discounts.
 * @param totalAmount - Total before order-level discount
 * @param discount - Discount value (percentage or amount)
 * @param discountType - Type of discount ("amount" or "percentage")
 * @returns Final total after applying discount
 */
export function recalculateFinalTotal(
  totalAmount: number,
  discount?: number,
  discountType?: "amount" | "percentage"
): number {
  if (discount === undefined || discount === 0) {
    return totalAmount;
  }
  const discountAmount =
    discountType === "percentage"
      ? totalAmount * (discount / 100)
      : discount;
  return totalAmount - discountAmount;
}
