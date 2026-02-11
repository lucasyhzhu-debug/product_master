/**
 * ProductionReadinessBar - Production readiness indicator with deficit warning.
 *
 * Shows the gap between stickered production counts vs total planned dispatch
 * for today and tomorrow, with a button to bump the production target.
 */

import React from 'react';
import { AlertTriangle, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ProductionReadinessBarProps {
  items: Array<{
    menuProductId: string;
    productName: string;
    /** How many stickered units are available now */
    stickeredCount: number;
    /** How many are planned for dispatch today + tomorrow */
    plannedTotal: number;
    /** Deficit = max(0, plannedTotal - stickeredCount) */
    deficit: number;
    /** Current production target */
    currentTarget: number;
  }>;
  /** Called when user clicks "Approve Bump" - receives menuProductId and suggested new target */
  onApproveBump?: (menuProductId: string, newTarget: number) => void;
  isLoading?: boolean;
}

export const ProductionReadinessBar = React.memo(function ProductionReadinessBar({
  items,
  onApproveBump,
  isLoading = false,
}: ProductionReadinessBarProps) {
  // Only render if there's at least one item with deficit > 0
  const itemsWithDeficit = items.filter((item) => item.deficit > 0);

  if (itemsWithDeficit.length === 0) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="w-full bg-gradient-to-r from-amber-50 to-orange-50 border-l-4 border-amber-600 rounded-lg p-4 animate-pulse">
        <div className="h-4 bg-amber-200 rounded w-32 mb-2"></div>
        <div className="h-3 bg-amber-200 rounded w-full"></div>
      </div>
    );
  }

  return (
    <div
      className="w-full bg-gradient-to-r from-amber-50 to-orange-50 border-l-4 rounded-lg shadow-sm overflow-hidden"
      style={{ borderLeftColor: 'var(--color-k3mart)' }}
    >
      {/* Header */}
      <div className="px-4 py-2.5 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
        <h3 className="text-sm font-semibold text-amber-900">Production Deficit</h3>
      </div>

      {/* Per-product rows */}
      <div className="px-4 pb-3 space-y-3">
        {itemsWithDeficit.map((item) => {
          const progressPct = Math.min(100, (item.stickeredCount / item.plannedTotal) * 100);

          // Determine progress bar color
          let barColor = 'bg-red-500';
          if (progressPct >= 100) {
            barColor = 'bg-green-500';
          } else if (progressPct >= 50) {
            barColor = 'bg-amber-500';
          }

          return (
            <div key={item.menuProductId} className="space-y-1.5">
              {/* Product name and deficit */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-gray-900 truncate block">
                    {item.productName}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs font-medium text-red-600">
                    Need {item.deficit} more
                  </span>
                  <Button
                    onClick={() => onApproveBump?.(item.menuProductId, item.currentTarget + item.deficit)}
                    disabled={!onApproveBump}
                    size="sm"
                    className="h-6 px-2.5 text-xs bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-50"
                  >
                    <TrendingUp className="h-3 w-3 mr-1" />
                    Approve Bump
                  </Button>
                </div>
              </div>

              {/* Progress bar */}
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-gray-200 rounded-full h-2 overflow-hidden">
                  <div
                    className={cn('h-full transition-all duration-300', barColor)}
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <span className="text-xs text-gray-600 tabular-nums shrink-0">
                  {item.stickeredCount} / {item.plannedTotal} stickered
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});
