/**
 * TransactionLogPanel — Scrollable paginated list of product inventory transactions.
 *
 * Shows: timestamp, type badge, quantity, location, performed by, reason/order link.
 * Supports filtering by menuProductId.
 */

import { ShoppingCart, TrendingUp, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useProductInventoryTransactions } from "@/hooks/convex";
import type { Id } from "../../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";

interface TransactionLogPanelProps {
  menuProductId?: Id<"menuProducts">;
  locationId?: Id<"storageLocations">;
}

// Transaction type display config
const TX_CONFIG = {
  add: {
    label: "Added",
    color: "bg-[var(--color-status-success-bg)] text-[var(--color-status-success)] border-[var(--color-status-success)]/30",
    icon: TrendingUp,
    iconColor: "text-[var(--color-status-success)]",
  },
  drawdown: {
    label: "Order",
    color: "bg-[var(--color-status-info-bg)] text-[var(--color-status-info)] border-[var(--color-status-info)]/30",
    icon: ShoppingCart,
    iconColor: "text-[var(--color-status-info)]",
  },
  gofood_sale: {
    label: "GoFood",
    color: "bg-[var(--color-gofood-light)] text-[var(--color-gofood)] border-[var(--color-gofood)]/30",
    icon: ShoppingCart,
    iconColor: "text-[var(--color-gofood)]",
  },
  adjust: {
    label: "Adjusted",
    color: "bg-[var(--color-status-warning-bg)] text-[var(--color-status-warning)] border-[var(--color-status-warning)]/30",
    icon: RefreshCw,
    iconColor: "text-[var(--color-status-warning)]",
  },
} as const;

type TransactionType = keyof typeof TX_CONFIG;

function formatTimestamp(ts: number): string {
  const date = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    // Today: show time
    return date.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  } else if (diffDays < 7) {
    return date.toLocaleDateString("id-ID", { weekday: "short", hour: "2-digit", minute: "2-digit" });
  } else {
    return date.toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
  }
}

export function TransactionLogPanel({
  menuProductId,
  locationId,
}: TransactionLogPanelProps) {
  const { results, status, loadMore } = useProductInventoryTransactions({
    menuProductId,
    locationId,
  });

  if (status === "LoadingFirstPage") {
    return (
      <div className="space-y-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="py-4 text-center text-sm text-muted-foreground">
        No transactions yet
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {results.map((tx) => {
        const txType = (tx.transactionType as TransactionType) in TX_CONFIG
          ? (tx.transactionType as TransactionType)
          : "adjust";
        const config = TX_CONFIG[txType];
        const Icon = config.icon;
        const isPositive = tx.quantity > 0;

        return (
          <div
            key={tx._id}
            className="flex items-center gap-2 p-2 rounded-md hover:bg-muted/40 text-xs"
          >
            {/* Type icon */}
            <Icon className={cn("h-3.5 w-3.5 flex-shrink-0", config.iconColor)} />

            {/* Type badge */}
            <Badge
              variant="outline"
              className={cn("text-[10px] px-1.5 py-0 flex-shrink-0", config.color)}
            >
              {config.label}
            </Badge>

            {/* Quantity */}
            <span
              className={cn(
                "font-mono font-semibold flex-shrink-0",
                isPositive ? "text-emerald-600" : "text-red-600"
              )}
            >
              {isPositive ? "+" : ""}{tx.quantity}
            </span>

            {/* Location */}
            {tx.locationName && (
              <span className="text-muted-foreground truncate flex-1 min-w-0">
                @ {tx.locationName}
              </span>
            )}

            {/* Reason / order ref */}
            {tx.reason && (
              <span
                className="text-muted-foreground truncate max-w-[100px]"
                title={tx.reason}
              >
                {tx.reason}
              </span>
            )}
            {tx.gofoodOrderRef && (
              <span className="text-muted-foreground truncate text-[10px]">
                {tx.gofoodOrderRef}
              </span>
            )}

            {/* Performer */}
            <span className="text-muted-foreground flex-shrink-0 text-[10px]">
              {tx.performedBy?.replace("system:gobiz_sync", "sync")}
            </span>

            {/* Timestamp */}
            <span className="text-muted-foreground flex-shrink-0 text-[10px] tabular-nums">
              {formatTimestamp(tx.createdAt)}
            </span>
          </div>
        );
      })}

      {/* Load More */}
      {status === "CanLoadMore" && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-xs mt-1"
          onClick={() => loadMore(20)}
        >
          Load more
        </Button>
      )}

      {status === "LoadingMore" && (
        <div className="text-center text-xs text-muted-foreground py-2">
          Loading...
        </div>
      )}
    </div>
  );
}
