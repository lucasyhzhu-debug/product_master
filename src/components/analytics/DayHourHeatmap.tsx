import { Fragment } from "react";
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

export function DayHourHeatmap() {
  const data = useDayHourHeatmap();
  if (data === undefined) {
    return <Card className="h-64 animate-pulse p-4" />;
  }
  // Backend returns grid[dayIdx][hourBinIdx]. We render transposed:
  // rows = hour bins (data.colLabels), columns = days (data.rowLabels).
  const dayLabels = data.rowLabels; // ["Mon" .. "Sun"]
  const hourLabels = data.colLabels; // ["0-3" .. "21-24"]
  const numDays = dayLabels.length;
  return (
    <Card className="p-4">
      <h4 className="mb-2 text-sm font-semibold">Day × Hour heatmap (revenue)</h4>
      <div
        className="grid gap-1 text-xs"
        style={{ gridTemplateColumns: `48px repeat(${numDays}, 1fr)` }}
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
              const val = data.grid[di][hi];
              return (
                <div
                  key={`${hi}-${di}`}
                  className={`aspect-square rounded ${intensityClass(val, data.max)}`}
                  title={`${dayLabels[di]} ${hourLabel}: ${formatCurrency(val)}`}
                  aria-label={`${dayLabels[di]} ${hourLabel}: ${formatCurrency(val)}`}
                />
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
