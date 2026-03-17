/**
 * Business settings hooks for company identity management.
 * Query hooks use useSessionQuery (protectedQuery endpoints).
 * Mutation hooks use createMutationHook factory.
 */
import { useSessionQuery, useSessionMutation } from "convex-helpers/react/sessions";
import { api } from "../../../convex/_generated/api";
import { createMutationHook } from "./createMutationHook";

// ============================================================================
// QUERY HOOKS
// ============================================================================

/** Get the business settings singleton (admin/manager) */
export function useBusinessSettings() {
  return useSessionQuery(api.businessSettings.queries.get, {});
}

// ============================================================================
// MUTATION HOOKS
// ============================================================================

/** Create or update business settings (admin-only) */
export const useUpsertBusinessSettings = createMutationHook(
  api.businessSettings.mutations.upsert,
  { successMessage: "Settings saved", errorMessage: "Failed to save settings" },
);

/** Generate presigned upload URL for logo (admin-only, raw mutation -- no toast) */
export function useBusinessSettingsUploadUrl() {
  return useSessionMutation(api.businessSettings.mutations.generateUploadUrl);
}

// ============================================================================
// TYPES
// ============================================================================

export type BusinessSettings = NonNullable<ReturnType<typeof useBusinessSettings>>;
