/**
 * PlannerActionBar - Action bar with Copy Last Week button and grand totals row.
 *
 * Contains:
 * - "Copy Last Week" button (disabled when no previous week plans)
 * - Grand totals summary row: daily column totals (production targets) + grand total
 *
 * Per-day confirm buttons are in PlannerGridHeader, NOT here.
 * No batch "Save" button (auto-save on blur replaces it).
 */

import React from 'react';
import { Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface PlannerActionBarProps {
  onCopyLastWeek: () => void;
  hasPreviousWeek: boolean;
  dailyTotals: Record<string, number>;
  grandTotal: number;
  weekDates: string[];
}

export const PlannerActionBar = React.memo(function PlannerActionBar({
  onCopyLastWeek,
  hasPreviousWeek,
  dailyTotals,
  grandTotal,
  weekDates,
}: PlannerActionBarProps) {
  return (
    <div className="border-t bg-muted/30">
      {/* Grand Totals Row (production targets) */}
      <div className="flex items-stretch border-b border-gray-200">
        {/* Label */}
        <div className="sticky left-0 z-10 flex items-center px-3 py-2 bg-gray-100 border-r border-gray-200 min-w-[160px] w-[160px] shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]">
          <span className="text-xs font-bold text-gray-800">Daily Target</span>
        </div>
        {/* Empty stock column */}
        <div className="w-[64px] min-w-[64px] border-r border-gray-200 bg-gray-100" />
        {/* Daily totals */}
        {weekDates.map((date) => (
          <div
            key={date}
            className="flex-1 min-w-[64px] flex items-center justify-center border-r border-gray-200 last:border-r-0 bg-gray-100 py-2"
          >
            <span className="text-sm font-bold tabular-nums text-gray-900">
              {dailyTotals[date] || 0}
            </span>
          </div>
        ))}
        {/* Grand total */}
        <div className="w-[72px] min-w-[72px] flex items-center justify-center bg-gray-200 py-2">
          <span className="text-sm font-black tabular-nums text-gray-900">{grandTotal}</span>
        </div>
      </div>

      {/* Action buttons row */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div>
                  <Button
                    variant="outline"
                    onClick={onCopyLastWeek}
                    disabled={!hasPreviousWeek}
                    className="gap-2"
                  >
                    <Copy className="h-4 w-4" />
                    Copy Last Week
                  </Button>
                </div>
              </TooltipTrigger>
              {!hasPreviousWeek && (
                <TooltipContent>No plans from previous week</TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        </div>

        <div className="text-sm text-muted-foreground">
          Week total: <span className="font-bold text-foreground">{grandTotal}</span> units
        </div>
      </div>
    </div>
  );
});
