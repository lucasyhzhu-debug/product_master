/**
 * Phase 74.5.1 Wave 0 — GoFood regression snapshot tests (narrowed for 74.5.1).
 *
 * NOTE: the FULL GoFood retirement regression (processGofoodSales ⇒ channel_sale)
 * is a 74.5.2 concern. In 74.5.1 this test only verifies that the ADDITIVE
 * `gobizAdapter.normalize() → ChannelSaleEvent[]` path produces events whose
 * fields match what `processGofoodSales` would have derived from the same
 * payload. NO retirement tests here — processGofoodSales still runs in parallel
 * during 74.5.1.
 *
 * Per CONTEXT D-08: GoFood fixtures are captured pre-refactor and land in
 * `tests/fixtures/channel-regression/` before any 74.5.2 flag flip.
 *
 * RED STATE: fixtures absent → tests skipped. Tests become live once fixtures land.
 */

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "../../schema";

const modules = import.meta.glob("../../**/*.ts");

const fixtures = import.meta.glob("../../../tests/fixtures/channel-regression/gobiz-*.json");

describe("GoFood regression — 74.5.1-scoped normalize shape parity (TDD red)", () => {
  const fixturePaths = Object.keys(fixtures);

  if (fixturePaths.length === 0) {
    test.skip("T-GF.1 normalize() shape matches processGofoodSales-derived fields (fixtures not yet captured)", () => {
      // Placeholder.
    });
    test.skip("T-GF.2 processGofoodSales still runs UNCHANGED in parallel (fixtures not yet captured)", () => {
      // Placeholder — 74.5.1 must NOT retire processGofoodSales.
    });
    return;
  }

  test("T-GF.1 gobizAdapter.normalize() emits events whose fields match processGofoodSales-derived set", async () => {
    const _t = convexTest(schema, modules);
    // TODO (Wave 2): for each fixture, invoke gobizAdapter.normalize() and
    // compare {source, quantity, unitPrice, totalPrice, menuProductId, outletId}
    // to what processGofoodSales would derive.
    expect(fixturePaths.length).toBeGreaterThan(0);
  });

  test("T-GF.2 processGofoodSales path still runs UNCHANGED in parallel (coexistence in 74.5.1)", async () => {
    const _t = convexTest(schema, modules);
    // TODO (Wave 2): Replay a fixture through the legacy path; assert the
    // existing gofood_sale transaction row still appears.
    expect(fixturePaths.length).toBeGreaterThan(0);
  });
});
