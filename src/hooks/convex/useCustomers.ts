/**
 * Convex hooks for customers.
 * Convex query/mutation hooks for customer management.
 * Transforms Convex camelCase to frontend snake_case for compatibility.
 */
import { useQuery } from "convex/react";
import { useSessionMutation } from "convex-helpers/react/sessions";
import { api } from "../../../convex/_generated/api";
import type { Id, Doc } from "../../../convex/_generated/dataModel";
import { toast } from "sonner";
import type { Customer } from "@/lib/types";
import { getErrorMessage } from "@/lib/utils";

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
// Transform Functions (Internal)
// ============================================

type ConvexCustomer = Doc<"customers">;

function transformCustomer(customer: ConvexCustomer): Customer {
  return {
    id: customer._id as unknown as number,
    name: customer.name,
    phone: customer.phone ?? null,
    source: customer.source ?? null,
    notes: customer.notes ?? null,
    created_at: new Date(customer._creationTime).toISOString(),
    updated_at: new Date(customer._creationTime).toISOString(), // Convex doesn't track updated_at
    created_by: customer.createdBy ?? "admin",
  };
}

// ============================================
// Query Hooks
// ============================================

/**
 * List all customers.
 */
export function useConvexCustomers(limit?: number) {
  const data = useQuery(api.customers.queries.list, { limit });
  if (data === undefined) return { data: undefined, isLoading: true };
  return {
    data: data.map(transformCustomer),
    isLoading: false,
  };
}

/**
 * Get a single customer by ID.
 */
export function useConvexCustomer(id: Id<"customers"> | undefined) {
  const data = useQuery(api.customers.queries.get, id ? { id } : "skip");
  if (data === undefined) return { data: undefined, isLoading: id !== undefined };
  if (data === null) return { data: null, isLoading: false };
  return {
    data: transformCustomer(data),
    isLoading: false,
  };
}

/**
 * Search customers by name or phone.
 */
export function useConvexCustomerSearch(query: string, limit?: number) {
  const data = useQuery(
    api.customers.queries.search,
    query ? { query, limit } : "skip"
  );
  if (data === undefined) return { data: undefined, isLoading: query !== "" };
  return {
    data: (data ?? []).map(transformCustomer),
    isLoading: false,
  };
}

/**
 * Get customer by phone number.
 */
export function useConvexCustomerByPhone(phone: string | undefined) {
  const data = useQuery(
    api.customers.queries.getByPhone,
    phone ? { phone } : "skip"
  );
  if (data === undefined) return { data: undefined, isLoading: phone !== undefined };
  if (data === null) return { data: null, isLoading: false };
  return {
    data: transformCustomer(data),
    isLoading: false,
  };
}

// ============================================
// Mutation Hooks
// ============================================

/**
 * Create a new customer.
 */
export function useConvexCreateCustomer() {
  const mutation = useSessionMutation(api.customers.mutations.create);

  const execute = async (data: CustomerCreateInput) => {
    try {
      const id = await mutation(data);
      toast.success("Customer created");
      return id;
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to create customer"));
      throw error;
    }
  };

  return { mutate: execute, mutateAsync: execute };
}

/**
 * Update an existing customer.
 */
export function useConvexUpdateCustomer() {
  const mutation = useSessionMutation(api.customers.mutations.update);

  const execute = async (data: { id: Id<"customers">; updates: CustomerUpdateInput }) => {
    try {
      await mutation({ id: data.id, ...data.updates });
      toast.success("Customer updated");
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to update customer"));
      throw error;
    }
  };

  return { mutate: execute, mutateAsync: execute };
}

/**
 * Delete a customer.
 */
export function useConvexDeleteCustomer() {
  const mutation = useSessionMutation(api.customers.mutations.remove);

  const execute = async (id: Id<"customers">) => {
    try {
      await mutation({ id });
      toast.success("Customer deleted");
      return true;
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to delete customer"));
      throw error;
    }
  };

  return { mutate: execute, mutateAsync: execute };
}
