/**
 * PlannerGridHeader - Three-row column headers for weekly planner grid.
 *
 * Shows for each day column:
 * - Row 1: Full day name ("Monday", "Tuesday", etc.)
 * - Row 2: Date ("17 Feb")
 * - Row 3: Event name if applicable (holiday, commercial date)
 *
 * Color coding:
 * - Weekday: default bg-card
 * - Weekend: bg-blue-50 / dark:bg-blue-900/20
 * - Holiday: bg-red-50 / dark:bg-red-900/20
 * - Sales date: bg-purple-50 / dark:bg-purple-900/20
 * - Today: ring highlight
 * - Past day: muted/greyed out
 *
 * Per-day confirm buttons at bottom of header (NOT in PlannerActionBar).
 */

import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface DateInfo {
  date: string;
  dayName: string;
  dateLabel: string;
  dayType: 'weekday' | 'weekend' | 'holiday' | 'sales_date';
  eventName?: string;
  isWeekend: boolean;
  isToday: boolean;
}

interface PlannerGridHeaderProps {
  weekDates: string[];
  dateInfos: DateInfo[];
  dayStatuses: Record<string, 'draft' | 'confirmed' | 'submitted'>;
  onConfirmDay: (date: string) => void;
  hasEditsForDay: Record<string, boolean>;
  todayStr: string;
}

export const PlannerGridHeader = React.memo(function PlannerGridHeader({
  weekDates,
  dateInfos,
  dayStatuses,
  onConfirmDay,
  hasEditsForDay,
  todayStr,
}: PlannerGridHeaderProps) {
  return (
    <div className="border-b-2 border-border">
      {/* Main header row with 3-row day info */}
      <div className="flex">
        {/* Sticky left: Outlet / Product label */}
        <div className="sticky left-0 z-10 flex items-center justify-center bg-card border-r border-border px-3 py-2 min-w-[160px] w-[160px] shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]">
          <span className="text-xs font-semibold text-foreground/70">Outlet / Product</span>
        </div>

        {/* Stock column label */}
        <div className="w-[64px] min-w-[64px] flex items-center justify-center bg-card border-r border-border">
          <span className="text-xs font-semibold text-foreground/70">Stock</span>
        </div>

        {/* Day columns */}
        {dateInfos.map((info) => {
          const isPastDay = info.date < todayStr;

          // Color scheme based on day type and past status
          let bgClass = 'bg-card';
          let dayNameClass = 'text-foreground';
          let eventClass = '';

          if (isPastDay) {
            bgClass = 'bg-muted/30';
            dayNameClass = 'text-muted-foreground';
            eventClass = 'text-muted-foreground/70';
          } else if (info.dayType === 'holiday') {
            bgClass = 'bg-red-50 dark:bg-red-900/20';
            dayNameClass = 'text-red-700 dark:text-red-300';
            eventClass = 'text-red-600 dark:text-red-400';
          } else if (info.dayType === 'sales_date') {
            bgClass = 'bg-purple-50 dark:bg-purple-900/20';
            dayNameClass = 'text-purple-700 dark:text-purple-300';
            eventClass = 'text-purple-600 dark:text-purple-400';
          } else if (info.isWeekend) {
            bgClass = 'bg-blue-50 dark:bg-blue-900/20';
            dayNameClass = 'text-blue-700 dark:text-blue-300';
          }

          return (
            <div
              key={info.date}
              className={cn(
                'flex-1 min-w-[64px] flex flex-col items-center justify-center py-2 px-1 border-r border-border last:border-r-0',
                bgClass,
                info.isToday && 'ring-2 ring-primary ring-inset'
              )}
            >
              {/* Row 1: Day name */}
              <span className={cn('text-xs font-semibold', dayNameClass)}>{info.dayName}</span>
              {/* Row 2: Date */}
              <span className={cn('text-[10px]', isPastDay ? 'text-muted-foreground/70' : 'text-muted-foreground')}>{info.dateLabel}</span>
              {/* Row 3: Event name */}
              <span
                className={cn(
                  'text-[9px] font-medium truncate max-w-full h-3',
                  eventClass || 'text-transparent'
                )}
              >
                {info.eventName || '\u00A0'}
              </span>
            </div>
          );
        })}

        {/* Total column label */}
        <div className="w-[72px] min-w-[72px] flex items-center justify-center bg-card">
          <span className="text-xs font-semibold text-foreground/70">Total</span>
        </div>
      </div>

      {/* Per-day confirm buttons row */}
      <div className="flex border-t border-border bg-muted/30">
        {/* Empty sticky left spacer */}
        <div className="sticky left-0 z-10 min-w-[160px] w-[160px] border-r border-border bg-muted/30 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]" />
        {/* Empty stock column spacer */}
        <div className="w-[64px] min-w-[64px] border-r border-border" />

        {/* Confirm button per day */}
        {weekDates.map((date) => {
          const status = dayStatuses[date] || 'draft';
          const hasEdits = hasEditsForDay[date] || false;
          const isPastDay = date < todayStr;

          return (
            <div
              key={date}
              className="flex-1 min-w-[64px] flex flex-col items-center justify-center py-1.5 px-0.5 border-r border-border last:border-r-0 gap-1"
            >
              {/* Status badge */}
              {isPastDay ? (
                // Past days: show muted status only, no action buttons
                status !== 'draft' ? (
                  <Badge variant="secondary" className="text-[9px] px-1.5 py-0 bg-muted text-muted-foreground">
                    {status === 'submitted' ? 'Submitted' : status === 'confirmed' ? 'Confirmed' : 'Draft'}
                  </Badge>
                ) : null
              ) : status === 'submitted' ? (
                <Badge variant="default" className="text-[9px] px-1.5 py-0 bg-blue-600 hover:bg-blue-600">
                  Submitted
                </Badge>
              ) : status === 'confirmed' ? (
                <Badge variant="default" className="text-[9px] px-1.5 py-0 bg-green-600 hover:bg-green-600">
                  Confirmed
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-[9px] px-1.5 py-0 bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300">
                  Draft
                </Badge>
              )}

              {/* Action button (not for past days) */}
              {!isPastDay && status === 'draft' && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-5 text-[9px] px-1.5"
                  onClick={() => onConfirmDay(date)}
                >
                  Confirm
                </Button>
              )}
              {!isPastDay && status === 'confirmed' && hasEdits && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-5 text-[9px] px-1.5 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700"
                  onClick={() => onConfirmDay(date)}
                >
                  Update Kitchen
                </Button>
              )}
            </div>
          );
        })}

        {/* Empty total column spacer */}
        <div className="w-[72px] min-w-[72px]" />
      </div>
    </div>
  );
});
