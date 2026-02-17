/**
 * WeekNav - Week navigation for the Unified Dispatch Planner.
 *
 * Shows prev/next arrow buttons, date range display, and "Today" button
 * when navigated away from the current week. Follows the K3Mart WeekNavigator pattern.
 */

import React from "react";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";

interface WeekNavProps {
  /** ISO YYYY-MM-DD string for the first day (Monday) of the displayed week */
  startDate: string;
  /** Called with new start date when user navigates */
  onNavigate: (newStart: string) => void;
  /** Whether the displayed week contains today */
  isCurrentWeek: boolean;
}

/** Calculate 7-day date range and format like "Feb 17 - Feb 23, 2026" */
function formatDateRange(startDate: string): string {
  const monday = new Date(startDate + "T00:00:00+07:00");
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);

  const monDay = monday.getDate();
  const monMonth = monday.toLocaleDateString("en-US", {
    month: "short",
    timeZone: "Asia/Jakarta",
  });
  const sunDay = sunday.getDate();
  const sunMonth = sunday.toLocaleDateString("en-US", {
    month: "short",
    timeZone: "Asia/Jakarta",
  });
  const year = sunday.toLocaleDateString("en-US", {
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });

  if (monMonth === sunMonth) {
    return `${monMonth} ${monDay} - ${sunDay}, ${year}`;
  }
  return `${monMonth} ${monDay} - ${sunMonth} ${sunDay}, ${year}`;
}

/** Shift a YYYY-MM-DD date by N days and return new YYYY-MM-DD */
function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00+07:00");
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
}

/** Get the Monday of the current week in Jakarta timezone */
function getCurrentMonday(): string {
  const now = new Date();
  const todayStr = now.toLocaleDateString("en-CA", {
    timeZone: "Asia/Jakarta",
  });

  // Get Jakarta day-of-week using Intl (safe regardless of browser timezone)
  const dayName = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone: "Asia/Jakarta",
  }).format(now);

  const dayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  const dayOfWeek = dayMap[dayName] ?? 0;
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  const today = new Date(todayStr + "T12:00:00+07:00");
  today.setDate(today.getDate() + mondayOffset);
  return today.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
}

export const WeekNav = React.memo(function WeekNav({
  startDate,
  onNavigate,
  isCurrentWeek,
}: WeekNavProps) {
  const handlePrev = () => onNavigate(shiftDate(startDate, -7));
  const handleNext = () => onNavigate(shiftDate(startDate, 7));
  const handleToday = () => onNavigate(getCurrentMonday());

  return (
    <div className="flex items-center justify-between px-4 py-3 border-b bg-card">
      {/* Left: Prev button */}
      <Button variant="outline" size="icon" onClick={handlePrev}>
        <ChevronLeft className="h-5 w-5" />
      </Button>

      {/* Center: Date range + Today button */}
      <div className="flex flex-col items-center gap-1">
        <span className="text-lg font-bold text-foreground">
          {formatDateRange(startDate)}
        </span>
        {!isCurrentWeek && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleToday}
            className="text-xs h-7 gap-1"
          >
            <CalendarDays className="h-3 w-3" />
            Back to Today
          </Button>
        )}
      </div>

      {/* Right: Next button */}
      <Button variant="outline" size="icon" onClick={handleNext}>
        <ChevronRight className="h-5 w-5" />
      </Button>
    </div>
  );
});
