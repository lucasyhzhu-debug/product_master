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
 * @param deliveryFee - Optional delivery fee to add on top (must be included in finalTotal per schema)
 * @returns Final total after applying discount and adding delivery fee
 */
export function recalculateFinalTotal(
  totalAmount: number,
  discount?: number,
  discountType?: "amount" | "percentage",
  deliveryFee?: number
): number {
  let total: number;
  if (discount === undefined || discount === 0) {
    total = totalAmount;
  } else {
    const discountAmount =
      discountType === "percentage"
        ? totalAmount * (discount / 100)
        : discount;
    total = totalAmount - discountAmount;
  }
  return total + (deliveryFee ?? 0);
}

// ============================================
// Package Status Calculation
// ============================================

/**
 * Calculate the overall package status for an order item.
 * Pure function used by packaging mutations (markPackagePacked, unmarkPackagePacked,
 * fillPackage, unfillPackage, markAllItemPackagesPacked).
 *
 * @param ballsFilled - Number of balls filled so far
 * @param quantity - Number of packages (order quantity)
 * @param ballsPerPackage - Production units per package
 * @param packedIndicesCount - Number of packages marked as packed
 * @returns Package status: "empty" | "filling" | "filled" | "packed"
 */
export function calculatePackageStatus(
  ballsFilled: number,
  quantity: number,
  ballsPerPackage: number,
  packedIndicesCount: number
): "empty" | "filling" | "filled" | "packed" {
  const totalBallsRequired = quantity * ballsPerPackage;
  const allPackagesPacked = packedIndicesCount >= quantity;

  if (allPackagesPacked) {
    return "packed";
  } else if (ballsFilled >= totalBallsRequired) {
    return "filled";
  } else if (ballsFilled > 0) {
    return "filling";
  }
  return "empty";
}

// ============================================
// Production Unit Calculations
// ============================================

export interface ProductionUnitsNeeded {
  unitsRequired: number;
}

/**
 * Calculate total production units needed for an order item.
 *
 * This is the single source of truth for production unit calculations.
 * Used across:
 * - Order creation (mutations.ts)
 * - Production record creation (productionRecords.ts)
 * - Backfill operations (migrations.ts)
 *
 * @param unitsPerProduct - How many units are needed per product (e.g., 1 for Original, 3 for Bite Triple)
 * @param quantity - Number of products ordered
 * @returns Total units required for production
 *
 * @example
 * // Original (1 big ball per unit, 5 units ordered)
 * calculateProductionUnitsNeeded(1, 5) // => { unitsRequired: 5 }
 *
 * @example
 * // Bite Sized Triple (3 mid balls per unit, 2 units ordered)
 * calculateProductionUnitsNeeded(3, 2) // => { unitsRequired: 6 }
 *
 * @example
 * // Combo pack with multiple unit types (handled by calling this per component)
 * // For a pack with 1 big ball and 2 mid balls, ordered 3 times:
 * calculateProductionUnitsNeeded(1, 3) // => { unitsRequired: 3 } for big balls
 * calculateProductionUnitsNeeded(2, 3) // => { unitsRequired: 6 } for mid balls
 */
export function calculateProductionUnitsNeeded(
  unitsPerProduct: number,
  quantity: number
): ProductionUnitsNeeded {
  if (unitsPerProduct < 0) {
    throw new Error(`unitsPerProduct must be non-negative, got ${unitsPerProduct}`);
  }
  if (quantity < 0) {
    throw new Error(`quantity must be non-negative, got ${quantity}`);
  }

  return {
    unitsRequired: unitsPerProduct * quantity,
  };
}

// ============================================
// Delivery Address Parsing
// ============================================

export interface DeliveryParseResult {
  deliveryType: 'Pickup' | 'Delivery';
  pickupLocation?: string;
}

const PICKUP_PREFIX_RE = /^pick up:\s*/i;

/**
 * Derive deliveryType and pickupLocation from the raw address string.
 * "Pick up: [location]" → Pickup. Everything else → Delivery.
 */
export function parseDeliveryAddress(address: string): DeliveryParseResult {
  const trimmed = (address ?? '').trim();
  if (PICKUP_PREFIX_RE.test(trimmed)) {
    const location = trimmed.replace(PICKUP_PREFIX_RE, '').trim();
    return { deliveryType: 'Pickup', pickupLocation: location || undefined };
  }
  return { deliveryType: 'Delivery' };
}
