/**
 * PlannerGridHeader - Day column headers for weekly planner grid.
 *
 * Shows 7 day columns with weekend/holiday markers, today highlighting,
 * and sticky "Outlet" label column on the left.
 */

import React from 'react';
import { cn } from '@/lib/utils';

interface DayHeaderData {
  date: string; // YYYY-MM-DD
  dayLabel: string; // "Mon", "Tue", etc.
  dateLabel: string; // "Feb 11"
  isWeekend: boolean;
  isHoliday: boolean;
  holidayName?: string;
  isToday: boolean;
  isTomorrow: boolean;
}

interface PlannerGridHeaderProps {
  dates: DayHeaderData[];
}

export const PlannerGridHeader = React.memo(function PlannerGridHeader({
  dates,
}: PlannerGridHeaderProps) {
  return (
    <div className="flex border-b-2 border-gray-200">
      {/* Sticky Outlet Label Column */}
      <div className="sticky left-0 z-10 flex items-center justify-center bg-white border-r border-gray-200 px-3 py-2 min-w-[120px]">
        <span className="text-xs font-semibold text-gray-700">Outlet</span>
      </div>

      {/* Day Columns */}
      {dates.map((day) => {
        const bgClass = cn(
          'bg-white',
          day.isWeekend && !day.isHoliday && 'bg-amber-50',
          day.isHoliday && 'bg-orange-50',
          day.isTomorrow && !day.isToday && !day.isHoliday && 'bg-blue-50'
        );

        const containerClass = cn(
          'flex-1 px-3 py-2 flex flex-col items-center justify-center border-r border-gray-200 last:border-r-0 transition-all',
          bgClass,
          day.isToday && 'ring-2 ring-blue-300'
        );

        const dayLabelClass = cn(
          'text-xs font-semibold',
          day.isToday ? 'text-blue-700' : 'text-gray-900'
        );

        const dateLabelClass = 'text-[10px] text-gray-500';

        return (
          <div
            key={day.date}
            className={containerClass}
            title={day.isHoliday && day.holidayName ? day.holidayName : undefined}
          >
            <div className={dayLabelClass}>{day.dayLabel}</div>
            <div className={dateLabelClass}>{day.dateLabel}</div>
            {day.isHoliday && (
              <div className="text-[8px] text-orange-600 mt-0.5">●</div>
            )}
          </div>
        );
      })}
    </div>
  );
});
