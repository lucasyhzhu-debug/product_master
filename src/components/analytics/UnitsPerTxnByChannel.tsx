import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  LabelList,
  Cell,
} from "recharts";
import { useUnitsPerTxnByChannel } from "@/hooks/convex/useAnalytics";
import { getPlatformPalette } from "@/lib/platformColors";
import {
  ChartFrame,
  CHART_MARGIN,
  X_AXIS_STRING_LABEL_PROPS,
} from "@/lib/chartPrimitives";

type Row = {
  channel: string;
  unitsPerTxn: number;
  units: number;
  orderCount: number;
};

function UnitsPerTxnTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: Row }>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0]?.payload;
  if (!p) return null;
  return (
    <div
      data-chart-tooltip
      className="rounded-md border border-border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md"
    >
      <div className="mb-1 font-medium">{p.channel}</div>
      <div data-tooltip-value className="text-xs tabular-nums">
        {p.units} units · {p.orderCount} txns · {p.unitsPerTxn.toFixed(2)} u/txn
      </div>
    </div>
  );
}

export function UnitsPerTxnByChannel() {
  const data = useUnitsPerTxnByChannel();
  if (data === undefined) {
    return (
      <ChartFrame title="Units per transaction (by channel)" loading>
        {null}
      </ChartFrame>
    );
  }
  // channelEconomics rows carry raw totals; compute unitsPerTxn client-side.
  const rows: Row[] = data
    .map((r) => ({
      channel: r.channel,
      units: r.units,
      orderCount: r.orderCount,
      unitsPerTxn:
        r.orderCount === 0 ? 0 : Number((r.units / r.orderCount).toFixed(2)),
    }))
    .sort((a, b) => b.unitsPerTxn - a.unitsPerTxn);
  return (
    <ChartFrame title="Units per transaction (by channel)">
      <ResponsiveContainer width="100%" height="100%" minWidth={320}>
        <BarChart data={rows} margin={CHART_MARGIN}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="channel" {...X_AXIS_STRING_LABEL_PROPS} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip content={<UnitsPerTxnTooltip />} />
          <Bar dataKey="unitsPerTxn">
            {rows.map((r) => (
              <Cell key={r.channel} fill={getPlatformPalette(r.channel).hex} />
            ))}
            <LabelList dataKey="unitsPerTxn" position="top" />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
