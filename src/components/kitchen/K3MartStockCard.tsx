/**
 * K3MartStockCard - Read-only outlet stock info card for the Sticker panel.
 *
 * Shows aggregate K3 Mart outlet stock, today's sales, consignment target,
 * and per-outlet breakdown. Mirrors GoFoodStickerCard pattern.
 */

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { FlipNumber } from './FlipNumber';

interface K3MartStockCardProps {
  productName: string;
  consignmentTarget: number;
  totalOutletStock: number;
  totalSoldToday: number;
  gapToTarget: number;
  outletBreakdown: Array<{ outletName: string; stock: number; soldToday: number }>;
  lastSyncAt?: number;
  onSyncStock?: () => void;
}

export function K3MartStockCard({
  productName,
  consignmentTarget,
  totalOutletStock,
  totalSoldToday,
  gapToTarget,
  outletBreakdown,
  lastSyncAt,
  onSyncStock,
}: K3MartStockCardProps) {
  const [showBreakdown, setShowBreakdown] = useState(false);

  const lastSyncStr = lastSyncAt
    ? new Date(lastSyncAt).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      })
    : 'Never';

  return (
    <div
      className="bg-white rounded-xl shadow-sm border border-[#E8E2DB] border-l-4 overflow-hidden"
      style={{ borderLeftColor: 'var(--color-k3mart)' }}
    >
      {/* Header */}
      <div className="px-3 py-2.5" style={{ backgroundColor: 'var(--color-k3mart-light)' }}>
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-gray-900 truncate">
              {productName}
            </h3>
            <div className="text-[10px] text-gray-500 mt-0.5">
              Last sync {lastSyncStr}
            </div>
          </div>
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-white shrink-0 ml-2"
            style={{ backgroundColor: 'var(--color-k3mart-badge)' }}
          >
            K3MART
          </span>
        </div>
      </div>

      {/* Stat Row */}
      <div className="px-3 py-2.5">
        <div className="grid grid-cols-3 gap-2 text-center">
          {/* At Outlets */}
          <div>
            <div className="text-xl font-bold text-[#1A202C] flex items-center justify-center">
              <FlipNumber value={totalOutletStock} size="md" />
            </div>
            <div className="text-[10px] text-gray-500 mt-0.5">At Outlets</div>
          </div>

          {/* Sold Today */}
          <div>
            <div className="text-xl font-bold text-[#1A202C] flex items-center justify-center">
              <FlipNumber value={totalSoldToday} size="md" />
            </div>
            <div className="text-[10px] text-gray-500 mt-0.5">Sold Today</div>
          </div>

          {/* Target */}
          <div>
            <div className="text-xl font-bold text-[#1A202C] flex items-center justify-center">
              <FlipNumber value={consignmentTarget} size="md" />
            </div>
            <div className="text-[10px] text-gray-500 mt-0.5">Target</div>
          </div>
        </div>
      </div>

      {/* Restock indicator */}
      {gapToTarget > 0 && (
        <div className="mx-3 mb-2 text-[10px] font-medium rounded px-2 py-1"
          style={{ backgroundColor: 'var(--color-k3mart-light)', color: 'var(--color-k3mart-accent)' }}
        >
          Need {gapToTarget} more to hit target
        </div>
      )}

      {/* Outlet breakdown (collapsible) */}
      {outletBreakdown.length > 0 && (
        <div className="border-t border-gray-100">
          <button
            onClick={() => setShowBreakdown(!showBreakdown)}
            className="w-full px-3 py-1.5 flex items-center justify-between text-[10px] font-semibold text-gray-500 uppercase tracking-wider hover:bg-gray-50"
          >
            Per-Outlet ({outletBreakdown.length})
            {showBreakdown ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
          </button>
          {showBreakdown && (
            <div className="px-3 pb-2 space-y-0.5">
              {outletBreakdown.map((outlet) => (
                <div
                  key={outlet.outletName}
                  className="flex items-center justify-between text-[11px] px-2 py-1 rounded bg-gray-50"
                >
                  <span className="text-gray-700 truncate mr-2">{outlet.outletName}</span>
                  <div className="flex items-center gap-3 shrink-0 tabular-nums">
                    <span className="text-gray-600">
                      Stk: <span className="font-bold">{outlet.stock}</span>
                    </span>
                    <span className="text-gray-600">
                      Sold: <span className="font-bold">{outlet.soldToday}</span>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Sync Stock button */}
      {onSyncStock && (
        <div className="px-3 py-2 border-t border-gray-100 flex justify-end">
          <button
            onClick={onSyncStock}
            className="text-[11px] font-medium px-3 py-1 rounded-md hover:bg-gray-100 transition-colors"
            style={{ color: 'var(--color-k3mart)' }}
          >
            Sync Stock
          </button>
        </div>
      )}
    </div>
  );
}
