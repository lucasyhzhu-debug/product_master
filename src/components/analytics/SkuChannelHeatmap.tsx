import { Card } from "@/components/ui/card";
import { useSkuChannelMatrix } from "@/hooks/convex/useAnalytics";

function intensityClass(pct: number): string {
  if (pct < 5) return "bg-purple-500/10";
  if (pct < 15) return "bg-purple-500/30";
  if (pct < 30) return "bg-purple-500/50";
  if (pct < 50) return "bg-purple-500/75";
  return "bg-purple-500";
}

export function SkuChannelHeatmap() {
  const data = useSkuChannelMatrix(8);
  if (data === undefined) return <Card className="h-64 animate-pulse p-4" />;
  return (
    <Card className="p-4">
      <h4 className="mb-2 text-sm font-semibold">Product SKU × Channel heatmap (% of channel)</h4>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr>
              <th className="py-1 text-left text-muted-foreground">Product</th>
              {data.channels.map((c) => (
                <th key={c} className="px-2 text-center text-muted-foreground">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.matrix.map((row) => (
              <tr key={row.productKey}>
                <td className="py-1">{row.product}</td>
                {row.channels.map((c) => (
                  <td
                    key={c.channel}
                    className={`px-1 py-1 text-center ${intensityClass(c.pctOfChannel)}`}
                  >
                    {c.pctOfChannel.toFixed(0)}%
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
