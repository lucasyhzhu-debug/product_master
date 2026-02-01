import { query } from "../_generated/server";
import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";

// ============================================
// Types
// ============================================

interface FeedbackWithScreenshot extends Doc<"feedback"> {
  screenshotUrl: string | null;
}

// ============================================
// Queries
// ============================================

/**
 * List all feedback items with optional status filter.
 * Includes screenshot URLs from storage.
 */
export const list = query({
  args: {
    status: v.optional(v.union(v.literal("ongoing"), v.literal("archived"))),
  },
  handler: async (ctx, args): Promise<FeedbackWithScreenshot[]> => {
    // Get feedback - use index if status filter is provided
    let feedbackItems;
    if (args.status) {
      feedbackItems = await ctx.db
        .query("feedback")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .order("desc")
        .collect();
    } else {
      feedbackItems = await ctx.db.query("feedback").order("desc").collect();
    }

    // Fetch screenshot URLs from storage
    const result = await Promise.all(
      feedbackItems.map(async (feedback) => {
        const screenshotUrl = await ctx.storage.getUrl(
          feedback.screenshotStorageId
        );

        return {
          ...feedback,
          screenshotUrl,
        };
      })
    );

    return result;
  },
});

/**
 * Get a single feedback item by ID with screenshot URL.
 */
export const get = query({
  args: {
    id: v.id("feedback"),
  },
  handler: async (ctx, args): Promise<FeedbackWithScreenshot | null> => {
    const feedback = await ctx.db.get(args.id);
    if (!feedback) return null;

    const screenshotUrl = await ctx.storage.getUrl(
      feedback.screenshotStorageId
    );

    return {
      ...feedback,
      screenshotUrl,
    };
  },
});

/**
 * Get only "ongoing" feedback for export.
 * Used for markdown export functionality.
 */
export const getExportData = query({
  args: {},
  handler: async (ctx): Promise<FeedbackWithScreenshot[]> => {
    // Get only ongoing feedback
    const feedbackItems = await ctx.db
      .query("feedback")
      .withIndex("by_status", (q) => q.eq("status", "ongoing"))
      .order("desc")
      .collect();

    // Fetch screenshot URLs
    const result = await Promise.all(
      feedbackItems.map(async (feedback) => {
        const screenshotUrl = await ctx.storage.getUrl(
          feedback.screenshotStorageId
        );

        return {
          ...feedback,
          screenshotUrl,
        };
      })
    );

    return result;
  },
});

/**
 * Get feedback grouped by priority (for dashboard/analytics).
 */
export const getByPriority = query({
  args: {
    priority: v.union(v.literal("low"), v.literal("medium"), v.literal("high")),
  },
  handler: async (ctx, args): Promise<FeedbackWithScreenshot[]> => {
    // Get feedback by priority index
    const feedbackItems = await ctx.db
      .query("feedback")
      .withIndex("by_priority", (q) => q.eq("priority", args.priority))
      .order("desc")
      .collect();

    // Fetch screenshot URLs
    const result = await Promise.all(
      feedbackItems.map(async (feedback) => {
        const screenshotUrl = await ctx.storage.getUrl(
          feedback.screenshotStorageId
        );

        return {
          ...feedback,
          screenshotUrl,
        };
      })
    );

    return result;
  },
});

/**
 * Get feedback statistics (for dashboard).
 */
export const getStats = query({
  args: {},
  handler: async (ctx) => {
    const allFeedback = await ctx.db.query("feedback").collect();

    // Count by status
    const ongoing = allFeedback.filter((f) => f.status === "ongoing").length;
    const archived = allFeedback.filter((f) => f.status === "archived").length;

    // Count by priority (only ongoing)
    const ongoingFeedback = allFeedback.filter((f) => f.status === "ongoing");
    const highPriority = ongoingFeedback.filter(
      (f) => f.priority === "high"
    ).length;
    const mediumPriority = ongoingFeedback.filter(
      (f) => f.priority === "medium"
    ).length;
    const lowPriority = ongoingFeedback.filter(
      (f) => f.priority === "low"
    ).length;

    // Count by tag (only ongoing)
    const tagCounts: Record<string, number> = {};
    ongoingFeedback.forEach((feedback) => {
      feedback.tags.forEach((tag) => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      });
    });

    return {
      total: allFeedback.length,
      ongoing,
      archived,
      highPriority,
      mediumPriority,
      lowPriority,
      tagCounts,
    };
  },
});
