/**
 * Invoice hooks for invoice creation, editing, and finalization.
 * Created in Phase 57 Plan 02, consumed primarily by Phase 58.
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

/** Get all invoices for an order (skip if no orderId) */
export function useInvoicesByOrder(orderId: Id<"orders"> | undefined) {
  return useSessionQuery(
    api.invoices.queries.getByOrder,
    orderId ? { orderId } : "skip",
  );
}

/** Get a single invoice by ID (skip if no invoiceId) */
export function useInvoice(invoiceId: Id<"invoices"> | undefined) {
  return useSessionQuery(
    api.invoices.queries.getById,
    invoiceId ? { invoiceId } : "skip",
  );
}

// ============================================================================
// MUTATION HOOKS
// ============================================================================

/** Create a draft invoice from an order (no success toast -- auto-save feedback in Phase 58 UI) */
export const useCreateInvoiceDraft = createMutationHook(
  api.invoices.mutations.createDraft,
  { successMessage: "", errorMessage: "Failed to create invoice draft" },
);

/** Update a draft invoice (no success toast -- auto-save feedback in Phase 58 UI) */
export const useUpdateInvoiceDraft = createMutationHook(
  api.invoices.mutations.updateDraft,
  { successMessage: "", errorMessage: "Failed to save invoice" },
);

/** Discard (delete) a draft invoice */
export const useDiscardInvoiceDraft = createMutationHook(
  api.invoices.mutations.discardDraft,
  { successMessage: "Draft discarded", errorMessage: "Failed to discard draft" },
);

/** Finalize an invoice (assigns INV-YYMM-NNN number) */
export const useFinalizeInvoice = createMutationHook(
  api.invoices.mutations.finalize,
  { successMessage: "Invoice finalized", errorMessage: "Failed to finalize invoice" },
);

// ============================================================================
// TYPES
// ============================================================================

export type Invoice = NonNullable<ReturnType<typeof useInvoice>>;
