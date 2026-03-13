/**
 * Accounts hooks for Chart of Accounts management.
 * Query hooks + factory-generated mutation hooks (with toast notifications).
 */

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { createMutationHook } from "./createMutationHook";

// ============================================================================
// QUERY HOOKS
// ============================================================================

/** List all accounts, optionally filtered to active-only */
export function useAccounts(activeOnly?: boolean) {
  return useQuery(api.accounts.queries.list, { activeOnly });
}

/** Get a single account by ID */
export function useAccount(id: Id<"accounts"> | undefined) {
  return useQuery(api.accounts.queries.getById, id ? { id } : "skip");
}

// ============================================================================
// MUTATION HOOKS
// ============================================================================

// Suppress successMessage to avoid double toast
// (EntityManager already shows toast on success; createMutationHook would add a second one)

/** Create a new GL account */
export const useCreateAccount = createMutationHook(
  api.accounts.mutations.create,
  { successMessage: "", errorMessage: "Failed to create account" }
);

/** Update an existing GL account */
export const useUpdateAccount = createMutationHook(
  api.accounts.mutations.update,
  { successMessage: "", errorMessage: "Failed to update account" }
);

/** Delete a GL account */
export const useDeleteAccount = createMutationHook(
  api.accounts.mutations.remove,
  { successMessage: "", errorMessage: "Failed to delete account" }
);

// ============================================================================
// TYPES
// ============================================================================

export type Account = NonNullable<ReturnType<typeof useAccounts>>[number];
