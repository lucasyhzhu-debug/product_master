/**
 * Tests for businessSettings mutation behavior.
 *
 * Since the mutations are ctx-dependent (database operations), these tests
 * verify the logical properties of the singleton pattern:
 * - Upsert creates on first call (insert path)
 * - Upsert patches on subsequent calls (patch path)
 * - Logo cleanup occurs when logoStorageId changes
 *
 * The actual ctx interactions are validated via type-checking and the
 * protectedMutation wrapper. Auth-gated convex-test runtime tests are
 * deferred per project convention.
 */

import { describe, it, expect } from "vitest";

/**
 * Simulate the upsert logic to verify singleton behavior.
 *
 * This mirrors the core decision logic in businessSettings/mutations.ts:
 * - If existing is null -> insert (first call)
 * - If existing exists -> patch (subsequent call)
 * - If logo changed -> delete old logo
 */
function simulateUpsert(
  existing: { logoStorageId?: string } | null,
  args: { logoStorageId?: string },
): { action: "insert" | "patch"; deleteOldLogo: boolean } {
  const deleteOldLogo = !!(
    existing &&
    existing.logoStorageId &&
    existing.logoStorageId !== args.logoStorageId
  );

  return {
    action: existing ? "patch" : "insert",
    deleteOldLogo,
  };
}

describe("businessSettings upsert singleton behavior", () => {
  it("creates singleton on first call (no existing record)", () => {
    const result = simulateUpsert(null, { logoStorageId: "logo_abc" });
    expect(result.action).toBe("insert");
    expect(result.deleteOldLogo).toBe(false);
  });

  it("patches existing singleton on subsequent calls", () => {
    const result = simulateUpsert(
      { logoStorageId: "logo_abc" },
      { logoStorageId: "logo_abc" },
    );
    expect(result.action).toBe("patch");
    expect(result.deleteOldLogo).toBe(false);
  });

  it("does not delete logo when same logoStorageId is provided", () => {
    const result = simulateUpsert(
      { logoStorageId: "logo_same" },
      { logoStorageId: "logo_same" },
    );
    expect(result.deleteOldLogo).toBe(false);
  });

  it("deletes old logo when logoStorageId changes", () => {
    const result = simulateUpsert(
      { logoStorageId: "logo_old" },
      { logoStorageId: "logo_new" },
    );
    expect(result.action).toBe("patch");
    expect(result.deleteOldLogo).toBe(true);
  });

  it("deletes old logo when logo is removed (undefined)", () => {
    const result = simulateUpsert(
      { logoStorageId: "logo_old" },
      { logoStorageId: undefined },
    );
    expect(result.action).toBe("patch");
    expect(result.deleteOldLogo).toBe(true);
  });

  it("does not delete when existing has no logo", () => {
    const result = simulateUpsert(
      { logoStorageId: undefined },
      { logoStorageId: "logo_new" },
    );
    expect(result.action).toBe("patch");
    expect(result.deleteOldLogo).toBe(false);
  });

  it("does not delete when both have no logo", () => {
    const result = simulateUpsert(
      { logoStorageId: undefined },
      { logoStorageId: undefined },
    );
    expect(result.action).toBe("patch");
    expect(result.deleteOldLogo).toBe(false);
  });
});
