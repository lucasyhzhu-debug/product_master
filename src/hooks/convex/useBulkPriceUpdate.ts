/**
 * Hooks for bulk price update mutations (Phase 68: COGS Bulk Price Update).
 */
import { createMutationHook } from "./createMutationHook";
import { api } from "../../../convex/_generated/api";

/** Bulk update ingredient prices. */
export const useBulkUpdateIngredientPrices = createMutationHook(
  api.ingredients.mutations.bulkUpdatePrices,
  {
    successMessage: "Ingredient prices updated",
    errorMessage: "Failed to update ingredient prices",
  }
);

/** Bulk update packaging material prices. */
export const useBulkUpdateMaterialPrices = createMutationHook(
  api.materials.mutations.bulkUpdatePrices,
  {
    successMessage: "Material prices updated",
    errorMessage: "Failed to update material prices",
  }
);
