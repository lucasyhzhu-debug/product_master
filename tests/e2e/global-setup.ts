import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

/**
 * Playwright global setup: ensures a test-friendly user exists with a known PIN.
 *
 * Strategy:
 * 1. Get active users from the Convex dev database
 * 2. Find a Manager or Admin user
 * 3. Reset their PIN to a known value ("999999")
 * 4. Unlock the account (in case it was locked from failed attempts)
 *
 * This runs once before all tests, not per-test.
 */
async function globalSetup() {
  const convexUrl =
    process.env.VITE_CONVEX_URL || "https://exciting-fennec-671.convex.cloud";

  console.log(`[E2E Setup] Connecting to Convex at ${convexUrl}`);
  const client = new ConvexHttpClient(convexUrl);

  try {
    // Get active users
    const users = await client.query(api.auth.queries.getActiveUsers);

    if (!users || users.length === 0) {
      throw new Error("No active users found in database");
    }

    console.log(
      `[E2E Setup] Found ${users.length} active users:`,
      users.map((u: { name: string; role: string }) => `${u.name} (${u.role})`)
    );

    // Prefer manager, then admin
    const targetUser =
      users.find(
        (u: { role: string }) => u.role === "manager"
      ) ||
      users.find(
        (u: { role: string }) => u.role === "admin"
      );

    if (!targetUser) {
      throw new Error(
        "No manager or admin user found. Tests require a manager-level account."
      );
    }

    console.log(
      `[E2E Setup] Using user: ${targetUser.name} (${targetUser.role})`
    );

    const userId = targetUser._id as Id<"users">;

    // Unlock the account (clear failed attempts and lockout)
    await client.mutation(api.auth.mutations.unlockUser, { userId });
    console.log(`[E2E Setup] Unlocked user ${targetUser.name}`);

    // Reset PIN to known test value
    const testPin = "999999";
    await client.mutation(api.auth.mutations.resetPin, {
      userId,
      newPin: testPin,
    });
    console.log(
      `[E2E Setup] Reset PIN for ${targetUser.name} to test PIN`
    );

    // Store user info for tests to use
    process.env.E2E_TEST_USER_NAME = targetUser.name;
    process.env.E2E_TEST_USER_ROLE = targetUser.role;
    process.env.E2E_TEST_PIN = testPin;

    console.log("[E2E Setup] Ready for testing");
  } finally {
    // ConvexHttpClient doesn't need explicit cleanup
  }
}

export default globalSetup;
