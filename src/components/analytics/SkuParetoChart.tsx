import { Card } from "@/components/ui/card";
import { useSkuPareto } from "@/hooks/convex/useAnalytics";
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

export function SkuParetoChart() {
  const data = useSkuPareto(10);
  if (data === undefined) return <Card className="h-64 animate-pulse p-4" />;
  return (
    <Card className="p-4">
      <h4 className="mb-2 text-sm font-semibold">SKU Pareto (top products by revenue)</h4>
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={data.rows}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" angle={-30} textAnchor="end" height={70} />
          <YAxis yAxisId="left" tickFormatter={(v) => formatCurrency(v)} />
          <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
          <Tooltip
            formatter={(v: number, name: string) =>
              name === "cumulativePct" ? `${v.toFixed(1)}%` : formatCurrency(v)
            }
          />
          <Legend />
          <Bar yAxisId="left" dataKey="revenue" fill="#f97316" name="Revenue" />
          <Line
            yAxisId="right"
            dataKey="cumulativePct"
            stroke="#10b981"
            strokeWidth={2}
            name="Cumulative %"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </Card>
  );
}
