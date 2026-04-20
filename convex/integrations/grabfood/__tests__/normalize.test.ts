/**
 * Phase 74.5.1 Wave 0 — TDD RED tests for GrabFood adapter normalize() stub (R1 + D74.5.1-L5).
 *
 * Per D74.5.1-L5 from the plan preamble:
 *   - GrabFood adapter ships as a STUB — `normalize()` throws
 *     `Not implemented — requires orders:read OAuth scope`.
 *   - Flag stays permanently OFF until OAuth granted.
 *
 * This test enforces the stub contract so Wave 2 does not accidentally attempt
 * a real integration while OAuth is still blocked (existing infrastructure
 * blocker tracked in MEMORY.md).
 *
 * RED STATE: Wave 2 adds `normalize()` stub.
 */

import { describe, test, expect } from "vitest";

// @ts-expect-error — ChannelAdapter + ChannelSaleEvent added in Wave 1 shared module
import type { ChannelAdapter } from "../../_shared/channelAdapter";
// @ts-expect-error — grabfoodAdapter.normalize() stub added in Wave 2
import { grabfoodAdapter } from "../adapter";

// Type-level ChannelAdapter-contract check — grabfood stub must still satisfy
// the interface shape even though normalize() throws.
const _grabfoodAdapter: ChannelAdapter = grabfoodAdapter;

describe("Req R1 — grabfood normalize() stub (TDD red; Wave 2 makes green)", () => {
  test("T-R1.grabfood.1 normalize() throws Not implemented — requires orders:read OAuth scope", async () => {
    await expect(grabfoodAdapter.normalize({})).rejects.toThrow(/Not implemented/i);
  });

  test("T-R1.grabfood.2 adapter exposes source=grabfood literal", () => {
    expect(grabfoodAdapter.source).toBe("grabfood");
  });
});
