/**
 * WeekNavigator - Week navigation component for K3 Mart weekly planner.
 *
 * Shows big prev/next arrow buttons, prominent date range display,
 * week number label, and "Today" button when navigated away from current week.
 * Current week has a different background color from other weeks.
 */

import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface WeekNavigatorProps {
  /** ISO week string like "2026-W08" */
  weekNumber: string;
  /** Array of 7 YYYY-MM-DD strings for this week */
  weekDates: string[];
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  isCurrentWeek: boolean;
}

/** Format a date range like "17 Feb - 23 Feb 2026" */
function formatDateRange(weekDates: string[]): string {
  if (weekDates.length < 7) return '';
  const monday = new Date(weekDates[0] + 'T00:00:00+07:00');
  const sunday = new Date(weekDates[6] + 'T00:00:00+07:00');

  const monDay = monday.getDate();
  const monMonth = monday.toLocaleDateString('en-US', { month: 'short', timeZone: 'Asia/Jakarta' });
  const sunDay = sunday.getDate();
  const sunMonth = sunday.toLocaleDateString('en-US', { month: 'short', timeZone: 'Asia/Jakarta' });
  const year = sunday.toLocaleDateString('en-US', { year: 'numeric', timeZone: 'Asia/Jakarta' });

  if (monMonth === sunMonth) {
    return `${monDay} - ${sunDay} ${sunMonth} ${year}`;
  }
  return `${monDay} ${monMonth} - ${sunDay} ${sunMonth} ${year}`;
}

/** Parse week number like "2026-W08" into display format */
function formatWeekLabel(weekNumber: string): string {
  const match = weekNumber.match(/^(\d{4})-W(\d{2})$/);
  if (!match) return weekNumber;
  return `Week ${parseInt(match[2])}, ${match[1]}`;
}

export const WeekNavigator = React.memo(function WeekNavigator({
  weekNumber,
  weekDates,
  onPrev,
  onNext,
  onToday,
  isCurrentWeek,
}: WeekNavigatorProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-between px-4 py-3 border-b',
        isCurrentWeek ? 'bg-primary/10' : 'bg-muted'
      )}
    >
      {/* Left: Prev button */}
      <Button variant="outline" size="lg" onClick={onPrev} className="px-3">
        <ChevronLeft className="h-5 w-5" />
      </Button>

      {/* Center: Date range + week number */}
      <div className="flex flex-col items-center gap-0.5">
        <span className="text-lg font-bold text-foreground">{formatDateRange(weekDates)}</span>
        <span className="text-sm text-muted-foreground">{formatWeekLabel(weekNumber)}</span>
        {!isCurrentWeek && (
          <Button variant="ghost" size="sm" onClick={onToday} className="mt-1 text-xs h-7">
            Back to This Week
          </Button>
        )}
      </div>

      {/* Right: Next button */}
      <Button variant="outline" size="lg" onClick={onNext} className="px-3">
        <ChevronRight className="h-5 w-5" />
      </Button>
    </div>
  );
});
