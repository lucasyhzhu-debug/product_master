import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import { useSkuPareto } from "@/hooks/convex/useAnalytics";
import {
  ChartFrame,
  ChartTooltip,
  CHART_MARGIN,
  X_AXIS_STRING_LABEL_PROPS,
  formatCurrencyCompact,
  truncateWithTooltip,
} from "@/lib/chartPrimitives";

export function SkuParetoChart({ topN = 10 }: { topN?: number }) {
  const data = useSkuPareto(topN);
  if (data === undefined) {
    return (
      <ChartFrame title="SKU Pareto (top products by revenue)" loading>
        {null}
      </ChartFrame>
    );
  }

  // Use server-computed cumulativePct directly from reduceSkuTop — no client recompute.
  const chartData = data.rows.map((d: { name: string; revenue: number; cumulativePct: number }) => ({
    ...d,
    displayName: truncateWithTooltip(d.name, 22).display,
    fullName: d.name,
  }));

  return (
    <ChartFrame title="SKU Pareto (top products by revenue)" height={360}>
      {/* overflow-visible prevents SVG from clipping rotated x-axis tick labels at chart edges */}
      <div className="h-full w-full [&>div>svg]:overflow-visible">
      <ResponsiveContainer width="100%" height="100%" minWidth={320}>
        <ComposedChart data={chartData} margin={{ ...CHART_MARGIN, left: 80 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="displayName" {...X_AXIS_STRING_LABEL_PROPS} />
          <YAxis
            yAxisId="left"
            tickFormatter={formatCurrencyCompact}
            tick={{ fontSize: 11 }}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tickFormatter={(v) => `${Math.round(v)}%`}
            domain={[0, 100]}
            tick={{ fontSize: 11 }}
          />
          <Tooltip
            content={
              <ChartTooltip
                valueFormatter={(value, name) => {
                  if (name === "Cumulative %") return `${Number(value).toFixed(1)}%`;
                  return formatCurrencyCompact(Number(value));
                }}
              />
            }
            labelFormatter={(_, payload) => {
              const first = Array.isArray(payload) ? payload[0]?.payload : undefined;
              return (first as { fullName?: string } | undefined)?.fullName ?? "";
            }}
          />
          <Legend />
          <Bar yAxisId="left" dataKey="revenue" name="Revenue" fill="#f97316" />
          <Line
            yAxisId="right"
            dataKey="cumulativePct"
            name="Cumulative %"
            stroke="#10b981"
            strokeWidth={2}
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
      </div>
    </ChartFrame>
  );
}
