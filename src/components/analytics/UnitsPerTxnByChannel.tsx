import { Card } from "@/components/ui/card";
import { useUnitsPerTxnByChannel } from "@/hooks/convex/useAnalytics";
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
import { getPlatformPalette } from "@/lib/platformColors";

export function UnitsPerTxnByChannel() {
  const data = useUnitsPerTxnByChannel();
  if (data === undefined) return <Card className="h-56 animate-pulse p-4" />;
  const rows = data.map((r) => ({
    channel: r.channel,
    unitsPerTxn: Number(r.unitsPerTxn.toFixed(2)),
    units: r.units,
    orderCount: r.orderCount,
  }));
  const rotate = rows.length > 4;
  return (
    <Card className="p-4">
      <h4 className="mb-2 text-sm font-semibold">Units per transaction (by channel)</h4>
      <ResponsiveContainer width="100%" height={rotate ? 240 : 200}>
        <BarChart data={rows} margin={{ top: 10, right: 8, left: 0, bottom: rotate ? 24 : 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="channel"
            angle={rotate ? -30 : 0}
            textAnchor={rotate ? "end" : "middle"}
            height={rotate ? 60 : 30}
            interval={0}
            tick={{ fontSize: 11 }}
          />
          <YAxis />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload || payload.length === 0) return null;
              const p = payload[0]?.payload as {
                channel: string;
                unitsPerTxn: number;
                units: number;
                orderCount: number;
              } | undefined;
              if (!p) return null;
              return (
                <div className="rounded-md border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-sm">
                  <div className="font-medium">{p.channel}</div>
                  <div className="text-muted-foreground">
                    {p.units} units · {p.orderCount} txns · {p.unitsPerTxn.toFixed(2)} u/txn
                  </div>
                </div>
              );
            }}
          />
          <Bar dataKey="unitsPerTxn">
            {rows.map((r) => (
              <Cell key={r.channel} fill={getPlatformPalette(r.channel).hex} />
            ))}
            <LabelList dataKey="unitsPerTxn" position="top" />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}
