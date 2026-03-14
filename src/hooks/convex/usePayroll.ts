/**
 * Payroll hooks for payroll entry management.
 * Query hooks + factory-generated mutation hooks.
 */
import { useSessionQuery, useSessionMutation } from "convex-helpers/react/sessions";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { createMutationHook } from "./createMutationHook";

// STATUS TYPE -- matches schema union exactly
export type PayrollStatus = "active" | "voided";

// ============================================================================
// QUERY HOOKS
// ============================================================================

/** List payroll entries with optional employee type filter */
export function usePayrollEntries(employeeType?: "contractor" | "staff") {
  return useSessionQuery(api.payroll.queries.list, employeeType ? { employeeType } : {});
}

/** Get a single payroll entry by ID */
export function usePayrollEntry(id: Id<"payrollEntries"> | undefined) {
  return useSessionQuery(api.payroll.queries.getById, id ? { payrollId: id } : "skip");
}

// ============================================================================
// MUTATION HOOKS
// ============================================================================

export const useCreatePayroll = createMutationHook(
  api.payroll.mutations.create,
  { successMessage: "Payroll entry created", errorMessage: "Failed to create payroll entry" }
);

export const useVoidPayroll = createMutationHook(
  api.payroll.mutations.voidEntry,
  { successMessage: "Payroll entry voided", errorMessage: "Failed to void payroll entry" }
);

/** Raw mutation for upload URL -- no toast, used in upload flow */
export function usePayrollUploadUrl() {
  return useSessionMutation(api.payroll.mutations.generateUploadUrl);
}

// ============================================================================
// TYPES
// ============================================================================

export type PayrollEntry = NonNullable<ReturnType<typeof usePayrollEntries>>[number];
