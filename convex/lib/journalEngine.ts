/**
 * Double-entry journal engine.
 *
 * Single entry point for all journal entry creation. No direct ctx.db.insert
 * on journalEntries or journalEntryLines is allowed outside this file (JE-06).
 *
 * Enforces:
 * - Balance validation: total debits === total credits (JE-01)
 * - Immutability: no update/patch mutations on data fields (JE-02)
 * - Reversal dating: uses original entry date, not Date.now() (JE-03)
 * - Date denormalization: entryDate on lines from parent date (JE-04)
 * - Sequential numbering: JE-MMDD-NNN via counter helper
 * - Integer amounts: IDR has no fractional component
 */

import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { getNextNumber } from "./counter";

// ---------------------------------------------------------------------------
// Type exports
// ---------------------------------------------------------------------------

/** Input line -- NO entryDate field. Helper auto-populates it from parent entry date. */
export interface JournalLine {
  accountId: Id<"accounts">;
  debitAmount: number;
  creditAmount: number;
  description?: string;
}

/** Valid source types for journal entries -- matches schema sourceType union exactly */
export type JournalSourceType =
  | "expense_approval"
  | "expense_void"
  | "reimbursement"
  | "reimbursement_void"
  | "payroll"
  | "payroll_void"
  | "manual"; // No mutation creates manual entries in Phase 42; included to match schema

export interface CreateJournalEntryParams {
  date: number; // Business date (accounting period), NOT Date.now()
  description: string;
  sourceType: JournalSourceType;
  sourceId?: string; // Id of source record (expense, batch, payroll entry)
  createdBy: Id<"users">;
  lines: JournalLine[]; // Min 2 lines, debits must equal credits
}

// ---------------------------------------------------------------------------
// Pure validation functions (exported for testing without MutationCtx)
// ---------------------------------------------------------------------------

/**
 * Validate journal entry lines for double-entry integrity.
 *
 * Checks (in order per line):
 * 1. Negative amounts (must be non-negative) -- checked BEFORE integer check
 * 2. Fractional amounts (must be whole numbers for IDR)
 * 3. Both-sided lines (must have debit OR credit, not both)
 * 4. Zero-zero lines (must have a non-zero amount)
 *
 * After all lines: total debits must equal total credits.
 * Integer enforcement guarantees exact equality is safe (no IEEE 754 issues).
 *
 * @throws Error with line-indexed message on validation failure
 */
export function validateJournalLines(lines: JournalLine[]): void {
  if (lines.length < 2) {
    throw new Error("Journal entry requires at least 2 lines");
  }

  let totalDebits = 0;
  let totalCredits = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineLabel = `Journal entry line ${i + 1}:`;

    // Negative check MUST come before integer check.
    // A fractional negative like -50000.5 should throw "non-negative", not "whole numbers".
    if (line.debitAmount < 0 || line.creditAmount < 0) {
      throw new Error(`${lineLabel} amounts must be non-negative`);
    }

    if (
      !Number.isInteger(line.debitAmount) ||
      !Number.isInteger(line.creditAmount)
    ) {
      throw new Error(`${lineLabel} amounts must be whole numbers (IDR)`);
    }

    if (line.debitAmount > 0 && line.creditAmount > 0) {
      throw new Error(
        `${lineLabel} must have either debit or credit, not both`
      );
    }

    if (line.debitAmount === 0 && line.creditAmount === 0) {
      throw new Error(
        `${lineLabel} must have a non-zero debit or credit amount`
      );
    }

    totalDebits += line.debitAmount;
    totalCredits += line.creditAmount;
  }

  if (totalDebits !== totalCredits) {
    throw new Error(
      `Journal entry imbalanced: debits (${totalDebits}) != credits (${totalCredits})`
    );
  }
}

/**
 * Validate that a void sourceType is the correct pairing for an original sourceType.
 *
 * Guards non-reversible types explicitly (manual, void types) before checking
 * the pairing map. This prevents:
 * - Manual entries being reversed (they require manual correction)
 * - Double-voids (reversing a reversal)
 *
 * @throws Error if original sourceType is non-reversible or pairing is invalid
 */
export function validateVoidPairing(
  originalSourceType: string,
  voidSourceType: string
): void {
  // Guard non-reversible source types FIRST (explicit intent, not implicit undefined lookup)
  const NON_REVERSIBLE_TYPES = [
    "manual",
    "expense_void",
    "reimbursement_void",
    "payroll_void",
  ];
  if (NON_REVERSIBLE_TYPES.includes(originalSourceType)) {
    throw new Error(`Cannot reverse a ${originalSourceType} entry`);
  }

  // Validate the pairing
  const VALID_VOID_PAIRS: Record<string, string> = {
    expense_approval: "expense_void",
    reimbursement: "reimbursement_void",
    payroll: "payroll_void",
  };
  const expectedVoidType = VALID_VOID_PAIRS[originalSourceType];
  if (expectedVoidType !== voidSourceType) {
    throw new Error(
      `Cannot create ${voidSourceType} reversal for ${originalSourceType} entry`
    );
  }
}

// ---------------------------------------------------------------------------
// Convenience builders (pure, exported)
// ---------------------------------------------------------------------------

/**
 * Build a debit journal line.
 */
export function buildDebitLine(
  accountId: Id<"accounts">,
  amount: number,
  description?: string
): JournalLine {
  return { accountId, debitAmount: amount, creditAmount: 0, description };
}

/**
 * Build a credit journal line.
 */
export function buildCreditLine(
  accountId: Id<"accounts">,
  amount: number,
  description?: string
): JournalLine {
  return { accountId, debitAmount: 0, creditAmount: amount, description };
}

/**
 * Build reversed lines by swapping debit and credit amounts.
 * Preserves accountId and description from original lines.
 */
export function buildReversedLines(lines: JournalLine[]): JournalLine[] {
  return lines.map((line) => ({
    accountId: line.accountId,
    debitAmount: line.creditAmount,
    creditAmount: line.debitAmount,
    description: line.description,
  }));
}

// ---------------------------------------------------------------------------
// Async functions (require MutationCtx) -- stubs for Task 2
// ---------------------------------------------------------------------------

/**
 * Create a journal entry with lines. Single entry point for all journal creation.
 *
 * @throws Error if lines fail validation (balance, integer, etc.)
 */
export async function createJournalEntryWithLines(
  _ctx: MutationCtx,
  _params: CreateJournalEntryParams
): Promise<Id<"journalEntries">> {
  throw new Error("Not implemented");
}

/**
 * Create a reversal entry for an existing journal entry.
 *
 * @throws Error if original entry is already reversed, sourceType pairing is invalid, or no lines exist
 */
export async function createReversalEntry(
  _ctx: MutationCtx,
  _originalEntryId: Id<"journalEntries">,
  _sourceType: "expense_void" | "reimbursement_void" | "payroll_void",
  _createdBy: Id<"users">
): Promise<Id<"journalEntries">> {
  throw new Error("Not implemented");
}
