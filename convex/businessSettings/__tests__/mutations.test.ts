/**
 * Tests for businessSettings mutation pure helpers.
 *
 * Tests the exported pure function from businessSettings/mutations.ts:
 * - computeUpsertAction: singleton insert/patch decision + logo cleanup detection
 *
 * The ctx-dependent mutation handlers are tested indirectly via this extracted
 * helper. Auth-gated convex-test runtime tests are deferred per project
 * convention (see bigsellerOrders/__tests__/mutations.test.ts).
 */

import { describe, it, expect } from "vitest";
import { computeUpsertAction } from "../mutations";

// ============================================
// Singleton Upsert Action
// ============================================
describe("computeUpsertAction", () => {
  it("returns insert when no existing record", () => {
    const result = computeUpsertAction(null, "logo_abc");
    expect(result.action).toBe("insert");
    expect(result.oldLogoToDelete).toBeNull();
  });

  it("returns insert with no logo cleanup when existing is null", () => {
    const result = computeUpsertAction(null, undefined);
    expect(result.action).toBe("insert");
    expect(result.oldLogoToDelete).toBeNull();
  });

  it("returns patch when existing record exists", () => {
    const result = computeUpsertAction({ logoStorageId: "logo_abc" }, "logo_abc");
    expect(result.action).toBe("patch");
  });

  it("does not flag logo cleanup when same logoStorageId", () => {
    const result = computeUpsertAction(
      { logoStorageId: "logo_same" },
      "logo_same",
    );
    expect(result.oldLogoToDelete).toBeNull();
  });

  it("flags old logo for cleanup when logoStorageId changes", () => {
    const result = computeUpsertAction(
      { logoStorageId: "logo_old" },
      "logo_new",
    );
    expect(result.action).toBe("patch");
    expect(result.oldLogoToDelete).toBe("logo_old");
  });

  it("flags old logo for cleanup when logo is removed (undefined)", () => {
    const result = computeUpsertAction(
      { logoStorageId: "logo_old" },
      undefined,
    );
    expect(result.action).toBe("patch");
    expect(result.oldLogoToDelete).toBe("logo_old");
  });

  it("does not flag cleanup when existing has no logo", () => {
    const result = computeUpsertAction(
      { logoStorageId: undefined },
      "logo_new",
    );
    expect(result.action).toBe("patch");
    expect(result.oldLogoToDelete).toBeNull();
  });

  it("does not flag cleanup when both have no logo", () => {
    const result = computeUpsertAction(
      { logoStorageId: undefined },
      undefined,
    );
    expect(result.action).toBe("patch");
    expect(result.oldLogoToDelete).toBeNull();
  });
});
