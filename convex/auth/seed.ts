import { mutation } from "../_generated/server";
import { hashPin } from "../lib/auth";

/**
 * Seeds the initial admin user with PIN "000000"
 * Run this once from the Convex dashboard after deployment
 *
 * Usage: In Convex Dashboard > Functions > auth:seedAdminUser
 */
export const seedAdminUser = mutation({
  args: {},
  handler: async (ctx) => {
    // Check if any admin already exists
    const existingAdmin = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "admin"))
      .first();

    if (existingAdmin) {
      return {
        success: false,
        message: "Admin user already exists",
        adminId: existingAdmin._id,
        adminName: existingAdmin.name,
      };
    }

    // Create admin with default PIN "000000"
    const defaultPin = "000000";
    const pinHash = await hashPin(defaultPin);

    const adminId = await ctx.db.insert("users", {
      name: "Administrator",
      pinHash,
      role: "admin",
      isActive: true,
      failedAttempts: 0,
      createdAt: Date.now(),
    });

    return {
      success: true,
      message: "Admin user created successfully",
      adminId,
      defaultPin: "000000 (CHANGE THIS IMMEDIATELY)",
    };
  },
});

/**
 * Seeds sample users for testing
 * Creates one user per role for development purposes
 */
export const seedTestUsers = mutation({
  args: {},
  handler: async (ctx) => {
    const existingUsers = await ctx.db.query("users").collect();

    if (existingUsers.length > 0) {
      return {
        success: false,
        message: `${existingUsers.length} users already exist. Skipping seed.`,
      };
    }

    const testUsers = [
      { name: "Admin User", role: "admin" as const, pin: "000000" },
      { name: "Manager User", role: "manager" as const, pin: "111111" },
      { name: "Order Staff", role: "order_staff" as const, pin: "222222" },
      { name: "Kitchen Staff", role: "kitchen" as const, pin: "333333" },
    ];

    const createdIds: string[] = [];

    for (const user of testUsers) {
      const pinHash = await hashPin(user.pin);
      const id = await ctx.db.insert("users", {
        name: user.name,
        pinHash,
        role: user.role,
        isActive: true,
        failedAttempts: 0,
        createdAt: Date.now(),
      });
      createdIds.push(id);
    }

    return {
      success: true,
      message: `Created ${testUsers.length} test users`,
      users: testUsers.map((u, i) => ({
        id: createdIds[i],
        name: u.name,
        role: u.role,
        pin: u.pin,
      })),
    };
  },
});
