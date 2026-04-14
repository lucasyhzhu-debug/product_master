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
  }));
  return (
    <Card className="p-4">
      <h4 className="mb-2 text-sm font-semibold">Units per transaction (by channel)</h4>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={rows}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="channel" />
          <YAxis />
          <Tooltip />
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
