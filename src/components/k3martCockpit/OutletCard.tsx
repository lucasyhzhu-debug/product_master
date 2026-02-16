/**
 * OutletCard - Collapsed outlet summary card for K3 Mart Cockpit.
 *
 * Shows outlet name, plan status, total stock, sales summary, and low stock warnings.
 * Click to expand for detailed product-level view.
 */

import React from 'react';
import { Store, AlertTriangle, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface OutletCardProps {
  outletName: string;
  outletId: string;
  /** Per-product stock entries */
  products: Array<{
    productName: string;
    stock: number;
    soldToday: number;
    avgDailySales: number;
  }>;
  /** Today's dispatch plan status */
  planStatus: 'no_plan' | 'draft' | 'confirmed' | 'submitted' | 'partial' | 'failed';
  /** Total stock across all products at this outlet */
  totalStock: number;
  /** Whether any product is below safety threshold */
  hasLowStock: boolean;
  /** Last sync timestamp (epoch ms) */
  lastSyncAt?: number;
  /** Whether this card is currently expanded/selected */
  isExpanded: boolean;
  /** Click handler to expand/collapse */
  onClick: () => void;
}

const PLAN_STATUS_CONFIG = {
  no_plan: { label: 'No Plan', bg: 'bg-muted', text: 'text-muted-foreground' },
  draft: { label: 'Draft', bg: 'bg-amber-100', text: 'text-amber-700' },
  confirmed: { label: 'Confirmed', bg: 'bg-blue-100', text: 'text-blue-700' },
  submitted: { label: 'Submitted', bg: 'bg-green-100', text: 'text-green-700' },
  partial: { label: 'Partial', bg: 'bg-orange-100', text: 'text-orange-700' },
  failed: { label: 'Failed', bg: 'bg-red-100', text: 'text-red-700' },
};

export const OutletCard = React.memo(function OutletCard({
  outletName,
  outletId: _outletId,
  products,
  planStatus,
  totalStock,
  hasLowStock,
  lastSyncAt,
  isExpanded,
  onClick,
}: OutletCardProps) {
  const statusConfig = PLAN_STATUS_CONFIG[planStatus];
  const totalSoldToday = products.reduce((sum, p) => sum + p.soldToday, 0);
  const avgDailySales = products.reduce((sum, p) => sum + p.avgDailySales, 0);

  const lastSyncStr = lastSyncAt
    ? new Date(lastSyncAt).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      })
    : 'Never';

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left bg-card rounded-xl shadow-sm border border-border border-l-4 overflow-hidden transition-all hover:shadow-md',
        isExpanded && 'ring-2 ring-offset-2',
      )}
      style={{
        borderLeftColor: 'var(--color-k3mart)',
        ...(isExpanded && { '--tw-ring-color': 'var(--color-k3mart)' } as React.CSSProperties),
      }}
    >
      {/* Header */}
      <div
        className="px-3 py-2.5 flex items-center justify-between"
        style={{ backgroundColor: 'var(--color-k3mart-light)' }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Store className="h-4 w-4 shrink-0" style={{ color: 'var(--color-k3mart)' }} />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground truncate">{outletName}</h3>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
            style={{ backgroundColor: 'var(--color-k3mart-badge)' }}
          >
            K3MART
          </span>
          <ChevronRight
            className={cn(
              'h-4 w-4 transition-transform',
              isExpanded && 'rotate-90'
            )}
            style={{ color: 'var(--color-k3mart)' }}
          />
        </div>
      </div>

      {/* Stats Grid */}
      <div className="px-3 py-2.5">
        <div className="grid grid-cols-4 gap-1.5 text-center">
          {/* Total Stock */}
          <div>
            <div className="text-lg font-bold text-foreground tabular-nums">{totalStock}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">Stock</div>
          </div>

          {/* Sold Today */}
          <div>
            <div className="text-lg font-bold text-foreground tabular-nums">{totalSoldToday}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">Sold Today</div>
          </div>

          {/* Avg Daily Sales */}
          <div>
            <div className="text-lg font-bold text-foreground tabular-nums">{avgDailySales.toFixed(1)}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">Avg/Day</div>
          </div>

          {/* Plan Status Badge */}
          <div className="flex flex-col items-center justify-center">
            <span
              className={cn(
                'rounded-full px-2 py-1 text-[10px] font-semibold',
                statusConfig.bg,
                statusConfig.text,
              )}
            >
              {statusConfig.label}
            </span>
            <div className="text-[10px] text-muted-foreground mt-0.5">Plan</div>
          </div>
        </div>
      </div>

      {/* Low Stock Warning */}
      {hasLowStock && (
        <div
          className="mx-3 mb-2 px-2 py-1 rounded flex items-center gap-1.5 text-[10px] font-medium"
          style={{
            backgroundColor: 'var(--color-k3mart-light)',
            color: 'var(--color-k3mart-accent)',
          }}
        >
          <AlertTriangle className="h-3 w-3 shrink-0" />
          <span>Low stock alert</span>
        </div>
      )}

      {/* Last Sync */}
      <div className="px-3 pb-2.5 text-[10px] text-muted-foreground">
        Last sync: {lastSyncStr}
      </div>
    </button>
  );
});
