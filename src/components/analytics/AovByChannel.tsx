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
import { useAovByChannel } from "@/hooks/convex/useAnalytics";
import {
  ChartFrame,
  ChartTooltip,
  CHART_MARGIN,
  X_AXIS_STRING_LABEL_PROPS,
  formatCurrencyCompact,
} from "@/lib/chartPrimitives";

export function AovByChannel() {
  const data = useAovByChannel();
  if (data === undefined) {
    return (
      <ChartFrame title="AOV per channel (gross vs net)" loading>
        {null}
      </ChartFrame>
    );
  }
  // channelEconomics rows carry raw totals; compute gross/net AOV client-side.
  const rows = data.map((r) => ({
    channel: r.channel,
    gross: r.orderCount === 0 ? 0 : r.gross / r.orderCount,
    net: r.orderCount === 0 ? 0 : r.net / r.orderCount,
  }));
  return (
    <ChartFrame title="AOV per channel (gross vs net)">
      <ResponsiveContainer width="100%" height="100%" minWidth={320}>
        <BarChart data={rows} margin={CHART_MARGIN}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="channel" {...X_AXIS_STRING_LABEL_PROPS} />
          <YAxis tickFormatter={formatCurrencyCompact} tick={{ fontSize: 11 }} />
          <Tooltip
            content={
              <ChartTooltip
                valueFormatter={(v) => formatCurrencyCompact(Number(v))}
              />
            }
          />
          <Legend />
          <Bar dataKey="gross" name="Gross AOV" fill="#10b981" />
          <Bar dataKey="net" name="Net AOV" fill="#8b5cf6" />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
