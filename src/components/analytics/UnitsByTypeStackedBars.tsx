import { Card } from "@/components/ui/card";
import { useVolumeByType } from "@/hooks/convex/useAnalytics";
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
import { colorFor } from "@/lib/productionTypeColors";

export function UnitsByTypeStackedBars() {
  const data = useVolumeByType("day");
  if (data === undefined) return <Card className="h-64 animate-pulse p-4" />;
  const rows = data.buckets.map((b, i) => {
    const row: Record<string, string | number> = { bucket: b };
    for (const s of data.series) row[s.code] = s.values[i];
    return row;
  });
  return (
    <Card className="p-4">
      <h4 className="mb-2 text-sm font-semibold">Units sold by production type</h4>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={rows}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="bucket" />
          <YAxis />
          <Tooltip />
          <Legend />
          {data.series.map((s, i) => (
            <Bar key={s.code} dataKey={s.code} name={s.name} stackId="a" fill={colorFor(s.code, i)} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}
