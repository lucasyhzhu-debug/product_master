/**
 * Shared validation helpers used across financial modules.
 * Eliminates duplication of common validators.
 */

/** Validates that amount is a positive integer (IDR has no fractional component) */
export function validatePositiveIntegerAmount(amount: number): void {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error("Amount must be a positive integer (IDR)");
  }
}

/** Validates that a reason string is non-empty (for void, rejection, etc.) */
export function validateRequiredReason(reason: string, label = "Void reason"): void {
  if (!reason.trim()) {
    throw new Error(`${label} is required`);
  }
}

/** Validates that periodStart < periodEnd */
export function validatePeriodRange(
  periodStart: number,
  periodEnd: number
): void {
  if (periodStart >= periodEnd) {
    throw new Error("Period start must be before period end");
  }
}

/** Validates that a description is non-empty */
export function validateRequiredDescription(description: string): void {
  if (!description.trim()) {
    throw new Error("Description is required");
  }
}
