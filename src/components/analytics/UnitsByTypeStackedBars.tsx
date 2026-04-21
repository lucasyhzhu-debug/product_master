import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import { colorFor } from "@/lib/productionTypeColors";
import {
  ChartFrame,
  ChartTooltip,
  CHART_MARGIN,
  X_AXIS_STRING_LABEL_PROPS,
} from "@/lib/chartPrimitives";
import { useVolumeByType } from "@/hooks/convex/useAnalytics";

export function UnitsByTypeStackedBars() {
  const data = useVolumeByType("day");
  if (data === undefined) {
    return (
      <ChartFrame title="Units sold by production type" loading>
        {null}
      </ChartFrame>
    );
  }

  // LOCKED shape from reduceVolumeByType (time-bucketed): { buckets: string[], series: [{code, name, values[]}] }
  // Read data.buckets directly and map into recharts' per-row object shape.
  const rows = data.buckets.map((label, i) => {
    const row: Record<string, string | number> = { label };
    for (const s of data.series) row[s.code] = s.values[i];
    return row;
  });

  return (
    <ChartFrame title="Units sold by production type">
      <ResponsiveContainer width="100%" height="100%" minWidth={320}>
        <BarChart data={rows} margin={CHART_MARGIN}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="label" {...X_AXIS_STRING_LABEL_PROPS} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip content={<ChartTooltip valueFormatter={(v) => String(v)} />} />
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
