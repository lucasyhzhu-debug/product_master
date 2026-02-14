/**
 * Convex hooks for menu products.
 */
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id, Doc } from "../../../convex/_generated/dataModel";
import { toast } from "sonner";
import type { MenuProduct } from "@/lib/types";
import { getErrorMessage } from "@/lib/utils";
import { useProtectedMutation } from "./useProtectedMutation";
import { useAuth } from "../../contexts/AuthContext";

// ============================================
// Types
// ============================================

export interface MenuProductCreateInput {
  code?: string;
  name: string;
  grams?: number;
  defaultPrice: number;
  isActive?: boolean;
  // Unified BOM: Components array using componentTypeId
  components?: Array<{
    componentTypeId: Id<"componentTypes">;
    quantity: number;
    consumptionStage?: "production" | "boxing" | "labeling" | "none";
  }>;
}

export interface MenuProductUpdateInput {
  code?: string;
  name?: string;
  grams?: number;
  defaultPrice?: number;
  isActive?: boolean;
  // Unified BOM: Components array using componentTypeId
  components?: Array<{
    componentTypeId: Id<"componentTypes">;
    quantity: number;
    consumptionStage?: "production" | "boxing" | "labeling" | "none";
  }>;
}

// ============================================
// Transform Functions (Internal)
// ============================================

type ConvexMenuProduct = Doc<"menuProducts">;

function transformMenuProduct(product: ConvexMenuProduct): MenuProduct {
  return {
    id: product._id as unknown as number,
    code: product.code,
    name: product.name,
    grams: product.grams ?? 0,
    default_price: product.defaultPrice,
    is_active: product.isActive ?? true,
    created_at: new Date(product._creationTime).toISOString(),
  };
}

// ============================================
// Query Hooks
// ============================================

/**
 * List all menu products.
 */
export function useConvexMenuProducts(activeOnly?: boolean) {
  const data = useQuery(api.menuProducts.queries.list, { activeOnly });
  if (data === undefined) return { data: undefined, isLoading: true };
  return {
    data: data.map(transformMenuProduct),
    isLoading: false,
  };
}

/**
 * Get a single menu product by ID.
 */
export function useConvexMenuProduct(id: Id<"menuProducts"> | undefined) {
  const data = useQuery(api.menuProducts.queries.get, id ? { id } : "skip");
  if (data === undefined) return { data: undefined, isLoading: id !== undefined };
  if (data === null) return { data: null, isLoading: false };
  return {
    data: transformMenuProduct(data),
    isLoading: false,
  };
}

/**
 * Get menu product by code.
 */
export function useConvexMenuProductByCode(code: string | undefined) {
  const data = useQuery(
    api.menuProducts.queries.getByCode,
    code ? { code } : "skip"
  );
  if (data === undefined) return { data: undefined, isLoading: code !== undefined };
  if (data === null) return { data: null, isLoading: false };
  return {
    data: transformMenuProduct(data),
    isLoading: false,
  };
}

/**
 * PRD-8 Phase 2: List products assigned to POS slots (posSlot 1-4).
 * Returns products sorted by slot number.
 */
export interface PosProduct {
  _id: string;
  code: string;
  name: string;
  grams: number;
  defaultPrice: number;
  unitCost?: number;
  unitCostStaleAt?: number;
  posSlot: number;
  productType?: "food" | "packaging";
  cachedProductionSummary?: string;
}

export interface PackagingPosProduct {
  _id: string;
  code: string;
  name: string;
  grams: number;
  defaultPrice: number;
  unitCost?: number;
  unitCostStaleAt?: number;
  packagingPosSlot: number;
  productType: "packaging";
}

export function useConvexPosProducts() {
  const data = useQuery(api.menuProducts.queries.listPosProducts);
  if (data === undefined) return { data: undefined, isLoading: true };

  // Transform to POS-compatible format
  const posProducts = data.map((p): PosProduct => ({
    _id: p._id as unknown as string,
    code: p.code,
    name: p.name,
    grams: p.grams ?? 0,
    defaultPrice: p.defaultPrice,
    unitCost: p.unitCost,
    unitCostStaleAt: p.unitCostStaleAt,
    posSlot: p.posSlot as number,
    productType: p.productType as "food" | "packaging" | undefined,
    cachedProductionSummary: p.cachedProductionSummary,
  }));

  return {
    data: posProducts,
    isLoading: false,
  };
}

/**
 * List available products (not assigned to any POS slot).
 * Returns products without posSlot or packagingPosSlot.
 */
export interface AvailableProduct {
  _id: string;
  code: string;
  name: string;
  grams: number;
  defaultPrice: number;
  unitCost?: number;
  unitCostStaleAt?: number;
  productType?: "food" | "packaging";
  cachedProductionSummary?: string;
}

export function useConvexAvailableProducts() {
  const data = useQuery(api.menuProducts.queries.listAvailableProducts);
  if (data === undefined) return { data: undefined, isLoading: true };

  const availableProducts = data.map((p): AvailableProduct => ({
    _id: p._id as unknown as string,
    code: p.code,
    name: p.name,
    grams: p.grams ?? 0,
    defaultPrice: p.defaultPrice,
    unitCost: p.unitCost,
    unitCostStaleAt: p.unitCostStaleAt,
    productType: p.productType as "food" | "packaging" | undefined,
    cachedProductionSummary: p.cachedProductionSummary,
  }));

  return {
    data: availableProducts,
    isLoading: false,
  };
}

// ============================================
// Mutation Hooks
// ============================================

/**
 * Create a new menu product.
 * Requires admin authentication.
 */
export function useConvexCreateMenuProduct() {
  const protectedCreate = useProtectedMutation(api.menuProducts.mutations.create);

  const execute = async (data: MenuProductCreateInput) => {
    try {
      const id = await protectedCreate(data);
      toast.success("Menu product created");
      return id;
    } catch (error: unknown) {
      if (!(error instanceof Error && error.message === "Not authenticated")) {
        toast.error(getErrorMessage(error, "Failed to create menu product"));
      }
      throw error;
    }
  };

  return {
    mutate: execute,
    mutateAsync: execute,
  };
}

/**
 * Update an existing menu product.
 * Requires admin authentication.
 */
export function useConvexUpdateMenuProduct() {
  const protectedUpdate = useProtectedMutation(api.menuProducts.mutations.update);

  const execute = async (data: { id: Id<"menuProducts">; updates: MenuProductUpdateInput }) => {
    try {
      await protectedUpdate({ id: data.id, ...data.updates });
      toast.success("Menu product updated");
    } catch (error: unknown) {
      if (!(error instanceof Error && error.message === "Not authenticated")) {
        toast.error(getErrorMessage(error, "Failed to update menu product"));
      }
      throw error;
    }
  };

  return {
    mutate: execute,
    mutateAsync: execute,
  };
}

/**
 * Delete a menu product.
 * Requires admin authentication.
 */
export function useConvexDeleteMenuProduct() {
  const protectedRemove = useProtectedMutation(api.menuProducts.mutations.remove);

  const execute = async (id: Id<"menuProducts">) => {
    try {
      await protectedRemove({ id });
      toast.success("Menu product deleted");
      return true;
    } catch (error: unknown) {
      if (!(error instanceof Error && error.message === "Not authenticated")) {
        toast.error(getErrorMessage(error, "Failed to delete menu product"));
      }
      throw error;
    }
  };

  return {
    mutate: execute,
    mutateAsync: execute,
  };
}

/**
 * PRD-8 Phase 2: Assign a menu product to a POS slot (1-4).
 * Automatically swaps if slot is occupied.
 * Requires admin authentication.
 */
export function useConvexAssignToSlot() {
  const protectedAssign = useProtectedMutation(api.menuProducts.mutations.assignToSlot);

  const execute = async (data: { id: Id<"menuProducts">; slot: number }) => {
    try {
      const id = await protectedAssign(data);
      toast.success(`Assigned to slot ${data.slot}`);
      return id;
    } catch (error: unknown) {
      if (!(error instanceof Error && error.message === "Not authenticated")) {
        toast.error(getErrorMessage(error, "Failed to assign slot"));
      }
      throw error;
    }
  };

  return {
    mutate: execute,
    mutateAsync: execute,
  };
}

/**
 * PRD-8 Phase 2: Remove a menu product from POS slot.
 * Moves product to legacy section.
 * Requires admin authentication.
 */
export function useConvexRemoveFromSlot() {
  const protectedRemove = useProtectedMutation(api.menuProducts.mutations.removeFromSlot);

  const execute = async (id: Id<"menuProducts">) => {
    try {
      const resultId = await protectedRemove({ id });
      toast.success("Removed from POS");
      return resultId;
    } catch (error: unknown) {
      if (!(error instanceof Error && error.message === "Not authenticated")) {
        toast.error(getErrorMessage(error, "Failed to remove from slot"));
      }
      throw error;
    }
  };

  return {
    mutate: execute,
    mutateAsync: execute,
  };
}

// ============================================
// Packaging POS Hooks
// ============================================

/**
 * List packaging products assigned to packaging POS slots (1-4).
 */
export function useConvexPackagingPosProducts() {
  const data = useQuery(api.menuProducts.queries.listPackagingPosProducts);
  if (data === undefined) return { data: undefined, isLoading: true };

  const packagingProducts = data.map((p): PackagingPosProduct => ({
    _id: p._id as unknown as string,
    code: p.code,
    name: p.name,
    grams: p.grams ?? 0,
    defaultPrice: p.defaultPrice,
    unitCost: p.unitCost,
    unitCostStaleAt: p.unitCostStaleAt,
    packagingPosSlot: p.packagingPosSlot as number,
    productType: "packaging",
  }));

  return {
    data: packagingProducts,
    isLoading: false,
  };
}

/**
 * Assign a packaging product to a packaging POS slot (1-4).
 * Validates product is packaging-type.
 * Requires admin authentication.
 */
export function useConvexAssignToPackagingSlot() {
  const protectedAssign = useProtectedMutation(api.menuProducts.mutations.assignToPackagingSlot);

  const execute = async (data: { id: Id<"menuProducts">; slot: number }) => {
    try {
      const id = await protectedAssign(data);
      toast.success(`Assigned to packaging slot ${data.slot}`);
      return id;
    } catch (error: unknown) {
      if (!(error instanceof Error && error.message === "Not authenticated")) {
        toast.error(getErrorMessage(error, "Failed to assign packaging slot"));
      }
      throw error;
    }
  };

  return {
    mutate: execute,
    mutateAsync: execute,
  };
}

/**
 * Remove a packaging product from its packaging POS slot.
 * Requires admin authentication.
 */
/**
 * Reorder food POS slots.
 * Takes an ordered array of product IDs and assigns slots 1, 2, 3...
 */
export function useConvexReorderSlots() {
  const protectedReorder = useProtectedMutation(api.menuProducts.mutations.reorderSlots);

  return {
    mutate: async (orderedProductIds: Id<"menuProducts">[]) => {
      try {
        await protectedReorder({ orderedProductIds });
      } catch (error: unknown) {
        if (!(error instanceof Error && error.message === "Not authenticated")) {
          toast.error(getErrorMessage(error, "Failed to reorder slots"));
        }
        throw error;
      }
    },
  };
}

/**
 * Reorder packaging POS slots.
 * Takes an ordered array of product IDs and assigns slots 1, 2, 3...
 */
export function useConvexReorderPackagingSlots() {
  const protectedReorder = useProtectedMutation(api.menuProducts.mutations.reorderPackagingSlots);

  return {
    mutate: async (orderedProductIds: Id<"menuProducts">[]) => {
      try {
        await protectedReorder({ orderedProductIds });
      } catch (error: unknown) {
        if (!(error instanceof Error && error.message === "Not authenticated")) {
          toast.error(getErrorMessage(error, "Failed to reorder packaging slots"));
        }
        throw error;
      }
    },
  };
}

export function useConvexRemoveFromPackagingSlot() {
  const protectedRemove = useProtectedMutation(api.menuProducts.mutations.removeFromPackagingSlot);

  return {
    mutate: async (id: Id<"menuProducts">) => {
      try {
        const resultId = await protectedRemove({ id });
        toast.success("Removed from packaging POS");
        return resultId;
      } catch (error: unknown) {
        if (!(error instanceof Error && error.message === "Not authenticated")) {
          toast.error(getErrorMessage(error, "Failed to remove from packaging slot"));
        }
        throw error;
      }
    },
  };
}

// ============================================
// COGS Recalculation Hook
// ============================================

/**
 * Recalculate all menu product costs.
 * Admin only. Returns diff summary of changed products.
 */
export interface RecalcResult {
  productId: string;
  name: string;
  oldCost: number | undefined;
  newCost: number;
  delta: number;
}

export function useConvexRecalculateAllCosts() {
  const recalculate = useMutation(api.menuProducts.mutations.recalculateAllCosts);
  const { user } = useAuth();

  return {
    recalculate: async (): Promise<RecalcResult[]> => {
      if (!user?.token) {
        toast.error("Session expired. Please log in again.");
        throw new Error("Not authenticated");
      }
      const results = await recalculate({ token: user.token });
      return results as RecalcResult[];
    },
  };
}
