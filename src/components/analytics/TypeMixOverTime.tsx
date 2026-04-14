import { useState } from "react";
import { Card } from "@/components/ui/card";
import { useVolumeByType } from "@/hooks/convex/useAnalytics";
import { Button } from "@/components/ui/button";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

const TYPE_COLORS: Record<string, string> = {
  BIG_BALL: "#f97316",
  MID_BALL: "#8b5cf6",
  HAZELNUT_REGULAR: "#06b6d4",
};

const TYPE_COLOR_FALLBACK = ["#10b981", "#eab308", "#ec4899", "#f43f5e", "#64748b"];

function colorFor(code: string, i: number): string {
  return TYPE_COLORS[code] ?? TYPE_COLOR_FALLBACK[i % TYPE_COLOR_FALLBACK.length];
}

export function TypeMixOverTime() {
  const [mode, setMode] = useState<"absolute" | "percent">("percent");
  const data = useVolumeByType("week");
  if (data === undefined) return <Card className="h-64 animate-pulse p-4" />;
  const rows = data.buckets.map((b, i) => {
    const total = data.series.reduce((acc, s) => acc + s.values[i], 0);
    const row: Record<string, string | number> = { bucket: b };
    for (const s of data.series) {
      const v = s.values[i];
      row[s.code] = mode === "percent" && total > 0 ? (v / total) * 100 : v;
    }
    return row;
  });
  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-sm font-semibold">Product-type mix over time</h4>
        <div className="flex gap-1">
          <Button
            size="sm"
            variant={mode === "percent" ? "default" : "outline"}
            onClick={() => setMode("percent")}
          >
            %
          </Button>
          <Button
            size="sm"
            variant={mode === "absolute" ? "default" : "outline"}
            onClick={() => setMode("absolute")}
          >
            Abs
          </Button>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={rows}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="bucket" />
          <YAxis />
          <Tooltip />
          <Legend />
          {data.series.map((s, i) => (
            <Bar key={s.code} dataKey={s.code} name={s.name} stackId="a" fill={colorFor(s.code, i)} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}
