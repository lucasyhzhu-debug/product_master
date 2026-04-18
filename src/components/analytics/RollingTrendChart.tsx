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
import { useRollingTrend } from "@/hooks/convex/useAnalytics";
import { formatCurrency } from "@/lib/utils";
import {
  ChartFrame,
  CHART_MARGIN,
  formatCurrencyCompact,
} from "@/lib/chartPrimitives";

// RollingTrend uses a time-series (date) X-axis. Rotating/interval-0 axis props
// would be too noisy for 30+ daily ticks, so X_AXIS_STRING_LABEL_PROPS is NOT
// applied here; Recharts' default time-axis auto-interval is appropriate.
function RollingTrendTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{
    payload?: { date: string; daily: number; r7: number; r28: number };
  }>;
  label?: string | number;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0]?.payload;
  if (!p) return null;
  return (
    <div
      data-chart-tooltip
      className="rounded-md border border-border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md"
    >
      <div className="mb-1 font-medium">{String(label ?? p.date)}</div>
      <div data-tooltip-value className="text-xs tabular-nums">
        Daily {formatCurrency(p.daily)}
      </div>
      <div className="text-xs text-muted-foreground tabular-nums">
        7d avg {formatCurrency(p.r7)} · 28d avg {formatCurrency(p.r28)}
      </div>
    </div>
  );
}

export function RollingTrendChart() {
  const data = useRollingTrend();
  if (data === undefined) {
    return (
      <ChartFrame title="Rolling trend (7d / 28d)" loading>
        {null}
      </ChartFrame>
    );
  }
  const rows = data.dates.map((d: string, i: number) => ({
    date: d,
    daily: data.daily[i],
    r7: data.rolling7[i],
    r28: data.rolling28[i],
  }));
  return (
    <ChartFrame title="Rolling trend (7d / 28d)">
      <ResponsiveContainer width="100%" height="100%" minWidth={320}>
        <ComposedChart data={rows} margin={CHART_MARGIN}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} />
          <YAxis tickFormatter={formatCurrencyCompact} tick={{ fontSize: 11 }} />
          <Tooltip content={<RollingTrendTooltip />} />
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
    </ChartFrame>
  );
}
