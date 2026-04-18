import { useState } from "react";
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
import { useByWeekday } from "@/hooks/convex/useAnalytics";
import {
  ChartFrame,
  CHART_MARGIN,
  X_AXIS_STRING_LABEL_PROPS,
} from "@/lib/chartPrimitives";

type Mode = "weekday" | "rolling";

type WeekdayTooltipPayload = {
  payload?: {
    day?: string;
    orders?: number;
    units?: number;
    unitsPerOrder?: number;
  };
};

function WeekdayTooltip({
  active,
  payload,
  mode,
}: {
  active?: boolean;
  payload?: WeekdayTooltipPayload[];
  mode: Mode;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0]?.payload;
  if (!p) return null;
  const label = p.day ?? "";
  const orders = p.orders ?? 0;
  const units = p.units ?? 0;
  const upo = p.unitsPerOrder ?? 0;
  const prefix = label;
  return (
    <div
      data-chart-tooltip
      className="rounded-md border border-border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md"
    >
      <div className="mb-1 font-medium">{prefix}</div>
      <div data-tooltip-value className="text-xs tabular-nums">
        {orders} orders · {units} units · {upo.toFixed(2)} u/txn
      </div>
    </div>
  );
}

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
    return (
      <ChartFrame
        title="Orders, Units & Units/Order per weekday"
        loading
      >
        {null}
      </ChartFrame>
    );
  }
  const chartData = data.labels.map((label: string, i: number) => {
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

  // In weekday mode we have 7 ticks max — always show all of them per R1.
  // In rolling mode the series can grow long; use Recharts' auto-interval.
  const axisProps =
    mode === "weekday"
      ? X_AXIS_STRING_LABEL_PROPS
      : { tick: { fontSize: 11 } as const };

  return (
    <ChartFrame
      title={
        mode === "weekday"
          ? "Orders, Units & Units/Order per weekday"
          : "Orders, Units & Units/Order (rolling)"
      }
    >
      <div className="mb-2 flex items-center justify-end gap-1">
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
      <ResponsiveContainer width="100%" height="100%" minWidth={320}>
        <ComposedChart data={chartData} margin={CHART_MARGIN}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="day" {...axisProps} />
          {/* Left axis carries both Orders and Units (same count-like scale). */}
          <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
          {/* Right axis dedicated to Units/Order ratio (fewer ticks). */}
          <YAxis
            yAxisId="right"
            orientation="right"
            stroke="#22d3ee"
            tickCount={4}
            tick={{ fontSize: 11 }}
          />
          <Tooltip content={<WeekdayTooltip mode={mode} />} />
          <Legend />
          <Bar yAxisId="left" dataKey="orders" fill="#f97316" name="Orders" />
          <Bar yAxisId="left" dataKey="units" fill="#8b5cf6" name="Units" />
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
    </ChartFrame>
  );
}
