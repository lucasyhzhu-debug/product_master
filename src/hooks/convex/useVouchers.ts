/**
 * Convex hooks for vouchers.
 * Used by VouchersManager page and POS checkout.
 *
 * NOTE: The vouchers API types are generated when `npx convex dev` runs.
 * If you see type errors, run `npx convex dev` to regenerate the types.
 */
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id, Doc } from "../../../convex/_generated/dataModel";
import { useAuth } from "../../contexts/AuthContext";
import { toast } from "sonner";

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
  const mutation = useMutation(vouchersApi.mutations.create as any);
  const { user } = useAuth();

  return {
    createVoucher: async (data: VoucherCreateInput) => {
      if (!user?.token) {
        toast.error("Session expired. Please log in again.");
        throw new Error("Not authenticated");
      }
      try {
        const id = await mutation({ ...data, token: user.token });
        toast.success("Voucher created successfully");
        return id;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to create voucher";
        toast.error(message);
        throw error;
      }
    },
    isLoading: false,
  };
}

/**
 * Hook to update a voucher.
 * Admin only.
 */
export function useUpdateVoucher() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mutation = useMutation(vouchersApi.mutations.update as any);
  const { user } = useAuth();

  return {
    updateVoucher: async (data: VoucherUpdateInput) => {
      if (!user?.token) {
        toast.error("Session expired. Please log in again.");
        throw new Error("Not authenticated");
      }
      try {
        const { id, ...updates } = data;
        await mutation({ id, ...updates, token: user.token });
        toast.success("Voucher updated successfully");
        return id;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to update voucher";
        toast.error(message);
        throw error;
      }
    },
    isLoading: false,
  };
}

/**
 * Hook to toggle voucher active status.
 * Admin only.
 */
export function useToggleVoucherActive() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mutation = useMutation(vouchersApi.mutations.toggleActive as any);
  const { user } = useAuth();

  return {
    toggleActive: async (id: Id<"vouchers">) => {
      if (!user?.token) {
        toast.error("Session expired. Please log in again.");
        throw new Error("Not authenticated");
      }
      try {
        const isNowActive = await mutation({ id, token: user.token });
        toast.success(isNowActive ? "Voucher activated" : "Voucher deactivated");
        return isNowActive;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to toggle voucher status";
        toast.error(message);
        throw error;
      }
    },
    isLoading: false,
  };
}

/**
 * Hook to delete a voucher.
 * Admin only. Cannot delete vouchers that have been used.
 */
export function useDeleteVoucher() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mutation = useMutation(vouchersApi.mutations.remove as any);
  const { user } = useAuth();

  return {
    deleteVoucher: async (id: Id<"vouchers">) => {
      if (!user?.token) {
        toast.error("Session expired. Please log in again.");
        throw new Error("Not authenticated");
      }
      try {
        await mutation({ id, token: user.token });
        toast.success("Voucher deleted");
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to delete voucher";
        toast.error(message);
        throw error;
      }
    },
    isLoading: false,
  };
}

/**
 * Hook to create a manager override voucher.
 * Manager and Admin only.
 */
export function useCreateManagerOverride() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mutation = useMutation(vouchersApi.mutations.createManagerOverride as any);
  const { user } = useAuth();

  return {
    createOverride: async (data: ManagerOverrideInput) => {
      if (!user?.token) {
        toast.error("Session expired. Please log in again.");
        throw new Error("Not authenticated");
      }
      try {
        const result = await mutation({ ...data, token: user.token });
        toast.success(`Override voucher created: ${result.code}`);
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to create override voucher";
        toast.error(message);
        throw error;
      }
    },
    isLoading: false,
  };
}

/**
 * Hook to generate a random voucher code.
 * Admin only.
 */
export function useGenerateVoucherCode() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mutation = useMutation(vouchersApi.mutations.generateCode as any);
  const { user } = useAuth();

  return {
    generateCode: async (prefix?: string) => {
      if (!user?.token) {
        toast.error("Session expired. Please log in again.");
        throw new Error("Not authenticated");
      }
      try {
        return await mutation({ prefix, token: user.token });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to generate code";
        toast.error(message);
        throw error;
      }
    },
    isLoading: false,
  };
}
