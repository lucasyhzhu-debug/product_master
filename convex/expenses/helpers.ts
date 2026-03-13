/**
 * Pure helper functions for expense validation and fraud detection.
 * No ctx dependency -- all functions are testable without Convex runtime.
 */

export const RECEIPT_THRESHOLD = 50_000; // Rp 50,000
export const DUPLICATE_WINDOW_DAYS = 7;
export const LATE_SUBMISSION_DAYS = 14;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Returns true if receipt is required for this amount (> Rp 50,000) */
export function requiresReceipt(amount: number): boolean {
  return amount > RECEIPT_THRESHOLD;
}

/** Validates that amount is a positive integer (IDR has no fractional component) */
export function validateExpenseAmount(amount: number): void {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error("Amount must be a positive integer (IDR)");
  }
}

/** Returns true if expense is submitted more than 14 days after expense date */
export function isLateSubmission(expenseDate: number, submittedAt: number): boolean {
  const deadline = expenseDate + LATE_SUBMISSION_DAYS * MS_PER_DAY;
  return submittedAt > deadline;
}

/**
 * Checks for duplicate expenses (FRAUD-01: soft warning).
 * Returns a warning string if any existing expense has same amount AND
 * expense date within 7-day window. Returns null if no duplicates.
 */
export function checkDuplicateExpense(
  existingExpenses: Array<{ amount: number; expenseDate: number; expenseNumber: string }>,
  newAmount: number,
  newDate: number
): string | null {
  const windowMs = DUPLICATE_WINDOW_DAYS * MS_PER_DAY;
  for (const existing of existingExpenses) {
    if (
      existing.amount === newAmount &&
      Math.abs(existing.expenseDate - newDate) <= windowMs
    ) {
      return `Possible duplicate of ${existing.expenseNumber} (same amount within ${DUPLICATE_WINDOW_DAYS} days)`;
    }
  }
  return null;
}
