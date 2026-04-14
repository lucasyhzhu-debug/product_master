/**
 * Centralised color palette for production-type stacked bar charts.
 *
 * M1: consolidates the duplicate TYPE_COLORS maps that previously lived in
 * UnitsByTypeStackedBars.tsx and TypeMixOverTime.tsx so both charts stay
 * visually aligned without silent drift.
 */

export const TYPE_COLORS: Record<string, string> = {
  BIG_BALL: "#f97316",
  MID_BALL: "#8b5cf6",
  HAZELNUT_REGULAR: "#06b6d4",
};

const TYPE_COLOR_FALLBACK = ["#10b981", "#eab308", "#ec4899", "#f43f5e", "#64748b"];

export function colorFor(code: string, i: number): string {
  return TYPE_COLORS[code] ?? TYPE_COLOR_FALLBACK[i % TYPE_COLOR_FALLBACK.length];
}
