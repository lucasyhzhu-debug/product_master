/**
 * ExpenseApproval -- Approval queue for managers and admins.
 * Lists pending expenses (excluding own submissions) with fraud flags,
 * approval actions, and rejection chain display.
 *
 * Real-time: Convex auto-updates the queue when expenses are acted on.
 */
import { useMemo } from "react";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { usePendingForApproval, useRejectionChain } from "@/hooks/convex/useExpenses";
import { useAccounts } from "@/hooks/convex/useAccounts";
import { ExpenseStatusBadge } from "@/components/expenses/StatusBadge";
import { FraudFlags } from "@/components/expenses/FraudFlags";
import { ApprovalActions } from "@/components/expenses/ApprovalActions";
import { RejectionChain } from "@/components/expenses/RejectionChain";
import { formatCurrency } from "@/lib/utils";
import { utcToWibDateStr } from "@/lib/dateUtils";
import {
  ClipboardCheck,
  Calendar,
  Store,
  Receipt,
  CreditCard,
  Wallet,
  Banknote,
} from "lucide-react";
import { Link } from "react-router-dom";
import type { PendingExpense } from "@/hooks/convex/useExpenses";
import type { Account } from "@/hooks/convex/useAccounts";

/** Map payment method code to display label and icon */
const PAYMENT_METHODS: Record<string, { label: string; icon: typeof CreditCard }> = {
  employee_paid: { label: "Reimburse Employee", icon: Wallet },
  company_paid: { label: "Paid by Company", icon: CreditCard },
  payment_request: { label: "Payment Request", icon: Banknote },
};

export function ExpenseApproval() {
  useDocumentTitle("Expense Approvals");

  const pending = usePendingForApproval();
  const accounts = useAccounts(true);

  // Build account lookup map (memoized to avoid re-creating on every render)
  const accountMap = useMemo(() => {
    const map = new Map<string, Account>();
    if (accounts) {
      for (const acc of accounts) {
        map.set(acc._id, acc);
      }
    }
    return map;
  }, [accounts]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Expense Approvals"
        description={
          pending !== undefined
            ? `${pending.length} expense${pending.length !== 1 ? "s" : ""} pending review`
            : undefined
        }
        action={
          <Button variant="outline" asChild>
            <Link to="/expenses">My Expenses</Link>
          </Button>
        }
      />

      {/* Loading state */}
      {pending === undefined && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-[180px] w-full rounded-lg" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {pending !== undefined && pending.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <ClipboardCheck className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No pending expenses to review</h3>
            <p className="text-sm text-muted-foreground">
              All expenses have been reviewed. New submissions will appear here automatically.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Pending expense cards */}
      {pending !== undefined && pending.length > 0 && (
        <div className="space-y-3">
          {pending.map((expense) => (
            <ExpenseApprovalCard
              key={expense._id}
              expense={expense}
              accountMap={accountMap}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// ExpenseApprovalCard -- individual card for each pending expense
// ============================================================================

interface ExpenseApprovalCardProps {
  expense: PendingExpense;
  accountMap: Map<string, Account>;
}

function ExpenseApprovalCard({ expense, accountMap }: ExpenseApprovalCardProps) {
  const account = accountMap.get(expense.accountId);
  const paymentInfo = PAYMENT_METHODS[expense.paymentMethod] ?? {
    label: expense.paymentMethod,
    icon: CreditCard,
  };
  const PaymentIcon = paymentInfo.icon;

  const hasRejectionHistory = !!expense.previousExpenseId;
  const rejectionChain = useRejectionChain(hasRejectionHistory ? expense._id : undefined);
  const rejectionCount = rejectionChain?.length ?? 0;

  return (
    <Card>
      <CardContent className="pt-4 pb-4 space-y-3">
        {/* Header row: number, status, amount */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-xs font-mono text-muted-foreground">
                {expense.expenseNumber}
              </span>
              {/* Payment type badge */}
              {expense.paymentMethod === "company_paid" && (
                <Badge className="bg-sky-100 text-sky-800 text-xs">Company Paid</Badge>
              )}
              {expense.paymentMethod === "payment_request" && (
                <Badge className="bg-violet-100 text-violet-800 text-xs">Payment Request</Badge>
              )}
              <ExpenseStatusBadge status={expense.status} />
            </div>
            <p className="text-sm font-medium">{expense.description}</p>
            <p className="text-xs text-muted-foreground">
              Submitted by {expense.submitterName}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-lg font-semibold">{formatCurrency(expense.amount)}</p>
          </div>
        </div>

        {/* Fraud flags */}
        <FraudFlags
          duplicateWarning={expense.duplicateWarning}
          lateSubmission={expense.lateSubmission}
          rejectionCount={rejectionCount > 0 ? rejectionCount : undefined}
          flaggedForReview={expense.flaggedForReview}
          flagReason={expense.flagReason}
        />

        {/* Detail row: vendor, date, GL category, payment method, receipt */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Store className="h-3 w-3" />
            {expense.vendorName}
          </span>
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {utcToWibDateStr(expense.expenseDate)}
          </span>
          {account && (
            <span className="text-xs">
              {account.code} - {account.name}
            </span>
          )}
          <Badge variant="secondary" className="text-xs font-normal">
            <PaymentIcon className="h-3 w-3 mr-1" />
            {paymentInfo.label}
          </Badge>
          {expense.receiptFileId && (
            <Badge variant="outline" className="text-xs font-normal">
              <Receipt className="h-3 w-3 mr-1" />
              Receipt attached
            </Badge>
          )}
          {expense.transactionReference && (
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <Receipt className="h-3.5 w-3.5" />
              <span>Ref: {expense.transactionReference}</span>
            </div>
          )}
        </div>

        {/* Rejection chain (if has previous versions) */}
        {hasRejectionHistory && (
          <RejectionChain expenseId={expense._id} />
        )}

        {/* Approval actions */}
        <div className="pt-2 border-t">
          <ApprovalActions
            expenseId={expense._id}
            amount={expense.amount}
            paymentMethod={expense.paymentMethod}
            status={expense.status}
          />
        </div>
      </CardContent>
    </Card>
  );
}
