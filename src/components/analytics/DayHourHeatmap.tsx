import { useMemo } from "react";
import { ResponsiveHeatMap } from "@nivo/heatmap";
import { useDayHourHeatmap } from "@/hooks/convex/useAnalytics";
import { ChartFrame, ChartTooltip, formatCurrencyCompact } from "@/lib/chartPrimitives";

function collapseOvernight(
  grid: number[][],
  colLabels: string[],
): { labels: string[]; grid: number[][] } {
  const OVERNIGHT_IDX = colLabels
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => {
      const start = Number(l.split("-")[0]);
      if (isNaN(start)) return false;
      return start < 9;
    })
    .map(({ i }) => i);
  const keepIdx = colLabels
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => {
      const start = Number(l.split("-")[0]);
      if (isNaN(start)) return false;
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

  const { transformed, rawValues, maxPct } = useMemo(() => {
    if (data === undefined)
      return { transformed: [], rawValues: new Map<string, number>(), maxPct: 1 };
    const { grid, rowLabels, colLabels } = data;
    const collapsed = collapseOvernight(grid, colLabels);
    const { labels: hourLabels, grid: newGrid } = collapsed;

    // Per-day revenue totals (column sums in original day×hour grid)
    const dayTotals = rowLabels.map((_d, dayIdx) =>
      hourLabels.reduce((s, _h, hourIdx) => s + (newGrid[dayIdx]?.[hourIdx] ?? 0), 0),
    );

    // Store raw IDR values for tooltip lookup
    const rawValues = new Map<string, number>();

    // Transposed: rows = hour bins, columns = days
    // y = % of that day's total revenue (cell intensity reflects share-of-day, not absolute IDR)
    const transformed = hourLabels.map((hourLabel, hourIdx) => ({
      id: hourLabel,
      data: rowLabels.map((day: string, dayIdx: number) => {
        const raw = newGrid[dayIdx]?.[hourIdx] ?? 0;
        const pct = dayTotals[dayIdx] > 0 ? (raw / dayTotals[dayIdx]) * 100 : 0;
        rawValues.set(`${hourLabel}|${day}`, raw);
        return { x: day, y: pct };
      }),
    }));

    const maxPct = Math.max(...transformed.flatMap((r) => r.data.map((d) => d.y)), 1);
    return { transformed, rawValues, maxPct };
  }, [data]);

  if (data === undefined) {
    return (
      <ChartFrame title="Day × Hour heatmap (% of day revenue)" height={320} loading>
        {null}
      </ChartFrame>
    );
  }

  return (
    <ChartFrame title="Day × Hour heatmap (% of day revenue)" height={320}>
      <ResponsiveHeatMap
        data={transformed}
        margin={{ top: 50, right: 20, bottom: 20, left: 115 }}
        valueFormat={(v) => `${Math.round(Number(v))}%`}
        axisTop={{
          tickRotation: 0,
          legend: "",
          legendPosition: "middle",
          legendOffset: -36,
        }}
        axisBottom={null}
        axisRight={null}
        axisLeft={{
          legend: "Hour (WIB)",
          legendPosition: "middle",
          legendOffset: -100,
        }}
        colors={{ type: "quantize", scheme: "purples", steps: 5 }}
        emptyColor="hsl(var(--muted))"
        labelTextColor={(cell) =>
          Number(cell.value ?? 0) / maxPct > 0.4 ? "#ffffff" : "#1e293b"
        }
        tooltip={({ cell }) => {
          const raw = rawValues.get(`${String(cell.serieId)}|${String(cell.data.x)}`) ?? 0;
          return (
            <ChartTooltip
              active
              label={`${String(cell.data.x)} · ${String(cell.serieId)}`}
              payload={[{ name: "Revenue", value: raw }]}
              valueFormatter={(v) =>
                typeof v === "number" ? formatCurrencyCompact(v) : String(v)
              }
            />
          );
        }}
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
