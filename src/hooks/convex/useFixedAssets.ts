/**
 * Fixed Asset hooks.
 * Query + mutation hooks for the Asset Register page (Phase 60).
 * Wraps protectedQuery/protectedMutation endpoints from convex/fixedAssets/.
 */
import { useSessionQuery, useSessionMutation } from "convex-helpers/react/sessions";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { createMutationHook } from "./createMutationHook";

// ============================================================================
// QUERY HOOKS
// ============================================================================

/** List all fixed assets with optional status filter */
export function useFixedAssets(statusFilter?: string) {
  return useSessionQuery(api.fixedAssets.queries.list, { statusFilter });
}

/** Get a single fixed asset by ID with enriched data */
export function useFixedAsset(assetId: Id<"fixedAssets"> | undefined) {
  return useSessionQuery(
    api.fixedAssets.queries.getById,
    assetId ? { assetId } : "skip"
  );
}

/**
 * Preview depreciation batch (manager + admin). Pass "skip" to avoid subscribing
 * when the consuming dialog is closed — getDepreciationPreview scans all active
 * depreciable assets, so lazy-loading is a meaningful perf win on page mount.
 */
export function useDepreciationPreview(mode: "run" | "skip" = "skip") {
  return useSessionQuery(
    api.fixedAssets.queries.getDepreciationPreview,
    mode === "run" ? {} : "skip"
  );
}

/** Lightweight depreciation reminder for Income Statement */
export function useDepreciationReminder() {
  return useSessionQuery(api.fixedAssets.queries.getDepreciationReminder, {});
}

/** One-off: find equipment_purchase JEs without matching assets. Pass "skip" to disable. */
export function useOrphanEquipmentPurchases(mode: "run" | "skip" = "run") {
  return useSessionQuery(
    api.fixedAssets.queries.getOrphanEquipmentPurchases,
    mode === "skip" ? "skip" : {}
  );
}

/** Find active assets without acquisition JE (for backfill banner). Pass "skip" to disable. */
export function useAssetsWithoutAcquisitionJE(mode: "run" | "skip" = "run") {
  return useSessionQuery(
    api.fixedAssets.queries.getAssetsWithoutAcquisitionJE,
    mode === "skip" ? "skip" : {}
  );
}

// ============================================================================
// MUTATION HOOKS
// ============================================================================

/** Create a new fixed asset */
export const useCreateAsset = createMutationHook(
  api.fixedAssets.mutations.create,
  { successMessage: "Asset registered", errorMessage: "Failed to create asset" }
);

/** Update non-financial fields on an asset */
export const useUpdateAsset = createMutationHook(
  api.fixedAssets.mutations.update,
  { successMessage: "Asset updated", errorMessage: "Failed to update asset" }
);

/** Run depreciation batch ("Catch Up to Now"). Empty successMessage — caller shows detailed toast. */
export const useRunDepreciation = createMutationHook(
  api.fixedAssets.mutations.runDepreciation,
  { successMessage: "", errorMessage: "Failed to run depreciation" }
);

/** Dispose an asset (sold/scrapped/written_off/reclassify_to_expense). Empty successMessage — dialog handles all success toasts contextually. */
export const useDisposeAsset = createMutationHook(
  api.fixedAssets.mutations.disposeAsset,
  { successMessage: "", errorMessage: "Failed to dispose asset" }
);

/** Void an entire month's depreciation run */
export const useVoidDepreciationMonth = createMutationHook(
  api.fixedAssets.mutations.voidDepreciationMonth,
  { successMessage: "Depreciation month voided", errorMessage: "Failed to void depreciation" }
);

/** Backfill acquisition JEs for orphan assets (admin). Empty successMessage — caller shows detailed toast. */
export const useBackfillAcquisitionJEs = createMutationHook(
  api.fixedAssets.mutations.backfillAcquisitionJEs,
  { successMessage: "", errorMessage: "Failed to backfill acquisition JEs" }
);

/** Raw mutation for upload URL -- no toast, used in upload flow */
export function useGenerateAssetUploadUrl() {
  return useSessionMutation(api.fixedAssets.mutations.generateUploadUrl);
}
