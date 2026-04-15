import { Card } from "@/components/ui/card";
import { useChannelEconomics } from "@/hooks/convex/useAnalytics";
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
import { formatCurrency } from "@/lib/utils";
import { getPlatformPalette } from "@/lib/platformColors";

type RevPerUnitRow = {
  channel: string;
  value: number;
  gross: number;
  net: number;
  takePct: number;
};

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
    <div className="rounded-md border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-sm">
      <div className="font-medium">{p.channel}</div>
      <div className="text-muted-foreground">
        Rev/Unit {formatCurrency(p.value)}
      </div>
      <div className="text-muted-foreground">
        Gross {formatCurrency(p.gross)} · Net {formatCurrency(p.net)} · Take{" "}
        {p.takePct.toFixed(0)}%
      </div>
    </div>
  );
}

export function RevPerUnitChart() {
  const data = useChannelEconomics();
  if (data === undefined) return <Card className="h-56 animate-pulse p-4" />;
  const rows: RevPerUnitRow[] = data.map((r) => ({
    channel: r.channel,
    value: r.revPerUnit,
    gross: r.gross,
    net: r.net,
    takePct: r.takePct,
  }));
  const rotate = rows.length > 4;
  return (
    <Card className="p-4">
      <h4 className="mb-2 text-sm font-semibold">Revenue per unit by channel</h4>
      <ResponsiveContainer width="100%" height={rotate ? 240 : 200}>
        <BarChart data={rows} margin={{ top: 4, right: 8, left: 0, bottom: rotate ? 24 : 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="channel"
            angle={rotate ? -30 : 0}
            textAnchor={rotate ? "end" : "middle"}
            height={rotate ? 60 : 30}
            interval={0}
            tick={{ fontSize: 11 }}
          />
          <YAxis tickFormatter={(v) => formatCurrency(v)} />
          <Tooltip content={<RevPerUnitTooltip />} />
          <Bar dataKey="value">
            {rows.map((r) => (
              <Cell key={r.channel} fill={getPlatformPalette(r.channel).hex} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}
