/**
 * Payroll validation helpers.
 * Re-exports shared validators -- no payroll-specific logic needed.
 */
export {
  validatePositiveIntegerAmount,
  validateRequiredReason,
  validatePeriodRange,
  validateRequiredDescription,
} from "../lib/validation";
