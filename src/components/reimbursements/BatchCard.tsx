/**
 * BatchCard -- Summary card for a reimbursement batch in the history list.
 *
 * Shows batch header (RMB code, employee, amount, status badge),
 * detail row for confirmed batches, void/confirm actions,
 * and an expandable expense list.
 */
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { formatCurrency } from "@/lib/utils";
import { utcToWibDateStr } from "@/lib/dateUtils";
import {
  ChevronDown,
  ChevronRight,
  CheckCircle,
  XCircle,
  Landmark,
  Calendar,
} from "lucide-react";
import type { Batch } from "@/hooks/convex/useReimbursements";
import type { Id } from "../../../convex/_generated/dataModel";

const STATUS_BADGE: Record<
  string,
  { variant: "default" | "secondary" | "destructive" | "outline"; label: string }
> = {
  pending: { variant: "secondary", label: "Pending" },
  confirmed: { variant: "default", label: "Confirmed" },
  voided: { variant: "destructive", label: "Voided" },
};

interface BatchCardProps {
  batch: Batch;
  onConfirm?: (
    batchId: Id<"reimbursementBatches">,
    batchNumber: string,
    totalAmount: number,
  ) => void;
  onVoid?: (
    batchId: Id<"reimbursementBatches">,
    batchNumber: string,
  ) => void;
}

export function BatchCard({ batch, onConfirm, onVoid }: BatchCardProps) {
  const [expanded, setExpanded] = useState(false);
  const badgeInfo = STATUS_BADGE[batch.status] || STATUS_BADGE.pending;

  return (
    <Card>
      <CardContent className="pt-4 pb-4 space-y-2">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
              <span className="text-sm font-mono font-bold">
                {batch.batchNumber}
              </span>
              <Badge variant={badgeInfo.variant}>{badgeInfo.label}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {batch.employeeName}
            </p>
          </div>
          <span className="text-lg font-semibold">
            {formatCurrency(batch.totalAmount)}
          </span>
        </div>

        {/* Detail row for confirmed batches */}
        {batch.status === "confirmed" && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {batch.bankReference && (
              <span className="flex items-center gap-1">
                <Landmark className="h-3 w-3" />
                Ref: {batch.bankReference}
              </span>
            )}
            {batch.transferDate && (
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {utcToWibDateStr(batch.transferDate)}
              </span>
            )}
          </div>
        )}

        {/* Void reason for voided batches */}
        {batch.status === "voided" && batch.voidReason && (
          <p className="text-xs text-muted-foreground italic">
            Void reason: {batch.voidReason}
          </p>
        )}

        {/* Actions row */}
        <div className="flex items-center justify-between gap-2 pt-1">
          {/* Expandable trigger */}
          <Collapsible open={expanded} onOpenChange={setExpanded}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="text-xs">
                {expanded ? (
                  <ChevronDown className="h-3.5 w-3.5 mr-1" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 mr-1" />
                )}
                Expenses
              </Button>
            </CollapsibleTrigger>
          </Collapsible>

          <div className="flex items-center gap-2">
            {batch.status === "pending" && onConfirm && (
              <Button
                size="sm"
                onClick={() =>
                  onConfirm(
                    batch._id as Id<"reimbursementBatches">,
                    batch.batchNumber,
                    batch.totalAmount,
                  )
                }
              >
                <CheckCircle className="h-3.5 w-3.5 mr-1" />
                Confirm
              </Button>
            )}
            {batch.status === "confirmed" && onVoid && (
              <Button
                size="sm"
                variant="outline"
                className="text-destructive border-destructive/50 hover:bg-destructive/10"
                onClick={() =>
                  onVoid(
                    batch._id as Id<"reimbursementBatches">,
                    batch.batchNumber,
                  )
                }
              >
                <XCircle className="h-3.5 w-3.5 mr-1" />
                Void
              </Button>
            )}
          </div>
        </div>

        {/* Expandable expense details -- using separate Collapsible state */}
        {expanded && (
          <BatchExpenseList batchId={batch._id as Id<"reimbursementBatches">} />
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// BatchExpenseList -- expanded expense items for a batch
// ============================================================================

import { useBatchItems } from "@/hooks/convex/useReimbursements";
import { Skeleton } from "@/components/ui/skeleton";
import type { Doc } from "../../../convex/_generated/dataModel";

function BatchExpenseList({
  batchId,
}: {
  batchId: Id<"reimbursementBatches">;
}) {
  const items = useBatchItems(batchId);

  if (items === undefined) {
    return (
      <div className="space-y-1 pt-2 border-t">
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-full" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <p className="text-xs text-muted-foreground pt-2 border-t">
        No expenses in this batch.
      </p>
    );
  }

  return (
    <div className="pt-2 border-t space-y-1">
      {items.map((expense: Doc<"expenses"> | null) =>
        expense ? (
          <div
            key={expense._id}
            className="flex items-center gap-2 py-1 px-1 text-sm"
          >
            <span className="text-xs font-mono text-muted-foreground w-[72px] shrink-0">
              {expense.expenseNumber}
            </span>
            <span className="flex-1 min-w-0 truncate">
              {expense.description}
            </span>
            <span className="text-xs text-muted-foreground shrink-0">
              {utcToWibDateStr(expense.expenseDate)}
            </span>
            <span className="font-medium shrink-0 w-[90px] text-right text-sm">
              {formatCurrency(expense.amount)}
            </span>
          </div>
        ) : null,
      )}
    </div>
  );
}
