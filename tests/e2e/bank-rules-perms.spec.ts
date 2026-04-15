/**
 * Phase 73 Plan 06 — Role gating invariants (D-23).
 *
 * D-23 widens the /bank-reconciliation route + sidebar entry from admin-only
 * to manager+admin, but:
 *  - kitchen and order_staff roles must remain blocked
 *  - /bank-rules stays admin-only (managers bounced by route gate per T-73-16)
 *  - backend queries enforce the same gates (requireRole) as the last line
 *    of defence
 *
 * These specs are static-invariant guards following the Plan 04 pattern.
 */
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const APP_PATH = resolve(__dirname, "../../src/App.tsx");
const HEADER_PATH = resolve(
  __dirname,
  "../../src/components/layout/Header.tsx",
);
const BANK_QUERIES_PATH = resolve(
  __dirname,
  "../../convex/bankStatements/queries.ts",
);
const BANK_MUTATIONS_PATH = resolve(
  __dirname,
  "../../convex/bankStatements/mutations.ts",
);
const RULE_MUTATIONS_PATH = resolve(
  __dirname,
  "../../convex/bankKeywordRules/mutations.ts",
);
const RULE_QUERIES_PATH = resolve(
  __dirname,
  "../../convex/bankKeywordRules/queries.ts",
);

function readSrc(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

test.describe("Phase 73 — D-23 role gating invariants", () => {
  test("/bank-reconciliation route allows manager + admin only (D-23)", () => {
    const src = readSrc(APP_PATH);
    // Locate the bank-reconciliation <Route>; the ProtectedRoute wrapper must
    // grant access to manager + admin, blocking kitchen and order_staff.
    const bankReconBlock = src
      .split(/path=["']bank-reconciliation["']/)[1]
      ?.split("<Route")[0] ?? "";
    expect(bankReconBlock).toMatch(
      /allowedRoles=\{\[\s*["']manager["']\s*,\s*["']admin["']\s*\]\}/,
    );
    expect(bankReconBlock).not.toMatch(/["']kitchen["']/);
    expect(bankReconBlock).not.toMatch(/["']order_staff["']/);
  });

  test("/bank-rules route stays admin-only (T-73-16)", () => {
    const src = readSrc(APP_PATH);
    const bankRulesBlock = src
      .split(/path=["']bank-rules["']/)[1]
      ?.split("<Route")[0] ?? "";
    expect(bankRulesBlock).toMatch(
      /allowedRoles=\{\[\s*["']admin["']\s*\]\}/,
    );
    // Managers should NOT be in the bank-rules route's allowedRoles.
    expect(bankRulesBlock).not.toMatch(
      /allowedRoles=\{\[\s*["']manager["']/,
    );
  });

  test("sidebar header blocks kitchen + order_staff from Bank Reconciliation", () => {
    const src = readSrc(HEADER_PATH);
    // The Bank Reconciliation nav entry must be gated manager + admin, never
    // rendered for kitchen or order_staff.
    const bankReconEntry = src
      .split(/Bank Reconciliation/)[1]
      ?.split(/\},/)[0] ?? "";
    // The surrounding allowedRoles definition for this entry
    // should include 'manager' and 'admin' and NOT 'kitchen' / 'order_staff'.
    const bankReconContext = src
      .match(/Bank Reconciliation[\s\S]{0,300}/)?.[0] ?? "";
    expect(bankReconContext).toMatch(/manager/);
    expect(bankReconContext).toMatch(/admin/);
    expect(bankReconContext).not.toMatch(/['"]kitchen['"]/);
    expect(bankReconContext).not.toMatch(/['"]order_staff['"]/);
    // Silence unused-var lint if the split returns empty (pattern kept for
    // future drift detection without affecting the assertion set above).
    void bankReconEntry;
  });

  test("backend bankStatements queries enforce manager + admin via requireRole", () => {
    const src = readSrc(BANK_QUERIES_PATH);
    // 4 existing P72 queries widened in Plan 01 (listStatements, getStatement,
    // findByFileHash, listLines) + 8 new Plan 02 queries — all manager+admin.
    const widenedCount = (
      src.match(
        /requireRole\(\s*ctx,\s*args\.token,\s*\[\s*"manager"\s*,\s*"admin"\s*\]\s*\)/g,
      ) || []
    ).length;
    expect(widenedCount).toBeGreaterThanOrEqual(4);
    // No admin-only bank-statement reads survive P73 (D-23).
    expect(src).not.toMatch(
      /requireRole\(\s*ctx,\s*args\.token,\s*\[\s*"admin"\s*\]\s*\)/,
    );
  });

  test("backend bankStatements mutations enforce manager + admin (not kitchen)", () => {
    const src = readSrc(BANK_MUTATIONS_PATH);
    const managerAdminCount = (
      src.match(
        /requireRole\(\s*ctx,\s*args\.token,\s*\[\s*"manager"\s*,\s*"admin"\s*\]\s*\)/g,
      ) || []
    ).length;
    // Plan 01 (4 mutations) + Plan 02 (4 mutations) = 8 manager+admin gates.
    expect(managerAdminCount).toBeGreaterThanOrEqual(8);
    // No kitchen / order_staff slipped into any guard.
    expect(src).not.toMatch(
      /requireRole\([^)]*["']kitchen["']/,
    );
    expect(src).not.toMatch(
      /requireRole\([^)]*["']order_staff["']/,
    );
  });

  test("bankKeywordRules createFromOverride is manager+admin (D-12)", () => {
    const src = readSrc(RULE_MUTATIONS_PATH);
    const block = src
      .split("export const createFromOverride")[1]
      ?.split("export const")[0] ?? "";
    expect(block).toMatch(
      /requireRole\(\s*ctx,\s*args\.token,\s*\[\s*"manager"\s*,\s*"admin"\s*\]\s*\)/,
    );
  });

  test("bankKeywordRules plain CRUD stays admin-only (D-23 / P72 D-19)", () => {
    const mutSrc = readSrc(RULE_MUTATIONS_PATH);
    // `create`, `update`, `deactivate` must use `protectedMutation({ roles: ["admin"] })`
    const adminOnlyCount = (
      mutSrc.match(
        /protectedMutation\(\{\s*roles:\s*\[\s*"admin"\s*\]/g,
      ) || []
    ).length;
    expect(adminOnlyCount).toBeGreaterThanOrEqual(3);

    const qSrc = readSrc(RULE_QUERIES_PATH);
    // Rule queries stay admin-only
    expect(qSrc).toMatch(
      /requireRole\([^)]*\[\s*"admin"\s*\]\s*\)|protected.*roles:\s*\[\s*"admin"\s*\]/,
    );
  });

  test("no bank reconciliation permission widens to kitchen or order_staff", () => {
    // Sweep every Phase-73 surface file — none of the four routes should ever
    // include kitchen or order_staff in any allowedRoles / requireRole list.
    const files = [
      readSrc(APP_PATH),
      readSrc(HEADER_PATH),
      readSrc(BANK_QUERIES_PATH),
      readSrc(BANK_MUTATIONS_PATH),
      readSrc(RULE_MUTATIONS_PATH),
      readSrc(RULE_QUERIES_PATH),
    ].join("\n---\n");

    // Kitchen and order_staff are allowed in other parts of the app but must
    // not appear in the bank-reconciliation OR bank-rules gating context. We
    // scope the check to requireRole / allowedRoles / protectedMutation calls
    // that also mention admin — the bank subsystem's guard shape.
    const badKitchen = files.match(
      /(requireRole|allowedRoles|protectedMutation)[^)]{0,200}\bkitchen\b[^)]{0,200}\badmin\b/g,
    );
    const badOrderStaff = files.match(
      /(requireRole|allowedRoles|protectedMutation)[^)]{0,200}\border_staff\b[^)]{0,200}\badmin\b/g,
    );
    expect(badKitchen).toBeNull();
    expect(badOrderStaff).toBeNull();
  });
});
