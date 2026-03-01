import { useState, useMemo } from "react";
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronDown, ChevronRight, BarChart3 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { getPlatformPalette } from "@/lib/platformColors";
import {
  useRevenueTimeSeries,
  type PeriodPreset,
} from "@/hooks/convex";

type Granularity = "hourly" | "daily" | "weekly" | "monthly";
type Metric = "gross" | "net" | "volume";
type ChartMode = "stacked" | "grouped";

/** Auto-select granularity based on preset range */
function defaultGranularity(preset: PeriodPreset): Granularity {
  switch (preset) {
    case "past24hours":
    case "today":
    case "yesterday":
      return "hourly";
    case "thisWeek":
    case "last7days":
      return "daily";
    case "last30days":
    case "thisMonth":
      return "weekly";
    case "allTime":
      return "weekly";
  }
}

function formatYAxis(value: number, metric: Metric): string {
  if (metric === "volume") {
    return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value);
  }
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(0)}k`;
  return String(value);
}

function TooltipContent({
  active,
  payload,
  label,
  metric,
  hiddenPlatforms,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
  metric: Metric;
  hiddenPlatforms?: Set<string>;
}) {
  if (!active || !payload) return null;

  const visible = hiddenPlatforms
    ? payload.filter((p) => !hiddenPlatforms.has(p.name))
    : payload;
  const total = visible.reduce((sum, p) => sum + p.value, 0);

  return (
    <div className="rounded-lg border bg-background p-3 shadow-md">
      <p className="text-sm font-medium mb-2">{label}</p>
      {visible.map((entry) => (
        <div key={entry.name} className="flex items-center justify-between gap-4 text-sm">
          <div className="flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-muted-foreground">{entry.name}</span>
          </div>
          <span className="font-medium tabular-nums">
            {metric === "volume" ? entry.value.toLocaleString() : formatCurrency(entry.value)}
          </span>
        </div>
      ))}
      <div className="border-t mt-2 pt-2 flex items-center justify-between text-sm font-semibold">
        <span>Total</span>
        <span className="tabular-nums">
          {metric === "volume" ? total.toLocaleString() : formatCurrency(total)}
        </span>
      </div>
    </div>
  );
}

interface SalesChartProps {
  preset: PeriodPreset;
  defaultExpanded?: boolean;
}

export function SalesChart({ preset, defaultExpanded = false }: SalesChartProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [metric, setMetric] = useState<Metric>("gross");
  const [granularity, setGranularity] = useState<Granularity>(defaultGranularity(preset));
  const [chartMode, setChartMode] = useState<ChartMode>("stacked");
  const [hiddenPlatforms, setHiddenPlatforms] = useState<Set<string>>(new Set());

  const { data, isLoading } = useRevenueTimeSeries(
    preset,
    granularity,
    metric
  );

  // Transform data for recharts
  const chartData = useMemo(() => {
    if (!data) return [];
    return data.labels.map((label, i) => {
      const point: Record<string, string | number> = { name: label };
      for (const series of data.series) {
        point[series.platform] = series.data[i] ?? 0;
      }
      return point;
    });
  }, [data]);

  const platforms = useMemo(() => {
    if (!data) return [];
    return data.series.map((s) => s.platform);
  }, [data]);

  // Map display names to hex colors via the unified palette
  const platformColorMap = useMemo(() => {
    if (!data) return {} as Record<string, string>;
    const map: Record<string, string> = {};
    for (const s of data.series) {
      map[s.platform] = getPlatformPalette(s.platformKey).hex;
    }
    return map;
  }, [data]);

  const useAreaChart = granularity === "monthly";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleLegendClick = (entry: any) => {
    const platform = String(entry.dataKey || entry.value || "");
    if (!platform) return;
    setHiddenPlatforms((prev) => {
      const next = new Set(prev);
      if (next.has(platform)) next.delete(platform);
      else next.add(platform);
      return next;
    });
  };

  const legendFormatter = (value: string) => (
    <span style={{ opacity: hiddenPlatforms.has(value) ? 0.3 : 1, cursor: "pointer" }}>
      {value}
    </span>
  );

  const metricOptions: { value: Metric; label: string }[] = [
    { value: "gross", label: "Gross" },
    { value: "net", label: "Net" },
    { value: "volume", label: "Volume" },
  ];

  const granularityOptions: { value: Granularity; label: string }[] = [
    { value: "hourly", label: "Hourly" },
    { value: "daily", label: "Daily" },
    { value: "weekly", label: "Weekly" },
    { value: "monthly", label: "Monthly" },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div
            className="flex items-center gap-2 cursor-pointer"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium">Revenue Chart</CardTitle>
          </div>
          {isExpanded && (
            <div className="flex items-center gap-3">
              {/* Metric toggle */}
              <div className="flex items-center gap-1">
                {metricOptions.map((m) => (
                  <Badge
                    key={m.value}
                    variant={metric === m.value ? "default" : "outline"}
                    className="cursor-pointer text-xs"
                    onClick={() => setMetric(m.value)}
                  >
                    {m.label}
                  </Badge>
                ))}
              </div>
              {/* Chart mode toggle (only for bar charts) */}
              {!useAreaChart && (
                <div className="flex items-center gap-1">
                  {(["stacked", "grouped"] as const).map((mode) => (
                    <Badge
                      key={mode}
                      variant={chartMode === mode ? "secondary" : "outline"}
                      className="cursor-pointer text-xs capitalize"
                      onClick={() => setChartMode(mode)}
                    >
                      {mode}
                    </Badge>
                  ))}
                </div>
              )}
              {/* Granularity toggle */}
              <div className="flex items-center gap-1">
                {granularityOptions.map((g) => (
                  <Badge
                    key={g.value}
                    variant={granularity === g.value ? "secondary" : "outline"}
                    className="cursor-pointer text-xs"
                    onClick={() => setGranularity(g.value)}
                  >
                    {g.label}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      </CardHeader>
      {isExpanded && (
        <CardContent className="pt-0">
          {isLoading || !data ? (
            <Skeleton className="h-64 lg:h-80 w-full" />
          ) : chartData.length === 0 ? (
            <div className="h-64 lg:h-80 flex items-center justify-center text-sm text-muted-foreground">
              No chart data for this period.
            </div>
          ) : useAreaChart ? (
            <ResponsiveContainer width="100%" height={320} className="h-64 lg:h-80">
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} className="text-muted-foreground" />
                <YAxis
                  tick={{ fontSize: 12 }}
                  tickFormatter={(v) => formatYAxis(v, metric)}
                  className="text-muted-foreground"
                />
                <Tooltip
                  content={(props: any) => (
                    <TooltipContent {...props} metric={metric} hiddenPlatforms={hiddenPlatforms} />
                  )}
                />
                <Legend onClick={handleLegendClick} formatter={legendFormatter} />
                {platforms.map((platform) => (
                  <Area
                    key={platform}
                    type="monotone"
                    dataKey={platform}
                    stackId="1"
                    hide={hiddenPlatforms.has(platform)}
                    fill={platformColorMap[platform] ?? "#888"}
                    stroke={platformColorMap[platform] ?? "#888"}
                    fillOpacity={0.6}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height={320} className="h-64 lg:h-80">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} className="text-muted-foreground" />
                <YAxis
                  tick={{ fontSize: 12 }}
                  tickFormatter={(v) => formatYAxis(v, metric)}
                  className="text-muted-foreground"
                />
                <Tooltip
                  content={(props: any) => (
                    <TooltipContent {...props} metric={metric} hiddenPlatforms={hiddenPlatforms} />
                  )}
                />
                <Legend onClick={handleLegendClick} formatter={legendFormatter} />
                {platforms.map((platform) => (
                  <Bar
                    key={platform}
                    dataKey={platform}
                    hide={hiddenPlatforms.has(platform)}
                    {...(chartMode === "stacked" ? { stackId: "stack" } : {})}
                    fill={platformColorMap[platform] ?? "#888"}
                    radius={chartMode === "grouped" ? [2, 2, 0, 0] : [0, 0, 0, 0]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      )}
    </Card>
  );
}
