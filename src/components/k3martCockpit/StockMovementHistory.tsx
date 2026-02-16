/**
 * StockMovementHistory - Recent stock movements list with status badges,
 * expandable detail, pagination, and cancel buttons.
 *
 * Shows recent stock-in/out requests for an outlet with their K3 Mart API status.
 * Merges local DB records and API-pulled data, sorted by timestamp descending.
 */

import React, { useState, useMemo } from "react";
import { ArrowDownToLine, ArrowUpFromLine, X, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
// cn available if needed for conditional styling

export interface StockMovement {
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
  /** Price at time of submission */
  priceAtSubmission?: number;
  /** Stock level at time of submission */
  currentStockAtSubmission?: number;
  /** Who submitted */
  submittedBy?: string;
  /** Source of data: "local" or "api" */
  dataSource?: "local" | "api";
}

interface StockMovementHistoryProps {
  movements: StockMovement[];
  onCancel?: (movementId: string) => Promise<void>;
  isLoading?: boolean;
}

const STATUS_BADGE_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  pending: "secondary",
  approved: "default",
  rejected: "destructive",
  canceled: "outline",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  canceled: "Canceled",
};

const PAGE_SIZE = 10;

/**
 * Format timestamp to relative time string.
 */
function formatRelativeTime(timestamp?: number): string {
  if (!timestamp) return "Unknown";

  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const date = new Date(timestamp);
  const today = new Date();

  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/**
 * Format absolute timestamp.
 */
function formatAbsoluteTime(timestamp?: number): string {
  if (!timestamp) return "Unknown time";
  const date = new Date(timestamp);
  return date.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export const StockMovementHistory = React.memo(function StockMovementHistory({
  movements,
  onCancel,
  isLoading = false,
}: StockMovementHistoryProps) {
  const [cancelingIds, setCancelingIds] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Sort by timestamp descending, merge duplicates
  const sortedMovements = useMemo(() => {
    const sorted = [...movements].sort((a, b) => {
      const timeA = a.submittedAt ?? 0;
      const timeB = b.submittedAt ?? 0;
      return timeB - timeA;
    });
    return sorted;
  }, [movements]);

  const visibleMovements = sortedMovements.slice(0, visibleCount);
  const hasMore = visibleCount < sortedMovements.length;

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

  const toggleExpand = (id: string) => {
    setExpandedId((current) => (current === id ? null : id));
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
        <div className="text-center py-8 text-sm text-gray-500">No recent movements</div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase text-gray-600">Recent Movements</h3>
          <span className="text-[10px] text-gray-400 tabular-nums">{sortedMovements.length} total</span>
        </div>
        <div className="space-y-2">
          {visibleMovements.map((movement) => {
            const status = movement.k3martStatus || "pending";
            const isCanceling = cancelingIds.has(movement._id);
            const canCancel = onCancel && status === "pending";
            const isExpanded = expandedId === movement._id;

            return (
              <div
                key={movement._id}
                className="bg-white rounded-lg border border-gray-200 overflow-hidden"
              >
                {/* Main row - clickable to expand */}
                <button
                  onClick={() => toggleExpand(movement._id)}
                  className="w-full text-left p-3 hover:bg-gray-50/50 transition-colors"
                >
                  {/* Row 1: Direction icon + Product + Status + Cancel */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 min-w-0 flex-1">
                      {movement.direction === "stock_in" ? (
                        <ArrowDownToLine className="h-4 w-4 shrink-0 text-green-600 mt-0.5" />
                      ) : (
                        <ArrowUpFromLine className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-gray-900 truncate">
                          {movement.productName || "Unknown Product"}
                        </div>
                        <div className="text-xs text-gray-500">
                          {movement.direction === "stock_in" ? "Stock In" : "Stock Out"} &bull;{" "}
                          {movement.quantity} units
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {/* Status badge */}
                      <Badge variant={STATUS_BADGE_VARIANT[status]} className="text-[10px]">
                        {STATUS_LABEL[status]}
                      </Badge>

                      {/* Cancel button */}
                      {canCancel && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 shrink-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCancel(movement._id);
                          }}
                          disabled={isCanceling}
                          title="Cancel request"
                        >
                          {isCanceling ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <X className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      )}

                      {/* Expand indicator */}
                      {isExpanded ? (
                        <ChevronUp className="h-3.5 w-3.5 text-gray-400" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
                      )}
                    </div>
                  </div>

                  {/* Row 2: Source/Destination + Timestamp */}
                  <div className="flex items-center justify-between gap-2 mt-1 pl-6">
                    {(movement.source || movement.destination) && (
                      <span className="text-xs text-gray-500">
                        {movement.direction === "stock_in"
                          ? `From: ${movement.source || "Unknown"}`
                          : `To: ${movement.destination || "Unknown"}`}
                      </span>
                    )}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="text-xs text-gray-500">
                          {formatRelativeTime(movement.submittedAt)}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="left">
                        <p className="text-xs">{formatAbsoluteTime(movement.submittedAt)}</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>

                  {/* Note preview */}
                  {movement.note && !isExpanded && (
                    <div className="text-xs text-gray-500 pl-6 mt-1 truncate italic">
                      {movement.note}
                    </div>
                  )}
                </button>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="px-3 pb-3 pt-1 border-t border-gray-100 space-y-2">
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {movement.priceAtSubmission !== undefined && movement.priceAtSubmission > 0 && (
                        <>
                          <span className="text-gray-500">Price/unit</span>
                          <span className="tabular-nums">{formatCurrency(movement.priceAtSubmission)}</span>
                        </>
                      )}
                      {movement.currentStockAtSubmission !== undefined && (
                        <>
                          <span className="text-gray-500">Stock at submission</span>
                          <span className="tabular-nums">{movement.currentStockAtSubmission}</span>
                        </>
                      )}
                      {movement.submittedBy && (
                        <>
                          <span className="text-gray-500">Submitted by</span>
                          <span>{movement.submittedBy}</span>
                        </>
                      )}
                      {movement.dataSource && (
                        <>
                          <span className="text-gray-500">Source</span>
                          <span>{movement.dataSource === "api" ? "K3Mart API" : "Local"}</span>
                        </>
                      )}
                    </div>
                    {movement.note && (
                      <div className="text-xs text-gray-600 pt-1 border-t border-gray-100">
                        <span className="text-gray-500">Note: </span>
                        {movement.note}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Load more */}
        {hasMore && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-xs text-gray-500"
            onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
          >
            Load more ({sortedMovements.length - visibleCount} remaining)
          </Button>
        )}
      </div>
    </TooltipProvider>
  );
});
