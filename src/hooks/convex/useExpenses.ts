/**
 * Expense hooks for expense submission workflow.
 * Query hooks + factory-generated mutation hooks.
 */
import { useSessionQuery, useSessionMutation } from "convex-helpers/react/sessions";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { createMutationHook } from "./createMutationHook";

// STATUS TYPE -- matches schema union exactly
export type ExpenseStatus =
  | "draft"
  | "submitted"
  | "approved"
  | "rejected"
  | "awaiting_payment"
  | "reimbursed"
  | "voided";

// ============================================================================
// QUERY HOOKS
// ============================================================================

/** List current user's expenses with optional status filter */
export function useMyExpenses(status?: ExpenseStatus) {
  return useSessionQuery(api.expenses.queries.listMyExpenses, status ? { status } : {});
}

/** Get a single expense by ID */
export function useExpense(id: Id<"expenses"> | undefined) {
  return useSessionQuery(api.expenses.queries.getById, id ? { expenseId: id } : "skip");
}

/** Get the status change history for an expense (audit trail) */
export function useExpenseStatusHistory(expenseId: Id<"expenses"> | undefined) {
  return useSessionQuery(
    api.expenses.queries.getStatusHistory,
    expenseId ? { expenseId } : "skip"
  );
}

// ============================================================================
// MUTATION HOOKS
// ============================================================================

export const useCreateExpenseDraft = createMutationHook(
  api.expenses.mutations.createDraft,
  { successMessage: "Draft saved", errorMessage: "Failed to save draft" }
);

export const useUpdateExpenseDraft = createMutationHook(
  api.expenses.mutations.updateDraft,
  { successMessage: "Draft updated", errorMessage: "Failed to update draft" }
);

export const useSubmitExpense = createMutationHook(
  api.expenses.mutations.submitExpense,
  { successMessage: "Expense submitted for approval", errorMessage: "Failed to submit expense" }
);

// Special hook for generateUploadUrl -- needs raw mutation, not toast wrapper
// because it's called as part of the upload flow, not as a standalone action
export function useExpenseUploadUrl() {
  return useSessionMutation(api.expenses.mutations.generateUploadUrl);
}

// ============================================================================
// APPROVAL QUERY HOOKS (Phase 45)
// ============================================================================

/** List expenses pending approval for the current user (manager/admin only) */
export function usePendingForApproval() {
  return useSessionQuery(api.expenses.queries.listPendingForApproval, {});
}

/** Get the rejection chain for an expense (previous rejected versions) */
export function useRejectionChain(expenseId: Id<"expenses"> | undefined) {
  return useSessionQuery(
    api.expenses.queries.getRejectionChain,
    expenseId ? { expenseId } : "skip"
  );
}

// ============================================================================
// APPROVAL MUTATION HOOKS (Phase 45)
// ============================================================================

export const useApproveExpense = createMutationHook(
  api.expenses.mutations.approveExpense,
  { successMessage: "Expense approved", errorMessage: "Failed to approve expense" }
);

export const useRejectExpense = createMutationHook(
  api.expenses.mutations.rejectExpense,
  { successMessage: "Expense rejected", errorMessage: "Failed to reject expense" }
);

export const useVoidExpense = createMutationHook(
  api.expenses.mutations.voidExpense,
  { successMessage: "Expense voided", errorMessage: "Failed to void expense" }
);

// ============================================================================
// TYPES
// ============================================================================

export type Expense = NonNullable<ReturnType<typeof useMyExpenses>>[number];
export type ExpenseStatusHistoryEntry = NonNullable<
  ReturnType<typeof useExpenseStatusHistory>
>[number];
export type PendingExpense = NonNullable<ReturnType<typeof usePendingForApproval>>[number];
export type RejectionChainEntry = NonNullable<ReturnType<typeof useRejectionChain>>[number];
