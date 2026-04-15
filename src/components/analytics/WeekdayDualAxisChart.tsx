import { useState } from "react";
import { Card } from "@/components/ui/card";
import { useByWeekday } from "@/hooks/convex/useAnalytics";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

type Mode = "weekday" | "rolling";

function formatRollingLabel(iso: string): string {
  // iso = YYYY-MM-DD; render as "MMM D"
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[m - 1]} ${d}`;
}

export function WeekdayDualAxisChart() {
  const [mode, setMode] = useState<Mode>("weekday");
  const data = useByWeekday(mode);
  if (data === undefined) {
    return <Card className="h-64 animate-pulse p-4" />;
  }
  const chartData = data.labels.map((label, i) => {
    const orders = data.orders[i];
    const units = data.units[i];
    const upo = orders > 0 ? units / orders : 0;
    return {
      day: mode === "rolling" ? formatRollingLabel(label) : label,
      orders,
      units,
      unitsPerOrder: Number(upo.toFixed(2)),
    };
  });

  // For rolling mode, compute a sensible X-axis interval to avoid label crowding.
  const xAxisInterval =
    mode === "rolling" && chartData.length > 14
      ? Math.ceil(chartData.length / 12)
      : 0;

  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-sm font-semibold">
          {mode === "weekday"
            ? "Orders, Units & Units/Order per weekday"
            : "Orders, Units & Units/Order (rolling)"}
        </h4>
        <div className="inline-flex rounded-md border bg-muted/40 p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setMode("weekday")}
            className={`rounded px-2 py-1 transition ${
              mode === "weekday" ? "bg-background shadow-sm font-medium" : "text-muted-foreground"
            }`}
            aria-pressed={mode === "weekday"}
          >
            Weekday
          </button>
          <button
            type="button"
            onClick={() => setMode("rolling")}
            className={`rounded px-2 py-1 transition ${
              mode === "rolling" ? "bg-background shadow-sm font-medium" : "text-muted-foreground"
            }`}
            aria-pressed={mode === "rolling"}
          >
            Rolling
          </button>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="day" interval={xAxisInterval} />
          <YAxis yAxisId="left" stroke="#f97316" />
          <YAxis yAxisId="right" orientation="right" stroke="#8b5cf6" />
          <Tooltip />
          <Legend />
          <Bar yAxisId="left" dataKey="orders" fill="#f97316" name="Orders" />
          <Bar yAxisId="right" dataKey="units" fill="#8b5cf6" name="Units" />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="unitsPerOrder"
            stroke="#22d3ee"
            strokeWidth={2}
            dot={{ r: 2 }}
            name="Units / Order"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </Card>
  );
}
