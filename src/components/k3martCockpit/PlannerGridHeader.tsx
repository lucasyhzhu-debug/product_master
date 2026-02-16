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
 * - Weekend: bg-blue-50 with blue text
 * - Holiday: bg-red-50 with red text
 * - Sales date: bg-purple-50 with purple text
 * - Today: ring highlight
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
}

export const PlannerGridHeader = React.memo(function PlannerGridHeader({
  weekDates,
  dateInfos,
  dayStatuses,
  onConfirmDay,
  hasEditsForDay,
}: PlannerGridHeaderProps) {
  return (
    <div className="border-b-2 border-gray-300">
      {/* Main header row with 3-row day info */}
      <div className="flex">
        {/* Sticky left: Outlet / Product label */}
        <div className="sticky left-0 z-10 flex items-center justify-center bg-white border-r border-gray-200 px-3 py-2 min-w-[160px] w-[160px] shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]">
          <span className="text-xs font-semibold text-gray-700">Outlet / Product</span>
        </div>

        {/* Stock column label */}
        <div className="w-[64px] min-w-[64px] flex items-center justify-center bg-white border-r border-gray-200">
          <span className="text-xs font-semibold text-gray-700">Stock</span>
        </div>

        {/* Day columns */}
        {dateInfos.map((info) => {
          // Color scheme based on day type
          let bgClass = 'bg-card';
          let dayNameClass = 'text-gray-900';
          let eventClass = '';

          if (info.dayType === 'holiday') {
            bgClass = 'bg-red-50';
            dayNameClass = 'text-red-700';
            eventClass = 'text-red-600';
          } else if (info.dayType === 'sales_date') {
            bgClass = 'bg-purple-50';
            dayNameClass = 'text-purple-700';
            eventClass = 'text-purple-600';
          } else if (info.isWeekend) {
            bgClass = 'bg-blue-50';
            dayNameClass = 'text-blue-700';
          }

          return (
            <div
              key={info.date}
              className={cn(
                'flex-1 min-w-[64px] flex flex-col items-center justify-center py-2 px-1 border-r border-gray-200 last:border-r-0',
                bgClass,
                info.isToday && 'ring-2 ring-primary ring-inset'
              )}
            >
              {/* Row 1: Day name */}
              <span className={cn('text-xs font-semibold', dayNameClass)}>{info.dayName}</span>
              {/* Row 2: Date */}
              <span className="text-[10px] text-gray-500">{info.dateLabel}</span>
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
        <div className="w-[72px] min-w-[72px] flex items-center justify-center bg-white">
          <span className="text-xs font-semibold text-gray-700">Total</span>
        </div>
      </div>

      {/* Per-day confirm buttons row */}
      <div className="flex border-t border-gray-200 bg-gray-50/50">
        {/* Empty sticky left spacer */}
        <div className="sticky left-0 z-10 min-w-[160px] w-[160px] border-r border-gray-200 bg-gray-50/50 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]" />
        {/* Empty stock column spacer */}
        <div className="w-[64px] min-w-[64px] border-r border-gray-200" />

        {/* Confirm button per day */}
        {weekDates.map((date) => {
          const status = dayStatuses[date] || 'draft';
          const hasEdits = hasEditsForDay[date] || false;

          return (
            <div
              key={date}
              className="flex-1 min-w-[64px] flex flex-col items-center justify-center py-1.5 px-0.5 border-r border-gray-200 last:border-r-0 gap-1"
            >
              {/* Status badge */}
              {status === 'submitted' ? (
                <Badge variant="default" className="text-[9px] px-1.5 py-0 bg-blue-600 hover:bg-blue-600">
                  Submitted
                </Badge>
              ) : status === 'confirmed' ? (
                <Badge variant="default" className="text-[9px] px-1.5 py-0 bg-green-600 hover:bg-green-600">
                  Confirmed
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-[9px] px-1.5 py-0 bg-amber-100 text-amber-800">
                  Draft
                </Badge>
              )}

              {/* Action button */}
              {status === 'draft' && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-5 text-[9px] px-1.5"
                  onClick={() => onConfirmDay(date)}
                >
                  Confirm
                </Button>
              )}
              {status === 'confirmed' && hasEdits && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-5 text-[9px] px-1.5 text-amber-700 border-amber-300"
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
