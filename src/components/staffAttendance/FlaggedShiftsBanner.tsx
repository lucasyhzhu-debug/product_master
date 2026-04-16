/**
 * FlaggedShiftsBanner (Phase 74 — D-15).
 *
 * Top-of-page alert card on /staff-performance that surfaces the count of
 * flagged shifts (missing clock-out / over-16h / overlapping / before-hire)
 * and provides a "Jump to first" shortcut to scroll the first flagged row
 * into view. Renders null when flaggedCount === 0 — parents can drop this
 * in unconditionally.
 */

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface FlaggedShiftsBannerProps {
  flaggedCount: number;
  onJumpToFirst: () => void;
}

export function FlaggedShiftsBanner({ flaggedCount, onJumpToFirst }: FlaggedShiftsBannerProps) {
  if (flaggedCount === 0) return null;
  return (
    <div className="mb-4 flex items-center justify-between rounded-lg border border-yellow-500 bg-yellow-50 p-3 dark:bg-yellow-950/20">
      <div className="flex items-center gap-2 text-sm font-medium">
        <AlertTriangle className="h-4 w-4 text-yellow-600" />
        <span>
          {flaggedCount} shift{flaggedCount === 1 ? "" : "s"} need correction
        </span>
      </div>
      <Button size="sm" variant="outline" onClick={onJumpToFirst}>
        Jump to first
      </Button>
    </div>
  );
}
