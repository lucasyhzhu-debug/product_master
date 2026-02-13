/**
 * Custom Convex function wrappers with session-based authentication.
 *
 * Uses convex-helpers customMutation/customQuery to automatically:
 * - Extract sessionId from function args (injected by SessionProvider on frontend)
 * - Validate session and load user via getSessionUser
 * - Check role authorization via metadata parameter
 * - Provide ctx.user (typed as Doc<"users">) to handler
 *
 * Auth modes:
 * - protectedMutation / protectedQuery: session required, role must match
 * - publicMutation / publicQuery: no auth (login, seeds, public reads)
 */

import {
  customMutation,
  customQuery,
} from "convex-helpers/server/customFunctions";
import { SessionIdArg } from "convex-helpers/server/sessions";
import { mutation, query } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { ConvexError } from "convex/values";
import { getSessionUser, type UserRole } from "./auth";

/**
 * Protected mutation wrapper.
 *
 * Requires a valid session and matching role. The sessionId arg is
 * automatically added by convex-helpers and injected by useSessionMutation
 * on the frontend -- callers never pass it manually.
 *
 * Usage:
 * ```ts
 * export const create = protectedMutation({
 *   roles: ["manager", "admin"],
 *   args: { name: v.string() },
 *   handler: async (ctx, args) => {
 *     // ctx.user is Doc<"users">
 *     return await ctx.db.insert("ingredients", { ...args, createdBy: ctx.user.name });
 *   },
 * });
 * ```
 */
export const protectedMutation = customMutation(mutation, {
  args: SessionIdArg,
  input: async (
    ctx,
    { sessionId },
    { roles }: { roles: UserRole[] },
  ) => {
    const user = await getSessionUser(ctx, sessionId);
    if (!user || !user.isActive) {
      throw new ConvexError("Unauthorized");
    }
    if (!roles.includes(user.role as UserRole)) {
      throw new ConvexError("Unauthorized");
    }
    return {
      ctx: { ...ctx, user: user as Doc<"users"> },
      args: {},
    };
  },
});

/**
 * Protected query wrapper.
 *
 * Same auth pattern as protectedMutation but for queries.
 *
 * Usage:
 * ```ts
 * export const list = protectedQuery({
 *   roles: ["manager", "admin"],
 *   args: {},
 *   handler: async (ctx) => {
 *     return await ctx.db.query("ingredients").collect();
 *   },
 * });
 * ```
 */
export const protectedQuery = customQuery(query, {
  args: SessionIdArg,
  input: async (
    ctx,
    { sessionId },
    { roles }: { roles: UserRole[] },
  ) => {
    const user = await getSessionUser(ctx, sessionId);
    if (!user || !user.isActive) {
      throw new ConvexError("Unauthorized");
    }
    if (!roles.includes(user.role as UserRole)) {
      throw new ConvexError("Unauthorized");
    }
    return {
      ctx: { ...ctx, user: user as Doc<"users"> },
      args: {},
    };
  },
});

/**
 * Public mutation -- no auth required.
 * Used for login, session validation, seeds, etc.
 */
export const publicMutation = mutation;

/**
 * Public query -- no auth required.
 * Used for public reads, session validation, etc.
 */
export const publicQuery = query;
