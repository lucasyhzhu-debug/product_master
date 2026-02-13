/**
 * Convex hooks for tags.
 * Convex query/mutation hooks for tag management.
 */
import { useQuery, useMutation } from "convex/react";
import { useSessionMutation } from "convex-helpers/react/sessions";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/utils";

// Types that match the Convex schema
export interface ConvexTag {
  _id: Id<"tags">;
  _creationTime: number;
  name: string;
}

export interface TagCreateInput {
  name: string;
}

/**
 * List all tags.
 */
export function useConvexTags() {
  return useQuery(api.tags.queries.list, {});
}

/**
 * Get a single tag by ID.
 */
export function useConvexTag(id: Id<"tags"> | undefined) {
  return useQuery(api.tags.queries.get, id ? { id } : "skip");
}

/**
 * Get multiple tags by IDs.
 */
export function useConvexTagsMany(ids: Id<"tags">[]) {
  return useQuery(api.tags.queries.getMany, ids.length > 0 ? { ids } : "skip");
}

/**
 * Create tag mutation with toast notifications.
 * Uses useSessionMutation for automatic sessionId injection.
 */
export function useConvexCreateTag() {
  const mutation = useSessionMutation(api.tags.mutations.create);

  const execute = async (data: TagCreateInput) => {
    try {
      const id = await mutation(data);
      toast.success("Tag created successfully");
      return id;
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to create tag"));
      throw error;
    }
  };

  return { mutate: execute, mutateAsync: execute };
}

/**
 * Update tag mutation with toast notifications.
 */
export function useConvexUpdateTag() {
  const mutation = useSessionMutation(api.tags.mutations.update);

  const execute = async (data: { id: Id<"tags">; name: string }) => {
    try {
      const id = await mutation(data);
      toast.success("Tag updated successfully");
      return id;
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to update tag"));
      throw error;
    }
  };

  return { mutate: execute, mutateAsync: execute };
}

/**
 * Delete tag mutation with toast notifications.
 */
export function useConvexDeleteTag() {
  const mutation = useSessionMutation(api.tags.mutations.remove);

  const execute = async (id: Id<"tags">) => {
    try {
      await mutation({ id });
      toast.success("Tag deleted successfully");
      return true;
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to delete tag"));
      throw error;
    }
  };

  return { mutate: execute, mutateAsync: execute };
}

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
