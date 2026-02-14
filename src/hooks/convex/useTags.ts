/**
 * Convex hooks for tags.
 * Query hooks + factory-generated mutation hooks + standalone seed hook.
 */
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/utils";
import { createMutationHook } from "./createMutationHook";

// Types that match the Convex schema
export interface ConvexTag {
  _id: Id<"tags">;
  _creationTime: number;
  name: string;
}

export interface TagCreateInput {
  name: string;
}

/** List all tags. */
export function useConvexTags() {
  return useQuery(api.tags.queries.list, {});
}

/** Get a single tag by ID. */
export function useConvexTag(id: Id<"tags"> | undefined) {
  return useQuery(api.tags.queries.get, id ? { id } : "skip");
}

/** Get multiple tags by IDs. */
export function useConvexTagsMany(ids: Id<"tags">[]) {
  return useQuery(api.tags.queries.getMany, ids.length > 0 ? { ids } : "skip");
}

/** Create tag mutation with toast notifications. */
export const useConvexCreateTag = createMutationHook(
  api.tags.mutations.create,
  { successMessage: "Tag created successfully", errorMessage: "Failed to create tag" }
);

/** Update tag mutation with toast notifications. */
export const useConvexUpdateTag = createMutationHook(
  api.tags.mutations.update,
  { successMessage: "Tag updated successfully", errorMessage: "Failed to update tag" }
);

/** Delete tag mutation with toast notifications. */
export const useConvexDeleteTag = createMutationHook(
  api.tags.mutations.remove,
  { successMessage: "Tag deleted successfully", errorMessage: "Failed to delete tag" }
);

/**
 * Seed default tags mutation.
 * Uses useMutation (NOT useSessionMutation) -- seedDefaults is a public mutation.
 */
export function useConvexSeedTags() {
  const mutation = useMutation(api.tags.mutations.seedDefaults);

  return {
    mutate: async () => {
      try {
        const result = await mutation({});
        if (result.created.length > 0) {
          toast.success(result.message);
        }
        return result;
      } catch (error: unknown) {
        toast.error(getErrorMessage(error, "Failed to seed default tags"));
        throw error;
      }
    },
  };
}
