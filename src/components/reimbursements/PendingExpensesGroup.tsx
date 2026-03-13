/**
 * PendingExpensesGroup -- Employee expense group card with selection and batch creation.
 *
 * Displays one employee's awaiting-payment expenses with:
 * - Employee name + total amount + expense count badge
 * - Bank details row (or warning if missing)
 * - Selectable expense list with select-all
 * - "Create Batch" button (disabled until at least one expense selected)
 */
import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { formatCurrency } from "@/lib/utils";
import { utcToWibDateStr } from "@/lib/dateUtils";
import { Landmark, AlertTriangle, Package } from "lucide-react";
import type { AwaitingPaymentGroup } from "@/hooks/convex/useReimbursements";
import type { Id } from "../../../convex/_generated/dataModel";

/** Shape of an expense in the awaiting-payment group */
interface GroupExpense {
  _id: string;
  expenseNumber: string;
  description: string;
  amount: number;
  expenseDate: number;
}

interface PendingExpensesGroupProps {
  group: AwaitingPaymentGroup;
  onCreateBatch: (
    employeeUserId: Id<"users">,
    expenseIds: Id<"expenses">[],
  ) => void;
  disabled?: boolean;
}

export function PendingExpensesGroup({
  group,
  onCreateBatch,
  disabled,
}: PendingExpensesGroupProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const allSelected =
    group.expenses.length > 0 && selectedIds.size === group.expenses.length;

  const toggleAll = useCallback(() => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(group.expenses.map((e: GroupExpense) => e._id)));
    }
  }, [allSelected, group.expenses]);

  const toggleOne = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleCreateBatch = useCallback(() => {
    const ids = Array.from(selectedIds) as Id<"expenses">[];
    onCreateBatch(group.userId as Id<"users">, ids);
    setSelectedIds(new Set());
  }, [selectedIds, group.userId, onCreateBatch]);

  // Calculate selected total
  const selectedTotal = group.expenses
    .filter((e: GroupExpense) => selectedIds.has(e._id))
    .reduce((sum: number, e: GroupExpense) => sum + e.amount, 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">{group.userName}</CardTitle>
            <Badge variant="secondary" className="text-xs">
              {group.expenseCount} expense
              {group.expenseCount !== 1 ? "s" : ""}
            </Badge>
          </div>
          <span className="text-lg font-semibold">
            {formatCurrency(group.totalAmount)}
          </span>
        </div>
        {/* Bank details */}
        <div className="flex items-center gap-1.5 text-sm mt-1">
          {group.bankAccountNumber && group.bankName ? (
            <>
              <Landmark className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">
                {group.bankName} - {group.bankAccountNumber}
              </span>
            </>
          ) : (
            <>
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
              <span className="text-amber-600 dark:text-amber-400 text-xs">
                No bank details on file
              </span>
            </>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-2">
        {/* Select all row */}
        <div className="flex items-center gap-2 pb-1 border-b">
          <Checkbox
            checked={allSelected}
            onCheckedChange={toggleAll}
            aria-label="Select all expenses"
          />
          <span className="text-xs text-muted-foreground font-medium">
            Select all
          </span>
        </div>

        {/* Expense list */}
        <div className="space-y-1">
          {group.expenses.map((expense: GroupExpense) => (
            <label
              key={expense._id}
              className="flex items-center gap-2 py-1.5 px-1 rounded hover:bg-muted/50 cursor-pointer"
            >
              <Checkbox
                checked={selectedIds.has(expense._id)}
                onCheckedChange={() => toggleOne(expense._id)}
                aria-label={`Select ${expense.expenseNumber}`}
              />
              <span className="text-xs font-mono text-muted-foreground w-[72px] shrink-0">
                {expense.expenseNumber}
              </span>
              <span className="text-sm flex-1 min-w-0 truncate">
                {expense.description}
              </span>
              <span className="text-xs text-muted-foreground shrink-0">
                {utcToWibDateStr(expense.expenseDate)}
              </span>
              <span className="text-sm font-medium shrink-0 w-[90px] text-right">
                {formatCurrency(expense.amount)}
              </span>
            </label>
          ))}
        </div>

        {/* Create Batch action */}
        <div className="flex items-center justify-between pt-2 border-t">
          <span className="text-sm text-muted-foreground">
            {selectedIds.size > 0 && (
              <>
                {selectedIds.size} selected:{" "}
                <span className="font-medium text-foreground">
                  {formatCurrency(selectedTotal)}
                </span>
              </>
            )}
          </span>
          <Button
            size="sm"
            onClick={handleCreateBatch}
            disabled={selectedIds.size === 0 || disabled}
          >
            <Package className="h-4 w-4 mr-1" />
            Create Batch
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
