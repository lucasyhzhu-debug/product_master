/**
 * Convex hooks for menu products.
 * These replace the React Query + Axios hooks.
 */
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id, Doc } from "../../../convex/_generated/dataModel";
import { toast } from "sonner";
import type { MenuProduct } from "@/lib/types";

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
}

export interface MenuProductUpdateInput {
  code?: string;
  name?: string;
  grams?: number;
  defaultPrice?: number;
  productionType?: string;
  productionUnits?: number;
  isActive?: boolean;
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

// ============================================
// Mutation Hooks
// ============================================

/**
 * Create a new menu product.
 */
export function useConvexCreateMenuProduct() {
  const mutation = useMutation(api.menuProducts.mutations.create);

  return {
    mutate: async (data: MenuProductCreateInput) => {
      try {
        const id = await mutation(data);
        toast.success("Menu product created");
        return id;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to create menu product";
        toast.error(message);
        throw error;
      }
    },
    mutateAsync: async (data: MenuProductCreateInput) => {
      try {
        const id = await mutation(data);
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
 */
export function useConvexUpdateMenuProduct() {
  const mutation = useMutation(api.menuProducts.mutations.update);

  return {
    mutate: async (data: { id: Id<"menuProducts">; updates: MenuProductUpdateInput }) => {
      try {
        await mutation({ id: data.id, ...data.updates });
        toast.success("Menu product updated");
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to update menu product";
        toast.error(message);
        throw error;
      }
    },
    mutateAsync: async (data: { id: Id<"menuProducts">; updates: MenuProductUpdateInput }) => {
      try {
        await mutation({ id: data.id, ...data.updates });
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
 */
export function useConvexDeleteMenuProduct() {
  const mutation = useMutation(api.menuProducts.mutations.remove);

  return {
    mutate: async (id: Id<"menuProducts">) => {
      try {
        await mutation({ id });
        toast.success("Menu product deleted");
        return true;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to delete menu product";
        toast.error(message);
        throw error;
      }
    },
    mutateAsync: async (id: Id<"menuProducts">) => {
      try {
        await mutation({ id });
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
