/**
 * OutletPlannerRow - Single outlet row with 7 editable day cells for K3 Mart weekly planner.
 *
 * Renders one outlet's row in the planner grid: outlet name cell (sticky left) + 7 day cells.
 * Uses React.memo and useCallback to optimize re-renders when editing cells.
 */

import React, { useCallback } from 'react';
import { cn } from '@/lib/utils';
import { EditablePlannerCell } from './EditablePlannerCell';

interface OutletPlannerRowProps {
  outletName: string;
  outletId: string;
  rowIndex: number;
  cells: Array<{
    date: string;
    value: number;
    suggestedQty: number;
    isStockOut: boolean;
    status?: "draft" | "confirmed" | "submitted" | "approved" | "rejected" | "canceled";
    isWeekend: boolean;
    isHoliday: boolean;
    isEditable: boolean;
  }>;
  onCellChange: (date: string, outletId: string, newValue: number) => void;
}

export const OutletPlannerRow = React.memo(function OutletPlannerRow({
  outletName,
  outletId,
  rowIndex,
  cells,
  onCellChange,
}: OutletPlannerRowProps) {
  // Memoized cell change handler to prevent unnecessary re-renders
  const handleCellChange = useCallback(
    (date: string) => (newValue: number) => {
      onCellChange(date, outletId, newValue);
    },
    [onCellChange, outletId]
  );

  return (
    <div
      className={cn(
        'flex items-stretch border-b border-gray-200 transition-colors hover:bg-gray-50/50',
        rowIndex % 2 === 1 && 'bg-gray-50/30'
      )}
    >
      {/* Outlet Name Cell (Sticky Left) */}
      <div className="sticky left-0 z-10 flex items-center px-3 py-2 bg-white border-r border-gray-200 shadow-sm">
        <span className="text-xs font-medium text-gray-900 truncate max-w-[120px]">
          {outletName}
        </span>
      </div>

      {/* Day Cells (7 columns) */}
      <div className="flex flex-1">
        {cells.map((cell, colIndex) => (
          <div
            key={cell.date}
            className="flex-1 min-w-[100px] border-r border-gray-200 last:border-r-0 flex items-center justify-center p-1"
          >
            <EditablePlannerCell
              value={cell.value}
              suggestedQty={cell.suggestedQty}
              isStockOut={cell.isStockOut}
              status={cell.status}
              isWeekend={cell.isWeekend}
              isHoliday={cell.isHoliday}
              isEditable={cell.isEditable}
              colIndex={colIndex}
              rowIndex={rowIndex}
              onChange={handleCellChange(cell.date)}
            />
          </div>
        ))}
      </div>
    </div>
  );
});
