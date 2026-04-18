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
