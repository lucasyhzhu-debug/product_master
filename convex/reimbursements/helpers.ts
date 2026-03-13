/**
 * Pure validation helpers for reimbursement mutations.
 *
 * No ctx dependency -- suitable for unit testing.
 */

/**
 * Validate that a bank reference is non-empty.
 */
export function validateBankReference(ref: string): void {
  if (!ref.trim()) {
    throw new Error("Bank reference number is required");
  }
}

/**
 * Validate that a transfer date is a positive timestamp.
 */
export function validateTransferDate(date: number): void {
  if (!date || date <= 0) {
    throw new Error("Transfer date is required");
  }
}

/**
 * Validate that a void reason is non-empty.
 */
export function validateVoidReason(reason: string): void {
  if (!reason.trim()) {
    throw new Error("Void reason is required");
  }
}
