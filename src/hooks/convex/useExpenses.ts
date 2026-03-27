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
  | "voided"
  | "recorded"
  | "paid";

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
// RECEIPT DUPLICATE CHECK
// ============================================================================

/** Check if a receipt hash already exists on another expense (early duplicate detection) */
export function useCheckReceiptHash(hash: string | undefined, excludeExpenseId?: Id<"expenses">) {
  return useSessionQuery(
    api.expenses.queries.checkReceiptHash,
    hash ? { hash, ...(excludeExpenseId ? { excludeExpenseId } : {}) } : "skip"
  );
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
// PHASE 59: New payment method mutation hooks
// ============================================================================

export const useAcknowledgeExpense = createMutationHook(
  api.expenses.mutations.acknowledgeExpense,
  { successMessage: "Expense acknowledged", errorMessage: "Failed to acknowledge expense" }
);

export const useFlagExpense = createMutationHook(
  api.expenses.mutations.flagExpense,
  { successMessage: "Expense flagged for review", errorMessage: "Failed to flag expense" }
);

export const useMarkAsPaid = createMutationHook(
  api.expenses.mutations.markAsPaid,
  { successMessage: "Payment recorded", errorMessage: "Failed to record payment" }
);

// ============================================================================
// CAPEX CONVERSION (expense-to-fixed-asset)
// ============================================================================

export const useConvertToCapex = createMutationHook(
  api.expenses.mutations.convertToCapex,
  { successMessage: "", errorMessage: "Failed to convert expense to CapEx" }
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
