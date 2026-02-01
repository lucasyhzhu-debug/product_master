import { mutation } from "../_generated/server";
import { v } from "convex/values";

// ============================================
// Mutations
// ============================================

/**
 * Generate upload URL for screenshot.
 * Used to upload screenshot before creating feedback.
 */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Create a new feedback item with screenshot.
 */
export const create = mutation({
  args: {
    screenshotStorageId: v.id("_storage"),
    elementSelector: v.optional(v.string()),
    pageUrl: v.string(),
    pageTitle: v.string(),
    description: v.string(),
    priority: v.union(v.literal("low"), v.literal("medium"), v.literal("high")),
    tags: v.array(v.string()),
    createdBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Validate description not empty
    if (!args.description.trim()) {
      throw new Error("Description cannot be empty");
    }

    // Create feedback (status defaults to "ongoing")
    const feedbackId = await ctx.db.insert("feedback", {
      screenshotStorageId: args.screenshotStorageId,
      elementSelector: args.elementSelector,
      pageUrl: args.pageUrl,
      pageTitle: args.pageTitle,
      description: args.description,
      status: "ongoing",
      priority: args.priority,
      tags: args.tags,
      comments: [],
      createdBy: args.createdBy ?? "anonymous",
    });

    return feedbackId;
  },
});

/**
 * Add a comment to existing feedback.
 */
export const addComment = mutation({
  args: {
    feedbackId: v.id("feedback"),
    content: v.string(),
    createdBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const feedback = await ctx.db.get(args.feedbackId);
    if (!feedback) {
      throw new Error("Feedback not found");
    }

    // Validate comment content not empty
    if (!args.content.trim()) {
      throw new Error("Comment cannot be empty");
    }

    // Create new comment
    const newComment = {
      content: args.content,
      createdBy: args.createdBy ?? "anonymous",
      createdAt: Date.now(),
    };

    // Add comment to array (use spread to append)
    const existingComments = feedback.comments ?? [];
    await ctx.db.patch(args.feedbackId, {
      comments: [...existingComments, newComment],
    });

    return args.feedbackId;
  },
});

/**
 * Toggle feedback status between "ongoing" and "archived".
 */
export const toggleStatus = mutation({
  args: {
    feedbackId: v.id("feedback"),
  },
  handler: async (ctx, args) => {
    const feedback = await ctx.db.get(args.feedbackId);
    if (!feedback) {
      throw new Error("Feedback not found");
    }

    // Toggle status
    const newStatus = feedback.status === "ongoing" ? "archived" : "ongoing";

    await ctx.db.patch(args.feedbackId, {
      status: newStatus,
    });

    return args.feedbackId;
  },
});

/**
 * Update feedback priority.
 */
export const updatePriority = mutation({
  args: {
    feedbackId: v.id("feedback"),
    priority: v.union(v.literal("low"), v.literal("medium"), v.literal("high")),
  },
  handler: async (ctx, args) => {
    const feedback = await ctx.db.get(args.feedbackId);
    if (!feedback) {
      throw new Error("Feedback not found");
    }

    await ctx.db.patch(args.feedbackId, {
      priority: args.priority,
    });

    return args.feedbackId;
  },
});

/**
 * Update feedback tags.
 */
export const updateTags = mutation({
  args: {
    feedbackId: v.id("feedback"),
    tags: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const feedback = await ctx.db.get(args.feedbackId);
    if (!feedback) {
      throw new Error("Feedback not found");
    }

    await ctx.db.patch(args.feedbackId, {
      tags: args.tags,
    });

    return args.feedbackId;
  },
});

/**
 * Delete feedback and its screenshot from storage.
 */
export const remove = mutation({
  args: {
    feedbackId: v.id("feedback"),
  },
  handler: async (ctx, args) => {
    const feedback = await ctx.db.get(args.feedbackId);
    if (!feedback) {
      throw new Error("Feedback not found");
    }

    // Delete screenshot from storage
    await ctx.storage.delete(feedback.screenshotStorageId);

    // Delete feedback record
    await ctx.db.delete(args.feedbackId);

    return true;
  },
});
