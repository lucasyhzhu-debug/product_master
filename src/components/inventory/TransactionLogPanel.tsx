/**
 * TransactionLogPanel — Scrollable paginated list of product inventory transactions.
 *
 * Shows: timestamp, type badge, quantity, location, performed by, reason/order link.
 * Supports filtering by menuProductId, locationId, and transactionType.
 * Includes a type filter bar to isolate production adds from GoFood sync noise.
 *
 * Phase 74.5.2 Plan 08 — Hybrid GoFood display:
 *   - LEGACY rows: `transactionType === "gofood_sale"` (retained during the
 *     migration soak until the schema literal is dropped in 74.5.3).
 *   - MIGRATED rows: `transactionType === "channel_sale"` with
 *     `source === "gobiz"`.
 *   Both render identically as the "GoFood" branch. The `isGoFoodTransaction`
 *   helper centralizes the hybrid check; filter, label, and row ref display
 *   all use it.
 */

import { useState } from "react";
import { ShoppingCart, TrendingUp, RefreshCw, ArrowLeftRight, ClipboardCheck } from "lucide-react";
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

// Transaction type display config — covers all schema types
const TX_CONFIG = {
  add: {
    label: "Production",
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
  channel_sale: {
    // Default channel_sale rendering — overridden to the GoFood branch via
    // resolveDisplayConfig when source === "gobiz" (hybrid).
    label: "Channel sale",
    color: "bg-[var(--color-status-info-bg)] text-[var(--color-status-info)] border-[var(--color-status-info)]/30",
    icon: ShoppingCart,
    iconColor: "text-[var(--color-status-info)]",
  },
  adjust: {
    label: "Adjusted",
    color: "bg-[var(--color-status-warning-bg)] text-[var(--color-status-warning)] border-[var(--color-status-warning)]/30",
    icon: RefreshCw,
    iconColor: "text-[var(--color-status-warning)]",
  },
  transfer: {
    label: "Transfer",
    color: "bg-purple-50 text-purple-700 border-purple-300/30 dark:bg-purple-950 dark:text-purple-300",
    icon: ArrowLeftRight,
    iconColor: "text-purple-600 dark:text-purple-400",
  },
  stock_count: {
    label: "Count",
    color: "bg-sky-50 text-sky-700 border-sky-300/30 dark:bg-sky-950 dark:text-sky-300",
    icon: ClipboardCheck,
    iconColor: "text-sky-600 dark:text-sky-400",
  },
} as const;

type TransactionType = keyof typeof TX_CONFIG;

/**
 * Hybrid GoFood predicate (Phase 74.5.2 Plan 08).
 *
 * A row is a GoFood transaction when EITHER:
 *   - `transactionType === "gofood_sale"` (LEGACY, pre-migration), OR
 *   - `transactionType === "channel_sale"` AND `source === "gobiz"` (MIGRATED
 *     or post-cutover new writes).
 */
function isGoFoodTransaction(tx: {
  transactionType: string;
  source?: string;
}): boolean {
  if (tx.transactionType === "gofood_sale") return true;
  if (tx.transactionType === "channel_sale" && tx.source === "gobiz") return true;
  return false;
}

/**
 * Resolve the effective display config for a transaction row. Centralizes the
 * hybrid GoFood mapping so the badge label, color, and icon stay consistent
 * across legacy and migrated rows.
 */
function resolveDisplayConfig(tx: {
  transactionType: string;
  source?: string;
}): (typeof TX_CONFIG)[TransactionType] {
  // GoFood hybrid: migrated (channel_sale + gobiz) renders the same as legacy.
  if (tx.transactionType === "channel_sale" && tx.source === "gobiz") {
    return TX_CONFIG.gofood_sale;
  }
  const key = tx.transactionType as TransactionType;
  return (key in TX_CONFIG ? TX_CONFIG[key] : TX_CONFIG.adjust);
}

// Filter options for the type filter bar
// The GoFood filter value remains "gofood_sale" for backwards-compat with any
// bookmarked state; the click handler below expands it to match BOTH the
// legacy literal AND the migrated channel_sale + source=gobiz rows.
const TYPE_FILTERS: Array<{ value: string | undefined; label: string }> = [
  { value: undefined, label: "All" },
  { value: "add", label: "Production" },
  { value: "gofood_sale", label: "GoFood" },
  { value: "drawdown", label: "Orders" },
  { value: "transfer", label: "Transfers" },
  { value: "adjust", label: "Adjustments" },
  { value: "stock_count", label: "Counts" },
];

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
  const [typeFilter, setTypeFilter] = useState<string | undefined>(undefined);

  // Phase 74.5.2 Plan 08 — hybrid GoFood filtering.
  // When the user selects the "GoFood" chip (value="gofood_sale"), the
  // server-side filter would only return LEGACY rows. Post-migration rows
  // live as `channel_sale + source=gobiz`. To avoid hiding them, we disable
  // the server-side filter for this case and apply `isGoFoodTransaction`
  // client-side over the unfiltered stream. All other filters pass through
  // unchanged.
  const isGoFoodFilter = typeFilter === "gofood_sale";
  const serverTransactionType = isGoFoodFilter ? undefined : typeFilter;

  const { results, status, loadMore } = useProductInventoryTransactions({
    menuProductId,
    locationId,
    transactionType: serverTransactionType,
  });

  const displayedResults = isGoFoodFilter
    ? results.filter((tx) =>
        isGoFoodTransaction({ transactionType: tx.transactionType, source: tx.source })
      )
    : results;

  return (
    <div className="space-y-2">
      {/* Type filter bar */}
      <div className="flex flex-wrap gap-1">
        {TYPE_FILTERS.map((filter) => (
          <button
            key={filter.value ?? "all"}
            type="button"
            className={cn(
              "px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors",
              typeFilter === filter.value
                ? "bg-foreground text-background border-foreground"
                : "bg-transparent text-muted-foreground border-border hover:border-foreground/30 hover:text-foreground"
            )}
            onClick={() => setTypeFilter(filter.value)}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {/* Loading state */}
      {status === "LoadingFirstPage" && (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      )}

      {/* Empty state */}
      {status !== "LoadingFirstPage" && displayedResults.length === 0 && (
        <div className="py-4 text-center text-sm text-muted-foreground">
          {typeFilter ? `No ${TYPE_FILTERS.find(f => f.value === typeFilter)?.label.toLowerCase() ?? typeFilter} transactions` : "No transactions yet"}
          {isGoFoodFilter && status === "CanLoadMore" && (
            <div className="mt-2 text-xs">
              GoFood rows are interleaved with other types — load more pages to
              find older transactions.
            </div>
          )}
        </div>
      )}

      {/* Sparse-page hint: GoFood filter client-side narrows the loaded page,
          so even when some rows exist, older GoFood transactions may be on
          later pages. SOAK BRIDGE: remove in 74.5.3 once server-side filter
          switches to channel_sale+source=gobiz (after gofood_sale literal drop). */}
      {isGoFoodFilter &&
        status === "CanLoadMore" &&
        displayedResults.length > 0 &&
        displayedResults.length < 5 && (
          <div className="py-2 text-center text-xs text-muted-foreground">
            Showing {displayedResults.length} GoFood row{displayedResults.length === 1 ? "" : "s"} on the current page. Load more to see older transactions.
          </div>
        )}

      {/* Transaction list */}
      {displayedResults.length > 0 && (
        <div className="space-y-1.5">
          {displayedResults.map((tx) => {
            const config = resolveDisplayConfig({
              transactionType: tx.transactionType,
              source: tx.source,
            });
            const Icon = config.icon;
            const isPositive = tx.quantity > 0;
            // Hybrid GoFood ref display: legacy `gofoodOrderRef` for
            // pre-migration rows; `externalRef` for migrated/post-cutover
            // rows (written by processChannelSaleInternal). Both surface as
            // the same right-aligned small-text label.
            const isGoFoodRow = isGoFoodTransaction({
              transactionType: tx.transactionType,
              source: tx.source,
            });
            const refLabel = isGoFoodRow
              ? (tx.gofoodOrderRef ?? tx.externalRef)
              : tx.gofoodOrderRef;

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
                {refLabel && (
                  <span className="text-muted-foreground truncate text-[10px]">
                    {refLabel}
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
      )}
    </div>
  );
}
