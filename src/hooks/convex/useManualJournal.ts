/**
 * Manual Journal Entry hooks.
 * Query + mutation hooks for the Manual Journal Entry page (Phase 62).
 * Wraps protectedQuery endpoint from convex/manualJournal/queries.ts
 * and protectedMutation endpoint from convex/manualJournal/mutations.ts.
 */
import { useSessionQuery } from "convex-helpers/react/sessions";
import { createMutationHook } from "./createMutationHook";
import { api } from "../../../convex/_generated/api";

// ============================================================================
// QUERY HOOKS
// ============================================================================

/** List template-based manual journal entries for a date period */
export function useManualJournalEntries(periodStart: number, periodEnd: number) {
  return useSessionQuery(api.manualJournal.queries.listByPeriod, {
    periodStart,
    periodEnd,
  });
}

// ============================================================================
// MUTATION HOOKS
// ============================================================================

/** Create a manual journal entry from a template */
export const useCreateManualJournalEntry = createMutationHook(
  api.manualJournal.mutations.create,
  { successMessage: "Journal entry created", errorMessage: "Failed to create journal entry" }
);
