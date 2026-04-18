/**
 * Phase 80.2 Wave 3 — Task 3.2
 *
 * Unit tests for the pure `attachLinkedMenuProductId` helper extracted in
 * Wave 1 Task 1.2. This test file REPLACES the v2 plan's `sync-linking.test.ts`
 * (see PATTERNS.md §5) — rather than introduce a novel fetch-stub harness for
 * an action-level test, we cover the pure mapping-attachment logic directly.
 *
 * Matches the pattern established in `helpers.test.ts`.
 */

import { describe, it, expect } from "vitest";
import { attachLinkedMenuProductId } from "../helpers";
import type { Id } from "../../../_generated/dataModel";

const MP_A = "mp_fake_id_A" as unknown as Id<"menuProducts">;
const MP_B = "mp_fake_id_B" as unknown as Id<"menuProducts">;

describe("attachLinkedMenuProductId", () => {
  it("sets linkedMenuProductId when externalProductCode is in the map", () => {
    const map = new Map<string, Id<"menuProducts">>([["K3-001", MP_A]]);
    const rec = {
      source: "k3mart" as const,
      externalProductCode: "K3-001",
      productName: "Original 80g",
      quantitySold: 5,
    };
    const result = attachLinkedMenuProductId(rec, map);
    expect(result.linkedMenuProductId).toBe(MP_A);
    expect(result.externalProductCode).toBe("K3-001");
    expect(result.productName).toBe("Original 80g");
  });

  it("leaves record unchanged when externalProductCode is not in the map", () => {
    const map = new Map<string, Id<"menuProducts">>([["K3-001", MP_A]]);
    const rec = {
      source: "k3mart" as const,
      externalProductCode: "K3-999",
      productName: "Unrelated",
    };
    const result = attachLinkedMenuProductId(rec, map);
    expect(result.linkedMenuProductId).toBeUndefined();
    expect(result.externalProductCode).toBe("K3-999");
  });

  it("leaves record unchanged when externalProductCode is missing", () => {
    const map = new Map<string, Id<"menuProducts">>([["K3-001", MP_A]]);
    const rec = { source: "k3mart" as const, productName: "No code" };
    const result = attachLinkedMenuProductId(rec, map);
    expect(result.linkedMenuProductId).toBeUndefined();
  });

  it("returns a shallow copy — does not mutate input", () => {
    const map = new Map<string, Id<"menuProducts">>([["K3-001", MP_A]]);
    const rec = {
      source: "k3mart" as const,
      externalProductCode: "K3-001",
      productName: "Original 80g",
    };
    const result = attachLinkedMenuProductId(rec, map);
    expect(result).not.toBe(rec); // different reference
    expect(
      (rec as { linkedMenuProductId?: Id<"menuProducts"> }).linkedMenuProductId,
    ).toBeUndefined();
  });

  it("supports remapping via map mutation (late binding)", () => {
    const map = new Map<string, Id<"menuProducts">>();
    map.set("K3-001", MP_A);
    const recA = attachLinkedMenuProductId({ externalProductCode: "K3-001" }, map);
    map.set("K3-001", MP_B);
    const recB = attachLinkedMenuProductId({ externalProductCode: "K3-001" }, map);
    expect(recA.linkedMenuProductId).toBe(MP_A);
    expect(recB.linkedMenuProductId).toBe(MP_B);
  });
});
