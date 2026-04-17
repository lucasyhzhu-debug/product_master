/**
 * Shared seeding helpers for Phase 74 Plan 04 convex-test suites.
 *
 * C-2 fix (2026-04-16 staff review): field names MUST match convex/schema.ts exactly.
 *   - `users` requires: name, pinHash (NOT `pin`), role, isActive, failedAttempts, createdAt
 *   - `sessions` requires: userId, token, expiresAt, createdAt
 * Omitting any of these causes validator errors before assertions run.
 */

import type { convexTest } from "convex-test";
import type { Id } from "../../_generated/dataModel";

type TestT = ReturnType<typeof convexTest>;

export interface SeedUserResult {
  userId: Id<"users">;
  token: string;
}

let _tokenCounter = 0;

export async function seedUser(
  t: TestT,
  opts: {
    name: string;
    role: "kitchen" | "order_staff" | "manager" | "admin";
    hireDate?: number;
  },
): Promise<SeedUserResult> {
  _tokenCounter += 1;
  const token = `test-token-${opts.role}-${_tokenCounter}-${Math.random().toString(36).slice(2, 8)}`;
  const userId = await t.run(async (ctx) => {
    const uid = await ctx.db.insert("users", {
      name: opts.name,
      pinHash: "salt:hash-test-stub",
      role: opts.role,
      isActive: true,
      failedAttempts: 0,
      createdAt: Date.now(),
      ...(opts.hireDate !== undefined ? { hireDate: opts.hireDate } : {}),
    });
    await ctx.db.insert("sessions", {
      userId: uid,
      token,
      expiresAt: Date.now() + 8 * 60 * 60 * 1000,
      createdAt: Date.now(),
    });
    return uid;
  });
  return { userId, token };
}

export async function insertAttendance(
  t: TestT,
  fields: {
    userId: Id<"users">;
    date: string;
    clockIn: number;
    clockOut?: number;
    durationMs?: number;
    deletedAt?: number;
    deletedBy?: string;
  },
): Promise<Id<"staffAttendance">> {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("staffAttendance", fields);
  });
}
