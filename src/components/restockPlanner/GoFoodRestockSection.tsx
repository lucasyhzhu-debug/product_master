/**
 * GoFoodRestockSection
 *
 * Read-only section displayed on the Restock Planner page showing
 * GoFood depot restock suggestions per outlet, per product.
 *
 * Data is sourced from the same getRestockSuggestions query used by
 * the GoFood Depot Cockpit page, ensuring consistent numbers.
 */

import { useState } from "react";
import { useQuery } from "convex/react";
import { useNavigate } from "react-router-dom";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Truck, ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

// ─── Per-outlet restock table ───

function OutletRestockTable({
  outletId,
  outletName,
}: {
  outletId: Id<"externalOutlets">;
  outletName: string;
}) {
  const navigate = useNavigate();
  const restockData = useQuery(api.gofoodDepot.queries.getRestockSuggestions, { outletId });
  const depotStock = useQuery(api.gofoodDepot.queries.getDepotStock, { outletId });

  const isLoading = restockData === undefined || depotStock === undefined;

  // Build a map from menuProductId -> current stock quantity at the outlet's linked location
  const stockMap = new Map<string, number | null>();
  if (depotStock) {
    for (const row of depotStock) {
      // productInventoryQty is the stock at the outlet's linked storage location
      stockMap.set(row.menuProductId as string, row.productInventoryQty);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-2 p-4">
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-3/4" />
      </div>
    );
  }

  if (!restockData || restockData.suggestions.length === 0) {
    return (
      <div className="px-4 py-6 text-center text-sm text-muted-foreground">
        No sales data for {outletName}
      </div>
    );
  }

  // Sort by product name for consistent ordering
  const sorted = [...restockData.suggestions].sort((a, b) =>
    a.productName.localeCompare(b.productName)
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] text-muted-foreground uppercase tracking-wider border-b">
            <th className="py-2 px-4 text-left font-medium">Product</th>
            <th className="py-2 px-3 text-right font-medium">Current Stock</th>
            <th className="py-2 px-3 text-right font-medium">Restock Tomorrow</th>
            <th className="py-2 px-3 text-left font-medium">Breakdown</th>
            <th className="py-2 px-3" />
          </tr>
        </thead>
        <tbody className="divide-y">
          {sorted.map((s) => {
            const currentStock = stockMap.get(s.menuProductId);
            return (
              <tr key={s.menuProductId} className="hover:bg-muted/50 transition-colors">
                <td className="py-2 px-4 font-medium">{s.productName}</td>
                <td className="py-2 px-3 text-right font-mono text-xs">
                  {currentStock !== null && currentStock !== undefined
                    ? currentStock
                    : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="py-2 px-3 text-right">
                  <span className="font-bold text-foreground">{s.suggestion}</span>
                </td>
                <td className="py-2 px-3 text-xs text-muted-foreground">
                  {s.breakdown}
                </td>
                <td className="py-2 px-3">
                  <button
                    className="text-xs text-orange-600 hover:text-orange-700 dark:text-orange-400 hover:underline whitespace-nowrap"
                    onClick={() => navigate('/inventory')}
                    title="Open Inventory to transfer this stock"
                  >
                    Transfer →
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main exported section ───

export function GoFoodRestockSection() {
  const [expanded, setExpanded] = useState(true);

  const outlets = useQuery(api.externalData.queries.listOutlets, { source: "gobiz" });
  const isLoading = outlets === undefined;

  if (!isLoading && (!outlets || outlets.length === 0)) {
    return null;
  }

  return (
    <section className="space-y-3">
      {/* Section header */}
      <div className="flex items-center gap-2">
        <Badge
          variant="outline"
          className="text-xs gap-1 border-orange-500/30 bg-orange-500/5 text-orange-700 dark:text-orange-400"
        >
          <Truck className="h-3.5 w-3.5" />
          GoFood Depot Restock
        </Badge>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
          aria-label={expanded ? "Collapse GoFood depot restock section" : "Expand GoFood depot restock section"}
        >
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
          {expanded ? "Collapse" : "Expand"}
        </button>
      </div>

      {/* Always-visible usage guidance */}
      <div className="rounded-md border border-orange-200/60 bg-orange-50/50 dark:border-orange-500/20 dark:bg-orange-500/5 px-4 py-3 text-sm space-y-1.5">
        <p className="text-foreground">
          <span className="font-medium">How to use:</span>{" "}
          <span className="text-muted-foreground">
            These numbers show how many units to send to each GoFood depot for tomorrow.
            The calculation uses a 3-day sales average (Mon: full week; Fri/Sat: +2 days buffer; other days: +1).
          </span>
        </p>
        <p className="text-foreground">
          <span className="font-medium">To restock:</span>{" "}
          <span className="text-muted-foreground">
            Pack the suggested quantity, then go to{" "}
            <span className="font-medium text-foreground">Inventory → Finished Goods → Move Stock</span>{" "}
            and transfer from Kitchen to the depot storage location.
          </span>
        </p>
      </div>

      {/* Collapsible content */}
      {expanded && (
        <div className="space-y-3">
          {isLoading ? (
            <div className="rounded-lg border bg-card p-4 space-y-2">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-full" />
            </div>
          ) : (
            outlets!.map((outlet) => (
              <div key={outlet._id} className="rounded-lg border bg-card overflow-hidden">
                {/* Outlet header */}
                <div className="flex items-center justify-between px-4 py-2.5 border-b bg-muted/30">
                  <h3 className="text-sm font-semibold">{outlet.name}</h3>
                  <span className="text-xs text-muted-foreground">Read-only</span>
                </div>
                <OutletRestockTable
                  outletId={outlet._id}
                  outletName={outlet.name}
                />
              </div>
            ))
          )}
        </div>
      )}
    </section>
  );
}
