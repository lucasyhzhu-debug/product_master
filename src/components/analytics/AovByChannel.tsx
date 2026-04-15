import { Card } from "@/components/ui/card";
import { useAovByChannel } from "@/hooks/convex/useAnalytics";
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
import { formatCurrency } from "@/lib/utils";

export function AovByChannel() {
  const data = useAovByChannel();
  if (data === undefined) return <Card className="h-56 animate-pulse p-4" />;
  const rows = data.map((r) => ({ channel: r.channel, gross: r.grossAov, net: r.netAov }));
  const rotate = rows.length > 4;
  return (
    <Card className="p-4">
      <h4 className="mb-2 text-sm font-semibold">AOV per channel (gross vs net)</h4>
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
          <Tooltip formatter={(v) => formatCurrency(typeof v === "number" ? v : 0)} />
          <Legend />
          <Bar dataKey="gross" name="Gross AOV" fill="#10b981" />
          <Bar dataKey="net" name="Net AOV" fill="#8b5cf6" />
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}
