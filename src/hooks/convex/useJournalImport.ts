/**
 * Journal Import hooks for historical expense bulk upload.
 * Wraps bulkCreateJournalEntries mutation with createMutationHook factory.
 */

import { createMutationHook } from "./createMutationHook";
import { api } from "../../../convex/_generated/api";

/** Bulk-create journal entries from CSV import rows (batched, admin-only) */
export const useBulkCreateJournalEntries = createMutationHook(
  api.journalImport.mutations.bulkCreateJournalEntries,
  {
    // Page handles its own progress UI -- suppress toasts
    successMessage: "",
    errorMessage: "",
  }
);
