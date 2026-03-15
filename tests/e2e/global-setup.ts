import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

/**
 * E2E test users -- one per role.
 * Created idempotently on first run, PIN reset to TEST_PIN on subsequent runs.
 */
const TEST_USERS = [
  { name: "E2E-Admin", role: "admin" as const },
  { name: "E2E-Manager", role: "manager" as const },
  { name: "E2E-Kitchen", role: "kitchen" as const },
  { name: "E2E-OrderStaff", role: "order_staff" as const },
] as const;

const TEST_PIN = "999999";

type UserRole = "admin" | "manager" | "kitchen" | "order_staff";
type ActiveUser = { _id: string; name: string; role: string };

/**
 * Ensure a single test user exists with a known PIN.
 * - If user with matching name already exists: unlock + reset PIN (no duplicate created)
 * - If user does NOT exist: create with name, pin, role
 */
async function ensureTestUser(
  client: ConvexHttpClient,
  existingUsers: ActiveUser[],
  name: string,
  role: UserRole
): Promise<void> {
  const existing = existingUsers.find((u) => u.name === name);

  if (existing) {
    // User already exists -- unlock and reset PIN
    const userId = existing._id as Id<"users">;
    await client.mutation(api.auth.mutations.unlockUser, { userId });
    await client.mutation(api.auth.mutations.resetPin, {
      userId,
      newPin: TEST_PIN,
    });
    console.log(`[E2E Setup] Reset existing user: ${name}`);
  } else {
    // User does not exist -- create
    await client.mutation(api.auth.mutations.createUser, {
      name,
      pin: TEST_PIN,
      role,
    });
    console.log(`[E2E Setup] Created new user: ${name} (${role})`);
  }
}

/**
 * Playwright global setup: ensures 4 E2E test users exist with known PINs.
 *
 * Strategy:
 * 1. Get active users from the Convex dev database
 * 2. For each test role, ensure the E2E-{Role} user exists with PIN 999999
 * 3. Backward compat: set E2E_TEST_USER_NAME to a manager/admin for existing spec files
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

    if (!users) {
      throw new Error("Failed to query active users from database");
    }

    console.log(
      `[E2E Setup] Found ${users.length} active users:`,
      users.map((u: { name: string; role: string }) => `${u.name} (${u.role})`)
    );

    // Ensure all 4 E2E test users exist with known PINs
    for (const testUser of TEST_USERS) {
      await ensureTestUser(client, users as ActiveUser[], testUser.name, testUser.role);
    }

    // Re-fetch users after potential creation (for backward compat lookup)
    const updatedUsers = await client.query(api.auth.queries.getActiveUsers);

    // Backward compat: find a manager or admin user for existing spec files
    // that use loginAsManager (prefers E2E-Manager, then any manager, then admin)
    const targetUser =
      (updatedUsers || []).find(
        (u: { name: string }) => u.name === "E2E-Manager"
      ) ||
      (updatedUsers || []).find(
        (u: { role: string }) => u.role === "manager"
      ) ||
      (updatedUsers || []).find(
        (u: { role: string }) => u.role === "admin"
      );

    if (targetUser) {
      process.env.E2E_TEST_USER_NAME = targetUser.name;
      process.env.E2E_TEST_USER_ROLE = targetUser.role;
      console.log(
        `[E2E Setup] Backward compat user: ${targetUser.name} (${targetUser.role})`
      );
    }

    process.env.E2E_TEST_PIN = TEST_PIN;

    console.log("[E2E Setup] All 4 E2E test users ready");
  } finally {
    // ConvexHttpClient doesn't need explicit cleanup
  }
}

export default globalSetup;
