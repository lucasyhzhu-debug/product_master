/**
 * OpEx Summary Card (XANL-01 + XANL-02)
 *
 * Displays total OpEx for the period and GL category breakdown as a pie chart.
 */
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
} from "recharts";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/utils";
import type { OpExAnalyticsData } from "@/hooks/convex/useExpenseAnalytics";

const COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#6366f1",
];

interface OpExSummaryCardProps {
  data: OpExAnalyticsData | undefined;
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; payload: { name: string; total: number } }>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const item = payload[0].payload;
  return (
    <div className="rounded-lg border bg-background p-3 shadow-md">
      <p className="text-sm font-medium">{item.name}</p>
      <p className="text-sm text-muted-foreground tabular-nums">
        {formatCurrency(item.total)}
      </p>
    </div>
  );
}

export function OpExSummaryCard({ data }: OpExSummaryCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Total OpEx</CardTitle>
        <CardDescription>Operating expenses by GL category</CardDescription>
      </CardHeader>
      <CardContent>
        {data === undefined ? (
          <div className="space-y-3">
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-[180px] w-full" />
          </div>
        ) : data.byCategory.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8">
            <p className="text-2xl font-bold tabular-nums mb-2">
              {formatCurrency(0)}
            </p>
            <p className="text-sm text-muted-foreground">
              No OpEx data for this period
            </p>
          </div>
        ) : (
          <>
            <p className="text-2xl font-bold tabular-nums mb-3">
              {formatCurrency(data.totalOpEx)}
            </p>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie
                  data={data.byCategory}
                  dataKey="total"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={70}
                  paddingAngle={2}
                >
                  {data.byCategory.map((_, index) => (
                    <Cell
                      key={index}
                      fill={COLORS[index % COLORS.length]}
                    />
                  ))}
                </Pie>
                <RechartsTooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-2 space-y-1">
              {data.byCategory.map((cat, index) => (
                <div key={cat.code} className="flex items-center gap-2 text-xs">
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: COLORS[index % COLORS.length] }}
                  />
                  <span className="text-muted-foreground truncate flex-1">
                    {cat.name}
                  </span>
                  <span className="tabular-nums font-medium">
                    {formatCurrency(cat.total)}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
