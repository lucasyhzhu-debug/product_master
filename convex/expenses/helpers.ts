/**
 * Pure helper functions for expense validation and fraud detection.
 * No ctx dependency -- all functions are testable without Convex runtime.
 */

export const RECEIPT_THRESHOLD = 50_000; // Rp 50,000
export const DUPLICATE_WINDOW_DAYS = 7;
export const LATE_SUBMISSION_DAYS = 14;

// Phase 45: DoA (Delegation of Authority) constants
export const DOA_ADMIN_ONLY_THRESHOLD = 500_000; // Rp 500,000
export const COMMENT_REQUIRED_THRESHOLD = 500_000; // Rp 500,000

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

// ---------------------------------------------------------------------------
// Phase 45: DoA (Delegation of Authority) helpers
// ---------------------------------------------------------------------------

/** Roles that can approve expenses */
const APPROVER_ROLES: readonly string[] = ["manager", "admin"];

/** Voidable expense statuses (non-terminal, non-draft, non-reimbursed) */
const VOIDABLE_STATUSES: readonly string[] = [
  "submitted",
  "approved",
  "awaiting_payment",
  "rejected",
];

/**
 * Check if a user can approve a specific expense.
 *
 * Rules:
 * - Self-approval is always blocked (regardless of role)
 * - Non-approver roles (kitchen, order_staff) are always blocked
 * - Manager can approve amounts <= DOA_ADMIN_ONLY_THRESHOLD (500K)
 * - Admin can approve any amount
 */
export function canApproveExpense(
  userRole: string,
  amount: number,
  submittedBy: string,
  approverId: string
): { allowed: boolean; reason?: string } {
  // Self-approval check first (EXP-09)
  if (submittedBy === approverId) {
    return { allowed: false, reason: "Cannot approve your own expense" };
  }

  // Role check
  if (!APPROVER_ROLES.includes(userRole)) {
    return { allowed: false, reason: `Role '${userRole}' cannot approve expenses` };
  }

  // DoA threshold: manager capped at 500K (EXP-07, EXP-08)
  if (userRole === "manager" && amount > DOA_ADMIN_ONLY_THRESHOLD) {
    return {
      allowed: false,
      reason: `Manager can only approve expenses up to Rp ${DOA_ADMIN_ONLY_THRESHOLD.toLocaleString()}`,
    };
  }

  return { allowed: true };
}

/**
 * Check if approver must provide a comment (EXP-11).
 * Comment required for amounts >= Rp 500,000.
 */
export function requiresApproverComment(amount: number): boolean {
  return amount >= COMMENT_REQUIRED_THRESHOLD;
}

/**
 * Determine the target status after approval based on payment method.
 *
 * - company_card: "approved" (terminal -- no reimbursement needed, EXP-14)
 * - personal_cash/personal_transfer: "awaiting_payment" (needs reimbursement, EXP-15)
 */
export function getTargetStatusAfterApproval(
  paymentMethod: string
): "approved" | "awaiting_payment" {
  return paymentMethod === "company_card" ? "approved" : "awaiting_payment";
}

/**
 * Check if an expense with this status can be voided.
 *
 * Voidable: submitted, approved, awaiting_payment, rejected
 * NOT voidable: draft, reimbursed, voided
 */
export function isVoidableStatus(status: string): boolean {
  return VOIDABLE_STATUSES.includes(status);
}
