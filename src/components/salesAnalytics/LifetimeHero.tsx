import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/utils";
import { useLifetimeTotals } from "@/hooks/convex";

export function LifetimeHero() {
  const { data, isLoading, error } = useLifetimeTotals();

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-6">
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardContent className="py-6">
          <p className="text-sm text-muted-foreground">Failed to load lifetime totals.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="py-6">
        <div className="flex items-baseline gap-3">
          <span className="text-3xl font-bold tabular-nums">
            {data.totalBalls.toLocaleString()}
          </span>
          <span className="text-sm text-muted-foreground">balls sold (est.)</span>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          {formatCurrency(data.lifetimeRevenue)} lifetime revenue
          <span className="mx-2">&middot;</span>
          {data.lifetimeTransactions.toLocaleString()} transactions
        </p>
        <p className="text-xs text-muted-foreground mt-2">
          Estimated at {formatCurrency(data.avgRevenuePerBall)}/ball based on mapped product mix
        </p>
      </CardContent>
    </Card>
  );
}
