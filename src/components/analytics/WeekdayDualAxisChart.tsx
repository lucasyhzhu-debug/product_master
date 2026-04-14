import { Card } from "@/components/ui/card";
import { useByWeekday } from "@/hooks/convex/useAnalytics";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

export function WeekdayDualAxisChart() {
  const data = useByWeekday();
  if (data === undefined) {
    return <Card className="h-64 animate-pulse p-4" />;
  }
  const chartData = data.labels.map((label, i) => ({
    day: label,
    orders: data.orders[i],
    units: data.units[i],
  }));
  return (
    <Card className="p-4">
      <h4 className="mb-2 text-sm font-semibold">Orders &amp; Units per weekday</h4>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="day" />
          <YAxis yAxisId="left" stroke="#f97316" />
          <YAxis yAxisId="right" orientation="right" stroke="#8b5cf6" />
          <Tooltip />
          <Legend />
          <Bar yAxisId="left" dataKey="orders" fill="#f97316" name="Orders" />
          <Bar yAxisId="right" dataKey="units" fill="#8b5cf6" name="Units" />
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}
