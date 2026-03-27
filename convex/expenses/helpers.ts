/**
 * Pure helper functions for expense validation and fraud detection.
 * No ctx dependency -- all functions are testable without Convex runtime.
 */

import { APPROVER_ROLES } from "./constants";

export const RECEIPT_THRESHOLD = 50_000; // Rp 50,000
export const DUPLICATE_WINDOW_DAYS = 7;
export const LATE_SUBMISSION_DAYS = 14;

// Phase 45: DoA (Delegation of Authority) constants -- single source of truth
export const EXPENSE_HIGH_VALUE_THRESHOLD = 500_000; // Rp 500,000
export const DOA_ADMIN_ONLY_THRESHOLD = EXPENSE_HIGH_VALUE_THRESHOLD;
export const COMMENT_REQUIRED_THRESHOLD = EXPENSE_HIGH_VALUE_THRESHOLD;

export const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Statuses excluded from receipt hash duplicate checks (FRAUD-02).
 *  Voided/rejected/draft expenses should not block legitimate resubmissions. */
export const RECEIPT_HASH_EXCLUDED_STATUSES = new Set(["voided", "rejected", "draft"]);

/** Returns true if receipt is required for this expense.
 *  company_paid and payment_request: always required (company money).
 *  employee_paid (or unspecified): existing threshold (> Rp 50,000). */
export function requiresReceipt(amount: number, paymentMethod?: string): boolean {
  // Company money = always require receipt regardless of amount
  if (paymentMethod === "company_paid" || paymentMethod === "payment_request") {
    return true;
  }
  // employee_paid (or unspecified for backward compat): existing threshold
  return amount > RECEIPT_THRESHOLD;
}

/** Validates that amount is a positive integer (IDR has no fractional component) */
// Re-export from shared validation -- backward compatible alias
import { validatePositiveIntegerAmount } from "../lib/validation";
export const validateExpenseAmount = validatePositiveIntegerAmount;

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

/** Voidable expense statuses (non-terminal, non-draft, non-reimbursed) */
const VOIDABLE_STATUSES: readonly string[] = [
  "submitted",
  "approved",
  "awaiting_payment",
  "rejected",
  "recorded",
  "paid",
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
  // Self-approval check first (EXP-10)
  if (submittedBy === approverId) {
    return { allowed: false, reason: "Cannot approve your own expense" };
  }

  // Role check
  if (!(APPROVER_ROLES as readonly string[]).includes(userRole)) {
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
 * - employee_paid: "awaiting_payment" (needs reimbursement)
 * - payment_request: "approved" (authorization only -- JE created later on markAsPaid)
 * - company_paid: "approved" (edge case -- should not reach standard approval but handle gracefully)
 */
export function getTargetStatusAfterApproval(
  paymentMethod: string
): "approved" | "awaiting_payment" {
  return paymentMethod === "employee_paid" ? "awaiting_payment" : "approved";
}

/**
 * Check if an expense with this status can be voided.
 *
 * Voidable: submitted, approved, awaiting_payment, rejected, recorded, paid
 * NOT voidable: draft, reimbursed, voided
 */
export function isVoidableStatus(status: string): boolean {
  return VOIDABLE_STATUSES.includes(status);
}

// ---------------------------------------------------------------------------
// Phase iv9: CapEx Conversion helpers
// ---------------------------------------------------------------------------

import type { AssetCategoryKey } from "../fixedAssets/helpers";

/**
 * Detect likely asset category from expense description keywords.
 * Returns the ASSET_CATEGORIES key. Fallback: "perkakas" (Tools).
 */
export function detectAssetCategory(description: string): AssetCategoryKey {
  const lower = description.toLowerCase();
  // Kitchen/production equipment
  if (/mixer|sealer|vacuum|fomac|oven|mesin|blender|grinder/.test(lower)) {
    return "mesin_produksi";
  }
  // Office equipment
  if (/printer|trolley|laptop|komputer|computer|monitor|scanner/.test(lower)) {
    return "peralatan_kantor";
  }
  // Furniture
  if (/meja|kursi|rak|lemari|shelf|desk|chair/.test(lower)) {
    return "mebelair";
  }
  // Vehicles
  if (/mobil|motor|kendaraan|vehicle|truck/.test(lower)) {
    return "kendaraan";
  }
  // Default fallback: Tools
  return "perkakas";
}
