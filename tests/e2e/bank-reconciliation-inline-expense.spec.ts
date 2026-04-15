/**
 * Phase 73 Plan 04 — Inline Expense dialog invariants (D-17).
 *
 * D-17 CRITICAL: inline-created expenses MUST land with status="submitted",
 * NEVER "approved". UI must render "Submit for approval" button and NEVER
 * render "Approve now". Reviewer on bank reconciliation is often not the
 * person who incurred the expense — so standard approval flow is required
 * even though money has already left the bank.
 *
 * These specs are intentionally lightweight invariant guards that can run
 * without a fully seeded reconciliation fixture. They verify the D-17 static
 * UI contracts (button labels, status wiring) by reading built artefacts.
 * Full fixture-driven end-to-end flows live in Plan 06's suite.
 */
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const DIALOG_PATH = resolve(
  __dirname,
  "../../src/components/bankReconciliation/InlineExpenseDialog.tsx",
);
const BACKEND_PATH = resolve(
  __dirname,
  "../../convex/bankStatements/mutations.ts",
);

function readSrc(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

test.describe("Phase 73 — InlineExpenseDialog D-17 invariants", () => {
  test("inline expense dialog exists", () => {
    const src = readSrc(DIALOG_PATH);
    expect(src.length).toBeGreaterThan(0);
  });

  test("inline expense dialog blocks Approve now (D-17)", () => {
    const src = readSrc(DIALOG_PATH);
    expect(src).not.toMatch(/Approve now/);
    expect(src).not.toMatch(/approveNow/);
  });

  test("renders Submit for approval button + uses ExpenseSubmitForm (I4)", () => {
    const src = readSrc(DIALOG_PATH);
    expect(src).toMatch(/Submit for approval/);
    expect(src).toMatch(/<ExpenseSubmitForm/);
  });

  test("requires receipt upload (receiptStorageId wiring)", () => {
    const src = readSrc(DIALOG_PATH);
    // The dialog must pass receiptStorageId / receiptFileId to inlineCreateExpense
    expect(src).toMatch(/receiptStorageId|receiptFileId/);
    expect(src).toMatch(/useInlineCreateExpense/);
  });

  test("created expense has status submitted, not approved (backend invariant)", () => {
    const be = readSrc(BACKEND_PATH);
    // Backend hard-codes status: "submitted" in inlineCreateExpense
    const mutationBlock = be
      .split("export const inlineCreateExpense")[1]
      ?.split("export const")[0];
    expect(mutationBlock ?? "").toMatch(/status:\s*"submitted"/);
    expect(mutationBlock ?? "").not.toMatch(/status:\s*"approved"/);
  });

  test("bank line is patched to suggested, not confirmed (backend invariant)", () => {
    const be = readSrc(BACKEND_PATH);
    const mutationBlock = be
      .split("export const inlineCreateExpense")[1]
      ?.split("export const")[0];
    expect(mutationBlock ?? "").toMatch(/status:\s*"suggested"/);
  });
});
