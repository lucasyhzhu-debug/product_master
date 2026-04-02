/**
 * Reimbursement hooks for batch management workflow.
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

/** List expenses awaiting payment, grouped by employee */
export function useAwaitingPayment() {
  return useSessionQuery(api.reimbursements.queries.listAwaitingPayment, {});
}

/** List reimbursement batches with optional status filter and search */
export function useBatches(
  status?: "pending" | "confirmed" | "voided",
  search?: string,
) {
  return useSessionQuery(api.reimbursements.queries.listBatches, {
    ...(status ? { status } : {}),
    ...(search ? { search } : {}),
  });
}

/** Get a single batch by ID (skip if undefined) */
export function useBatchById(
  batchId: Id<"reimbursementBatches"> | undefined,
) {
  return useSessionQuery(
    api.reimbursements.queries.getBatchById,
    batchId ? { batchId } : "skip",
  );
}

/** Get expenses for a batch (skip if undefined) */
export function useBatchItems(
  batchId: Id<"reimbursementBatches"> | undefined,
) {
  return useSessionQuery(
    api.reimbursements.queries.getBatchItems,
    batchId ? { batchId } : "skip",
  );
}

/** Check for existing pending batch for an employee */
export function usePendingBatchForEmployee(
  employeeUserId: Id<"users"> | undefined,
) {
  return useSessionQuery(
    api.reimbursements.queries.getPendingBatchForEmployee,
    employeeUserId ? { employeeUserId } : "skip",
  );
}

// ============================================================================
// MUTATION HOOKS
// ============================================================================

/** Create a pending reimbursement batch for one employee */
export const useCreateBatch = createMutationHook(
  api.reimbursements.mutations.createBatch,
  { successMessage: "Batch created", errorMessage: "Failed to create batch" },
);

/** Confirm a pending batch with bank transfer details */
export const useConfirmBatch = createMutationHook(
  api.reimbursements.mutations.confirmBatch,
  {
    successMessage: "Batch confirmed -- expenses marked as reimbursed",
    errorMessage: "Failed to confirm batch",
  },
);

/** Void a confirmed batch and return expenses to awaiting payment */
export const useVoidBatch = createMutationHook(
  api.reimbursements.mutations.voidBatch,
  {
    successMessage: "Batch voided -- expenses returned to awaiting payment",
    errorMessage: "Failed to void batch",
  },
);

/** Delete a pending batch so expenses can be re-batched */
export const useDeleteBatch = createMutationHook(
  api.reimbursements.mutations.deleteBatch,
  {
    successMessage: "Batch deleted -- expenses can be re-batched",
    errorMessage: "Failed to delete batch",
  },
);

/** Add expenses to an existing pending batch */
export const useAddExpensesToBatch = createMutationHook(
  api.reimbursements.mutations.addExpensesToBatch,
  {
    successMessage: "Expenses added to existing batch",
    errorMessage: "Failed to add expenses to batch",
  },
);

// ============================================================================
// TYPES
// ============================================================================

export type AwaitingPaymentGroup = NonNullable<
  ReturnType<typeof useAwaitingPayment>
>[number];
export type Batch = NonNullable<ReturnType<typeof useBatches>>[number];
