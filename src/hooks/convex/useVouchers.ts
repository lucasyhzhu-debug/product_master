/**
 * Convex hooks for vouchers.
 * Used by VouchersManager page and POS checkout.
 *
 * NOTE: The vouchers API types are generated when `npx convex dev` runs.
 * If you see type errors, run `npx convex dev` to regenerate the types.
 */
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id, Doc } from "../../../convex/_generated/dataModel";
import { getErrorMessage } from "../../lib/utils";
import { toast } from "sonner";
import { useProtectedMutation } from "./useProtectedMutation";

// Type assertion for vouchers API (will be properly typed after `npx convex dev`)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const vouchersApi = (api as any).vouchers as {
  queries: {
    list: unknown;
    listActiveForCombobox: unknown;
    listOverrides: unknown;
    getById: unknown;
    getByCode: unknown;
    validateVoucher: unknown;
    getCustomerUsageCount: unknown;
    getVoucherStats: unknown;
    getOverrideOrderDetails: unknown;
  };
  mutations: {
    create: unknown;
    update: unknown;
    toggleActive: unknown;
    remove: unknown;
    createManagerOverride: unknown;
    incrementUsage: unknown;
    decrementUsage: unknown;
    generateCode: unknown;
  };
};

// ============================================
// Types
// ============================================

export type Voucher = Doc<"vouchers">;

export interface VoucherCreateInput {
  code?: string;
  name: string;
  description?: string;
  discountType: "amount" | "percentage";
  discountValue: number;
  minimumOrderAmount?: number;
  maximumDiscount?: number;
  isActive?: boolean;
  validFrom?: number;
  validUntil?: number;
  usageLimit?: number;
  usagePerCustomer?: number;
}

export interface VoucherUpdateInput {
  id: Id<"vouchers">;
  name?: string;
  description?: string;
  discountType?: "amount" | "percentage";
  discountValue?: number;
  minimumOrderAmount?: number;
  maximumDiscount?: number;
  isActive?: boolean;
  validFrom?: number;
  validUntil?: number;
  usageLimit?: number;
  usagePerCustomer?: number;
}

export interface ManagerOverrideInput {
  reason: string;
  discountType: "amount" | "percentage";
  discountValue: number;
  orderId?: Id<"orders">;
}

// ============================================
// Queries
// ============================================

/**
 * Hook to fetch all regular vouchers (excludes manager overrides).
 */
export function useVouchers(activeOnly?: boolean) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return useQuery(vouchersApi.queries.list as any, {
    includeOverrides: false,
    activeOnly,
  });
}

/**
 * Hook to fetch manager override vouchers.
 */
export function useManagerOverrides(daysBack?: number) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return useQuery(vouchersApi.queries.listOverrides as any, {
    daysBack,
  });
}

/**
 * Hook to fetch active vouchers for POS combobox.
 * Returns only currently valid, active vouchers for user selection.
 */
export function useActiveVouchersForCombobox() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return useQuery(vouchersApi.queries.listActiveForCombobox as any);
}

/**
 * Hook to fetch a single voucher by ID.
 */
export function useVoucher(id: Id<"vouchers"> | undefined) {
  return useQuery(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vouchersApi.queries.getById as any,
    id ? { id } : "skip"
  );
}

/**
 * Hook to validate a voucher code.
 */
export function useVoucherValidation(
  code: string | undefined,
  orderTotal: number,
  customerId?: Id<"customers">
) {
  return useQuery(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vouchersApi.queries.validateVoucher as any,
    code && code.trim()
      ? { code, orderTotal, customerId }
      : "skip"
  );
}

/**
 * Hook to get voucher statistics.
 */
export function useVoucherStats(id: Id<"vouchers"> | undefined) {
  return useQuery(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vouchersApi.queries.getVoucherStats as any,
    id ? { id } : "skip"
  );
}

// ============================================
// Mutations
// ============================================

/**
 * Hook to create a new voucher.
 * Admin only.
 */
export function useCreateVoucher() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const protectedCreate = useProtectedMutation(vouchersApi.mutations.create as any);

  return {
    createVoucher: async (data: VoucherCreateInput) => {
      try {
        const id = await protectedCreate({ ...data });
        toast.success("Voucher created successfully");
        return id;
      } catch (error) {
        if (!(error instanceof Error && error.message === "Not authenticated")) {
          toast.error(getErrorMessage(error, "Failed to create voucher"));
        }
        throw error;
      }
    },
  };
}

/**
 * Hook to update a voucher.
 * Admin only.
 */
export function useUpdateVoucher() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const protectedUpdate = useProtectedMutation(vouchersApi.mutations.update as any);

  return {
    updateVoucher: async (data: VoucherUpdateInput) => {
      try {
        const { id, ...updates } = data;
        await protectedUpdate({ id, ...updates });
        toast.success("Voucher updated successfully");
        return id;
      } catch (error) {
        if (!(error instanceof Error && error.message === "Not authenticated")) {
          toast.error(getErrorMessage(error, "Failed to update voucher"));
        }
        throw error;
      }
    },
  };
}

/**
 * Hook to toggle voucher active status.
 * Admin only.
 */
export function useToggleVoucherActive() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const protectedToggle = useProtectedMutation(vouchersApi.mutations.toggleActive as any);

  return {
    toggleActive: async (id: Id<"vouchers">) => {
      try {
        const isNowActive = await protectedToggle({ id });
        toast.success(isNowActive ? "Voucher activated" : "Voucher deactivated");
        return isNowActive;
      } catch (error) {
        if (!(error instanceof Error && error.message === "Not authenticated")) {
          toast.error(getErrorMessage(error, "Failed to toggle voucher status"));
        }
        throw error;
      }
    },
  };
}

/**
 * Hook to delete a voucher.
 * Admin only. Cannot delete vouchers that have been used.
 */
export function useDeleteVoucher() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const protectedRemove = useProtectedMutation(vouchersApi.mutations.remove as any);

  return {
    deleteVoucher: async (id: Id<"vouchers">) => {
      try {
        await protectedRemove({ id });
        toast.success("Voucher deleted");
        return true;
      } catch (error) {
        if (!(error instanceof Error && error.message === "Not authenticated")) {
          toast.error(getErrorMessage(error, "Failed to delete voucher"));
        }
        throw error;
      }
    },
  };
}

/**
 * Hook to create a manager override voucher.
 * Manager and Admin only.
 */
export function useCreateManagerOverride() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const protectedCreateOverride = useProtectedMutation(vouchersApi.mutations.createManagerOverride as any);

  return {
    createOverride: async (data: ManagerOverrideInput) => {
      try {
        const result = await protectedCreateOverride({ ...data });
        toast.success(`Override voucher created: ${result.code}`);
        return result;
      } catch (error) {
        if (!(error instanceof Error && error.message === "Not authenticated")) {
          toast.error(getErrorMessage(error, "Failed to create override voucher"));
        }
        throw error;
      }
    },
  };
}

/**
 * Hook to generate a random voucher code.
 * Admin only.
 */
export function useGenerateVoucherCode() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const protectedGenerate = useProtectedMutation(vouchersApi.mutations.generateCode as any);

  return {
    generateCode: async (prefix?: string) => {
      try {
        return await protectedGenerate({ prefix });
      } catch (error) {
        if (!(error instanceof Error && error.message === "Not authenticated")) {
          toast.error(getErrorMessage(error, "Failed to generate code"));
        }
        throw error;
      }
    },
  };
}
