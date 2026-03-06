/**
 * Voucher utility functions, types, and constants.
 * Shared across VoucherCard, OverrideCard, VoucherForm, and VouchersManager.
 */
import type { Voucher } from "@/hooks/convex/useVouchers";
import { formatCurrency } from "@/lib/utils";

// ============================================
// Helper Functions
// ============================================

export function formatDate(timestamp: number | undefined): string {
  if (!timestamp) return "-";
  return new Date(timestamp).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function getVoucherStatus(voucher: Voucher): {
  label: string;
  variant: "default" | "secondary" | "destructive" | "outline";
} {
  const now = Date.now();

  if (!voucher.isActive) {
    return { label: "Inactive", variant: "secondary" };
  }
  if (voucher.validUntil !== undefined && now > voucher.validUntil) {
    return { label: "Expired", variant: "destructive" };
  }
  if (
    voucher.usageLimit !== undefined &&
    voucher.usageCount >= voucher.usageLimit
  ) {
    return { label: "Depleted", variant: "outline" };
  }
  if (voucher.validFrom !== undefined && now < voucher.validFrom) {
    return { label: "Scheduled", variant: "outline" };
  }
  return { label: "Active", variant: "default" };
}

export function formatDiscountValue(voucher: Voucher): string {
  if (voucher.discountType === "percentage") {
    return `${voucher.discountValue}%`;
  }
  if (voucher.applicableMenuProductId) {
    return `${formatCurrency(voucher.discountValue)}/item`;
  }
  return formatCurrency(voucher.discountValue);
}

// ============================================
// Form State Type
// ============================================

export interface VoucherFormState {
  code: string;
  name: string;
  description: string;
  discountType: "amount" | "percentage";
  discountValue: string;
  minimumOrderAmount: string;
  maximumDiscount: string;
  applicableMenuProductId: string;
  isActive: boolean;
  validFrom: string;
  validUntil: string;
  usageLimit: string;
  usagePerCustomer: string;
}

export const initialFormState: VoucherFormState = {
  code: "",
  name: "",
  description: "",
  discountType: "percentage",
  discountValue: "",
  minimumOrderAmount: "",
  maximumDiscount: "",
  applicableMenuProductId: "",
  isActive: true,
  validFrom: "",
  validUntil: "",
  usageLimit: "",
  usagePerCustomer: "",
};
