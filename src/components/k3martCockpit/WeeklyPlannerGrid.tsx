/**
 * WeeklyPlannerGrid - Outlet-first weekly dispatch planning grid orchestrator.
 *
 * Composes WeekNavigator, PlannerGridHeader, OutletPlannerRow (per outlet),
 * and PlannerActionBar into a complete editable grid with:
 * - Week navigation (prev/next/today) defaulting to current week
 * - Outlet-first layout with product sub-rows
 * - Auto-save on blur (no batch save button)
 * - Copy-last-week functionality
 * - Daily column totals as production targets
 * - Unsaved changes warning on navigate away
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { WeekNavigator } from './WeekNavigator';
import { PlannerGridHeader } from './PlannerGridHeader';
import { OutletPlannerRow } from './OutletPlannerRow';
import { PlannerActionBar } from './PlannerActionBar';
import { getWeekNumber, getWeekDates, getTodayJakarta } from '@/../../convex/k3martCockpit/helpers';
import { getDayType, getEventName } from '@/lib/indonesianHolidays';
import {
  useConvexWeeklyDispatchPlans,
  useConvexSaveWeeklyDispatchPlan,
  useConvexCopyLastWeek,
  useConvexConfirmDayPlan,
} from '@/hooks/convex';
import { useAuth } from '@/contexts/AuthContext';

export function WeeklyPlannerGrid() {
  const { user } = useAuth();
  const canAct = user?.role === 'manager' || user?.role === 'admin';

  // Week navigation state
  const [weekOffset, setWeekOffset] = useState(0);
  const currentWeekNumber = useMemo(() => {
    const today = getTodayJakarta();
    const d = new Date(today + 'T00:00:00+07:00');
    d.setDate(d.getDate() + weekOffset * 7);
    return getWeekNumber(d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }));
  }, [weekOffset]);
  const isCurrentWeek = weekOffset === 0;

  // Compute week dates from week number
  const weekDates = useMemo(() => {
    const today = getTodayJakarta();
    const d = new Date(today + 'T00:00:00+07:00');
    d.setDate(d.getDate() + weekOffset * 7);
    return getWeekDates(d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }));
  }, [weekOffset]);

  const todayStr = useMemo(() => getTodayJakarta(), []);

  // Unsaved changes tracking
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasUnsavedChanges]);

  // Data query
  const { data: weeklyData, isLoading } = useConvexWeeklyDispatchPlans(currentWeekNumber);

  // Mutations
  const saveDispatchPlan = useConvexSaveWeeklyDispatchPlan();
  const copyLastWeek = useConvexCopyLastWeek();
  const confirmDayPlan = useConvexConfirmDayPlan();

  // Track which days have local edits (for "Update Kitchen" button)
  const [editedDays, setEditedDays] = useState<Set<string>>(new Set());

  // Reset edited days when week changes
  useEffect(() => {
    setEditedDays(new Set());
    setHasUnsavedChanges(false);
  }, [currentWeekNumber]);

  // Handlers
  const handlePrev = useCallback(() => setWeekOffset((o) => o - 1), []);
  const handleNext = useCallback(() => setWeekOffset((o) => o + 1), []);
  const handleToday = useCallback(() => setWeekOffset(0), []);

  const handleSaveCell = useCallback(
    async (
      outletId: string,
      menuProductId: string,
      externalProductCode: string,
      date: string,
      plannedQty: number,
      suggestedQty: number
    ) => {
      try {
        await saveDispatchPlan({
          plans: [
            {
              date,
              outletId: outletId as any,
              menuProductId: menuProductId as any,
              externalProductId: externalProductCode,
              suggestedQty,
              plannedQty,
              isStockOut: false,
            },
          ],
        });
        // Track that this day has been edited (for "Update Kitchen" on confirmed days)
        setEditedDays((prev) => new Set(prev).add(date));
        setHasUnsavedChanges(false);
      } catch (error) {
        console.error('Failed to save cell:', error);
        toast.error('Failed to save');
      }
    },
    [saveDispatchPlan]
  );

  const handleDirty = useCallback(() => {
    setHasUnsavedChanges(true);
  }, []);

  const handleCopyLastWeek = useCallback(async () => {
    try {
      const result = await copyLastWeek({ targetWeekNumber: currentWeekNumber });
      if (result.copiedCount > 0) {
        toast.success(`Copied ${result.copiedCount} plans from last week`);
      } else {
        toast.info('No plans to copy from last week');
      }
    } catch (error) {
      console.error('Failed to copy last week:', error);
      toast.error('Failed to copy last week');
    }
  }, [copyLastWeek, currentWeekNumber]);

  const handleConfirmDay = useCallback(
    async (date: string) => {
      try {
        const result = await confirmDayPlan({ date });
        toast.success(`Confirmed ${result.confirmedCount} plans for ${date}`);
        // Clear edited state for this day
        setEditedDays((prev) => {
          const next = new Set(prev);
          next.delete(date);
          return next;
        });
      } catch (error) {
        console.error('Failed to confirm day:', error);
        toast.error('Failed to confirm day');
      }
    },
    [confirmDayPlan]
  );

  // Derived data
  const outlets = weeklyData?.outlets ?? [];
  const plans = weeklyData?.plans ?? {};
  const hasPreviousWeek = (weeklyData?.previousWeekTotals &&
    Object.values(weeklyData.previousWeekTotals).some((v) => v > 0)) ?? false;

  // Compute daily totals (production targets) and grand total
  const dailyTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const date of weekDates) {
      totals[date] = 0;
    }
    for (const outlet of outlets) {
      for (const product of outlet.products) {
        for (const date of weekDates) {
          const key = `${outlet.outletId}_${date}_${product.menuProductId}`;
          const cell = plans[key];
          if (cell && !cell.isStockOut) {
            totals[date] += cell.plannedQty;
          }
        }
      }
    }
    return totals;
  }, [weekDates, outlets, plans]);

  const grandTotal = useMemo(
    () => Object.values(dailyTotals).reduce((sum, v) => sum + v, 0),
    [dailyTotals]
  );

  // Compute day statuses (draft/confirmed/submitted) by checking all plans for each day
  const dayStatuses = useMemo(() => {
    const statuses: Record<string, 'draft' | 'confirmed' | 'submitted'> = {};
    for (const date of weekDates) {
      let hasDraft = false;
      let hasConfirmed = false;
      let hasSubmitted = false;
      let hasAnyPlan = false;

      for (const outlet of outlets) {
        for (const product of outlet.products) {
          const key = `${outlet.outletId}_${date}_${product.menuProductId}`;
          const cell = plans[key];
          if (cell && cell.plannedQty > 0) {
            hasAnyPlan = true;
            if (cell.status === 'submitted') hasSubmitted = true;
            else if (cell.status === 'confirmed') hasConfirmed = true;
            else hasDraft = true;
          }
        }
      }

      if (hasSubmitted && !hasDraft && !hasConfirmed) {
        statuses[date] = 'submitted';
      } else if (hasConfirmed && !hasDraft) {
        statuses[date] = 'confirmed';
      } else {
        statuses[date] = hasAnyPlan ? 'draft' : 'draft';
      }
    }
    return statuses;
  }, [weekDates, outlets, plans]);

  // Track which confirmed days have been locally edited (for "Update Kitchen" button)
  const hasEditsForDay = useMemo(() => {
    const result: Record<string, boolean> = {};
    for (const date of weekDates) {
      result[date] = editedDays.has(date) && dayStatuses[date] === 'confirmed';
    }
    return result;
  }, [weekDates, editedDays, dayStatuses]);

  // Build enriched date info for header
  const dateInfos = useMemo(
    () =>
      weekDates.map((date) => {
        const d = new Date(date + 'T00:00:00+07:00');
        const dayOfWeek = d.getDay();
        return {
          date,
          dayName: d.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'Asia/Jakarta' }),
          dateLabel: d.toLocaleDateString('en-US', {
            day: 'numeric',
            month: 'short',
            timeZone: 'Asia/Jakarta',
          }),
          dayType: getDayType(date),
          eventName: getEventName(date),
          isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
          isToday: date === todayStr,
        };
      }),
    [weekDates, todayStr]
  );

  // Compute base row index for each outlet (for keyboard navigation)
  const outletBaseRowIndices = useMemo(() => {
    const indices: number[] = [];
    let rowIndex = 0;
    for (const outlet of outlets) {
      indices.push(rowIndex);
      rowIndex += outlet.products.length;
    }
    return indices;
  }, [outlets]);

  // Loading state
  if (isLoading) {
    return (
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-12 w-full" />
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  // No data state
  if (outlets.length === 0) {
    return (
      <div className="rounded-xl border bg-card shadow-sm p-8 text-center text-muted-foreground">
        No outlets available for planning. Configure outlets in K3Mart settings.
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
      {/* Week Navigator */}
      <WeekNavigator
        weekNumber={currentWeekNumber}
        weekDates={weekDates}
        onPrev={handlePrev}
        onNext={handleNext}
        onToday={handleToday}
        isCurrentWeek={isCurrentWeek}
      />

      {/* Grid Area */}
      <div className="overflow-x-auto">
        <div className="min-w-[800px]">
          {/* Header with 3-row day columns + per-day confirm buttons */}
          <PlannerGridHeader
            weekDates={weekDates}
            dateInfos={dateInfos}
            dayStatuses={dayStatuses}
            onConfirmDay={handleConfirmDay}
            hasEditsForDay={hasEditsForDay}
          />

          {/* Outlet Rows */}
          {outlets.map((outlet, outletIndex) => (
            <OutletPlannerRow
              key={outlet.outletId as string}
              outletId={outlet.outletId as string}
              outletName={outlet.outletName}
              products={outlet.products}
              weekDates={weekDates}
              plans={plans}
              canAct={canAct}
              baseRowIndex={outletBaseRowIndices[outletIndex]}
              onSaveCell={handleSaveCell}
              onDirty={handleDirty}
            />
          ))}
        </div>
      </div>

      {/* Action Bar with Copy Last Week + Grand Totals */}
      <PlannerActionBar
        onCopyLastWeek={handleCopyLastWeek}
        hasPreviousWeek={hasPreviousWeek}
        dailyTotals={dailyTotals}
        grandTotal={grandTotal}
        weekDates={weekDates}
      />
    </div>
  );
}
