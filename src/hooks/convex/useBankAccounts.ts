/**
 * Bank account hooks for company bank account management and user bank details.
 * Query hooks use useSessionQuery (protectedQuery endpoints).
 * Mutation hooks use createMutationHook factory.
 */
import { useSessionQuery } from "convex-helpers/react/sessions";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { createMutationHook } from "./createMutationHook";

// ============================================================================
// QUERY HOOKS
// ============================================================================

/** List company bank accounts, optionally filtering to active-only */
export function useBankAccounts(activeOnly?: boolean) {
  return useSessionQuery(api.bankAccounts.queries.list, {
    ...(activeOnly !== undefined ? { activeOnly } : {}),
  });
}

/** Get a single bank account by ID (skip if undefined) */
export function useBankAccount(id: Id<"bankAccounts"> | undefined) {
  return useSessionQuery(
    api.bankAccounts.queries.getById,
    id ? { bankAccountId: id } : "skip",
  );
}

// ============================================================================
// MUTATION HOOKS -- Company Bank Accounts
// ============================================================================

// Suppress success/error toasts (EntityManager handles its own toasts)
/** Create a new company bank account */
export const useCreateBankAccount = createMutationHook(
  api.bankAccounts.mutations.create,
  { successMessage: "", errorMessage: "" },
);

/** Update a company bank account */
export const useUpdateBankAccount = createMutationHook(
  api.bankAccounts.mutations.update,
  { successMessage: "", errorMessage: "" },
);

/** Delete a company bank account */
export const useDeleteBankAccount = createMutationHook(
  api.bankAccounts.mutations.remove,
  { successMessage: "", errorMessage: "" },
);

// ============================================================================
// MUTATION HOOKS -- User Bank Details (I4 fix: lives here, not useExpenses)
// ============================================================================

/** Update current user's own bank details (any role) */
export const useUpdateBankDetails = createMutationHook(
  api.auth.mutations.updateBankDetails,
  { successMessage: "Bank details updated", errorMessage: "Failed to update bank details" },
);

// ============================================================================
// TYPES
// ============================================================================

export type BankAccount = NonNullable<ReturnType<typeof useBankAccounts>>[number];
