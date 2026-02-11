/**
 * K3MartPackingCard - Consignment readiness summary for the Pack panel.
 *
 * Shows whether the K3 Mart consignment batch is ready for courier pickup.
 * Informational only — no interactive buttons.
 */

import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface K3MartPackingItem {
  menuProductId: string;
  productName: string;
  consignmentTarget: number;
  boxed: number;
  stickered: number;
  isReady: boolean; // stickered >= consignmentTarget
}

interface K3MartPackingCardProps {
  date: string;
  items: K3MartPackingItem[];
}

export function K3MartPackingCard({ date, items }: K3MartPackingCardProps) {
  const readyCount = items.filter((i) => i.isReady).length;
  const totalCount = items.length;
  const allReady = readyCount === totalCount;

  // Format date for display
  const dateStr = (() => {
    try {
      const d = new Date(date + 'T00:00:00+07:00');
      return d.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return date;
    }
  })();

  return (
    <div
      className="rounded-lg overflow-hidden border-l-4 bg-white shadow-sm"
      style={{ borderLeftColor: 'var(--color-k3mart)' }}
    >
      {/* Header */}
      <div
        className="px-4 py-3 border-b border-[#E8E2DB]"
        style={{ backgroundColor: 'var(--color-k3mart-light)' }}
      >
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className="text-base font-bold text-gray-900">
            K3 Mart Consignment
          </span>
          <span
            className="rounded-full px-2.5 py-0.5 text-xs font-semibold text-white"
            style={{ backgroundColor: 'var(--color-k3mart-badge)' }}
          >
            K3MART
          </span>
        </div>
        <p className="text-xs text-gray-500">{dateStr}</p>
      </div>

      {/* Product rows */}
      <div className="px-4 py-2">
        <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-3 text-[11px] mb-1.5">
          <span className="font-semibold text-gray-500 uppercase tracking-wider">Product</span>
          <span className="font-semibold text-gray-500 uppercase tracking-wider text-center">Target</span>
          <span className="font-semibold text-gray-500 uppercase tracking-wider text-center">Boxed</span>
          <span className="font-semibold text-gray-500 uppercase tracking-wider text-center">Stickered</span>
          <span className="font-semibold text-gray-500 uppercase tracking-wider text-center w-6" />
        </div>
        <div className="space-y-1">
          {items.map((item) => (
            <div
              key={item.menuProductId}
              className={cn(
                'grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-3 items-center px-2 py-1.5 rounded-lg text-sm',
                item.isReady ? 'bg-green-50' : 'bg-amber-50'
              )}
            >
              <span className="font-medium text-gray-900 truncate">{item.productName}</span>
              <span className="tabular-nums text-center font-bold w-10">{item.consignmentTarget}</span>
              <span className="tabular-nums text-center w-10">{item.boxed}</span>
              <span className="tabular-nums text-center w-10">{item.stickered}</span>
              <span className="w-6 flex justify-center">
                {item.isReady ? (
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                )}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div
        className="px-4 py-2.5 border-t border-[#E8E2DB] text-sm font-medium"
        style={{ backgroundColor: 'var(--color-k3mart-light)' }}
      >
        {allReady ? (
          <span className="text-green-700 flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4" />
            All {totalCount} products ready for pickup
          </span>
        ) : (
          <span style={{ color: 'var(--color-k3mart-accent)' }}>
            {readyCount} of {totalCount} products ready for pickup
          </span>
        )}
      </div>
    </div>
  );
}
