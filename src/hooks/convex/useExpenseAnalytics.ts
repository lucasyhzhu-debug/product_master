/**
 * Expense Analytics hooks.
 * Query hooks for the Expense Analytics dashboard (Phase 50).
 * Wraps 3 protectedQuery endpoints from convex/expenses/analyticsQueries.ts.
 */
import { useSessionQuery } from "convex-helpers/react/sessions";
import { api } from "../../../convex/_generated/api";

// ============================================================================
// QUERY HOOKS
// ============================================================================

/** OpEx summary: total, GL category breakdown, 6-month trend */
export function useOpExAnalytics(periodStart: number, periodEnd: number) {
  return useSessionQuery(api.expenses.analyticsQueries.getOpExAnalytics, {
    periodStart,
    periodEnd,
  });
}

/** Employee spend breakdown, pending reimbursement total, avg approval time */
export function useExpenseMetrics(periodStart: number, periodEnd: number) {
  return useSessionQuery(api.expenses.analyticsQueries.getExpenseMetrics, {
    periodStart,
    periodEnd,
  });
}

/** Fraud flags: split detection, approver concentration, unfamiliar vendors */
export function useFraudFlags() {
  return useSessionQuery(api.expenses.analyticsQueries.getFraudFlags, {});
}

// ============================================================================
// TYPES (derived from query return types)
// ============================================================================

export type OpExAnalyticsData = NonNullable<ReturnType<typeof useOpExAnalytics>>;
export type ExpenseMetricsData = NonNullable<ReturnType<typeof useExpenseMetrics>>;
export type FraudFlagsData = NonNullable<ReturnType<typeof useFraudFlags>>;
