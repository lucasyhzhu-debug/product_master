/**
 * Authentication test helper for convex-test.
 *
 * Provides createTestSession() to set up authenticated test contexts
 * without needing a real login flow. Used by entity tests after
 * mutations are wrapped with protectedMutation (which requires a
 * valid session with sessionId).
 *
 * Usage:
 * ```ts
 * import { createTestSession } from "../helpers/authTestHelper";
 *
 * const t = convexTest(schema);
 * const sessionId = await createTestSession(t, { role: "admin" });
 *
 * // Now call protected mutations with sessionId
 * await t.mutation(api.ingredients.mutations.create, {
 *   sessionId,
 *   name: "Test Ingredient",
 * });
 * ```
 */

import type { TestConvex } from "convex-test";
import schema from "../../convex/schema";

type TestContext = TestConvex<typeof schema>;

/**
 * Creates a test user and session, returning the sessionId string
 * that can be passed to protectedMutation/protectedQuery functions.
 *
 * @param t - TestConvex instance from convex-test
 * @param options - Optional role (default "admin") and name
 * @returns sessionId string to pass as the sessionId arg
 */
export async function createTestSession(
  t: TestContext,
  options?: {
    role?: "kitchen" | "order_staff" | "manager" | "admin";
    name?: string;
  },
): Promise<string> {
  const role = options?.role ?? "admin";
  const name = options?.name ?? `Test ${role}`;
  const sessionId = `test-session-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  await t.run(async (ctx) => {
    // Create test user
    const userId = await ctx.db.insert("users", {
      name,
      pinHash: "test:hash",
      role,
      isActive: true,
      failedAttempts: 0,
      createdAt: Date.now(),
    });

    // Create session linked to the user
    await ctx.db.insert("sessions", {
      userId,
      token: sessionId,
      expiresAt: Date.now() + 8 * 60 * 60 * 1000, // 8 hours
      createdAt: Date.now(),
    });
  });

  return sessionId;
}
