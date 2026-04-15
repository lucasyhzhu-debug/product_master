/**
 * Phase 73 Plan 04 — CapEx → Asset Register round-trip invariants (D-20/D-21/D-22).
 *
 *  - D-20: CapEx-flagged line shows Route to Asset Register button instead of Confirm
 *  - D-21: AssetRegister accepts ?fromBankLine= URL param + calls markAssetLinked + redirects back
 *  - D-22: duplicate detection prompt surfaces for vendor+cost+date matches
 *
 * These specs are lightweight static invariant guards; full fixture-driven
 * flows live in Plan 06's suite.
 */
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ACTION_BAR_PATH = resolve(
  __dirname,
  "../../src/components/bankReconciliation/ReconciliationActionBar.tsx",
);
const SPLIT_VIEW_PATH = resolve(
  __dirname,
  "../../src/components/bankReconciliation/SplitViewWorkspace.tsx",
);
const ASSET_REGISTER_PATH = resolve(
  __dirname,
  "../../src/pages/AssetRegister.tsx",
);

function readSrc(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

test.describe("Phase 73 — CapEx round-trip D-20/D-21/D-22 invariants", () => {
  test("capex-flagged line shows Route to Asset Register button (D-20)", () => {
    const src = readSrc(ACTION_BAR_PATH);
    expect(src).toMatch(/Route to Asset Register/);
    expect(src).toMatch(/capex_needs_asset_register/);
  });

  test("clicking routes to AssetRegister with fromBankLine prefill (D-21)", () => {
    const src = readSrc(SPLIT_VIEW_PATH);
    expect(src).toMatch(/\/asset-register\/new\?fromBankLine/);
  });

  test("AssetRegister parses fromBankLine and prefills (D-21)", () => {
    const src = readSrc(ASSET_REGISTER_PATH);
    expect(src).toMatch(/fromBankLine/);
  });

  test("AssetRegister calls markAssetLinked on save (D-21)", () => {
    const src = readSrc(ASSET_REGISTER_PATH);
    expect(src).toMatch(/markAssetLinked/);
  });

  test("duplicate detection prompt (D-22)", () => {
    const src = readSrc(ASSET_REGISTER_PATH);
    // Duplicate detection copy: "Link to existing" / "Create new anyway"
    expect(src).toMatch(/Link to existing|Create new anyway|duplicate/i);
  });

  test("save routes back to /bank-reconciliation with review tab", () => {
    const src = readSrc(ASSET_REGISTER_PATH);
    expect(src).toMatch(/\/bank-reconciliation\?tab=review/);
  });
});
