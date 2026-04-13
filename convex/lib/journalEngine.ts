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
  | "manual" // Template-based manual entries created via manualJournal/mutations.ts (Phase 62)
  | "depreciation" // Auto-generated monthly depreciation entries (Phase 60)
  | "depreciation_void" // Reversal of depreciation entries (Phase 60)
  | "asset_acquisition" // Equipment purchase JE from expense-to-CapEx conversion
  | "bank_statement"; // Bank statement reconciliation suggestion (Phase 72+). Suggestion only in P72; posted via P73.

/** Void source types that reverse an original entry */
export type VoidSourceType = "expense_void" | "reimbursement_void" | "payroll_void" | "depreciation_void";

/** Source types that can be reversed (non-void, non-manual) */
export type ReversibleSourceType = "expense_approval" | "reimbursement" | "payroll" | "depreciation";

export interface CreateJournalEntryParams {
  date: number; // Business date (accounting period), NOT Date.now()
  description: string;
  sourceType: JournalSourceType;
  sourceId?: string; // String ID of source record (expense, batch, payroll entry)
  createdBy: Id<"users">;
  lines: JournalLine[]; // Min 2 lines, debits must equal credits
  metadata?: { receiptUrl?: string; templateType?: string }; // Optional metadata for receipt URLs (historical import) or template type (manual journal)
}

// ---------------------------------------------------------------------------
// Constants (module-level for reuse and to avoid re-creation per call)
// ---------------------------------------------------------------------------

/** Source types that cannot be reversed — manual requires manual correction, void types are already reversals (no double-void) */
const NON_REVERSIBLE_TYPES: readonly string[] = [
  "manual",
  "expense_void",
  "reimbursement_void",
  "payroll_void",
  "depreciation_void",
  "asset_acquisition", // Requires manual correction, not automated reversal
  "bank_statement", // Phase 72+: no automated reversal — correction via manual journal entry
];

/** Maps original source type → expected void source type */
const VALID_VOID_PAIRS: Record<string, VoidSourceType> = {
  expense_approval: "expense_void",
  reimbursement: "reimbursement_void",
  payroll: "payroll_void",
  depreciation: "depreciation_void",
};

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
 * - Double-voids (reversing a reversal — void entries are themselves reversals)
 *
 * @throws Error if original sourceType is non-reversible, unknown, or pairing is invalid
 */
export function validateVoidPairing(
  originalSourceType: JournalSourceType,
  voidSourceType: VoidSourceType
): void {
  // Guard non-reversible source types FIRST (explicit intent, not implicit undefined lookup)
  if (NON_REVERSIBLE_TYPES.includes(originalSourceType)) {
    throw new Error(`Cannot reverse an ${originalSourceType} entry`);
  }

  // Validate the pairing
  const expectedVoidType = VALID_VOID_PAIRS[originalSourceType];
  if (expectedVoidType === undefined) {
    throw new Error(`Unknown source type: ${originalSourceType}`);
  }
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
// Async functions (require MutationCtx)
// ---------------------------------------------------------------------------

/**
 * Create a journal entry with lines. Single entry point for all journal creation.
 *
 * Flow:
 * 1. Validate lines (balance, integer, etc.) -- throws before any DB writes
 * 2. Generate sequential entry number (JE-MMDD-NNN)
 * 3. Insert journal entry header
 * 4. Insert lines with denormalized entryDate from parent (JE-04)
 *
 * @throws Error if lines fail validation
 */
export async function createJournalEntryWithLines(
  ctx: MutationCtx,
  params: CreateJournalEntryParams
): Promise<Id<"journalEntries">> {
  // Validate before any DB writes
  validateJournalLines(params.lines);

  // Generate sequential entry number: JE-MMDD-NNN
  const entryNumber = await getNextNumber(ctx, "JE");

  // Insert journal entry header
  const entryId = await ctx.db.insert("journalEntries", {
    entryNumber,
    date: params.date,
    description: params.description,
    sourceType: params.sourceType,
    sourceId: params.sourceId,
    isReversed: false,
    createdBy: params.createdBy,
    createdAt: Date.now(),
    ...(params.metadata ? { metadata: params.metadata } : {}),
  });

  // Insert lines with denormalized entryDate from parent (JE-04)
  // Promise.all batches independent inserts in a single Convex transaction round-trip
  await Promise.all(
    params.lines.map((line) =>
      ctx.db.insert("journalEntryLines", {
        journalEntryId: entryId,
        accountId: line.accountId,
        entryDate: params.date, // Denormalized from parent (JE-04)
        debitAmount: line.debitAmount,
        creditAmount: line.creditAmount,
        description: line.description,
      })
    )
  );

  return entryId;
}

/**
 * Create a reversal entry for an existing journal entry.
 *
 * Flow:
 * 1. Fetch and validate original entry
 * 2. Validate sourceType pairing (delegates to validateVoidPairing)
 * 3. Fetch original lines
 * 4. Build reversed lines (swap debit/credit)
 * 5. Create reversal entry via createJournalEntryWithLines (JE-06)
 * 6. Mark original as reversed (ONLY ctx.db.patch on journalEntries, JE-02)
 *
 * Uses original.date as reversal business date, NOT Date.now() (JE-03).
 * Passes original.sourceId through to maintain by_source index queryability.
 *
 * @throws Error if original not found, already reversed, sourceType invalid, or no lines
 */
export async function createReversalEntry(
  ctx: MutationCtx,
  originalEntryId: Id<"journalEntries">,
  sourceType: VoidSourceType,
  createdBy: Id<"users">
): Promise<Id<"journalEntries">> {
  // Fetch original entry
  const original = await ctx.db.get(originalEntryId);
  if (!original) {
    throw new Error("Original journal entry not found");
  }

  // Guard: already reversed
  if (original.isReversed) {
    throw new Error("Journal entry has already been reversed");
  }

  // Validate sourceType pairing (delegates to pure function)
  validateVoidPairing(original.sourceType, sourceType);

  // Fetch original lines
  const originalLines = await ctx.db
    .query("journalEntryLines")
    .withIndex("by_journal_entry", (q) =>
      q.eq("journalEntryId", originalEntryId)
    )
    .collect();

  // Guard: no lines (data integrity error)
  if (originalLines.length === 0) {
    throw new Error(
      "Original journal entry has no lines (data integrity error)"
    );
  }

  // Build reversed lines -- extract only JournalLine fields from DB docs
  const reversedLines = buildReversedLines(
    originalLines.map((line) => ({
      accountId: line.accountId,
      debitAmount: line.debitAmount,
      creditAmount: line.creditAmount,
      description: line.description,
    }))
  );

  // Create reversal entry via createJournalEntryWithLines (JE-06)
  // CRITICAL: use original.date, NOT Date.now() (JE-03)
  // Pass sourceId through to maintain by_source index queryability
  const reversalId = await createJournalEntryWithLines(ctx, {
    date: original.date, // Same accounting period as original (JE-03)
    description: `Reversal of ${original.entryNumber}: ${original.description}`,
    sourceType,
    sourceId: original.sourceId,
    createdBy,
    lines: reversedLines,
  });

  // Mark original as reversed (ONLY ctx.db.patch on journalEntries, JE-02)
  await ctx.db.patch(originalEntryId, {
    isReversed: true,
    reversedByEntryId: reversalId,
  });

  return reversalId;
}
