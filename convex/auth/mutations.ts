import { mutation } from "../_generated/server";
import { v } from "convex/values";
import {
  hashPin,
  verifyPin,
  SESSION_DURATION_MS,
  MAX_FAILED_ATTEMPTS,
  LOCKOUT_DURATION_MS,
} from "../lib/auth";
import { protectedMutation } from "../lib/functions";

// ============================================
// Authentication Mutations
// ============================================

/**
 * Login mutation - authenticates user by PIN.
 *
 * Handles:
 * - PIN verification with hashed storage
 * - Failed login attempt tracking
 * - Account lockout after MAX_FAILED_ATTEMPTS (5)
 * - Session creation with 8-hour expiry
 *
 * Returns:
 * - success: true with session token, user info on valid login
 * - success: false with error message and optional lockout info
 */
export const login = mutation({
  args: {
    userId: v.id("users"),
    pin: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) {
      return { success: false, error: "User not found" };
    }

    if (!user.isActive) {
      return { success: false, error: "Account is deactivated" };
    }

    // Check if account is locked
    if (user.lockedUntil && user.lockedUntil > Date.now()) {
      return {
        success: false,
        error: "Account is locked",
        lockedUntil: user.lockedUntil,
      };
    }

    // Verify PIN
    const isValid = await verifyPin(args.pin, user.pinHash);

    if (!isValid) {
      const newFailedAttempts = user.failedAttempts + 1;
      const updates: Record<string, unknown> = { failedAttempts: newFailedAttempts };

      if (newFailedAttempts >= MAX_FAILED_ATTEMPTS) {
        updates.lockedUntil = Date.now() + LOCKOUT_DURATION_MS;
      }

      await ctx.db.patch(user._id, updates);

      return {
        success: false,
        error: "Invalid PIN",
        remainingAttempts: MAX_FAILED_ATTEMPTS - newFailedAttempts,
        lockedUntil: updates.lockedUntil as number | undefined,
      };
    }

    // Reset failed attempts on successful login
    await ctx.db.patch(user._id, {
      failedAttempts: 0,
      lockedUntil: undefined,
      lastLoginAt: Date.now(),
    });

    // Create session
    const token = crypto.randomUUID();
    const expiresAt = Date.now() + SESSION_DURATION_MS;

    await ctx.db.insert("sessions", {
      userId: user._id,
      token,
      expiresAt,
      createdAt: Date.now(),
    });

    return {
      success: true,
      session: {
        token,
        userId: user._id,
        name: user.name,
        role: user.role,
        avatarUrl: user.avatarUrl,
        expiresAt,
      },
    };
  },
});

/**
 * Logout mutation - invalidates session.
 *
 * Deletes the session record from the database.
 * Safe to call even if session doesn't exist.
 */
export const logout = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();

    if (session) {
      await ctx.db.delete(session._id);
    }

    return { success: true };
  },
});

/**
 * Create user mutation - admin only.
 *
 * Validates:
 * - PIN format (4-6 digits)
 *
 * Creates:
 * - User with hashed PIN
 * - Initial active state
 * - Zero failed attempts
 *
 * Note: Authorization check should be done in frontend for now.
 * Future: Add requireRole() check when auth is fully implemented.
 */
export const createUser = mutation({
  args: {
    name: v.string(),
    pin: v.string(),
    role: v.union(
      v.literal("kitchen"),
      v.literal("order_staff"),
      v.literal("manager"),
      v.literal("admin")
    ),
    avatarUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Validate PIN format (4-6 digits)
    if (!/^\d{4,6}$/.test(args.pin)) {
      throw new Error("PIN must be 4-6 digits");
    }

    const pinHash = await hashPin(args.pin);

    const userId = await ctx.db.insert("users", {
      name: args.name,
      pinHash,
      role: args.role,
      avatarUrl: args.avatarUrl,
      isActive: true,
      failedAttempts: 0,
      createdAt: Date.now(),
    });

    return userId;
  },
});

/**
 * Update user mutation - modify user profile.
 *
 * Allows updating:
 * - name
 * - role
 * - avatarUrl
 *
 * Does NOT allow updating:
 * - PIN (use resetPin instead)
 * - isActive (use setUserActive instead)
 */
export const updateUser = mutation({
  args: {
    userId: v.id("users"),
    name: v.optional(v.string()),
    role: v.optional(
      v.union(
        v.literal("kitchen"),
        v.literal("order_staff"),
        v.literal("manager"),
        v.literal("admin")
      )
    ),
    avatarUrl: v.optional(v.string()),
    // Phase 70 DA-04: Employee profile fields
    hireDate: v.optional(v.number()),
    baseSalaryIdr: v.optional(v.number()),
    bankAccountHolderName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId, ...updates } = args;
    const filteredUpdates = Object.fromEntries(
      Object.entries(updates).filter(([, v]) => v !== undefined)
    );

    if (Object.keys(filteredUpdates).length > 0) {
      await ctx.db.patch(userId, filteredUpdates);
    }

    return await ctx.db.get(userId);
  },
});

/**
 * Reset PIN mutation - change user PIN.
 *
 * Validates:
 * - New PIN format (4-6 digits)
 *
 * Side effects:
 * - Resets failed login attempts
 * - Clears lockout status
 */
export const resetPin = mutation({
  args: {
    userId: v.id("users"),
    newPin: v.string(),
  },
  handler: async (ctx, args) => {
    if (!/^\d{4,6}$/.test(args.newPin)) {
      throw new Error("PIN must be 4-6 digits");
    }

    const pinHash = await hashPin(args.newPin);

    await ctx.db.patch(args.userId, {
      pinHash,
      failedAttempts: 0,
      lockedUntil: undefined,
    });

    return { success: true };
  },
});

/**
 * Deactivate/reactivate user mutation.
 *
 * When deactivating (isActive: false):
 * - Invalidates ALL user sessions
 * - User cannot login until reactivated
 *
 * When reactivating (isActive: true):
 * - User can login again
 */
export const setUserActive = mutation({
  args: {
    userId: v.id("users"),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, { isActive: args.isActive });

    // If deactivating, also invalidate all their sessions
    if (!args.isActive) {
      const sessions = await ctx.db
        .query("sessions")
        .withIndex("by_user", (q) => q.eq("userId", args.userId))
        .collect();

      for (const session of sessions) {
        await ctx.db.delete(session._id);
      }
    }

    return { success: true };
  },
});

/**
 * Unlock user mutation - clear lockout status.
 *
 * Resets:
 * - failedAttempts to 0
 * - lockedUntil to undefined
 *
 * Use case: Admin manually unlocking a user before lockout expires.
 */
export const unlockUser = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, {
      failedAttempts: 0,
      lockedUntil: undefined,
    });

    return { success: true };
  },
});

/**
 * Invalidate session by admin.
 *
 * Forcefully logs out a user by deleting their session.
 * Use case: Admin force-logout for security purposes.
 */
export const invalidateSession = mutation({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.sessionId);
    return { success: true };
  },
});

/**
 * Cleanup expired sessions mutation.
 *
 * Deletes all sessions where expiresAt < now.
 * Should be called periodically (e.g., via cron action).
 *
 * Returns:
 * - deleted: number of sessions removed
 */
export const cleanupExpiredSessions = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const expiredSessions = await ctx.db
      .query("sessions")
      .withIndex("by_expiry", (q) => q.lt("expiresAt", now))
      .collect();

    for (const session of expiredSessions) {
      await ctx.db.delete(session._id);
    }

    return { deleted: expiredSessions.length };
  },
});

// ---------------------------------------------------------------------------
// Self-service bank details (Phase 46)
// ---------------------------------------------------------------------------

/**
 * Update the current user's own bank details.
 *
 * Any authenticated user can update their bank account number and bank name.
 * Uses the filter-entries patch pattern (matching updateUser convention).
 *
 * Sending an empty string for a field clears (unsets) it.
 * Sending undefined for a field skips it entirely.
 */
export const updateBankDetails = protectedMutation({
  roles: ["kitchen", "order_staff", "manager", "admin"],
  args: {
    bankAccountNumber: v.optional(v.string()),
    bankName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const updates: Record<string, string | undefined> = {};
    if (args.bankAccountNumber !== undefined) {
      // Empty string → undefined (clears the field in Convex)
      updates.bankAccountNumber = args.bankAccountNumber.trim() || undefined;
    }
    if (args.bankName !== undefined) {
      updates.bankName = args.bankName.trim() || undefined;
    }
    if (Object.keys(updates).length > 0) {
      await ctx.db.patch(ctx.user._id, updates);
    }
  },
});
