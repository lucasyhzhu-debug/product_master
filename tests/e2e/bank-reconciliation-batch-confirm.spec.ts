/**
 * Phase 73 Plan 04 — BatchConfirmDialog invariants (D-08).
 *
 * D-08 requires a preview modal that:
 *  1. Shows N + grouped DR/CR + grand totals
 *  2. Blocks post when DR ≠ CR (balance gate)
 *  3. Surfaces a skipped count when lines lack JE accounts
 *
 * These specs are lightweight static invariant guards; full fixture-driven
 * flows live in Plan 06's suite.
 */
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const DIALOG_PATH = resolve(
  __dirname,
  "../../src/components/bankReconciliation/BatchConfirmDialog.tsx",
);

function readSrc(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

test.describe("Phase 73 — BatchConfirmDialog D-08 invariants", () => {
  test("dialog exists", () => {
    const src = readSrc(DIALOG_PATH);
    expect(src.length).toBeGreaterThan(0);
  });

  test("preview shows grouped DR/CR + grand totals", () => {
    const src = readSrc(DIALOG_PATH);
    expect(src).toMatch(/Debit Account/i);
    expect(src).toMatch(/Credit Account/i);
    expect(src).toMatch(/Grand Total/);
  });

  test("balance gate blocks post when DR ≠ CR (Ledger imbalance copy)", () => {
    const src = readSrc(DIALOG_PATH);
    expect(src).toMatch(/Ledger imbalance/);
  });

  test("skipped count surfaced in preview", () => {
    const src = readSrc(DIALOG_PATH);
    expect(src).toMatch(/skipped/i);
  });

  test("posting calls useBatchConfirmExactTier", () => {
    const src = readSrc(DIALOG_PATH);
    expect(src).toMatch(/useBatchConfirmExactTier/);
  });

  test("primary CTA label renders Post N journal entries", () => {
    const src = readSrc(DIALOG_PATH);
    expect(src).toMatch(/Post\s*\$?\{?.*journal entries/);
  });
});
