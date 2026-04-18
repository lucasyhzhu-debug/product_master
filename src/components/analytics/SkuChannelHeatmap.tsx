import { useMemo } from "react";
import { ResponsiveHeatMap } from "@nivo/heatmap";
import { useSkuChannelMatrix } from "@/hooks/convex/useAnalytics";
import {
  ChartFrame,
  ChartTooltip,
  truncateWithTooltip,
} from "@/lib/chartPrimitives";

export function SkuChannelHeatmap({ topN = 8 }: { topN?: number }) {
  const data = useSkuChannelMatrix(topN);

  const { transformed, fullNameById } = useMemo(() => {
    const fullNameById = new Map<string, string>();
    if (!data) return { transformed: [] as Array<{ id: string; data: Array<{ x: string; y: number }> }>, fullNameById };
    const transformed = data.matrix.map((row) => {
      const { display, full } = truncateWithTooltip(row.product, 22);
      fullNameById.set(display, full);
      return {
        id: display,
        data: row.channels.map((c) => ({
          x: c.channel,
          y: c.pctOfChannel,
        })),
      };
    });
    return { transformed, fullNameById };
  }, [data]);

  if (data === undefined) {
    return (
      <ChartFrame title="Product SKU × Channel heatmap (% of channel)" height={400} loading>
        {null}
      </ChartFrame>
    );
  }

  return (
    <ChartFrame title="Product SKU × Channel heatmap (% of channel)" height={400}>
      <ResponsiveHeatMap
        data={transformed}
        margin={{ top: 20, right: 30, bottom: 60, left: 180 }}
        valueFormat={(v) => `${Math.round(Number(v))}%`}
        axisTop={null}
        axisRight={null}
        axisBottom={{
          tickRotation: -30,
          legend: "Channel",
          legendPosition: "middle",
          legendOffset: 48,
        }}
        axisLeft={{
          legend: "Product",
          legendPosition: "middle",
          legendOffset: -160,
        }}
        colors={{ type: "quantize", scheme: "purples", steps: 5 }}
        emptyColor="hsl(var(--muted))"
        labelTextColor={{ from: "color", modifiers: [["darker", 3]] }}
        tooltip={({ cell }) => (
          <ChartTooltip
            active
            label={fullNameById.get(String(cell.serieId)) ?? String(cell.serieId)}
            payload={[
              {
                name: String(cell.data.x),
                value: Number(cell.value ?? 0),
              },
            ]}
            valueFormatter={(v) =>
              typeof v === "number" ? `${v.toFixed(1)}% of channel` : String(v)
            }
          />
        )}
        theme={{
          text: { fill: "hsl(var(--foreground))" },
          axis: {
            ticks: { text: { fill: "hsl(var(--muted-foreground))" } },
            legend: { text: { fill: "hsl(var(--foreground))" } },
          },
        }}
      />
    </ChartFrame>
  );
}
