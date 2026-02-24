/**
 * Convex hooks for visual feedback overlay.
 * Manages screenshot capture, feedback items, and comments.
 */
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { toast } from "sonner";

// ============================================
// Types
// ============================================

export type FeedbackStatus = "ongoing" | "archived";
export type FeedbackPriority = "low" | "medium" | "high";
export type FeedbackTag = "bug" | "enhancement" | "question";

export interface FeedbackComment {
  content: string;
  createdBy?: string;
  createdAt: number;
}

export interface FeedbackItem {
  _id: Id<"feedback">;
  _creationTime: number;
  screenshotStorageId: Id<"_storage">;
  screenshotUrl: string | null;
  elementSelector?: string;
  pageUrl: string;
  pageTitle: string;
  description: string;
  status: FeedbackStatus;
  priority: FeedbackPriority;
  tags: string[];
  comments?: FeedbackComment[];
  createdBy?: string;
}

export interface FeedbackCreateInput {
  screenshotStorageId: Id<"_storage">;
  elementSelector?: string;
  pageUrl: string;
  pageTitle: string;
  description: string;
  priority: FeedbackPriority;
  tags: string[];
  createdBy?: string;
}

export interface FeedbackStats {
  total: number;
  ongoing: number;
  archived: number;
  highPriority: number;
  mediumPriority: number;
  lowPriority: number;
  tagCounts: Record<string, number>;
}

// ============================================
// Query Hooks
// ============================================

/**
 * Get all feedback items with optional status filter.
 * Includes screenshot URLs.
 */
export function useFeedbackList(status?: FeedbackStatus) {
  const data = useQuery(api.feedback.queries.list, { status });

  if (data === undefined) {
    return { data: undefined, isLoading: true };
  }

  return { data: data as FeedbackItem[], isLoading: false };
}

/**
 * Get a single feedback item by ID.
 */
export function useFeedback(id: Id<"feedback"> | undefined) {
  const data = useQuery(
    api.feedback.queries.get,
    id ? { id } : "skip"
  );

  if (data === undefined) {
    return { data: undefined, isLoading: true };
  }

  return { data: data as FeedbackItem | null, isLoading: false };
}

/**
 * Get only ongoing feedback for export.
 */
export function useFeedbackExport() {
  const data = useQuery(api.feedback.queries.getExportData, {});

  if (data === undefined) {
    return { data: undefined, isLoading: true };
  }

  return { data: data as FeedbackItem[], isLoading: false };
}

/**
 * Get feedback statistics for dashboard.
 */
export function useFeedbackStats() {
  const data = useQuery(api.feedback.queries.getStats, {});

  if (data === undefined) {
    return { data: undefined, isLoading: true };
  }

  return { data: data as FeedbackStats, isLoading: false };
}

/**
 * Get count of ongoing feedback (for badge display).
 */
export function useOngoingFeedbackCount() {
  const { data, isLoading } = useFeedbackStats();

  if (isLoading || !data) {
    return { count: 0, isLoading };
  }

  return { count: data.ongoing, isLoading: false };
}

// ============================================
// Mutation Hooks
// ============================================

/**
 * Generate upload URL for screenshot.
 * Call this before uploading the screenshot blob.
 */
export function useGenerateUploadUrl() {
  const mutation = useMutation(api.feedback.mutations.generateUploadUrl);

  return {
    mutate: async () => {
      try {
        const uploadUrl = await mutation();
        return uploadUrl;
      } catch (error) {
        toast.error("Failed to generate upload URL");
        throw error;
      }
    },
  };
}

/**
 * Create a new feedback item.
 * Screenshot must be uploaded first using generateUploadUrl.
 */
export function useCreateFeedback() {
  const mutation = useMutation(api.feedback.mutations.create);

  return {
    mutate: async (input: FeedbackCreateInput) => {
      try {
        const id = await mutation(input);
        toast.success("Feedback submitted successfully");
        return id;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to create feedback";
        toast.error(message);
        throw error;
      }
    },
  };
}

/**
 * Add a comment to existing feedback.
 */
export function useAddFeedbackComment() {
  const mutation = useMutation(api.feedback.mutations.addComment);

  return {
    mutate: async (feedbackId: Id<"feedback">, content: string, createdBy?: string) => {
      try {
        await mutation({ feedbackId, content, createdBy });
        toast.success("Comment added");
        return feedbackId;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to add comment";
        toast.error(message);
        throw error;
      }
    },
  };
}

/**
 * Toggle feedback status between ongoing and archived.
 */
export function useToggleFeedbackStatus() {
  const mutation = useMutation(api.feedback.mutations.toggleStatus);

  return {
    mutate: async (feedbackId: Id<"feedback">) => {
      try {
        await mutation({ feedbackId });
        toast.success("Status updated");
        return feedbackId;
      } catch (error) {
        toast.error("Failed to update status");
        throw error;
      }
    },
  };
}

/**
 * Update feedback priority.
 */
export function useUpdateFeedbackPriority() {
  const mutation = useMutation(api.feedback.mutations.updatePriority);

  return {
    mutate: async (feedbackId: Id<"feedback">, priority: FeedbackPriority) => {
      try {
        await mutation({ feedbackId, priority });
        toast.success("Priority updated");
        return feedbackId;
      } catch (error) {
        toast.error("Failed to update priority");
        throw error;
      }
    },
  };
}

/**
 * Update feedback tags.
 */
export function useUpdateFeedbackTags() {
  const mutation = useMutation(api.feedback.mutations.updateTags);

  return {
    mutate: async (feedbackId: Id<"feedback">, tags: string[]) => {
      try {
        await mutation({ feedbackId, tags });
        toast.success("Tags updated");
        return feedbackId;
      } catch (error) {
        toast.error("Failed to update tags");
        throw error;
      }
    },
  };
}

/**
 * Delete feedback and its screenshot.
 */
export function useDeleteFeedback() {
  const mutation = useMutation(api.feedback.mutations.remove);

  return {
    mutate: async (feedbackId: Id<"feedback">) => {
      try {
        await mutation({ feedbackId });
        toast.success("Feedback deleted");
        return true;
      } catch (error) {
        toast.error("Failed to delete feedback");
        throw error;
      }
    },
  };
}

// ============================================
// Screenshot Upload Helper
// ============================================

/**
 * Upload a screenshot blob to Convex storage.
 * Returns the storage ID to use when creating feedback.
 */
export async function uploadScreenshot(
  generateUploadUrl: () => Promise<string>,
  blob: Blob
): Promise<Id<"_storage">> {
  // Get upload URL
  const uploadUrl = await generateUploadUrl();

  // Upload the blob
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": blob.type },
    body: blob,
  });

  if (!response.ok) {
    throw new Error(`Upload failed: ${response.statusText}`);
  }

  const { storageId } = await response.json();
  return storageId as Id<"_storage">;
}
