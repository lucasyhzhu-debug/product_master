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
  return (
    <Card className="p-4">
      <h4 className="mb-2 text-sm font-semibold">AOV per channel (gross vs net)</h4>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={rows}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="channel" />
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
