import { Fragment, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { useDayHourHeatmap } from "@/hooks/convex/useAnalytics";
import { formatCurrency } from "@/lib/utils";

function intensityClass(value: number, max: number): string {
  if (max === 0) return "bg-muted";
  const ratio = value / max;
  if (ratio === 0) return "bg-muted";
  if (ratio < 0.2) return "bg-purple-500/20";
  if (ratio < 0.4) return "bg-purple-500/40";
  if (ratio < 0.6) return "bg-purple-500/60";
  if (ratio < 0.8) return "bg-purple-500/80";
  return "bg-purple-500";
}

/**
 * Collapse backend colLabels ["0-3","3-6","6-9","9-12","12-15","15-18","18-21","21-24"]
 * into 6 display rows: ["Overnight (0-9)","9-12","12-15","15-18","18-21","21-24"].
 * The Overnight row sums the revenue from hours 0-3 + 3-6 + 6-9 per day.
 *
 * Keep scaling based on the transformed cells (max recomputed post-collapse)
 * so the color ramp accurately reflects what's visible.
 */
function collapseOvernight(
  grid: number[][],
  colLabels: string[],
): { labels: string[]; grid: number[][]; max: number } {
  const OVERNIGHT_IDX = colLabels
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => {
      const [start] = l.split("-").map(Number);
      return start < 9;
    })
    .map(({ i }) => i);
  const keepIdx = colLabels
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => {
      const [start] = l.split("-").map(Number);
      return start >= 9;
    });
  const newLabels = ["Overnight (0-9)", ...keepIdx.map(({ l }) => l)];
  const newGrid = grid.map((dayRow) => {
    const overnightSum = OVERNIGHT_IDX.reduce((s, hi) => s + (dayRow[hi] ?? 0), 0);
    const rest = keepIdx.map(({ i }) => dayRow[i] ?? 0);
    return [overnightSum, ...rest];
  });
  let max = 0;
  for (const row of newGrid) {
    for (const v of row) if (v > max) max = v;
  }
  return { labels: newLabels, grid: newGrid, max };
}

export function DayHourHeatmap() {
  const data = useDayHourHeatmap();

  const collapsed = useMemo(() => {
    if (!data) return null;
    return collapseOvernight(data.grid, data.colLabels);
  }, [data]);

  if (data === undefined || collapsed === null) {
    return <Card className="h-64 animate-pulse p-4" />;
  }
  // Backend returns grid[dayIdx][hourBinIdx]. We render transposed:
  // rows = hour bins (after overnight collapse), columns = days (rowLabels).
  const dayLabels = data.rowLabels; // ["Mon" .. "Sun"]
  const hourLabels = collapsed.labels; // 6 rows after collapse
  const numDays = dayLabels.length;
  const max = collapsed.max;
  return (
    <Card className="p-4">
      <h4 className="mb-2 text-sm font-semibold">Day × Hour heatmap (revenue)</h4>
      <div
        className="grid gap-1 text-xs"
        style={{ gridTemplateColumns: `80px repeat(${numDays}, 1fr)` }}
      >
        {/* Top-row day labels */}
        <div />
        {dayLabels.map((d) => (
          <div key={"top-" + d} className="text-center text-muted-foreground">
            {d}
          </div>
        ))}
        {/* Body: one row per hour bin */}
        {hourLabels.map((hourLabel, hi) => (
          <Fragment key={hourLabel}>
            <div className="flex items-center justify-end pr-1 text-muted-foreground">
              {hourLabel}
            </div>
            {Array.from({ length: numDays }).map((_, di) => {
              const val = collapsed.grid[di][hi];
              const pct = max === 0 ? 0 : Math.round((val / max) * 100);
              const label =
                val === 0
                  ? `${dayLabels[di]} · ${hourLabel} · Rp 0`
                  : `${dayLabels[di]} · ${hourLabel} · ${formatCurrency(val)} · ${pct}% of peak`;
              return (
                <div
                  key={`${hi}-${di}`}
                  className="relative group aspect-square"
                >
                  <div
                    className={`w-full h-full rounded ${intensityClass(val, max)}`}
                    aria-label={label}
                  />
                  <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1 z-50 hidden group-hover:block whitespace-nowrap rounded bg-popover text-popover-foreground border border-border px-2 py-1 text-xs shadow-md">
                    {label}
                  </div>
                </div>
              );
            })}
          </Fragment>
        ))}
        {/* Bottom-row day labels */}
        <div />
        {dayLabels.map((d) => (
          <div key={"bot-" + d} className="text-center text-muted-foreground">
            {d}
          </div>
        ))}
      </div>
    </Card>
  );
}
