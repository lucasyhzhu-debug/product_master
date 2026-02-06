/**
 * Convex hooks for menu products.
 * These replace the React Query + Axios hooks.
 */
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id, Doc } from "../../../convex/_generated/dataModel";
import { toast } from "sonner";
import type { MenuProduct } from "@/lib/types";
import { useAuth } from "../../contexts/AuthContext";

// ============================================
// Types
// ============================================

export interface MenuProductCreateInput {
  code?: string;
  name: string;
  grams?: number;
  defaultPrice: number;
  productionType?: string;
  productionUnits?: number;
  isActive?: boolean;
  // Unified BOM: Components array using componentTypeId
  components?: Array<{
    componentTypeId: Id<"componentTypes">;
    quantity: number;
    consumptionStage?: "boxing" | "labeling" | "none";
  }>;
}

export interface MenuProductUpdateInput {
  code?: string;
  name?: string;
  grams?: number;
  defaultPrice?: number;
  productionType?: string;
  productionUnits?: number;
  isActive?: boolean;
  // Unified BOM: Components array using componentTypeId
  components?: Array<{
    componentTypeId: Id<"componentTypes">;
    quantity: number;
    consumptionStage?: "boxing" | "labeling" | "none";
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
    production_type: (product.productionType ?? 'original') as 'original' | 'bite_sized',
    production_units: product.productionUnits ?? 1,
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
 * List only fixed menu products (isFixed === true).
 * PRD-5: For POS order form.
 * Returns raw Convex data with camelCase fields for POS components.
 */
export interface FixedProduct {
  _id: string;
  code: string;
  name: string;
  grams: number;
  defaultPrice: number;
  unitCost?: number;
  productionType?: string;
  productionUnits?: number;
}

export function useConvexFixedProducts() {
  const allProducts = useQuery(api.menuProducts.queries.list, { activeOnly: true });
  if (allProducts === undefined) return { data: undefined, isLoading: true };

  // Filter to only fixed products and transform to POS-compatible format
  const fixedProducts = allProducts
    .filter(p => p.isFixed === true)
    .map((p): FixedProduct => ({
      _id: p._id as unknown as string,
      code: p.code,
      name: p.name,
      grams: p.grams ?? 0,
      defaultPrice: p.defaultPrice,
      unitCost: p.unitCost,
      productionType: p.productionType,
      productionUnits: p.productionUnits,
    }));

  return {
    data: fixedProducts,
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
  productionType?: string;
  productionUnits?: number;
  posSlot: number;
  isFixed?: boolean;
  productType?: "food" | "packaging";
  cachedProductionSummary?: string;
}

export interface PackagingPosProduct {
  _id: string;
  code: string;
  name: string;
  defaultPrice: number;
  unitCost?: number;
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
    productionType: p.productionType,
    productionUnits: p.productionUnits,
    posSlot: p.posSlot as number,
    isFixed: p.isFixed,
    productType: p.productType as "food" | "packaging" | undefined,
    cachedProductionSummary: p.cachedProductionSummary,
  }));

  return {
    data: posProducts,
    isLoading: false,
  };
}

/**
 * PRD-8 Phase 2: List legacy products (not on POS).
 * Returns products with posSlot undefined.
 */
export interface LegacyProduct {
  _id: string;
  code: string;
  name: string;
  grams: number;
  defaultPrice: number;
  unitCost?: number;
  productionType?: string;
  productionUnits?: number;
  isFixed?: boolean;
  productType?: "food" | "packaging";
  cachedProductionSummary?: string;
}

export function useConvexLegacyProducts() {
  const data = useQuery(api.menuProducts.queries.listLegacyProducts);
  if (data === undefined) return { data: undefined, isLoading: true };

  // Transform to POS-compatible format
  const legacyProducts = data.map((p): LegacyProduct => ({
    _id: p._id as unknown as string,
    code: p.code,
    name: p.name,
    grams: p.grams ?? 0,
    defaultPrice: p.defaultPrice,
    unitCost: p.unitCost,
    productionType: p.productionType,
    productionUnits: p.productionUnits,
    isFixed: p.isFixed,
    productType: p.productType as "food" | "packaging" | undefined,
    cachedProductionSummary: p.cachedProductionSummary,
  }));

  return {
    data: legacyProducts,
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
  const mutation = useMutation(api.menuProducts.mutations.create);
  const { user } = useAuth();

  return {
    mutate: async (data: MenuProductCreateInput) => {
      if (!user?.token) {
        toast.error("Session expired. Please log in again.");
        throw new Error("Not authenticated");
      }
      try {
        const id = await mutation({ ...data, token: user.token });
        toast.success("Menu product created");
        return id;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to create menu product";
        toast.error(message);
        throw error;
      }
    },
    mutateAsync: async (data: MenuProductCreateInput) => {
      if (!user?.token) {
        toast.error("Session expired. Please log in again.");
        throw new Error("Not authenticated");
      }
      try {
        const id = await mutation({ ...data, token: user.token });
        toast.success("Menu product created");
        return id;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to create menu product";
        toast.error(message);
        throw error;
      }
    },
  };
}

/**
 * Update an existing menu product.
 * Requires admin authentication.
 */
export function useConvexUpdateMenuProduct() {
  const mutation = useMutation(api.menuProducts.mutations.update);
  const { user } = useAuth();

  return {
    mutate: async (data: { id: Id<"menuProducts">; updates: MenuProductUpdateInput }) => {
      if (!user?.token) {
        toast.error("Session expired. Please log in again.");
        throw new Error("Not authenticated");
      }
      try {
        await mutation({ id: data.id, token: user.token, ...data.updates });
        toast.success("Menu product updated");
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to update menu product";
        toast.error(message);
        throw error;
      }
    },
    mutateAsync: async (data: { id: Id<"menuProducts">; updates: MenuProductUpdateInput }) => {
      if (!user?.token) {
        toast.error("Session expired. Please log in again.");
        throw new Error("Not authenticated");
      }
      try {
        await mutation({ id: data.id, token: user.token, ...data.updates });
        toast.success("Menu product updated");
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to update menu product";
        toast.error(message);
        throw error;
      }
    },
  };
}

/**
 * Delete a menu product.
 * Requires admin authentication.
 */
export function useConvexDeleteMenuProduct() {
  const mutation = useMutation(api.menuProducts.mutations.remove);
  const { user } = useAuth();

  return {
    mutate: async (id: Id<"menuProducts">) => {
      if (!user?.token) {
        toast.error("Session expired. Please log in again.");
        throw new Error("Not authenticated");
      }
      try {
        await mutation({ id, token: user.token });
        toast.success("Menu product deleted");
        return true;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to delete menu product";
        toast.error(message);
        throw error;
      }
    },
    mutateAsync: async (id: Id<"menuProducts">) => {
      if (!user?.token) {
        toast.error("Session expired. Please log in again.");
        throw new Error("Not authenticated");
      }
      try {
        await mutation({ id, token: user.token });
        toast.success("Menu product deleted");
        return true;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to delete menu product";
        toast.error(message);
        throw error;
      }
    },
  };
}

/**
 * PRD-8 Phase 2: Assign a menu product to a POS slot (1-4).
 * Automatically swaps if slot is occupied.
 * Requires admin authentication.
 */
export function useConvexAssignToSlot() {
  const mutation = useMutation(api.menuProducts.mutations.assignToSlot);
  const { user } = useAuth();

  return {
    mutate: async (data: { id: Id<"menuProducts">; slot: number }) => {
      if (!user?.token) {
        toast.error("Session expired. Please log in again.");
        throw new Error("Not authenticated");
      }
      try {
        const id = await mutation({ ...data, token: user.token });
        toast.success(`Assigned to slot ${data.slot}`);
        return id;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to assign slot";
        toast.error(message);
        throw error;
      }
    },
    mutateAsync: async (data: { id: Id<"menuProducts">; slot: number }) => {
      if (!user?.token) {
        toast.error("Session expired. Please log in again.");
        throw new Error("Not authenticated");
      }
      try {
        const id = await mutation({ ...data, token: user.token });
        toast.success(`Assigned to slot ${data.slot}`);
        return id;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to assign slot";
        toast.error(message);
        throw error;
      }
    },
  };
}

/**
 * PRD-8 Phase 2: Remove a menu product from POS slot.
 * Moves product to legacy section.
 * Requires admin authentication.
 */
export function useConvexRemoveFromSlot() {
  const mutation = useMutation(api.menuProducts.mutations.removeFromSlot);
  const { user } = useAuth();

  return {
    mutate: async (id: Id<"menuProducts">) => {
      if (!user?.token) {
        toast.error("Session expired. Please log in again.");
        throw new Error("Not authenticated");
      }
      try {
        const resultId = await mutation({ id, token: user.token });
        toast.success("Removed from POS");
        return resultId;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to remove from slot";
        toast.error(message);
        throw error;
      }
    },
    mutateAsync: async (id: Id<"menuProducts">) => {
      if (!user?.token) {
        toast.error("Session expired. Please log in again.");
        throw new Error("Not authenticated");
      }
      try {
        const resultId = await mutation({ id, token: user.token });
        toast.success("Removed from POS");
        return resultId;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to remove from slot";
        toast.error(message);
        throw error;
      }
    },
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
    defaultPrice: p.defaultPrice,
    unitCost: p.unitCost,
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
  const mutation = useMutation(api.menuProducts.mutations.assignToPackagingSlot);
  const { user } = useAuth();

  return {
    mutate: async (data: { id: Id<"menuProducts">; slot: number }) => {
      if (!user?.token) {
        toast.error("Session expired. Please log in again.");
        throw new Error("Not authenticated");
      }
      try {
        const id = await mutation({ ...data, token: user.token });
        toast.success(`Assigned to packaging slot ${data.slot}`);
        return id;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to assign packaging slot";
        toast.error(message);
        throw error;
      }
    },
  };
}

/**
 * Remove a packaging product from its packaging POS slot.
 * Requires admin authentication.
 */
export function useConvexRemoveFromPackagingSlot() {
  const mutation = useMutation(api.menuProducts.mutations.removeFromPackagingSlot);
  const { user } = useAuth();

  return {
    mutate: async (id: Id<"menuProducts">) => {
      if (!user?.token) {
        toast.error("Session expired. Please log in again.");
        throw new Error("Not authenticated");
      }
      try {
        const resultId = await mutation({ id, token: user.token });
        toast.success("Removed from packaging POS");
        return resultId;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to remove from packaging slot";
        toast.error(message);
        throw error;
      }
    },
  };
}
