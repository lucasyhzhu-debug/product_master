/**
 * Monthly Trend Chart (XANL-04)
 *
 * 6-month OpEx line chart showing trailing spend trend.
 */
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from "recharts";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/utils";
import type { OpExAnalyticsData } from "@/hooks/convex/useExpenseAnalytics";

interface MonthlyTrendChartProps {
  data: OpExAnalyticsData | undefined;
}

function formatYAxis(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}k`;
  return String(value);
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-lg border bg-background p-3 shadow-md">
      <p className="text-sm font-medium mb-1">{label}</p>
      <p className="text-sm tabular-nums">{formatCurrency(payload[0].value)}</p>
    </div>
  );
}

export function MonthlyTrendChart({ data }: MonthlyTrendChartProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Monthly Trend</CardTitle>
        <CardDescription>6-month trailing OpEx trend</CardDescription>
      </CardHeader>
      <CardContent>
        {data === undefined ? (
          <Skeleton className="h-[240px] w-full" />
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={data.trend}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 12 }}
                className="text-muted-foreground"
              />
              <YAxis
                tick={{ fontSize: 12 }}
                tickFormatter={formatYAxis}
                className="text-muted-foreground"
              />
              <RechartsTooltip content={<CustomTooltip />} />
              <Line
                type="monotone"
                dataKey="total"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={{ r: 4, fill: "#3b82f6" }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
