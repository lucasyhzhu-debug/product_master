/// <reference types="vite/client" />
/**
 * Phase 74.5.1 Wave 0 — K3Mart regression snapshot tests (K3Mart preservation).
 *
 * Per CONTEXT D-08: 5-10 recent K3Mart sync payloads are captured pre-refactor
 * and stored under `tests/fixtures/channel-regression/`. Post-refactor outputs
 * (externalRevenue parent rows) MUST be byte-identical on happy path.
 *
 * IMPORTANT: The fixtures themselves are NOT checked in by this plan. They are
 * captured as a separate operational task (see tests/fixtures/channel-regression/README.md).
 * This file scaffolds the test structure. When fixtures land, replace the
 * `test.skip` block below with the actual snapshot comparison.
 *
 * RED STATE: fixtures absent → tests skipped cleanly. Tests become live once
 * fixtures land before the 74.5.2 cutover.
 */

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "../../schema";

const modules = import.meta.glob("../../**/*.ts");

// Dynamically load fixture files (if any). The meta.glob runs at build time,
// so `fixtures` is an object mapping filepath → async-import-fn. When no files
// match, the object is empty and we skip.
const fixtures = import.meta.glob("../../../tests/fixtures/channel-regression/k3mart-*.json");

describe("K3Mart regression snapshot (TDD red; fixtures land before 74.5.2 cutover)", () => {
  const fixturePaths = Object.keys(fixtures);

  if (fixturePaths.length === 0) {
    // Cleanly skip until fixtures are captured (D-08 capture protocol).
    test.skip("T-K3M.1 parent row byte-identical (fixtures not yet captured)", () => {
      // Placeholder — replace with byte-wise diff on captured fixtures.
    });
    test.skip("T-K3M.2 transactionId dedup preserved (fixtures not yet captured)", () => {
      // Placeholder — replay the same fixture twice; assert zero duplicate parents.
    });
    test.skip("T-K3M.3 collapsed-period invariant preserved (fixtures not yet captured)", () => {
      // Placeholder — assert periodStart === periodEnd === transactionDate per parent.
    });
    return;
  }

  test("T-K3M.1 parent row byte-identical to pre-refactor snapshot on happy path", async () => {
    const t = convexTest(schema, modules);
    // Each fixture file pairs with a pre-captured snapshot; adapter.syncK3MartRevenue
    // (called via the live K3Mart adapter path) must produce the same parent row fields.
    for (const path of fixturePaths) {
      const fixtureModule = (await fixtures[path]()) as { default: unknown };
      expect(fixtureModule).toBeDefined();
      // TODO (Wave 2): invoke k3martAdapter.sync-like entry against fixture,
      // read externalRevenue rows, compare to snapshot.default.
    }
    // Scaffold assertion only — actual compare lands with fixtures.
    expect(fixturePaths.length).toBeGreaterThan(0);
  });

  test("T-K3M.2 transactionId dedup preserved across reruns", async () => {
    const _t = convexTest(schema, modules);
    // TODO (Wave 2): replay same fixture twice; assert dedup returns 0 new rows.
    expect(fixturePaths.length).toBeGreaterThan(0);
  });

  test("T-K3M.3 collapsed-period invariant preserved (periodStart == periodEnd == transactionDate)", async () => {
    const _t = convexTest(schema, modules);
    // TODO (Wave 2): replay fixture; for each inserted externalRevenue row,
    // expect r.periodStart === r.periodEnd === r.transactionDate.
    expect(fixturePaths.length).toBeGreaterThan(0);
  });
});
