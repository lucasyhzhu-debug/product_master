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
  return (
    <Card className="p-4">
      <h4 className="mb-2 text-sm font-semibold">Day × Hour heatmap (revenue)</h4>
      <div className="grid grid-cols-[40px_repeat(8,1fr)] gap-1 text-xs">
        <div />
        {data.colLabels.map((c) => (
          <div key={"top-" + c} className="text-center text-muted-foreground">
            {c}
          </div>
        ))}
        {data.rowLabels.map((row, ri) => (
          <Fragment key={row}>
            <div className="flex items-center justify-end pr-1 text-muted-foreground">{row}</div>
            {data.grid[ri].map((val, ci) => (
              <div
                key={`${ri}-${ci}`}
                className={`aspect-square rounded ${intensityClass(val, data.max)}`}
                title={`${row} ${data.colLabels[ci]}: ${formatCurrency(val)}`}
              />
            ))}
          </Fragment>
        ))}
        <div />
        {data.colLabels.map((c) => (
          <div key={"bot-" + c} className="text-center text-muted-foreground">
            {c}
          </div>
        ))}
      </div>
    </Card>
  );
}
