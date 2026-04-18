import { useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { Button } from "@/components/ui/button";
import { colorFor } from "@/lib/productionTypeColors";
import {
  ChartFrame,
  ChartTooltip,
  CHART_MARGIN,
  X_AXIS_STRING_LABEL_PROPS,
} from "@/lib/chartPrimitives";
import { useTypeMixOverTime } from "@/hooks/convex/useAnalytics";

export function TypeMixOverTime({
  granularity = "week" as "day" | "week",
}: {
  granularity?: "day" | "week";
}) {
  const [mode, setMode] = useState<"absolute" | "percent">("percent");
  const data = useTypeMixOverTime(granularity);
  if (data === undefined) {
    return (
      <ChartFrame title={`Product-type mix over time`} loading>
        {null}
      </ChartFrame>
    );
  }

  // Shape from reduceTypeMixOverTime (Wave A): { buckets: string[], series: [{code, name, values[]}] }
  // Server returns absolute values; client does absolute↔percent toggle via mode.
  const rows = data.buckets.map((label, i) => {
    const total = data.series.reduce(
      (acc: number, s: { values: number[] }) => acc + s.values[i],
      0,
    );
    const row: Record<string, string | number> = { label };
    for (const s of data.series) {
      const v = s.values[i];
      row[s.code] = mode === "percent" && total > 0 ? (v / total) * 100 : v;
    }
    return row;
  });

  return (
    <ChartFrame title="Product-type mix over time">
      <div className="mb-2 flex items-center justify-end gap-1">
        <Button
          size="sm"
          variant={mode === "percent" ? "default" : "outline"}
          onClick={() => setMode("percent")}
        >
          %
        </Button>
        <Button
          size="sm"
          variant={mode === "absolute" ? "default" : "outline"}
          onClick={() => setMode("absolute")}
        >
          Abs
        </Button>
      </div>
      <ResponsiveContainer width="100%" height="100%" minWidth={320}>
        <BarChart data={rows} margin={CHART_MARGIN}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="label" {...X_AXIS_STRING_LABEL_PROPS} />
          <YAxis
            tickFormatter={(v) => (mode === "percent" ? `${Math.round(v)}%` : String(v))}
            domain={mode === "percent" ? [0, 100] : undefined}
            tick={{ fontSize: 11 }}
          />
          <Tooltip
            content={
              <ChartTooltip
                valueFormatter={(v) =>
                  mode === "percent" ? `${Number(v).toFixed(1)}%` : String(v)
                }
              />
            }
          />
          <Legend />
          {data.series.map((s, i) => (
            <Bar
              key={s.code}
              dataKey={s.code}
              name={s.name}
              stackId="a"
              fill={colorFor(s.code, i)}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
