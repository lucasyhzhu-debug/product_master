/**
 * Order item processing helpers.
 * Pure functions for building order items with line totals, applying discounts,
 * and copying items from cancelled orders.
 */
import type { Id } from "../../_generated/dataModel";
import { calculateLineTotals } from "../helpers";

/** Input item shape for buildOrderItems. */
export interface OrderItemInput {
  menuProductId?: Id<"menuProducts">;
  productName: string;
  productVariant?: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  discountAmount?: number;
}

/** Built order item with calculated line totals. */
export interface BuiltOrderItem {
  menuProductId?: Id<"menuProducts">;
  productName: string;
  productVariant?: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  discountAmount: number;
  lineTotal: number;
  lineCost: number;
  lineMargin: number;
}

/**
 * Build order items with calculated line totals from input items.
 * Returns the items array and accumulated totalAmount/totalCost.
 */
export function buildOrderItems(
  items: OrderItemInput[]
): {
  itemsToCreate: BuiltOrderItem[];
  totalAmount: number;
  totalCost: number;
} {
  let totalAmount = 0;
  let totalCost = 0;
  const itemsToCreate = items.map((item) => {
    const discount = item.discountAmount ?? 0;
    const { lineTotal, lineCost, lineMargin } = calculateLineTotals(
      item.quantity,
      item.unitPrice,
      item.unitCost,
      discount
    );
    totalAmount += lineTotal;
    totalCost += lineCost;
    return { ...item, discountAmount: discount, lineTotal, lineCost, lineMargin };
  });
  return { itemsToCreate, totalAmount, totalCost };
}

/**
 * Apply item-linked voucher discount to matching items.
 * Mutates itemsToCreate in place. Returns updated totalAmount.
 */
export function applyItemLinkedVoucherDiscount(
  itemsToCreate: Array<{
    menuProductId?: Id<"menuProducts">;
    quantity: number;
    unitPrice: number;
    discountAmount: number;
    lineTotal: number;
  }>,
  linkedProductId: Id<"menuProducts">,
  perUnitDiscount: number,
): number {
  let newTotalAmount = 0;
  for (let i = 0; i < itemsToCreate.length; i++) {
    const item = itemsToCreate[i];
    if (item.menuProductId === linkedProductId) {
      const addedDiscount = perUnitDiscount * item.quantity;
      const newDiscountAmount = item.discountAmount + addedDiscount;
      const newLineTotal = item.quantity * item.unitPrice - newDiscountAmount;
      itemsToCreate[i] = { ...item, discountAmount: newDiscountAmount, lineTotal: newLineTotal };
    }
    newTotalAmount += itemsToCreate[i].lineTotal;
  }
  return newTotalAmount;
}

/**
 * Calculate the manual (non-voucher) order-level discount amount.
 */
export function calculateOrderLevelDiscount(
  totalAmount: number,
  discount?: number,
  discountType?: "amount" | "percentage"
): number {
  if (discount === undefined || discountType === undefined) return 0;
  return discountType === "percentage"
    ? totalAmount * (discount / 100)
    : discount;
}

/** Copied order item with required discountAmount. */
export interface CopiedOrderItem {
  productName: string;
  productVariant?: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  discountAmount: number;
  lineTotal: number;
  lineCost: number;
  lineMargin: number;
  menuProductId?: Id<"menuProducts">;
}

export function buildCopiedOrderItems(
  activeItems: Array<{
    productName: string;
    productVariant?: string;
    quantity: number;
    unitPrice: number;
    unitCost: number;
    discountAmount?: number;
    lineTotal: number;
    lineCost: number;
    lineMargin: number;
    menuProductId?: Id<"menuProducts">;
  }>
): {
  itemsToCopy: CopiedOrderItem[];
  totalAmount: number;
  totalCost: number;
} {
  let totalAmount = 0;
  let totalCost = 0;
  const itemsToCopy: CopiedOrderItem[] = activeItems.map((item) => {
    totalAmount += item.lineTotal;
    totalCost += item.lineCost;
    return {
      productName: item.productName,
      productVariant: item.productVariant,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      unitCost: item.unitCost,
      discountAmount: item.discountAmount ?? 0,
      lineTotal: item.lineTotal,
      lineCost: item.lineCost,
      lineMargin: item.lineMargin,
      menuProductId: item.menuProductId,
    };
  });
  return { itemsToCopy, totalAmount, totalCost };
}
