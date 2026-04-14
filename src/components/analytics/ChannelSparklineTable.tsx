import { Card } from "@/components/ui/card";
import { useChannelMomentum } from "@/hooks/convex/useAnalytics";

function Spark({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(1, ...values);
  return (
    <div className="flex h-5 items-end gap-[2px]">
      {values.map((v, i) => (
        <div
          key={i}
          className="flex-1 rounded-sm"
          style={{ height: `${(v / max) * 100}%`, background: color, minWidth: "2px" }}
        />
      ))}
    </div>
  );
}

export function ChannelSparklineTable() {
  const data = useChannelMomentum();
  if (data === undefined) return <Card className="h-64 animate-pulse p-4" />;
  return (
    <Card className="p-4">
      <h4 className="mb-2 text-sm font-semibold">Per-channel momentum</h4>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-1">Channel</th>
              <th>Revenue</th>
              <th>Units</th>
              <th>AOV</th>
              <th>WoW</th>
            </tr>
          </thead>
          <tbody>
            {data.channels.map((r) => (
              <tr key={r.channel} className="border-b last:border-0">
                <td className="py-1">{r.channel}</td>
                <td className="min-w-[60px]">
                  <Spark values={r.revenueSpark} color="#10b981" />
                </td>
                <td className="min-w-[60px]">
                  <Spark values={r.unitsSpark} color="#8b5cf6" />
                </td>
                <td className="min-w-[60px]">
                  <Spark values={r.aovSpark} color="#06b6d4" />
                </td>
                <td
                  className={
                    r.wowPct === null
                      ? "text-muted-foreground"
                      : r.wowPct >= 0
                        ? "text-emerald-500"
                        : "text-red-500"
                  }
                >
                  {r.wowPct === null
                    ? "—"
                    : `${r.wowPct >= 0 ? "+" : ""}${r.wowPct.toFixed(0)}%`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
