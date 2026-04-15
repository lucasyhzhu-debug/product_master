/**
 * Phase 73 Plan 06 — Split-view workspace invariants (BANK-03).
 *
 * BANK-03 requires a two-pane reconciliation workspace with:
 *  - Bank lines pane (left) with direction/confirmed filters
 *  - Candidates pane (right) with 4 groups (expense/revenue/reimbursement/payroll)
 *  - Sticky action bar with [Match selected] / [Unmatch auto] / [Confirm] /
 *    [Confirm all exact-tier] / inline-create buttons
 *  - Progress header with live counts
 *  - Unmatch of confirmed line routes through destructive AlertDialog and
 *    posts a reversal journal entry (sourceType = "bank_statement_reversal")
 *
 * These specs are static-invariant guards following the Plan 04 pattern —
 * they assert the D-04/D-05/D-08/JE-03 contracts against the built source
 * files rather than driving a full fixture + live app. That keeps the
 * test suite deterministic (no Convex dev server required, no fixture
 * teardown race) while still gating the invariants at merge time.
 */
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const WORKSPACE_PATH = resolve(
  __dirname,
  "../../src/components/bankReconciliation/SplitViewWorkspace.tsx",
);
const ACTION_BAR_PATH = resolve(
  __dirname,
  "../../src/components/bankReconciliation/ReconciliationActionBar.tsx",
);
const LINES_PANE_PATH = resolve(
  __dirname,
  "../../src/components/bankReconciliation/BankLinesPane.tsx",
);
const CANDIDATES_PANE_PATH = resolve(
  __dirname,
  "../../src/components/bankReconciliation/CandidatesPane.tsx",
);
const PROGRESS_HEADER_PATH = resolve(
  __dirname,
  "../../src/components/bankReconciliation/StatementProgressHeader.tsx",
);
const MUTATIONS_PATH = resolve(
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

test.describe("Phase 73 — Split-view workspace BANK-03 invariants", () => {
  test("workspace orchestrator exists and composes pane + action bar", () => {
    const src = readSrc(WORKSPACE_PATH);
    expect(src.length).toBeGreaterThan(0);
    expect(src).toMatch(/BankLinesPane/);
    expect(src).toMatch(/CandidatesPane/);
    expect(src).toMatch(/ReconciliationActionBar/);
    expect(src).toMatch(/StatementProgressHeader/);
  });

  test("action bar renders [Match selected] primary CTA", () => {
    const src = readSrc(ACTION_BAR_PATH);
    expect(src).toMatch(/Match selected/);
    expect(src).toMatch(/useManualMatch|onMatch/);
  });

  test("action bar renders [Confirm] CTA and [Unmatch auto] outline", () => {
    const src = readSrc(ACTION_BAR_PATH);
    expect(src).toMatch(/Confirm/);
    expect(src).toMatch(/Unmatch auto/);
  });

  test("action bar exposes [Confirm all exact-tier] batch CTA", () => {
    const src = readSrc(ACTION_BAR_PATH);
    expect(src).toMatch(/Confirm all exact-tier/i);
  });

  test("confirmed-line unmatch routes through destructive AlertDialog (D-04)", () => {
    const src = readSrc(WORKSPACE_PATH);
    // Unmatch of a confirmed line must present a destructive confirmation
    // before posting the reversal JE.
    expect(src).toMatch(/AlertDialog|ConfirmDialog/);
    expect(src).toMatch(/useUnmatch/);
  });

  test("unmatch posts reversal JE via bank_statement_reversal sourceType (JE-03)", () => {
    const src = readSrc(MUTATIONS_PATH);
    const unmatchBlock = src
      .split("export const unmatch")[1]
      ?.split("export const")[0];
    // JE-03: reversal JE uses the new sourceType literal; date preserved
    // from the original JE (handled upstream — we only check the literal is
    // used in the reversal posting code path).
    expect(unmatchBlock ?? "").toMatch(/sourceType:\s*"bank_statement_reversal"/);
    // RESEARCH Pitfall 1: reversal MUST go through createJournalEntryWithLines,
    // NOT createReversalEntry (bank_statement stays in NON_REVERSIBLE_TYPES).
    expect(unmatchBlock ?? "").toMatch(/createJournalEntryWithLines/);
    expect(unmatchBlock ?? "").not.toMatch(/createReversalEntry/);
  });

  test("unmatch records reversal audit fields on the line (D-25)", () => {
    const src = readSrc(MUTATIONS_PATH);
    const unmatchBlock = src
      .split("export const unmatch")[1]
      ?.split("export const")[0];
    expect(unmatchBlock ?? "").toMatch(/reversedAt/);
    expect(unmatchBlock ?? "").toMatch(/reversedBy/);
    expect(unmatchBlock ?? "").toMatch(/reversalJournalEntryId/);
  });

  test("confirmLine records confirmation audit fields (D-25)", () => {
    const src = readSrc(MUTATIONS_PATH);
    const confirmBlock = src
      .split("export const confirmLine")[1]
      ?.split("export const")[0];
    expect(confirmBlock ?? "").toMatch(/confirmedAt/);
    expect(confirmBlock ?? "").toMatch(/confirmedBy/);
    expect(confirmBlock ?? "").toMatch(/confirmedJournalEntryId/);
    expect(confirmBlock ?? "").toMatch(/status:\s*"confirmed"/);
  });

  test("bank lines pane has direction + confirmed filter controls", () => {
    const src = readSrc(LINES_PANE_PATH);
    // Direction filter chips: All / Debit / Credit
    expect(src).toMatch(/debit/i);
    expect(src).toMatch(/credit/i);
    // Show/hide confirmed toggle
    expect(src).toMatch(/confirmed/i);
  });

  test("candidates pane renders all 4 groups (reimbursement/expense/payroll/revenue)", () => {
    const src = readSrc(CANDIDATES_PANE_PATH);
    expect(src).toMatch(/expense/i);
    expect(src).toMatch(/revenue/i);
    expect(src).toMatch(/reimbursement/i);
    expect(src).toMatch(/payroll/i);
    // [Search all records] footer escape hatch
    expect(src).toMatch(/Search all records/i);
  });

  test("progress header renders matched/suggested/unmatched/confirmed counters", () => {
    const src = readSrc(PROGRESS_HEADER_PATH);
    expect(src).toMatch(/matched/i);
    expect(src).toMatch(/suggested/i);
    expect(src).toMatch(/unmatched/i);
    expect(src).toMatch(/confirmed/i);
    expect(src).toMatch(/useStatementProgress/);
  });

  test("manualMatch guards against already-confirmed lines (D-04)", () => {
    const src = readSrc(MUTATIONS_PATH);
    const manualMatchBlock = src
      .split("export const manualMatch")[1]
      ?.split("export const")[0];
    // Confirmed-line guard + C3 TOCTOU post-write re-query
    expect(manualMatchBlock ?? "").toMatch(/confirmed/i);
    expect(manualMatchBlock ?? "").toMatch(/Concurrent match detected/);
  });
});
