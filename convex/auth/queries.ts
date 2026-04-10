import { query } from "../_generated/server";
import { v } from "convex/values";
import { getSessionUser } from "../lib/auth";

// ============================================
// Authentication Queries
// PRD-4: PIN-based login system
// ============================================

/**
 * Get all active users for login screen.
 * Returns only public fields (no PIN hashes).
 * PRD-4: Used by login UI to display available users.
 */
export const getActiveUsers = query({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db
      .query("users")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();

    // Return only public fields for login UI
    return users.map((user) => ({
      _id: user._id,
      name: user.name,
      role: user.role,
      avatarUrl: user.avatarUrl,
    }));
  },
});

/**
 * Get all users for admin management.
 * Returns all fields except PIN hash (security).
 * PRD-4: Used by admin user management UI.
 */
export const listUsers = query({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();

    return users.map((user) => ({
      _id: user._id,
      name: user.name,
      role: user.role,
      avatarUrl: user.avatarUrl,
      isActive: user.isActive,
      locationId: user.locationId,
      failedAttempts: user.failedAttempts,
      lockedUntil: user.lockedUntil,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      // Phase 70 DA-04: Employee profile fields (admin-only page)
      hireDate: user.hireDate,
      baseSalaryIdr: user.baseSalaryIdr,
      bankAccountHolderName: user.bankAccountHolderName,
    }));
  },
});

/**
 * Validate session and get current user.
 * PRD-4: Used by auth context to validate stored session token.
 */
export const validateSession = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const user = await getSessionUser(ctx, args.token);

    if (!user) {
      return { valid: false, user: null };
    }

    return {
      valid: true,
      user: {
        _id: user._id,
        name: user.name,
        role: user.role,
        avatarUrl: user.avatarUrl,
        isActive: user.isActive,
      },
    };
  },
});

/**
 * Get user by ID (for admin viewing).
 * Returns all fields except PIN hash.
 * PRD-4: Used by admin user detail view.
 */
export const getUserById = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);

    if (!user) return null;

    return {
      _id: user._id,
      name: user.name,
      role: user.role,
      avatarUrl: user.avatarUrl,
      isActive: user.isActive,
      locationId: user.locationId,
      failedAttempts: user.failedAttempts,
      lockedUntil: user.lockedUntil,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
    };
  },
});

/**
 * Get active sessions for a user (admin view).
 * PRD-4: Used by admin to monitor active sessions.
 */
export const getUserSessions = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    const now = Date.now();
    return sessions
      .filter((s) => s.expiresAt > now) // Only active sessions
      .map((s) => ({
        _id: s._id,
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
        lastActiveAt: s.lastActiveAt,
      }));
  },
});

/**
 * Get users by role (for filtering).
 * PRD-4: Used by admin UI to filter users by role.
 */
export const getUsersByRole = query({
  args: {
    role: v.union(
      v.literal("kitchen"),
      v.literal("order_staff"),
      v.literal("manager"),
      v.literal("admin")
    ),
  },
  handler: async (ctx, args) => {
    const users = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", args.role))
      .collect();

    return users.map((user) => ({
      _id: user._id,
      name: user.name,
      role: user.role,
      avatarUrl: user.avatarUrl,
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt,
    }));
  },
});
