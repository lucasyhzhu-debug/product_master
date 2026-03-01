/**
 * Canonical platform color palette for analytics views.
 * Single source of truth — all chart, card, and badge colors derive from here.
 *
 * Keyed by raw source string (gobiz, k3mart, etc.) as stored in externalRevenue.source.
 * SalesChart uses hex (for recharts), OverviewTab uses Tailwind classes (for cards/hierarchy).
 */

export type PlatformPalette = {
  hex: string;
  borderTop: string;
  borderLeft: string;
  dot: string;
  hoverBg: string;
  badgeBorder: string;
  badgeText: string;
};

const PALETTE: Record<string, PlatformPalette> = {
  gobiz:       { hex: "#14b8a6", borderTop: "border-t-teal-500",   borderLeft: "border-l-teal-500",   dot: "bg-teal-500",   hoverBg: "hover:bg-teal-50 dark:hover:bg-teal-950/20",   badgeBorder: "border-teal-500 dark:border-teal-600",   badgeText: "text-teal-700 dark:text-teal-400" },
  k3mart:      { hex: "#3b82f6", borderTop: "border-t-blue-500",   borderLeft: "border-l-blue-500",   dot: "bg-blue-500",   hoverBg: "hover:bg-blue-50 dark:hover:bg-blue-950/20",   badgeBorder: "border-blue-500 dark:border-blue-600",   badgeText: "text-blue-700 dark:text-blue-400" },
  internal:    { hex: "#f59e0b", borderTop: "border-t-amber-500",  borderLeft: "border-l-amber-500",  dot: "bg-amber-500",  hoverBg: "hover:bg-amber-50 dark:hover:bg-amber-950/20", badgeBorder: "border-amber-500 dark:border-amber-600", badgeText: "text-amber-700 dark:text-amber-400" },
  grabfood:    { hex: "#22c55e", borderTop: "border-t-green-500",  borderLeft: "border-l-green-500",  dot: "bg-green-500",  hoverBg: "hover:bg-green-50 dark:hover:bg-green-950/20", badgeBorder: "border-green-500 dark:border-green-600", badgeText: "text-green-700 dark:text-green-400" },
  shopee:      { hex: "#f97316", borderTop: "border-t-orange-500", borderLeft: "border-l-orange-500", dot: "bg-orange-500", hoverBg: "hover:bg-orange-50 dark:hover:bg-orange-950/20", badgeBorder: "border-orange-500 dark:border-orange-600", badgeText: "text-orange-700 dark:text-orange-400" },
  tiktok:      { hex: "#8b5cf6", borderTop: "border-t-violet-500", borderLeft: "border-l-violet-500", dot: "bg-violet-500", hoverBg: "hover:bg-violet-50 dark:hover:bg-violet-950/20", badgeBorder: "border-violet-500 dark:border-violet-600", badgeText: "text-violet-700 dark:text-violet-400" },
  consignment: { hex: "#a855f7", borderTop: "border-t-purple-500", borderLeft: "border-l-purple-500", dot: "bg-purple-500", hoverBg: "hover:bg-purple-50 dark:hover:bg-purple-950/20", badgeBorder: "border-purple-500 dark:border-purple-600", badgeText: "text-purple-700 dark:text-purple-400" },
  bigseller:   { hex: "#6b7280", borderTop: "border-t-gray-500",   borderLeft: "border-l-gray-500",   dot: "bg-gray-500",   hoverBg: "hover:bg-gray-50 dark:hover:bg-gray-950/20",   badgeBorder: "border-gray-500 dark:border-gray-600",   badgeText: "text-gray-700 dark:text-gray-400" },
};

const FALLBACK: PlatformPalette = {
  hex: "#888888",
  borderTop: "border-t-gray-500",
  borderLeft: "border-l-gray-500",
  dot: "bg-gray-500",
  hoverBg: "hover:bg-gray-50 dark:hover:bg-gray-950/20",
  badgeBorder: "border-gray-500 dark:border-gray-600",
  badgeText: "text-gray-700 dark:text-gray-400",
};

/** Get palette for a platform source key. Falls back to gray for unknown sources. */
export function getPlatformPalette(source: string): PlatformPalette {
  return PALETTE[source] ?? FALLBACK;
}

/**
 * Build a display-name-keyed hex color map for recharts.
 * SalesChart uses display names as dataKeys, so it needs colors keyed by display name.
 */
export function buildChartColorMap(sourceToPlatform: (source: string) => string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const [source, palette] of Object.entries(PALETTE)) {
    map[sourceToPlatform(source)] = palette.hex;
  }
  return map;
}
