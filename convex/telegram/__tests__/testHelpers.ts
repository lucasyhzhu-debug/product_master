import type { TestConvex } from "convex-test";
import type schema from "../../schema";

/**
 * Insert an admin user + session and return the session token. The token is
 * accepted by every Phase 85 protected function via requireRole(ctx, token,
 * ["manager", "admin"]). pinHash is a fake "salt:hash" — the auth path is
 * bypassed because we pass the token directly, never the PIN.
 */
export async function seedAdminSession(
  t: TestConvex<typeof schema>,
  token = "tok-admin",
  role: "manager" | "admin" = "admin",
): Promise<string> {
  await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      name: `Test ${role}`,
      pinHash: "salt:hash",
      role,
      isActive: true,
      failedAttempts: 0,
      createdAt: Date.now(),
    });
    await ctx.db.insert("sessions", {
      userId,
      token,
      expiresAt: Date.now() + 8 * 3600 * 1000,
      createdAt: Date.now(),
    });
  });
  return token;
}
