import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from "recharts";
import { useChannelEconomics } from "@/hooks/convex/useAnalytics";
import { getPlatformPalette } from "@/lib/platformColors";
import { formatCurrency } from "@/lib/utils";
import {
  ChartFrame,
  CHART_MARGIN,
  X_AXIS_STRING_LABEL_PROPS,
  formatCurrencyCompact,
} from "@/lib/chartPrimitives";

type RevPerUnitRow = {
  channel: string;
  value: number;
  gross: number;
  net: number;
  takePct: number;
};

// Channel-based RevPerUnit tooltip — preserves rich info (gross/net/take%) that a
// single-value ChartTooltip can't express. Uses popover tokens for R2 contrast.
function RevPerUnitTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: RevPerUnitRow }>;
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
        Rev/Unit {formatCurrency(p.value)}
      </div>
      <div className="text-xs text-muted-foreground tabular-nums">
        Gross {formatCurrency(p.gross)} · Net {formatCurrency(p.net)} · Take{" "}
        {p.takePct.toFixed(0)}%
      </div>
    </div>
  );
}

export function RevPerUnitChart() {
  const data = useChannelEconomics();
  if (data === undefined) {
    return (
      <ChartFrame title="Revenue per unit by channel" loading>
        {null}
      </ChartFrame>
    );
  }
  const rows: RevPerUnitRow[] = data.map((r) => ({
    channel: r.channel,
    value: r.revPerUnit,
    gross: r.gross,
    net: r.net,
    takePct: r.takePct,
  }));

  return (
    <ChartFrame title="Revenue per unit by channel">
      <ResponsiveContainer width="100%" height="100%" minWidth={320}>
        <BarChart data={rows} margin={CHART_MARGIN}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="channel" {...X_AXIS_STRING_LABEL_PROPS} />
          <YAxis tickFormatter={formatCurrencyCompact} tick={{ fontSize: 11 }} />
          <Tooltip content={<RevPerUnitTooltip />} />
          <Bar dataKey="value">
            {rows.map((r) => (
              <Cell key={r.channel} fill={getPlatformPalette(r.channel).hex} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
