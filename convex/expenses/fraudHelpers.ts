/**
 * Fraud detection pure helpers (no ctx dependency).
 *
 * Three detection functions for should-have fraud controls:
 * - FRAUD-06: Split detection (same employee + GL + 48hrs + >500K)
 * - FRAUD-07: Approver concentration (>80% of one employee's expenses)
 * - FRAUD-08: Unfamiliar vendor (not seen in system in last 90 days)
 */

// ─── Constants ───

export const MS_48_HOURS = 48 * 60 * 60 * 1000;
export const SPLIT_THRESHOLD = 500_000;
export const CONCENTRATION_THRESHOLD = 0.80;
export const MIN_EXPENSES_FOR_CONCENTRATION = 2;

/** Statuses considered "approved" for concentration analysis */
const APPROVED_STATUSES = new Set(["approved", "awaiting_payment", "reimbursed", "recorded", "paid"]);

// ─── Types ───

export interface ExpenseForFraud {
  _id: string;
  submittedBy: string;
  accountId: string;
  amount: number;
  expenseDate: number;
  approvedBy?: string;
  approvedAt?: number;
  vendorName: string;
  status: string;
}

export interface SplitFlag {
  employeeId: string;
  accountId: string;
  expenseIds: string[];
  totalAmount: number;
}

export interface ConcentrationFlag {
  employeeId: string;
  approverId: string;
  percent: number;
  count: number;
  totalCount: number;
}

// ─── Split Detection (FRAUD-06) ───

/**
 * Detect potential expense splitting.
 *
 * Groups expenses by (submittedBy, accountId). Within each group with 2+
 * expenses, uses a sliding window of 48 hours. If a cluster has 2+ expenses
 * and sum > Rp 500K, emits a flag.
 *
 * Deduplicates overlapping clusters by tracking seen expense IDs.
 */
export function detectSplits(expenses: ExpenseForFraud[]): SplitFlag[] {
  if (expenses.length < 2) return [];

  // Group by (submittedBy, accountId)
  const groups = new Map<string, ExpenseForFraud[]>();
  for (const exp of expenses) {
    const key = `${exp.submittedBy}::${exp.accountId}`;
    const group = groups.get(key);
    if (group) {
      group.push(exp);
    } else {
      groups.set(key, [exp]);
    }
  }

  const flags: SplitFlag[] = [];
  const seenExpenseIds = new Set<string>();

  for (const group of groups.values()) {
    if (group.length < 2) continue;

    // Sort by expenseDate ascending
    group.sort((a, b) => a.expenseDate - b.expenseDate);

    // Sliding window: for each expense, collect subsequent within 48hrs
    for (let i = 0; i < group.length; i++) {
      const anchor = group[i];
      if (seenExpenseIds.has(anchor._id)) continue;

      const cluster: ExpenseForFraud[] = [anchor];
      let sum = anchor.amount;

      for (let j = i + 1; j < group.length; j++) {
        if (group[j].expenseDate - anchor.expenseDate <= MS_48_HOURS) {
          if (!seenExpenseIds.has(group[j]._id)) {
            cluster.push(group[j]);
            sum += group[j].amount;
          }
        } else {
          break; // sorted, no need to check further
        }
      }

      if (cluster.length >= 2 && sum > SPLIT_THRESHOLD) {
        const ids = cluster.map((e) => e._id);
        for (const id of ids) seenExpenseIds.add(id);
        flags.push({
          employeeId: anchor.submittedBy,
          accountId: anchor.accountId,
          expenseIds: ids,
          totalAmount: sum,
        });
      }
    }
  }

  return flags;
}

// ─── Approver Concentration Detection (FRAUD-07) ───

/**
 * Detect approver concentration.
 *
 * Filters to approved expenses (status in approved/awaiting_payment/reimbursed)
 * that have an approvedBy field. Groups by submittedBy (employee). For each
 * employee with >= MIN_EXPENSES_FOR_CONCENTRATION expenses, checks if any
 * approver has > 80% share.
 */
export function detectApproverConcentration(expenses: ExpenseForFraud[]): ConcentrationFlag[] {
  // Filter to approved expenses with a known approver
  const approved = expenses.filter(
    (e) => APPROVED_STATUSES.has(e.status) && e.approvedBy
  );

  if (approved.length === 0) return [];

  // Group by submittedBy (employee)
  const byEmployee = new Map<string, ExpenseForFraud[]>();
  for (const exp of approved) {
    const group = byEmployee.get(exp.submittedBy);
    if (group) {
      group.push(exp);
    } else {
      byEmployee.set(exp.submittedBy, [exp]);
    }
  }

  const flags: ConcentrationFlag[] = [];

  for (const [employeeId, empExpenses] of byEmployee) {
    if (empExpenses.length < MIN_EXPENSES_FOR_CONCENTRATION) continue;

    // Count approvals by each approver
    const approverCounts = new Map<string, number>();
    for (const exp of empExpenses) {
      const approver = exp.approvedBy!;
      approverCounts.set(approver, (approverCounts.get(approver) ?? 0) + 1);
    }

    const totalCount = empExpenses.length;

    for (const [approverId, count] of approverCounts) {
      const percent = (count / totalCount) * 100;
      if (percent / 100 > CONCENTRATION_THRESHOLD) {
        flags.push({
          employeeId,
          approverId,
          percent,
          count,
          totalCount,
        });
      }
    }
  }

  return flags;
}

// ─── Unfamiliar Vendor Detection (FRAUD-08) ───

/**
 * Detect unfamiliar vendors.
 *
 * Returns recent vendor names not present in the historical set.
 * Case-insensitive comparison via .toLowerCase().
 * Returns unique vendor names.
 */
export function detectUnfamiliarVendors(
  recentVendors: string[],
  historicalVendors: Set<string>
): string[] {
  const seen = new Set<string>();
  const unfamiliar: string[] = [];

  for (const vendor of recentVendors) {
    const normalized = vendor.trim().toLowerCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);

    if (!historicalVendors.has(normalized)) {
      unfamiliar.push(vendor);
    }
  }

  return unfamiliar;
}
