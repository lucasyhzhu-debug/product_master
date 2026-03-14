/**
 * Expense Analytics Queries
 *
 * Three protectedQuery endpoints for the Expense Analytics dashboard:
 * - getOpExAnalytics: OpEx totals, GL category breakdown, 6-month trend
 * - getExpenseMetrics: Employee spend, pending reimbursement, avg approval time
 * - getFraudFlags: Split detection, approver concentration, unfamiliar vendor
 *
 * All queries require manager or admin role (APPROVER_ROLES).
 */

import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { protectedQuery } from "../lib/functions";
import { aggregateJournalLines } from "../lib/journalHelpers";
import { getWibComponents, wibMidnightToUtc } from "../lib/periodRange";
import { APPROVER_ROLES } from "./constants";
import {
  detectSplits,
  detectApproverConcentration,
  detectUnfamiliarVendors,
  type ExpenseForFraud,
} from "./fraudHelpers";

// ─── Month name abbreviations ───
const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// ============================================================================
// getOpExAnalytics
// ============================================================================

/**
 * OpEx analytics: total OpEx, breakdown by GL category, and 6-month trend.
 *
 * - Period totals use journalEntryLines with opex accounts
 * - 6-month trend always uses trailing months from current time
 * - Uses YYYY-MM composite key for bucketing (no year-boundary collisions)
 */
export const getOpExAnalytics = protectedQuery({
  roles: [...APPROVER_ROLES],
  args: {
    periodStart: v.number(),
    periodEnd: v.number(),
  },
  handler: async (ctx, args) => {
    // Compute 6-month trend boundaries from current WIB time
    const { year, month } = getWibComponents(Date.now());
    const trendStart = wibMidnightToUtc(year, month - 5, 1);
    const trendEnd = wibMidnightToUtc(year, month + 1, 1);

    // Fetch opex accounts and journal lines in PARALLEL
    const [opexAccounts, periodLines, trendLines] = await Promise.all([
      ctx.db.query("accounts").withIndex("by_type", (q) => q.eq("type", "opex")).collect(),
      ctx.db.query("journalEntryLines")
        .withIndex("by_entryDate", (q) =>
          q.gte("entryDate", args.periodStart).lt("entryDate", args.periodEnd)
        ).collect(),
      ctx.db.query("journalEntryLines")
        .withIndex("by_entryDate", (q) =>
          q.gte("entryDate", trendStart).lt("entryDate", trendEnd)
        ).collect(),
    ]);

    // Build lookup structures
    const opexIds = new Set(opexAccounts.map((a) => a._id as string));
    const accountLookup = new Map<string, { code: string; name: string }>();
    for (const a of opexAccounts) {
      accountLookup.set(a._id as string, { code: a.code, name: a.name });
    }

    // Aggregate period totals using shared helper
    const { items, total: totalOpEx } = aggregateJournalLines(periodLines, opexIds, accountLookup);

    // Sort byCategory by total descending (aggregateJournalLines sorts by code)
    const byCategory = [...items].sort((a, b) => b.total - a.total);

    // Build 6-month trend buckets using YYYY-MM composite key
    const trendBuckets = new Map<string, number>();
    const trendOrder: Array<{ key: string; label: string }> = [];

    for (let i = 5; i >= 0; i--) {
      const m = month - i;
      // Use Date constructor to normalize year rollover (e.g., month = -2 -> previous year Oct)
      const d = new Date(year, m, 1);
      const normalizedYear = d.getFullYear();
      const normalizedMonth = d.getMonth(); // 0-indexed
      const key = `${normalizedYear}-${String(normalizedMonth).padStart(2, "0")}`;
      trendBuckets.set(key, 0);
      trendOrder.push({ key, label: MONTH_NAMES[normalizedMonth] });
    }

    // Bucket trend lines
    for (const line of trendLines) {
      if (!opexIds.has(line.accountId as string)) continue;
      const wib = getWibComponents(line.entryDate);
      const key = `${wib.year}-${String(wib.month).padStart(2, "0")}`;
      const current = trendBuckets.get(key);
      if (current !== undefined) {
        trendBuckets.set(key, current + line.debitAmount - line.creditAmount);
      }
    }

    // Convert to trend array
    const trend = trendOrder.map(({ key, label }) => ({
      month: label,
      total: trendBuckets.get(key) ?? 0,
    }));

    return { totalOpEx, byCategory, trend };
  },
});

// ============================================================================
// getExpenseMetrics
// ============================================================================

/**
 * Expense operational metrics: employee spend breakdown, pending reimbursement,
 * and average approval time.
 *
 * Uses by_status_expenseDate index for efficient date+status filtering.
 */
export const getExpenseMetrics = protectedQuery({
  roles: [...APPROVER_ROLES],
  args: {
    periodStart: v.number(),
    periodEnd: v.number(),
  },
  handler: async (ctx, args) => {
    // Fetch expenses for each relevant status using indexed queries IN PARALLEL
    const [approved, awaitingPayment, reimbursed, allAwaiting] = await Promise.all([
      ctx.db.query("expenses")
        .withIndex("by_status_expenseDate", (q) =>
          q.eq("status", "approved").gte("expenseDate", args.periodStart).lt("expenseDate", args.periodEnd)
        ).collect(),
      ctx.db.query("expenses")
        .withIndex("by_status_expenseDate", (q) =>
          q.eq("status", "awaiting_payment").gte("expenseDate", args.periodStart).lt("expenseDate", args.periodEnd)
        ).collect(),
      ctx.db.query("expenses")
        .withIndex("by_status_expenseDate", (q) =>
          q.eq("status", "reimbursed").gte("expenseDate", args.periodStart).lt("expenseDate", args.periodEnd)
        ).collect(),
      // Pending reimbursements: ALL awaiting_payment (no date filter -- shows all outstanding)
      ctx.db.query("expenses")
        .withIndex("by_status", (q) => q.eq("status", "awaiting_payment"))
        .collect(),
    ]);

    const periodExpenses = [...approved, ...awaitingPayment, ...reimbursed];

    // Group by submittedBy for employee spend
    const employeeSpend = new Map<string, number>();
    for (const exp of periodExpenses) {
      const key = exp.submittedBy as string;
      employeeSpend.set(key, (employeeSpend.get(key) ?? 0) + exp.amount);
    }

    // Batch fetch user names
    const userIds = [...new Set(periodExpenses.map((e) => e.submittedBy))];
    const users = await Promise.all(userIds.map((id) => ctx.db.get(id)));
    const nameMap = new Map<string, string>();
    for (const user of users) {
      if (user) nameMap.set(user._id as string, user.name);
    }

    // Build byEmployee sorted by total descending
    const byEmployee: Array<{ userId: string; name: string; total: number }> = [];
    for (const [userId, total] of employeeSpend) {
      byEmployee.push({
        userId,
        name: nameMap.get(userId) ?? "Unknown",
        total,
      });
    }
    byEmployee.sort((a, b) => b.total - a.total);

    // Pending reimbursement total (all outstanding, not just period)
    const pendingTotal = allAwaiting.reduce((sum, e) => sum + e.amount, 0);

    // Average approval time in days
    let totalApprovalMs = 0;
    let approvalCount = 0;
    for (const exp of periodExpenses) {
      if (exp.submittedAt && exp.approvedAt) {
        totalApprovalMs += exp.approvedAt - exp.submittedAt;
        approvalCount++;
      }
    }
    const MS_PER_DAY = 86_400_000;
    const avgApprovalDays = approvalCount > 0
      ? totalApprovalMs / approvalCount / MS_PER_DAY
      : null;

    return { byEmployee, pendingTotal, avgApprovalDays };
  },
});

// ============================================================================
// getFraudFlags
// ============================================================================

/**
 * Fraud detection flags: split detection, approver concentration, unfamiliar vendor.
 *
 * Uses by_status_expenseDate index for efficient date-bounded status queries.
 * No period args -- fraud detection uses fixed time windows.
 */
export const getFraudFlags = protectedQuery({
  roles: [...APPROVER_ROLES],
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const MS_PER_DAY = 86_400_000;
    const sevenDaysAgo = now - 7 * MS_PER_DAY;
    const thirtyDaysAgo = now - 30 * MS_PER_DAY;
    const ninetyDaysAgo = now - 90 * MS_PER_DAY;

    // ── Split detection (FRAUD-06): last 7 days ──
    const [splitSubmitted, splitApproved, splitAwaiting] = await Promise.all([
      ctx.db.query("expenses")
        .withIndex("by_status_expenseDate", (q) =>
          q.eq("status", "submitted").gte("expenseDate", sevenDaysAgo)
        ).collect(),
      ctx.db.query("expenses")
        .withIndex("by_status_expenseDate", (q) =>
          q.eq("status", "approved").gte("expenseDate", sevenDaysAgo)
        ).collect(),
      ctx.db.query("expenses")
        .withIndex("by_status_expenseDate", (q) =>
          q.eq("status", "awaiting_payment").gte("expenseDate", sevenDaysAgo)
        ).collect(),
    ]);

    const splitInput: ExpenseForFraud[] = [
      ...splitSubmitted, ...splitApproved, ...splitAwaiting,
    ].map((e) => ({
      _id: e._id as string,
      submittedBy: e.submittedBy as string,
      accountId: e.accountId as string,
      amount: e.amount,
      expenseDate: e.expenseDate,
      approvedBy: e.approvedBy as string | undefined,
      approvedAt: e.approvedAt,
      vendorName: e.vendorName,
      status: e.status,
    }));

    const rawSplits = detectSplits(splitInput);

    // ── Approver concentration (FRAUD-07): last 30 days ──
    const [concApproved, concAwaiting, concReimbursed] = await Promise.all([
      ctx.db.query("expenses")
        .withIndex("by_status_expenseDate", (q) =>
          q.eq("status", "approved").gte("expenseDate", thirtyDaysAgo)
        ).collect(),
      ctx.db.query("expenses")
        .withIndex("by_status_expenseDate", (q) =>
          q.eq("status", "awaiting_payment").gte("expenseDate", thirtyDaysAgo)
        ).collect(),
      ctx.db.query("expenses")
        .withIndex("by_status_expenseDate", (q) =>
          q.eq("status", "reimbursed").gte("expenseDate", thirtyDaysAgo)
        ).collect(),
    ]);

    const concInput: ExpenseForFraud[] = [
      ...concApproved, ...concAwaiting, ...concReimbursed,
    ].map((e) => ({
      _id: e._id as string,
      submittedBy: e.submittedBy as string,
      accountId: e.accountId as string,
      amount: e.amount,
      expenseDate: e.expenseDate,
      approvedBy: e.approvedBy as string | undefined,
      approvedAt: e.approvedAt,
      vendorName: e.vendorName,
      status: e.status,
    }));

    const rawConcentrations = detectApproverConcentration(concInput);

    // ── Unfamiliar vendor (FRAUD-08): recent 30d vs historical 90d ──
    // Fetch 90 day window for all non-voided/draft statuses
    const [vendorSubmitted, vendorApproved, vendorAwaiting, vendorReimbursed] = await Promise.all([
      ctx.db.query("expenses")
        .withIndex("by_status_expenseDate", (q) =>
          q.eq("status", "submitted").gte("expenseDate", ninetyDaysAgo)
        ).collect(),
      ctx.db.query("expenses")
        .withIndex("by_status_expenseDate", (q) =>
          q.eq("status", "approved").gte("expenseDate", ninetyDaysAgo)
        ).collect(),
      ctx.db.query("expenses")
        .withIndex("by_status_expenseDate", (q) =>
          q.eq("status", "awaiting_payment").gte("expenseDate", ninetyDaysAgo)
        ).collect(),
      ctx.db.query("expenses")
        .withIndex("by_status_expenseDate", (q) =>
          q.eq("status", "reimbursed").gte("expenseDate", ninetyDaysAgo)
        ).collect(),
    ]);

    const allVendorExpenses = [
      ...vendorSubmitted, ...vendorApproved, ...vendorAwaiting, ...vendorReimbursed,
    ];

    // Split into recent (30d) and historical (90d) for comparison
    const recentVendors = allVendorExpenses
      .filter((e) => e.expenseDate >= thirtyDaysAgo)
      .map((e) => e.vendorName);
    const historicalVendors = new Set(
      allVendorExpenses
        .filter((e) => e.expenseDate < thirtyDaysAgo)
        .map((e) => e.vendorName.toLowerCase())
    );

    const unfamiliarVendors = detectUnfamiliarVendors(recentVendors, historicalVendors);

    // ── Join user names for split and concentration flags ──
    const userIdsToResolve = new Set<string>();
    for (const flag of rawSplits) userIdsToResolve.add(flag.employeeId);
    for (const flag of rawConcentrations) {
      userIdsToResolve.add(flag.employeeId);
      userIdsToResolve.add(flag.approverId);
    }

    const resolvedUsers = await Promise.all(
      [...userIdsToResolve].map((id) => ctx.db.get(id as Id<"users">))
    );
    const userNameMap = new Map<string, string>();
    for (const user of resolvedUsers) {
      if (user) userNameMap.set(user._id as string, user.name);
    }

    // Enrich flags with names
    const splits = rawSplits.map((flag) => ({
      ...flag,
      employeeName: userNameMap.get(flag.employeeId) ?? "Unknown",
    }));

    const concentrations = rawConcentrations.map((flag) => ({
      ...flag,
      employeeName: userNameMap.get(flag.employeeId) ?? "Unknown",
      approverName: userNameMap.get(flag.approverId) ?? "Unknown",
    }));

    return { splits, concentrations, unfamiliarVendors };
  },
});
