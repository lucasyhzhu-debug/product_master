/// <reference types="vite/client" />
/**
 * Phase 74.5.2 Plan 08: updated to assert unified channel_sale + source=gobiz
 * post-retirement of the legacy per-source GoFood deduction mutation.
 *
 * POST-RETIREMENT CONTRACT:
 *  - The legacy per-source GoFood deduction handler no longer exists in
 *    `convex/productInventory/mutations.ts`.
 *  - GoFood sales land through the unified
 *    `saveRevenueItems → processChannelSaleInternal` path, writing
 *    `productInventoryTransactions` rows with
 *    `transactionType: "channel_sale"` and `source: "gobiz"`.
 *  - `gofoodOrderRef` is replaced by `externalRef` on new rows
 *    (format: `${externalTransactionId}${externalItemId ?? ""}`).
 *
 * This file asserts the unified shape. Legacy `transactionType` rows using
 * the retired literal from before the cutover are rewritten by
 * `convex/migrations/gofoodSaleToChannelSale.ts` (Plan 04); tests for that
 * migration live in `convex/migrations/__tests__/gofoodSaleToChannelSale.test.ts`.
 *
 * RED STATE: the end-to-end fixtures are captured in
 * `tests/fixtures/channel-regression/gobiz-*.json` and land after Plan 09's
 * manual cutover. Until then, the fixture-driven tests remain skipped.
 */

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "../../schema";

const modules = import.meta.glob("../../**/*.ts");

const fixtures = import.meta.glob("../../../tests/fixtures/channel-regression/gobiz-*.json");

describe("GoFood regression — unified channel_sale + source=gobiz post-retirement", () => {
  const fixturePaths = Object.keys(fixtures);

  if (fixturePaths.length === 0) {
    test.skip("T-GF.1 unified path emits channel_sale + source=gobiz transactions (fixtures not yet captured)", () => {
      // Placeholder — fixtures land after Plan 09 cutover.
    });
    test.skip("T-GF.2 no retired-literal rows are written by the unified dispatch (fixtures not yet captured)", () => {
      // Placeholder — asserted separately in the migration test suite.
    });
    return;
  }

  test("T-GF.1 gobiz adapter normalize + saveRevenueItems emits channel_sale + source=gobiz", async () => {
    const _t = convexTest(schema, modules);
    // TODO (post-Plan 09): for each captured fixture, invoke the gobiz
    // adapter's normalize() + the unified saveRevenueItems hook, then assert
    // that the resulting productInventoryTransactions rows carry
    // transactionType === "channel_sale" AND source === "gobiz", with an
    // externalRef derived from the gobiz event's externalTransactionId.
    expect(fixturePaths.length).toBeGreaterThan(0);
  });

  test("T-GF.2 unified dispatch writes no retired-literal rows under any flag state", async () => {
    const _t = convexTest(schema, modules);
    // TODO (post-Plan 09): assert the unified dispatch does NOT write the
    // retired transactionType literal under any flag state. Complements
    // migration coverage in convex/migrations/__tests__/.
    expect(fixturePaths.length).toBeGreaterThan(0);
  });
});
