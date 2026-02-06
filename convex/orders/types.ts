/**
 * Shared types for order-related queries and helpers.
 * Only unifies types from queries.ts and whatsapp.ts.
 * ballDistribution.ts has its own OrderWithItems shape (different structure).
 */
import type { Doc } from "../_generated/dataModel";

/**
 * Order with items and customer data.
 * Used by queries.ts and whatsapp.ts.
 */
export interface OrderWithItems extends Doc<"orders"> {
  items: Doc<"orderItems">[];
  customer: Doc<"customers"> | null;
}
