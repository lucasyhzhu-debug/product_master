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

export function RevPerUnitChart() {
  const data = useChannelEconomics();
  if (data === undefined) return <Card className="h-56 animate-pulse p-4" />;
  const rows = data.map((r) => ({ channel: r.channel, value: r.revPerUnit }));
  return (
    <Card className="p-4">
      <h4 className="mb-2 text-sm font-semibold">Revenue per unit by channel</h4>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={rows}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="channel" />
          <YAxis tickFormatter={(v) => formatCurrency(v)} />
          <Tooltip formatter={(v: number) => formatCurrency(v)} />
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
