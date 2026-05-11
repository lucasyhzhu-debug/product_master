/**
 * Phase 74.5.1 Plan 09 — SourceBadge
 *
 * Colored source badge driven entirely by `getPlatformPalette(source)` from
 * `src/lib/platformColors.ts`. NO new hex values — palette is the single
 * source of truth (CLAUDE.md "Analytics channels: single color source").
 *
 * Reference: UI-SPEC §Shared Component Inventory.
 */

import { cn } from "@/lib/utils";
import { getPlatformPalette } from "@/lib/platformColors";
import type { ExternalSource } from "../../../convex/lib/externalSource";
import { resolvePlatform, platformDisplay } from "../../../convex/reports/platform";

interface SourceBadgeProps {
  source: ExternalSource;
  /** `sm` = 12px, `md` = 14px. Default md. */
  size?: "sm" | "md";
  /** Override the display label. Defaults to `platformDisplay(resolvePlatform({ source }).platform)`. */
  label?: string;
  className?: string;
}

export function SourceBadge({
  source,
  size = "md",
  label,
  className,
}: SourceBadgeProps) {
  const palette = getPlatformPalette(source);
  const displayLabel = label ?? platformDisplay(resolvePlatform({ source }).platform);

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border font-semibold",
        palette.badgeBorder,
        palette.badgeText,
        size === "sm" ? "px-1.5 py-0.5 text-xs" : "px-2 py-0.5 text-sm",
        className,
      )}
      aria-label={`Source: ${displayLabel}`}
    >
      {displayLabel}
    </span>
  );
}
