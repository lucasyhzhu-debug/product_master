/**
 * Pure validation helpers for reimbursement mutations.
 *
 * No ctx dependency -- suitable for unit testing.
 */

import { ConvexError } from "convex/values";

/**
 * Validate that a bank reference is non-empty.
 */
export function validateBankReference(ref: string): void {
  if (!ref.trim()) {
    throw new ConvexError("Bank reference number is required");
  }
}

/**
 * Validate that a transfer date is a positive timestamp.
 */
export function validateTransferDate(date: number): void {
  if (!date || date <= 0) {
    throw new ConvexError("Transfer date is required");
  }
}

/**
 * Validate that a void reason is non-empty.
 */
// Re-export from shared validation -- backward compatible alias
import { validateRequiredReason } from "../lib/validation";
export const validateVoidReason = validateRequiredReason;
