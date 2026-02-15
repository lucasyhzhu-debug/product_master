/**
 * Convex hooks for customers.
 * Query hooks return raw Convex data. Factory-generated mutation hooks.
 */
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { createMutationHook } from "./createMutationHook";

// ============================================
// Types
// ============================================

export interface CustomerCreateInput {
  name: string;
  phone?: string;
  source?: string;
  notes?: string;
}

export interface CustomerUpdateInput {
  name?: string;
  phone?: string;
  source?: string;
  notes?: string;
}

// ============================================
// Query Hooks
// ============================================

/** List all customers. */
export function useConvexCustomers(limit?: number) {
  return useQuery(api.customers.queries.list, { limit });
}

/** Get a single customer by ID. */
export function useConvexCustomer(id: Id<"customers"> | undefined) {
  return useQuery(api.customers.queries.get, id ? { id } : "skip");
}

/** Search customers by name or phone. */
export function useConvexCustomerSearch(query: string, limit?: number) {
  return useQuery(
    api.customers.queries.search,
    query ? { query, limit } : "skip"
  );
}

/** Get customer by phone number. */
export function useConvexCustomerByPhone(phone: string | undefined) {
  return useQuery(
    api.customers.queries.getByPhone,
    phone ? { phone } : "skip"
  );
}

// ============================================
// Mutation Hooks
// ============================================

/** Create a new customer. */
export const useConvexCreateCustomer = createMutationHook(
  api.customers.mutations.create,
  { successMessage: "Customer created", errorMessage: "Failed to create customer" }
);

/** Update an existing customer. */
export const useConvexUpdateCustomer = createMutationHook(
  api.customers.mutations.update,
  { successMessage: "Customer updated", errorMessage: "Failed to update customer" }
);

/** Delete a customer. */
export const useConvexDeleteCustomer = createMutationHook(
  api.customers.mutations.remove,
  { successMessage: "Customer deleted", errorMessage: "Failed to delete customer" }
);
