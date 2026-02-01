/**
 * Authentication helper utilities for Convex.
 *
 * Convex is a serverless runtime that does not support native modules like bcrypt.
 * Instead, we use the Web Crypto API with SHA-256 hashing and salt for PIN security.
 *
 * Security approach:
 * - PINs are hashed with SHA-256 + random salt
 * - Stored format: "salt:hash"
 * - Sessions use secure random tokens (UUID)
 * - Failed login attempts tracked with lockout mechanism
 */

import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";

/**
 * User role types.
 */
export type UserRole = "kitchen" | "order_staff" | "manager" | "admin";

/**
 * Session duration: 8 hours.
 */
export const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;

/**
 * Maximum failed login attempts before lockout.
 */
export const MAX_FAILED_ATTEMPTS = 5;

/**
 * Account lockout duration after max failed attempts: 15 minutes.
 */
export const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

/**
 * Hash a PIN using SHA-256 with a random salt.
 * Returns format: "salt:hash"
 */
export async function hashPin(pin: string): Promise<string> {
  const salt = crypto.randomUUID();
  const encoder = new TextEncoder();
  const data = encoder.encode(salt + pin);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${salt}:${hashHex}`;
}

/**
 * Verify a PIN against a stored hash.
 * Extracts the salt from the stored hash and compares.
 */
export async function verifyPin(pin: string, storedHash: string): Promise<boolean> {
  const [salt, hash] = storedHash.split(":");
  if (!salt || !hash) {
    return false;
  }

  const encoder = new TextEncoder();
  const data = encoder.encode(salt + pin);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

  return hashHex === hash;
}

/**
 * Validate a session token and return the associated user.
 * Returns null if session is invalid or expired.
 */
export async function getSessionUser(
  ctx: QueryCtx | MutationCtx,
  token: string
): Promise<Doc<"users"> | null> {
  const session = await ctx.db
    .query("sessions")
    .withIndex("by_token", (q) => q.eq("token", token))
    .first();

  if (!session) {
    return null;
  }

  if (session.expiresAt < Date.now()) {
    return null;
  }

  return await ctx.db.get(session.userId);
}

/**
 * Require a user with specific role(s) for mutation authorization.
 * Throws error if not authenticated, account is deactivated, or role is not allowed.
 * Returns the authenticated user if authorized.
 */
export async function requireRole(
  ctx: QueryCtx | MutationCtx,
  token: string,
  allowedRoles: UserRole[]
): Promise<Doc<"users">> {
  const user = await getSessionUser(ctx, token);

  if (!user) {
    throw new Error("Not authenticated");
  }

  if (!user.isActive) {
    throw new Error("Account is deactivated");
  }

  if (!allowedRoles.includes(user.role)) {
    throw new Error("Not authorized");
  }

  return user;
}
