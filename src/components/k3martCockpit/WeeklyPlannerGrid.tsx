/**
 * WeeklyPlannerGrid - Main orchestrator grid for weekly dispatch planning with product tabs.
 *
 * Composes PlannerGridHeader, OutletPlannerRow (x8), and PlannerActionBar into a complete
 * editable grid interface with product tabs, local state management, and optimistic UI updates.
 */

import { useState, useCallback, useMemo } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { PlannerGridHeader } from './PlannerGridHeader';
import { OutletPlannerRow } from './OutletPlannerRow';
import { PlannerActionBar } from './PlannerActionBar';

interface DateInfo {
  date: string; // YYYY-MM-DD
  dayLabel: string; // "Mon", "Tue", etc.
  dateLabel: string; // "Feb 11"
  isWeekend: boolean;
  isHoliday: boolean;
  holidayName?: string;
  isToday: boolean;
  isTomorrow: boolean;
}

interface ProductInfo {
  menuProductId: string;
  productName: string;
  externalProductCode: string;
}

interface OutletInfo {
  outletId: string;
  outletName: string;
}

interface PlanData {
  value: number;
  suggestedQty: number;
  isStockOut: boolean;
  status?: "draft" | "confirmed" | "submitted" | "approved" | "rejected" | "canceled";
}

interface WeeklyPlannerGridProps {
  /** ISO week string like "2026-W07" */
  weekNumber: string;
  /** The 7 dates for this week */
  dates: DateInfo[];
  /** Products to show as tabs */
  products: ProductInfo[];
  /** All outlets */
  outlets: OutletInfo[];
  /** Plans from the backend, keyed by `${outletId}_${date}_${menuProductId}` */
  plans: Record<string, PlanData>;
  /** Today date string YYYY-MM-DD */
  today: string;
  /** Tomorrow date string YYYY-MM-DD */
  tomorrow: string;
  onSavePlan: (changes: Array<{
    date: string;
    outletId: string;
    menuProductId: string;
    externalProductCode: string;
    plannedQty: number;
    suggestedQty: number;
    isStockOut: boolean;
  }>) => Promise<void>;
  onConfirmTomorrow: () => Promise<void>;
  onSubmitToday: () => Promise<void>;
  canAct: boolean;
  isLoading?: boolean;
}

export function WeeklyPlannerGrid({
  weekNumber,
  dates,
  products,
  outlets,
  plans,
  today,
  tomorrow,
  onSavePlan,
  onConfirmTomorrow,
  onSubmitToday,
  canAct,
  isLoading = false,
}: WeeklyPlannerGridProps) {
  // weekNumber used for API calls from parent; not needed locally
  void weekNumber;
  // Active product tab (default: first product)
  const [activeProductId, setActiveProductId] = useState<string>(
    products.length > 0 ? products[0].menuProductId : ''
  );

  // Local changes: Map<`${outletId}_${date}`, number>
  const [localChanges, setLocalChanges] = useState<Map<string, number>>(new Map());

  // Action states
  const [isSaving, setIsSaving] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Derived: has unsaved changes
  const hasUnsavedChanges = localChanges.size > 0;

  // Active product
  const activeProduct = useMemo(
    () => products.find((p) => p.menuProductId === activeProductId),
    [products, activeProductId]
  );

  // Cell change handler
  const handleCellChange = useCallback((date: string, outletId: string, newValue: number) => {
    const key = `${outletId}_${date}`;
    setLocalChanges((prev) => {
      const updated = new Map(prev);
      updated.set(key, newValue);
      return updated;
    });
  }, []);

  // Save handler
  const handleSave = useCallback(async () => {
    if (!activeProduct || localChanges.size === 0) return;

    setIsSaving(true);
    try {
      const changes = Array.from(localChanges.entries()).map(([key, plannedQty]) => {
        const [outletId, date] = key.split('_');
        const fullKey = `${outletId}_${date}_${activeProduct.menuProductId}`;
        const plan = plans[fullKey] || { value: 0, suggestedQty: 0, isStockOut: false };

        return {
          date,
          outletId,
          menuProductId: activeProduct.menuProductId,
          externalProductCode: activeProduct.externalProductCode,
          plannedQty,
          suggestedQty: plan.suggestedQty,
          isStockOut: plan.isStockOut,
        };
      });

      await onSavePlan(changes);
      setLocalChanges(new Map()); // Clear local changes on success
    } catch (error) {
      console.error('Failed to save plan:', error);
      // Keep local changes on error so user can retry
    } finally {
      setIsSaving(false);
    }
  }, [activeProduct, localChanges, plans, onSavePlan]);

  // Confirm tomorrow handler
  const handleConfirmTomorrow = useCallback(async () => {
    setIsConfirming(true);
    try {
      await onConfirmTomorrow();
    } catch (error) {
      console.error('Failed to confirm tomorrow:', error);
    } finally {
      setIsConfirming(false);
    }
  }, [onConfirmTomorrow]);

  // Submit today handler
  const handleSubmitToday = useCallback(async () => {
    setIsSubmitting(true);
    try {
      await onSubmitToday();
    } catch (error) {
      console.error('Failed to submit today:', error);
    } finally {
      setIsSubmitting(false);
    }
  }, [onSubmitToday]);

  // Compute action bar state for active product
  const actionBarState = useMemo(() => {
    if (!activeProduct) {
      return {
        canConfirmTomorrow: false,
        canSubmitToday: false,
        confirmedOutletCount: 0,
        totalOutletCount: outlets.length,
      };
    }

    let tomorrowDrafts = 0;
    let todayConfirmed = 0;

    outlets.forEach((outlet) => {
      // Check tomorrow's plan status
      const tomorrowKey = `${outlet.outletId}_${tomorrow}_${activeProduct.menuProductId}`;
      const tomorrowPlan = plans[tomorrowKey];
      if (tomorrowPlan && tomorrowPlan.status === 'draft') {
        tomorrowDrafts++;
      }

      // Check today's plan status
      const todayKey = `${outlet.outletId}_${today}_${activeProduct.menuProductId}`;
      const todayPlan = plans[todayKey];
      if (todayPlan && todayPlan.status === 'confirmed') {
        todayConfirmed++;
      }
    });

    return {
      canConfirmTomorrow: tomorrowDrafts > 0,
      canSubmitToday: todayConfirmed > 0,
      confirmedOutletCount: todayConfirmed,
      totalOutletCount: outlets.length,
    };
  }, [activeProduct, outlets, plans, today, tomorrow]);

  // Loading state
  if (isLoading) {
    return (
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        {/* Skeleton tabs */}
        <div className="flex gap-2 p-4 border-b bg-muted/30">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-8 w-24" />
          ))}
        </div>

        {/* Skeleton header */}
        <div className="flex border-b-2">
          <Skeleton className="h-12 w-[120px]" />
          <div className="flex flex-1 gap-px">
            {[1, 2, 3, 4, 5, 6, 7].map((i) => (
              <Skeleton key={i} className="h-12 flex-1" />
            ))}
          </div>
        </div>

        {/* Skeleton rows */}
        {[1, 2, 3, 4, 5, 6, 7, 8].map((row) => (
          <div key={row} className="flex border-b">
            <Skeleton className="h-16 w-[120px]" />
            <div className="flex flex-1 gap-px">
              {[1, 2, 3, 4, 5, 6, 7].map((col) => (
                <Skeleton key={col} className="h-16 flex-1" />
              ))}
            </div>
          </div>
        ))}

        {/* Skeleton action bar */}
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  // No products state
  if (products.length === 0) {
    return (
      <div className="rounded-xl border bg-card shadow-sm p-8 text-center text-muted-foreground">
        No products available for planning
      </div>
    );
  }

  // No active product (should not happen)
  if (!activeProduct) {
    return null;
  }

  // Build row data for active product
  const rowsData = outlets.map((outlet, rowIndex) => {
    const cells = dates.map((dateInfo) => {
      const localKey = `${outlet.outletId}_${dateInfo.date}`;
      const fullKey = `${outlet.outletId}_${dateInfo.date}_${activeProduct.menuProductId}`;
      const plan = plans[fullKey] || { value: 0, suggestedQty: 0, isStockOut: false };

      // Value: local change if exists, otherwise plan value
      const value = localChanges.has(localKey) ? localChanges.get(localKey)! : plan.value;

      // Editable: only if canAct and status is draft or undefined
      const isEditable = canAct && (!plan.status || plan.status === 'draft');

      return {
        date: dateInfo.date,
        value,
        suggestedQty: plan.suggestedQty,
        isStockOut: plan.isStockOut,
        status: plan.status,
        isWeekend: dateInfo.isWeekend,
        isHoliday: dateInfo.isHoliday,
        isEditable,
      };
    });

    return {
      outletId: outlet.outletId,
      outletName: outlet.outletName,
      rowIndex,
      cells,
    };
  });

  // Today/tomorrow labels for action bar
  const todayDate = dates.find((d) => d.isToday);
  const tomorrowDate = dates.find((d) => d.isTomorrow);
  const todayLabel = todayDate ? todayDate.dateLabel : today;
  const tomorrowLabel = tomorrowDate ? tomorrowDate.dateLabel : tomorrow;

  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
      {/* Product Tabs */}
      <div className="flex gap-1 p-3 border-b bg-muted/30 overflow-x-auto">
        {products.map((product) => {
          const isActive = product.menuProductId === activeProductId;
          return (
            <button
              key={product.menuProductId}
              onClick={() => {
                setActiveProductId(product.menuProductId);
                setLocalChanges(new Map()); // Clear local changes when switching products
              }}
              className={cn(
                'px-4 py-2 text-sm font-medium rounded-lg transition-all whitespace-nowrap',
                'border-b-2',
                isActive
                  ? 'border-amber-500 text-gray-900 font-bold bg-white shadow-sm'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100'
              )}
            >
              {product.productName}
            </button>
          );
        })}
      </div>

      {/* Grid Area */}
      <div className="overflow-x-auto -webkit-overflow-scrolling-touch">
        <div className="min-w-[800px]">
          {/* Header */}
          <PlannerGridHeader dates={dates} />

          {/* Outlet Rows */}
          {rowsData.map((row) => (
            <OutletPlannerRow
              key={row.outletId}
              outletName={row.outletName}
              outletId={row.outletId}
              rowIndex={row.rowIndex}
              cells={row.cells}
              onCellChange={handleCellChange}
            />
          ))}
        </div>
      </div>

      {/* Action Bar */}
      {canAct && (
        <PlannerActionBar
          hasUnsavedChanges={hasUnsavedChanges}
          todayLabel={todayLabel}
          tomorrowLabel={tomorrowLabel}
          canConfirmTomorrow={actionBarState.canConfirmTomorrow}
          canSubmitToday={actionBarState.canSubmitToday}
          confirmedOutletCount={actionBarState.confirmedOutletCount}
          totalOutletCount={actionBarState.totalOutletCount}
          onSavePlan={handleSave}
          onConfirmTomorrow={handleConfirmTomorrow}
          onSubmitToday={handleSubmitToday}
          isSaving={isSaving}
          isConfirming={isConfirming}
          isSubmitting={isSubmitting}
        />
      )}
    </div>
  );
}
