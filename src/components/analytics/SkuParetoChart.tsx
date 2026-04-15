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

// Truncate long SKU names (typical marketplace titles run 40+ chars).
// Full name is preserved in the tooltip header via labelFormatter.
function truncateLabel(name: string): string {
  return name.length > 14 ? `${name.slice(0, 13)}…` : name;
}

export function SkuParetoChart() {
  const data = useSkuPareto(10);
  if (data === undefined) return <Card className="h-64 animate-pulse p-4" />;
  // Precompute truncated display label alongside the original name so the
  // axis stays readable while tooltips still surface the full SKU.
  const rows = data.rows.map((r) => ({ ...r, label: truncateLabel(r.name) }));
  return (
    <Card className="p-4">
      <h4 className="mb-2 text-sm font-semibold">SKU Pareto (top products by revenue)</h4>
      <ResponsiveContainer width="100%" height={340}>
        <ComposedChart data={rows} margin={{ top: 10, right: 30, left: 10, bottom: 10 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="label"
            angle={-45}
            textAnchor="end"
            height={110}
            interval={0}
            tick={{ fontSize: 11 }}
          />
          <YAxis yAxisId="left" tickFormatter={(v) => formatCurrency(v)} />
          <YAxis
            yAxisId="right"
            orientation="right"
            tickFormatter={(v) => `${v}%`}
            domain={[0, 100]}
          />
          <Tooltip
            // UAT-03: cumulativePct is a percentage (0-100), not currency.
            // Route formatting by series name so the bar shows IDR and the
            // line shows %.
            formatter={(v, name) => {
              const num = typeof v === "number" ? v : 0;
              if (name === "Cumulative %") return `${num.toFixed(1)}%`;
              return formatCurrency(num);
            }}
            // Show full SKU name in tooltip header (pre-truncation).
            labelFormatter={(_label, payload) => {
              const item = payload && payload[0];
              const full =
                item && (item.payload as { name?: string } | undefined)?.name;
              return full ?? "";
            }}
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
