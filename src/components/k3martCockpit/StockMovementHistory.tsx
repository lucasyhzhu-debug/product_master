/**
 * StockMovementHistory - Recent stock movements list with status badges and cancel buttons.
 *
 * Shows recent stock-in/out requests for an outlet with their K3 Mart API status.
 */

import React, { useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface StockMovementHistoryProps {
  movements: Array<{
    _id: string;
    direction: "stock_in" | "stock_out";
    quantity: number;
    menuProductId: string;
    productName?: string;
    source?: string;
    destination?: string;
    k3martStatus?: "pending" | "approved" | "rejected" | "canceled";
    submittedAt?: number;
    note?: string;
  }>;
  onCancel?: (movementId: string) => Promise<void>;
  isLoading?: boolean;
}

const STATUS_CONFIG = {
  pending: { label: 'Pending', bg: 'bg-yellow-100', text: 'text-yellow-700' },
  approved: { label: 'Approved', bg: 'bg-green-100', text: 'text-green-700' },
  rejected: { label: 'Rejected', bg: 'bg-red-100', text: 'text-red-700' },
  canceled: { label: 'Canceled', bg: 'bg-gray-100', text: 'text-gray-500' },
};

/**
 * Format timestamp to relative time or date string
 * If < 60min ago, show "Xm ago"
 * If today, show time
 * Otherwise show date
 */
function formatTimestamp(timestamp?: number): string {
  if (!timestamp) return 'Unknown';

  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);

  // Less than 60 minutes ago
  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const date = new Date(timestamp);
  const today = new Date();

  // Today - show time
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }

  // Other days - show date
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

export const StockMovementHistory = React.memo(function StockMovementHistory({
  movements,
  onCancel,
  isLoading = false,
}: StockMovementHistoryProps) {
  const [cancelingIds, setCancelingIds] = useState<Set<string>>(new Set());

  const handleCancel = async (movementId: string) => {
    if (!onCancel) return;

    setCancelingIds((prev) => new Set(prev).add(movementId));
    try {
      await onCancel(movementId);
    } finally {
      setCancelingIds((prev) => {
        const next = new Set(prev);
        next.delete(movementId);
        return next;
      });
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase text-gray-600">Recent Movements</h3>
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-gray-100 rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  // Empty state
  if (movements.length === 0) {
    return (
      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase text-gray-600">Recent Movements</h3>
        <div className="text-center py-8 text-sm text-gray-500">
          No recent movements
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold uppercase text-gray-600">Recent Movements</h3>
      <div className="space-y-2">
        {movements.map((movement) => {
          const statusConfig = STATUS_CONFIG[movement.k3martStatus || 'pending'];
          const isCanceling = cancelingIds.has(movement._id);
          const canCancel = onCancel && movement.k3martStatus === 'pending';
          const isApproved = movement.k3martStatus === 'approved';

          return (
            <div
              key={movement._id}
              className="bg-white rounded-lg border border-gray-200 p-3 space-y-2"
            >
              {/* Row 1: Direction icon + Product + Cancel button */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2 min-w-0 flex-1">
                  {movement.direction === 'stock_in' ? (
                    <ArrowDownToLine className="h-4 w-4 shrink-0 text-green-600 mt-0.5" />
                  ) : (
                    <ArrowUpFromLine className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-gray-900 truncate">
                      {movement.productName || 'Unknown Product'}
                    </div>
                    <div className="text-xs text-gray-500">
                      {movement.direction === 'stock_in' ? 'Stock In' : 'Stock Out'} • {movement.quantity} units
                    </div>
                  </div>
                </div>

                {/* Cancel button */}
                {canCancel && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 shrink-0"
                    onClick={() => handleCancel(movement._id)}
                    disabled={isCanceling}
                    title={isApproved ? "Cannot cancel approved requests" : "Cancel request"}
                  >
                    {isCanceling ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <X className="h-3.5 w-3.5" />
                    )}
                  </Button>
                )}
              </div>

              {/* Row 2: Source/Destination label */}
              {(movement.source || movement.destination) && (
                <div className="text-xs text-gray-500 pl-6">
                  {movement.direction === 'stock_in'
                    ? `From: ${movement.source || 'Unknown'}`
                    : `To: ${movement.destination || 'Unknown'}`}
                </div>
              )}

              {/* Row 3: Status badge + Timestamp */}
              <div className="flex items-center justify-between gap-2 pl-6">
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                    statusConfig.bg,
                    statusConfig.text
                  )}
                >
                  {statusConfig.label}
                </span>
                <span className="text-xs text-gray-500">
                  {formatTimestamp(movement.submittedAt)}
                </span>
              </div>

              {/* Optional note */}
              {movement.note && (
                <div className="text-xs text-gray-600 pl-6 pt-1 border-t border-gray-100">
                  Note: {movement.note}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});
