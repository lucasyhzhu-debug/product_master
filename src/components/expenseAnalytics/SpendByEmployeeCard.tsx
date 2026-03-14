/**
 * Spend By Employee Card (XANL-03)
 *
 * Lists employees sorted by total spend descending with bar indicators.
 */
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/utils";
import type { ExpenseMetricsData } from "@/hooks/convex/useExpenseAnalytics";

interface SpendByEmployeeCardProps {
  data: ExpenseMetricsData | undefined;
}

export function SpendByEmployeeCard({ data }: SpendByEmployeeCardProps) {
  const maxTotal = data?.byEmployee.length
    ? Math.max(...data.byEmployee.map((e) => e.total))
    : 0;

  const totalSpend = data?.byEmployee.reduce((sum, e) => sum + e.total, 0) ?? 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Spend by Employee</CardTitle>
        <CardDescription>Employee expense breakdown for period</CardDescription>
      </CardHeader>
      <CardContent>
        {data === undefined ? (
          <div className="space-y-3">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-[90%]" />
            <Skeleton className="h-6 w-[75%]" />
            <Skeleton className="h-6 w-[60%]" />
          </div>
        ) : data.byEmployee.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No employee expenses for this period
          </p>
        ) : (
          <div className="space-y-3">
            {data.byEmployee.map((emp) => {
              const pct = totalSpend > 0 ? (emp.total / totalSpend) * 100 : 0;
              const barWidth = maxTotal > 0 ? (emp.total / maxTotal) * 100 : 0;

              return (
                <div key={emp.userId}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="font-medium truncate mr-2">{emp.name}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-muted-foreground">
                        {pct.toFixed(1)}%
                      </span>
                      <span className="tabular-nums font-medium">
                        {formatCurrency(emp.total)}
                      </span>
                    </div>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all"
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
