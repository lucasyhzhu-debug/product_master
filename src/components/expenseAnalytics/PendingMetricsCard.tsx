/**
 * Pending Metrics Card (XANL-05)
 *
 * Displays pending reimbursement total and average approval time.
 */
import { Clock, Wallet } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/utils";
import type { ExpenseMetricsData } from "@/hooks/convex/useExpenseAnalytics";

interface PendingMetricsCardProps {
  data: ExpenseMetricsData | undefined;
}

export function PendingMetricsCard({ data }: PendingMetricsCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Reimbursement Status</CardTitle>
        <CardDescription>Pending amounts and approval speed</CardDescription>
      </CardHeader>
      <CardContent>
        {data === undefined ? (
          <div className="space-y-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Pending Reimbursement Total */}
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 p-2">
                <Wallet className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Pending Reimbursement</p>
                <p className="text-xl font-bold tabular-nums">
                  {formatCurrency(data.pendingTotal)}
                </p>
              </div>
            </div>

            {/* Average Approval Time */}
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 p-2">
                <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Avg Approval Time</p>
                <p className="text-xl font-bold tabular-nums">
                  {data.avgApprovalDays !== null
                    ? `${data.avgApprovalDays.toFixed(1)} days`
                    : "--"}
                </p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
