/**
 * OutletStockDetail - Stock detail view per product for a single outlet
 *
 * Displays detailed stock information for each product at a K3 Mart outlet.
 * Shows current stock, sales metrics, and planned dispatches.
 * Extracted from ExpandedOutletPanel for testability and reuse.
 */

import React from "react";
import { Package } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface OutletStockDetailProps {
  products: Array<{
    menuProductId: string;
    productName: string;
    externalProductCode: string;
    currentStock: number;
    soldToday: number;
    avgDailySales: number;
    /** Days of stock remaining at avg rate */
    daysOfStock: number;
    /** Today's planned dispatch qty (if any) */
    plannedQty?: number;
    /** Today's plan status */
    planStatus?: "draft" | "confirmed" | "submitted" | "partial" | "failed";
  }>;
  outletName: string;
}

/**
 * Get color class for days of stock remaining
 */
function getDaysColor(days: number): {
  textColor: string;
  bgColor: string;
} {
  if (days <= 1) {
    return {
      textColor: "text-red-500",
      bgColor: "bg-red-50 dark:bg-red-950/20",
    };
  }
  if (days <= 3) {
    return {
      textColor: "text-amber-500",
      bgColor: "bg-amber-50 dark:bg-amber-950/20",
    };
  }
  return {
    textColor: "text-green-600",
    bgColor: "bg-transparent",
  };
}

/**
 * Get badge variant for plan status
 */
function getPlanStatusVariant(
  status: "draft" | "confirmed" | "submitted" | "partial" | "failed" | undefined
): "default" | "secondary" | "outline" | "destructive" {
  switch (status) {
    case "confirmed":
    case "submitted":
      return "default";
    case "partial":
      return "secondary";
    case "failed":
      return "destructive";
    default:
      return "outline";
  }
}

export const OutletStockDetail = React.memo(function OutletStockDetail({
  products,
  outletName,
}: OutletStockDetailProps) {
  if (products.length === 0) {
    return (
      <div className="p-4 text-center text-sm text-muted-foreground">
        No stock data available for {outletName}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {/* Section Header */}
      <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 px-3 pt-2">
        Stock Details
      </h4>

      {/* Product Rows */}
      <div className="divide-y divide-gray-100">
        {products.map((product, index) => {
          const { textColor, bgColor } = getDaysColor(product.daysOfStock);

          return (
            <div
              key={product.menuProductId}
              className={cn(
                "py-1.5 px-3 flex items-center gap-3 transition-colors hover:bg-gray-50/50",
                index % 2 === 1 && "bg-gray-50/50"
              )}
            >
              {/* Product Icon */}
              <div
                className="flex-shrink-0 h-7 w-7 rounded flex items-center justify-center"
                style={{
                  backgroundColor: "var(--color-k3mart-light, #f0fdf4)",
                }}
              >
                <Package
                  className="h-3.5 w-3.5"
                  style={{ color: "var(--color-k3mart, #22c55e)" }}
                />
              </div>

              {/* Product Info */}
              <div className="flex-1 min-w-0">
                {/* Product Name */}
                <p className="text-sm font-medium truncate">{product.productName}</p>

                {/* Stats Row */}
                <div className="flex items-center gap-3 mt-0.5 text-[11px] text-gray-600">
                  <span className="font-mono tabular-nums">
                    <span className="font-semibold text-gray-900">{product.currentStock}</span> stock
                  </span>
                  <span className="text-gray-400">•</span>
                  <span className="font-mono tabular-nums">{product.soldToday} sold</span>
                  <span className="text-gray-400">•</span>
                  <span className="font-mono tabular-nums">{product.avgDailySales.toFixed(1)}/day</span>
                </div>
              </div>

              {/* Days of Stock Badge */}
              <div className="flex-shrink-0 flex items-center gap-2">
                <div
                  className={cn(
                    "px-2 py-1 rounded text-[11px] font-semibold tabular-nums",
                    textColor,
                    bgColor
                  )}
                >
                  {product.daysOfStock.toFixed(1)}d
                </div>

                {/* Planned Dispatch Badge (if exists) */}
                {product.plannedQty !== undefined && product.plannedQty > 0 && (
                  <Badge
                    variant={getPlanStatusVariant(product.planStatus)}
                    className="text-[10px] px-1.5 py-0.5 h-5"
                  >
                    Plan: {product.plannedQty}
                  </Badge>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});
