/**
 * Phase 73 Plan 06 — Learn-from-Override invariants (D-10 / D-11 / D-12).
 *
 * When a reviewer edits a bank line's `overrideCategoryAccountId`, the UI
 * must surface a LearnFromOverrideDialog that pre-fills a keyword-rule
 * form from the line's parsed counterparty / description plus the chosen
 * category. Saving the form calls `createFromOverride` (manager+admin
 * gated) — NOT the admin-only plain `create` mutation (T-73-26).
 *
 * These specs are static-invariant guards following the Plan 04 pattern.
 */
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const DIALOG_PATH = resolve(
  __dirname,
  "../../src/components/bankReconciliation/LearnFromOverrideDialog.tsx",
);
const WORKSPACE_PATH = resolve(
  __dirname,
  "../../src/components/bankReconciliation/SplitViewWorkspace.tsx",
);
const RULE_MUTATIONS_PATH = resolve(
  __dirname,
  "../../convex/bankKeywordRules/mutations.ts",
);

function readSrc(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

test.describe("Phase 73 — LearnFromOverrideDialog D-10/D-11/D-12 invariants", () => {
  test("dialog exists", () => {
    const src = readSrc(DIALOG_PATH);
    expect(src.length).toBeGreaterThan(0);
  });

  test("dialog calls createFromOverride, NOT admin-only plain create (T-73-26)", () => {
    const src = readSrc(DIALOG_PATH);
    // Must use the widened mutation
    expect(src).toMatch(/useCreateRuleFromOverride|createFromOverride/);
    // Must NOT call admin-only plain create
    expect(src).not.toMatch(/useCreateBankKeywordRule\b/);
  });

  test("dialog pre-fills counterparty + keyword patterns from the bank line (D-11)", () => {
    const src = readSrc(DIALOG_PATH);
    // Pre-fill surfaces: counterparty token + description keywords
    expect(src).toMatch(/counterparty/i);
    expect(src).toMatch(/description|keyword|pattern/i);
  });

  test("dialog exposes editable ruleCode / priority / matchType fields (D-11)", () => {
    const src = readSrc(DIALOG_PATH);
    expect(src).toMatch(/ruleCode|rule code/i);
    expect(src).toMatch(/priority/i);
    expect(src).toMatch(/matchType|match type/i);
  });

  test("dialog primary CTA label renders [Save rule] (D-10)", () => {
    const src = readSrc(DIALOG_PATH);
    expect(src).toMatch(/Save rule/);
  });

  test("workspace opens LearnFromOverrideDialog from override state (D-12)", () => {
    const src = readSrc(WORKSPACE_PATH);
    // SplitViewWorkspace must render the dialog and drive it off override state
    expect(src).toMatch(/LearnFromOverrideDialog/);
    expect(src).toMatch(/overrideDialogState|overrideCategoryAccountId/);
  });

  test("backend createFromOverride is gated manager+admin, NOT admin-only (D-12 / T-73-26)", () => {
    const src = readSrc(RULE_MUTATIONS_PATH);
    const block = src
      .split("export const createFromOverride")[1]
      ?.split("export const")[0];
    expect(block ?? "").toMatch(
      /requireRole\(\s*ctx,\s*args\.token,\s*\[\s*"manager"\s*,\s*"admin"\s*\]\s*\)/,
    );
  });

  test("createFromOverride validates ruleCode regex + duplicate guard", () => {
    const src = readSrc(RULE_MUTATIONS_PATH);
    const block = src
      .split("export const createFromOverride")[1]
      ?.split("export const")[0];
    // ruleCode format: /^[A-Z]\d{2}$/
    expect(block ?? "").toMatch(/\[A-Z\]\\d\{2\}/);
    // Duplicate ruleCode rejection
    expect(block ?? "").toMatch(/by_ruleCode|duplicate|already exists/i);
  });

  test("createFromOverride populates createdBy from session user", () => {
    const src = readSrc(RULE_MUTATIONS_PATH);
    const block = src
      .split("export const createFromOverride")[1]
      ?.split("export const")[0];
    expect(block ?? "").toMatch(/createdBy/);
  });

  test("plain bankKeywordRules.create / update / deactivate stay admin-only (D-23 / P72 D-19)", () => {
    const src = readSrc(RULE_MUTATIONS_PATH);
    // These mutations keep admin-only gating; the override path is the ONLY
    // manager+admin widening in the rule module.
    const protectedMutationCount = (
      src.match(/protectedMutation\(\{\s*roles:\s*\[\s*"admin"\s*\]/g) || []
    ).length;
    expect(protectedMutationCount).toBeGreaterThanOrEqual(3);
  });
});
