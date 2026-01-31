/**
 * Convex hooks for tags.
 * These replace the React Query + Axios hooks.
 */
import { useQuery, useMutation } from "convex/react";
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
 */
export function useConvexCreateTag() {
  const mutation = useMutation(api.tags.mutations.create);

  return {
    mutate: async (data: TagCreateInput) => {
      try {
        const id = await mutation(data);
        toast.success("Tag created successfully");
        return id;
      } catch (error: unknown) {
        toast.error(getErrorMessage(error, "Failed to create tag"));
        throw error;
      }
    },
    mutateAsync: async (data: TagCreateInput) => {
      try {
        const id = await mutation(data);
        toast.success("Tag created successfully");
        return id;
      } catch (error: unknown) {
        toast.error(getErrorMessage(error, "Failed to create tag"));
        throw error;
      }
    },
  };
}

/**
 * Update tag mutation with toast notifications.
 */
export function useConvexUpdateTag() {
  const mutation = useMutation(api.tags.mutations.update);

  return {
    mutate: async (data: { id: Id<"tags">; name: string }) => {
      try {
        const id = await mutation(data);
        toast.success("Tag updated successfully");
        return id;
      } catch (error: unknown) {
        toast.error(getErrorMessage(error, "Failed to update tag"));
        throw error;
      }
    },
    mutateAsync: async (data: { id: Id<"tags">; name: string }) => {
      try {
        const id = await mutation(data);
        toast.success("Tag updated successfully");
        return id;
      } catch (error: unknown) {
        toast.error(getErrorMessage(error, "Failed to update tag"));
        throw error;
      }
    },
  };
}

/**
 * Delete tag mutation with toast notifications.
 */
export function useConvexDeleteTag() {
  const mutation = useMutation(api.tags.mutations.remove);

  return {
    mutate: async (id: Id<"tags">) => {
      try {
        await mutation({ id });
        toast.success("Tag deleted successfully");
        return true;
      } catch (error: unknown) {
        toast.error(getErrorMessage(error, "Failed to delete tag"));
        throw error;
      }
    },
    mutateAsync: async (id: Id<"tags">) => {
      try {
        await mutation({ id });
        toast.success("Tag deleted successfully");
        return true;
      } catch (error: unknown) {
        toast.error(getErrorMessage(error, "Failed to delete tag"));
        throw error;
      }
    },
  };
}

/**
 * Seed default tags mutation.
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
