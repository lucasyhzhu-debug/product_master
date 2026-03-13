import { formatCurrency } from "@/lib/utils";
import { ExpenseStatusBadge } from "./StatusBadge";
import { Calendar, Store, AlertTriangle, Clock } from "lucide-react";
import type { Expense } from "@/hooks/convex";

interface ExpenseCardProps {
  expense: Expense;
  onClick: (id: string) => void;
}

export function ExpenseCard({ expense, onClick }: ExpenseCardProps) {
  const date = new Date(expense.expenseDate);
  const formattedDate = date.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <div
      className="border rounded-lg p-4 cursor-pointer hover:bg-accent/50 transition-colors"
      onClick={() => onClick(expense._id)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono text-muted-foreground">
              {expense.expenseNumber}
            </span>
            <ExpenseStatusBadge status={expense.status} />
            {expense.lateSubmission && (
              <Clock
                className="h-3.5 w-3.5 text-amber-500"
                aria-label="Late submission"
              />
            )}
            {expense.duplicateWarning && (
              <AlertTriangle
                className="h-3.5 w-3.5 text-amber-500"
                aria-label={expense.duplicateWarning}
              />
            )}
          </div>
          <p className="text-sm font-medium truncate">{expense.description}</p>
          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Store className="h-3 w-3" />
              {expense.vendorName}
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {formattedDate}
            </span>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="font-semibold">{formatCurrency(expense.amount)}</p>
        </div>
      </div>
    </div>
  );
}
