// src/lib/chartPrimitives.tsx — shared chart primitives for /analytics widgets.
//
// Readability rules enforced centrally (never bypass in individual widgets):
//   R1 — axis labels never silently truncate; every clipped label has a hover-reveal
//   R2 — tooltips use --popover/--popover-foreground for WCAG-AA contrast
//   R3 — category colors appear as swatches, never as value text color

export function truncateWithTooltip(
  label: string,
  max = 22,
): { display: string; full: string } {
  if (label.length <= max) return { display: label, full: label };
  return { display: label.slice(0, max - 1) + "…", full: label };
}

export function formatCurrencyCompact(value: number): string {
  if (value === 0) return "Rp 0";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000_000) {
    return `Rp ${sign}${(abs / 1_000_000_000).toFixed(1).replace(".", ",")}M`;
  }
  if (abs >= 1_000_000) {
    return `Rp ${sign}${(abs / 1_000_000).toFixed(1).replace(".", ",")}jt`;
  }
  if (abs >= 1_000) {
    return `Rp ${sign}${Math.round(abs / 1000)}rb`;
  }
  return `Rp ${sign}${Math.round(abs)}`;
}

import { formatCurrency } from "@/lib/utils";

type TooltipEntry = {
  name?: string;
  value?: number | string;
  color?: string;
};

export type ChartTooltipProps = {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
  valueFormatter?: (value: number | string, name?: string) => string;
};

/**
 * R2: Every tooltip on /analytics renders through this component.
 * Background uses --popover token (near-black in dark mode); text uses
 * --popover-foreground (near-white). Category colors appear ONLY as swatches.
 */
export function ChartTooltip({
  active,
  payload,
  label,
  valueFormatter,
}: ChartTooltipProps) {
  if (!active || !payload?.length) return null;

  return (
    <div
      data-chart-tooltip
      className="rounded-md border border-border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md"
    >
      {label !== undefined && (
        <div className="mb-1 font-medium">{String(label)}</div>
      )}
      <div className="space-y-1">
        {payload.map((entry, i) => {
          const rawValue = entry.value ?? "";
          const formatted = valueFormatter
            ? valueFormatter(rawValue, entry.name)
            : typeof rawValue === "number"
              ? formatCurrency(rawValue)
              : String(rawValue);
          return (
            <div key={i} className="flex items-center gap-2">
              {entry.color && (
                <span
                  data-tooltip-swatch
                  className="inline-block h-2.5 w-2.5 rounded-sm"
                  style={{ backgroundColor: entry.color }}
                />
              )}
              <span className="text-muted-foreground">{entry.name ?? ""}:</span>
              <span data-tooltip-value className="font-medium tabular-nums">
                {formatted}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
