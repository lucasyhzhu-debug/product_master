import { Card } from "@/components/ui/card";
import { useRollingTrend } from "@/hooks/convex/useAnalytics";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import { formatCurrency } from "@/lib/utils";

export function RollingTrendChart() {
  const data = useRollingTrend();
  if (data === undefined) return <Card className="h-64 animate-pulse p-4" />;
  const rows = data.dates.map((d, i) => ({
    date: d,
    daily: data.daily[i],
    r7: data.rolling7[i],
    r28: data.rolling28[i],
  }));
  return (
    <Card className="p-4">
      <h4 className="mb-2 text-sm font-semibold">Rolling trend (7d / 28d)</h4>
      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart data={rows}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis tickFormatter={(v) => formatCurrency(v)} />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload || payload.length === 0) return null;
              const p = payload[0]?.payload as
                | { date: string; daily: number; r7: number; r28: number }
                | undefined;
              if (!p) return null;
              return (
                <div className="rounded-md border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-sm">
                  <div className="font-medium">{String(label ?? p.date)}</div>
                  <div className="text-muted-foreground">
                    {formatCurrency(p.daily)} · 7d avg {formatCurrency(p.r7)} · 28d avg{" "}
                    {formatCurrency(p.r28)}
                  </div>
                </div>
              );
            }}
          />
          <Legend />
          <Bar dataKey="daily" fill="#f9731644" name="Daily" />
          <Line dataKey="r7" stroke="#10b981" dot={false} name="7d rolling" />
          <Line
            dataKey="r28"
            stroke="#8b5cf6"
            strokeDasharray="4 2"
            dot={false}
            name="28d rolling"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </Card>
  );
}
