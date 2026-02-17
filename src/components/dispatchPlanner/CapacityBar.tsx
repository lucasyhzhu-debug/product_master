/**
 * CapacityBar - Segmented capacity visualization per day column.
 *
 * Shows a colored bar with segments proportional to each channel's quantity.
 * Bar width scales relative to capacity. Over-capacity is indicated by
 * a red dot and the bar extending beyond the container.
 * Tooltip on hover shows per-channel breakdown.
 */

import React, { useState } from "react";
import { cn } from "@/lib/utils";

/** Channel display colors (frontend-only, cannot import from convex/) */
const CHANNEL_COLORS: Record<string, string> = {
  direct: "#3B82F6",
  gofood: "#22C55E",
  k3mart: "#F97316",
  consignment: "#6B7280",
};

interface CapacityBarSegment {
  channelKey: string;
  quantity: number;
  color: string;
}

interface CapacityBarProps {
  /** Segments for each channel */
  segments: CapacityBarSegment[];
  /** Daily production capacity */
  capacity: number;
}

export { CHANNEL_COLORS };

export const CapacityBar = React.memo(function CapacityBar({
  segments,
  capacity,
}: CapacityBarProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  const total = segments.reduce((sum, s) => sum + s.quantity, 0);
  const isOverCapacity = total > capacity;
  const barWidthPercent = capacity > 0 ? Math.min((total / capacity) * 100, 100) : 0;

  // Filter non-zero segments
  const activeSegments = segments.filter((s) => s.quantity > 0);

  return (
    <div
      className="relative w-full px-1"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      {/* Bar container */}
      <div className="h-3 w-full rounded-sm bg-muted/40 overflow-hidden relative">
        {/* Segments */}
        <div
          className="h-full flex transition-all duration-300"
          style={{ width: `${barWidthPercent}%` }}
        >
          {activeSegments.map((seg) => {
            const segPercent =
              total > 0 ? (seg.quantity / total) * 100 : 0;
            return (
              <div
                key={seg.channelKey}
                className="h-full transition-all duration-300"
                style={{
                  width: `${segPercent}%`,
                  backgroundColor: seg.color || CHANNEL_COLORS[seg.channelKey] || "#888",
                }}
              />
            );
          })}
        </div>

        {/* Over-capacity indicator */}
        {isOverCapacity && (
          <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2">
            <div className="h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-background" />
          </div>
        )}
      </div>

      {/* Total label */}
      <div
        className={cn(
          "text-[10px] tabular-nums text-center mt-0.5",
          isOverCapacity
            ? "text-red-600 font-semibold"
            : "text-muted-foreground"
        )}
      >
        {total}/{capacity}
      </div>

      {/* Tooltip */}
      {showTooltip && activeSegments.length > 0 && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 bg-popover text-popover-foreground border rounded-md shadow-md px-3 py-2 text-xs whitespace-nowrap">
          <div className="font-semibold mb-1">
            {total} / {capacity} units
            {isOverCapacity && (
              <span className="text-red-500 ml-1">
                (+{total - capacity} over)
              </span>
            )}
          </div>
          {activeSegments.map((seg) => (
            <div key={seg.channelKey} className="flex items-center gap-2 py-0.5">
              <div
                className="h-2 w-2 rounded-full flex-shrink-0"
                style={{
                  backgroundColor:
                    seg.color || CHANNEL_COLORS[seg.channelKey] || "#888",
                }}
              />
              <span className="capitalize">{seg.channelKey}</span>
              <span className="text-muted-foreground ml-auto pl-2">
                {seg.quantity}
              </span>
            </div>
          ))}
          {/* Tooltip arrow */}
          <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-popover" />
        </div>
      )}
    </div>
  );
});
