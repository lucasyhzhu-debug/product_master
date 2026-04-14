import { Card } from "@/components/ui/card";
import { useChannelEconomics } from "@/hooks/convex/useAnalytics";
import { formatCurrency } from "@/lib/utils";

export function TakeRateTable() {
  const data = useChannelEconomics();
  if (data === undefined) return <Card className="h-56 animate-pulse p-4" />;
  return (
    <Card className="p-4">
      <h4 className="mb-2 text-sm font-semibold">Take-rate table</h4>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-1">Channel</th>
              <th>Gross</th>
              <th>Discount</th>
              <th>Take%</th>
              <th>Net/unit</th>
            </tr>
          </thead>
          <tbody>
            {data.map((r) => (
              <tr key={r.channel} className="border-b last:border-0">
                <td className="py-1">{r.channel}</td>
                <td>{formatCurrency(r.gross)}</td>
                <td>{formatCurrency(r.discount)}</td>
                <td>{r.takePct.toFixed(1)}%</td>
                <td>{formatCurrency(r.netPerUnit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 text-[10px] text-muted-foreground">
        Note: v1 excludes platform fees from Take% (reflects discount depth only).
      </div>
    </Card>
  );
}
