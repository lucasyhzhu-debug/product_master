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

  const { transformed, fullNameById, maxVal } = useMemo(() => {
    const fullNameById = new Map<string, string>();
    if (!data)
      return {
        transformed: [] as Array<{ id: string; data: Array<{ x: string; y: number }> }>,
        fullNameById,
        maxVal: 1,
      };
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
    const maxVal = Math.max(
      ...data.matrix.flatMap((row) => row.channels.map((c) => c.pctOfChannel)),
      1,
    );
    return { transformed, fullNameById, maxVal };
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
        margin={{ top: 60, right: 30, bottom: 20, left: 180 }}
        valueFormat={(v) => `${Math.round(Number(v))}%`}
        axisTop={{
          tickRotation: -30,
          legend: "Channel",
          legendPosition: "middle",
          legendOffset: -48,
        }}
        axisBottom={null}
        axisRight={null}
        axisLeft={{
          legend: "Product",
          legendPosition: "middle",
          legendOffset: -160,
        }}
        colors={{ type: "quantize", scheme: "purples", steps: 5 }}
        emptyColor="hsl(var(--muted))"
        labelTextColor={(cell) =>
          Number(cell.value ?? 0) / maxVal > 0.4 ? "#ffffff" : "#1e293b"
        }
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
            ticks: { text: { fill: "hsl(var(--muted-foreground))", fontSize: 11 } },
            legend: { text: { fill: "hsl(var(--muted-foreground))", fontSize: 11 } },
          },
          labels: { text: { fontSize: 11, fontWeight: 500 } },
        }}
      />
    </ChartFrame>
  );
}
