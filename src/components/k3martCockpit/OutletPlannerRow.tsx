/**
 * OutletPlannerRow - Outlet group with product sub-rows for K3 Mart weekly planner.
 *
 * Renders one outlet as:
 * - Outlet header row (bold name, sticky left)
 * - Product sub-rows (one per product, with stock column + 7 day cells + row total)
 * - Outlet subtotal row (when outlet has >1 product)
 *
 * All outlets are always expanded (no collapse/expand per user decision).
 */

import React, { useCallback, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { EditablePlannerCell } from './EditablePlannerCell';

interface PlanCell {
  plannedQty: number;
  suggestedQty: number;
  isStockOut: boolean;
  status: string;
}

interface OutletProduct {
  menuProductId: string;
  productName: string;
  externalProductCode: string;
  currentStock: number;
  price: number;
  isHidden: boolean;
}

interface OutletPlannerRowProps {
  outletId: string;
  outletName: string;
  products: OutletProduct[];
  weekDates: string[];
  plans: Record<string, PlanCell>;
  canAct: boolean;
  /** Base row index for keyboard navigation (increments per product sub-row) */
  baseRowIndex: number;
  /** Average daily sales per product for low stock warning. Key: menuProductId */
  avgDailySales?: Record<string, number>;
  onSaveCell: (
    outletId: string,
    menuProductId: string,
    externalProductCode: string,
    date: string,
    plannedQty: number,
    suggestedQty: number
  ) => void;
  onDirty: () => void;
}

export const OutletPlannerRow = React.memo(function OutletPlannerRow({
  outletId,
  outletName,
  products,
  weekDates,
  plans,
  canAct,
  baseRowIndex,
  avgDailySales,
  onSaveCell,
  onDirty,
}: OutletPlannerRowProps) {
  // Get cell data for a product on a specific date
  const getCellData = useCallback(
    (menuProductId: string, date: string): PlanCell => {
      const key = `${outletId}_${date}_${menuProductId}`;
      return plans[key] || { plannedQty: 0, suggestedQty: 0, isStockOut: false, status: 'draft' };
    },
    [outletId, plans]
  );

  // Compute row total for a product (sum of 7 days)
  const getRowTotal = useCallback(
    (menuProductId: string): number => {
      return weekDates.reduce((sum, date) => {
        const cell = getCellData(menuProductId, date);
        return sum + cell.plannedQty;
      }, 0);
    },
    [weekDates, getCellData]
  );

  // Compute subtotals per day (sum of all products for this outlet)
  const daySubtotals = useMemo(() => {
    return weekDates.map((date) =>
      products.reduce((sum, product) => {
        const cell = getCellData(product.menuProductId, date);
        return sum + cell.plannedQty;
      }, 0)
    );
  }, [weekDates, products, getCellData]);

  const outletTotal = useMemo(
    () => daySubtotals.reduce((sum, v) => sum + v, 0),
    [daySubtotals]
  );

  const showSubtotal = products.length > 1;

  return (
    <div className="border-b-2 border-gray-200">
      {/* Outlet Header Row */}
      <div className="flex items-stretch bg-gray-50 border-b border-gray-200">
        {/* Sticky outlet name */}
        <div className="sticky left-0 z-10 flex items-center px-3 py-2 bg-gray-50 border-r border-gray-200 min-w-[160px] w-[160px] shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]">
          <span className="text-sm font-bold text-gray-900 truncate">{outletName}</span>
        </div>
        {/* Stock column header (empty for outlet header) */}
        <div className="w-[64px] min-w-[64px] border-r border-gray-200" />
        {/* Empty day cells for header */}
        {weekDates.map((date) => (
          <div key={date} className="flex-1 min-w-[64px] border-r border-gray-200 last:border-r-0" />
        ))}
        {/* Total column header */}
        <div className="w-[72px] min-w-[72px] flex items-center justify-center">
          <span className="text-xs font-semibold text-gray-500">
            {outletTotal > 0 ? outletTotal : ''}
          </span>
        </div>
      </div>

      {/* Product Sub-rows */}
      {products.map((product, productIndex) => {
        const rowIndex = baseRowIndex + productIndex;
        const rowTotal = getRowTotal(product.menuProductId);
        const avgSales = avgDailySales?.[product.menuProductId] ?? 0;
        const isLowStock = avgSales > 0 && product.currentStock < avgSales * 2;

        return (
          <div
            key={product.menuProductId}
            className={cn(
              'flex items-stretch border-b border-gray-100',
              productIndex % 2 === 1 && 'bg-gray-50/30'
            )}
          >
            {/* Product name (indented, sticky left) */}
            <div className="sticky left-0 z-10 flex items-center px-3 py-1 bg-white border-r border-gray-200 min-w-[160px] w-[160px] shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]">
              <span className="text-xs text-gray-700 truncate pl-3">{product.productName}</span>
            </div>

            {/* Stock column */}
            <div
              className={cn(
                'w-[64px] min-w-[64px] flex items-center justify-center border-r border-gray-200 text-xs tabular-nums font-medium',
                isLowStock ? 'text-red-600 bg-red-50' : 'text-gray-600'
              )}
            >
              {product.currentStock}
            </div>

            {/* 7 day cells */}
            {weekDates.map((date, colIndex) => {
              const cell = getCellData(product.menuProductId, date);
              const cellStatus =
                cell.status === 'confirmed'
                  ? 'confirmed' as const
                  : cell.status === 'submitted'
                    ? 'submitted' as const
                    : 'draft' as const;
              const isEditable = canAct && cellStatus !== 'submitted';

              return (
                <div
                  key={date}
                  className="flex-1 min-w-[64px] border-r border-gray-200 last:border-r-0 flex items-center justify-center p-0.5"
                >
                  <EditablePlannerCell
                    value={cell.plannedQty}
                    suggestedQty={cell.suggestedQty}
                    status={cellStatus}
                    isEditable={isEditable}
                    onSave={(newValue) =>
                      onSaveCell(
                        outletId,
                        product.menuProductId,
                        product.externalProductCode,
                        date,
                        newValue,
                        cell.suggestedQty
                      )
                    }
                    onDirty={onDirty}
                    colIndex={colIndex}
                    rowIndex={rowIndex}
                  />
                </div>
              );
            })}

            {/* Row total */}
            <div className="w-[72px] min-w-[72px] flex items-center justify-center text-xs font-semibold tabular-nums text-gray-700 bg-gray-50/50">
              {rowTotal > 0 ? rowTotal : ''}
            </div>
          </div>
        );
      })}

      {/* Outlet Subtotal Row (only when >1 product) */}
      {showSubtotal && (
        <div className="flex items-stretch bg-gray-100/50 border-b border-gray-200">
          {/* Label */}
          <div className="sticky left-0 z-10 flex items-center px-3 py-1 bg-gray-100/50 border-r border-gray-200 min-w-[160px] w-[160px] shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]">
            <span className="text-xs text-gray-500 italic pl-3">Subtotal</span>
          </div>
          {/* Empty stock column */}
          <div className="w-[64px] min-w-[64px] border-r border-gray-200" />
          {/* Day subtotals */}
          {daySubtotals.map((subtotal, idx) => (
            <div
              key={weekDates[idx]}
              className="flex-1 min-w-[64px] flex items-center justify-center border-r border-gray-200 last:border-r-0 text-xs font-semibold tabular-nums text-gray-600"
            >
              {subtotal > 0 ? subtotal : ''}
            </div>
          ))}
          {/* Outlet total */}
          <div className="w-[72px] min-w-[72px] flex items-center justify-center text-xs font-bold tabular-nums text-gray-700">
            {outletTotal > 0 ? outletTotal : ''}
          </div>
        </div>
      )}
    </div>
  );
});
