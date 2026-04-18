import { useMemo } from "react";
import { ResponsiveHeatMap } from "@nivo/heatmap";
import { useDayHourHeatmap } from "@/hooks/convex/useAnalytics";
import { ChartFrame, ChartTooltip, formatCurrencyCompact } from "@/lib/chartPrimitives";

/**
 * Collapse backend colLabels ["0-3","3-6","6-9","9-12","12-15","15-18","18-21","21-24"]
 * into 6 display columns: ["Overnight (0-9)","9-12","12-15","15-18","18-21","21-24"].
 * The Overnight column sums revenue from hours 0-3 + 3-6 + 6-9 per day.
 *
 * Wave A reducer (reduceDayHourHeatmap) intentionally leaves raw 7×8 grid — this
 * collapse stays at component boundary per Wave A SUMMARY deviation #3.
 */
function collapseOvernight(
  grid: number[][],
  colLabels: string[],
): { labels: string[]; grid: number[][] } {
  const OVERNIGHT_IDX = colLabels
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => {
      const start = Number(l.split("-")[0]);
      if (isNaN(start)) return false; // skip malformed labels
      return start < 9;
    })
    .map(({ i }) => i);
  const keepIdx = colLabels
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => {
      const start = Number(l.split("-")[0]);
      if (isNaN(start)) return false; // skip malformed labels
      return start >= 9;
    });
  const newLabels = ["Overnight (0-9)", ...keepIdx.map(({ l }) => l)];
  const newGrid = grid.map((dayRow) => {
    const overnightSum = OVERNIGHT_IDX.reduce((s, hi) => s + (dayRow[hi] ?? 0), 0);
    const rest = keepIdx.map(({ i }) => dayRow[i] ?? 0);
    return [overnightSum, ...rest];
  });
  return { labels: newLabels, grid: newGrid };
}

export function DayHourHeatmap() {
  const data = useDayHourHeatmap();

  const transformed = useMemo(() => {
    if (data === undefined) return [];
    const { grid, rowLabels, colLabels } = data;
    const collapsed = collapseOvernight(grid, colLabels);
    // Nivo shape: Array<{ id: string; data: Array<{ x: string; y: number }> }>
    // Rows (id) are days (Mon..Sun); columns (x) are hour bins.
    return rowLabels.map((day: string, dayIdx: number) => ({
      id: day,
      data: collapsed.labels.map((hourLabel: string, hourIdx: number) => ({
        x: hourLabel,
        y: collapsed.grid[dayIdx]?.[hourIdx] ?? 0,
      })),
    }));
  }, [data]);

  if (data === undefined) {
    return (
      <ChartFrame title="Day × Hour heatmap (revenue)" height={360} loading>
        {null}
      </ChartFrame>
    );
  }

  return (
    <ChartFrame title="Day × Hour heatmap (revenue)" height={360}>
      <ResponsiveHeatMap
        data={transformed}
        margin={{ top: 20, right: 30, bottom: 60, left: 80 }}
        valueFormat={(v) => formatCurrencyCompact(Number(v))}
        axisTop={null}
        axisRight={null}
        axisBottom={{
          tickRotation: 0,
          legend: "Hour (WIB)",
          legendPosition: "middle",
          legendOffset: 46,
        }}
        axisLeft={{
          legend: "Day",
          legendPosition: "middle",
          legendOffset: -60,
        }}
        colors={{ type: "quantize", scheme: "purples", steps: 5 }}
        emptyColor="hsl(var(--muted))"
        labelTextColor={{ from: "color", modifiers: [["darker", 3]] }}
        tooltip={({ cell }) => (
          <ChartTooltip
            active
            label={String(cell.serieId)}
            payload={[
              {
                name: String(cell.data.x),
                value: Number(cell.value ?? 0),
              },
            ]}
            valueFormatter={(v) =>
              typeof v === "number" ? formatCurrencyCompact(v) : String(v)
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
