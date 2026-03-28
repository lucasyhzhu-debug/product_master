/**
 * StockCount -- Daily stock count page for physical inventory reconciliation.
 *
 * Layout:
 * - PageHeader with back link to /inventory
 * - Location selector dropdown
 * - Product grid: product name | system count | actual count input
 * - Submit button (disabled until at least one row changes)
 * - Last counted timestamp per product (if available)
 *
 * Mobile: Single-column stacked layout with large input fields.
 */

import { useState, useMemo, useCallback } from "react";
import { ClipboardCheck, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/layout/PageHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import {
  useProductInventory,
  useBulkStockCount,
  useLastStockCount,
  useStorageLocations,
} from "@/hooks/convex";
import type { Id } from "../../convex/_generated/dataModel";

// ============================================================================
// HELPERS
// ============================================================================

/** Format a relative time string from a timestamp */
function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffMins = Math.floor(diffMs / 60_000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "yesterday";
  return `${diffDays}d ago`;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function StockCount() {
  const { user } = useAuth();
  const token = user?.token;

  // State
  const [selectedLocationId, setSelectedLocationId] = useState<
    Id<"storageLocations"> | undefined
  >(undefined);
  const [counts, setCounts] = useState<Map<string, number>>(new Map());
  const [globalNote, setGlobalNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Data loading
  const locations = useStorageLocations(true);
  const { stockOverview } = useProductInventory(selectedLocationId);
  const lastStockCounts = useLastStockCount(selectedLocationId);
  const bulkStockCount = useBulkStockCount();

  // Compute changed rows
  const changedRows = useMemo(() => {
    if (!stockOverview) return [];
    const changed: Array<{
      menuProductId: string;
      actualCount: number;
      systemCount: number;
    }> = [];

    for (const [menuProductId, actualCount] of counts.entries()) {
      const systemRow = stockOverview.find(
        (r) => (r.menuProduct?._id as string) === menuProductId
      );
      const systemQty = systemRow?.quantity ?? 0;
      if (actualCount !== systemQty) {
        changed.push({ menuProductId, actualCount, systemCount: systemQty });
      }
    }
    return changed;
  }, [counts, stockOverview]);

  const hasChanges = changedRows.length > 0;

  // Handle count input change
  const handleCountChange = useCallback(
    (menuProductId: string, value: string) => {
      const parsed = parseInt(value, 10);
      setCounts((prev) => {
        const next = new Map(prev);
        if (value === "" || isNaN(parsed)) {
          next.delete(menuProductId);
        } else {
          next.set(menuProductId, Math.max(0, parsed));
        }
        return next;
      });
    },
    []
  );

  // Handle location change -- clear counts
  const handleLocationChange = useCallback((value: string) => {
    setSelectedLocationId(value as Id<"storageLocations">);
    setCounts(new Map());
  }, []);

  // Submit stock count
  const handleSubmit = useCallback(async () => {
    if (!token || !selectedLocationId || changedRows.length === 0) return;

    setIsSubmitting(true);
    try {
      const countsPayload = changedRows.map((row) => ({
        menuProductId: row.menuProductId as Id<"menuProducts">,
        actualCount: row.actualCount,
        note: globalNote || undefined,
      }));

      const result = await bulkStockCount({
        token,
        locationId: selectedLocationId,
        counts: countsPayload,
      });

      toast.success(
        `Stock count saved: ${result.updated} product${result.updated !== 1 ? "s" : ""} updated, ${result.skipped} unchanged`
      );
      // Clear the counts map to reset form
      setCounts(new Map());
      setGlobalNote("");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save stock count"
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [token, selectedLocationId, changedRows, globalNote, bulkStockCount]);

  // Loading state
  const isLoadingProducts =
    selectedLocationId !== undefined && stockOverview === undefined;

  return (
    <div className="flex flex-col min-h-screen">
      <div className="flex-1 p-4 md:p-6 space-y-6 pb-28 md:pb-6">
        {/* Header */}
        <PageHeader
          title="Daily Stock Count"
          description="Enter physical counts to reconcile inventory"
          backTo="/inventory"
          backLabel="Inventory"
          badge={
            <ClipboardCheck className="h-5 w-5 text-muted-foreground" />
          }
        />

        {/* Location Selector */}
        <div className="max-w-md">
          <label className="text-sm font-medium text-muted-foreground mb-2 block">
            Location
          </label>
          <Select
            value={selectedLocationId ?? ""}
            onValueChange={handleLocationChange}
          >
            <SelectTrigger className="min-h-[44px]">
              <SelectValue placeholder="Select a location..." />
            </SelectTrigger>
            <SelectContent>
              {locations?.map((loc) => (
                <SelectItem key={loc._id} value={loc._id}>
                  {loc.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Empty state: no location selected */}
        {!selectedLocationId && (
          <div className="text-center py-16 text-muted-foreground">
            <ClipboardCheck className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg font-medium">Select a location to start counting</p>
            <p className="text-sm mt-1">
              Choose a storage location above to see products and enter counts
            </p>
          </div>
        )}

        {/* Loading state */}
        {isLoadingProducts && (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        )}

        {/* Empty state: no products at location */}
        {selectedLocationId &&
          stockOverview !== undefined &&
          stockOverview.length === 0 && (
            <div className="text-center py-16 text-muted-foreground">
              <p className="text-lg font-medium">
                No products found at this location
              </p>
              <p className="text-sm mt-1">
                Add stock to this location first via the Inventory page
              </p>
            </div>
          )}

        {/* Optional note */}
        {selectedLocationId && stockOverview && stockOverview.length > 0 && (
          <div className="max-w-md">
            <label className="text-sm font-medium text-muted-foreground mb-2 block">
              Note (optional)
            </label>
            <Input
              value={globalNote}
              onChange={(e) => setGlobalNote(e.target.value)}
              placeholder="e.g. Morning count, post-delivery check"
              className="min-h-[44px]"
            />
          </div>
        )}

        {/* Product grid */}
        {selectedLocationId && stockOverview && stockOverview.length > 0 && (
          <div className="space-y-2">
            {/* Header row (desktop) */}
            <div className="hidden md:grid md:grid-cols-[1fr_100px_120px_1fr] gap-4 px-4 py-2 text-sm font-medium text-muted-foreground border-b">
              <span>Product</span>
              <span className="text-center">System</span>
              <span className="text-center">Actual</span>
              <span>Status</span>
            </div>

            {stockOverview.map((row) => {
              if (!row.menuProduct) return null;

              const menuProductId = row.menuProduct._id as string;
              const systemQty = row.quantity;
              const enteredValue = counts.get(menuProductId);
              const hasEntry = enteredValue !== undefined;
              const delta = hasEntry ? enteredValue - systemQty : 0;
              const isChanged = hasEntry && delta !== 0;
              const isLargeDelta =
                hasEntry &&
                systemQty > 0 &&
                Math.abs(enteredValue - systemQty) > systemQty * 0.5;

              // Last counted info
              const lastCount = lastStockCounts?.[menuProductId];

              return (
                <div
                  key={row._id}
                  className={`
                    rounded-lg border p-3 md:p-4 transition-colors
                    ${isChanged ? "border-blue-300 bg-blue-50/50 dark:border-blue-700 dark:bg-blue-950/20" : ""}
                  `}
                >
                  {/* Mobile layout: stacked */}
                  <div className="flex flex-col gap-2 md:grid md:grid-cols-[1fr_100px_120px_1fr] md:items-center md:gap-4">
                    {/* Product name + last counted */}
                    <div>
                      <p className="font-medium text-sm md:text-base">
                        {row.menuProduct.name}
                      </p>
                      {row.menuProduct.code && (
                        <p className="text-xs text-muted-foreground">
                          {row.menuProduct.code}
                        </p>
                      )}
                      {lastCount && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Last counted: {formatRelativeTime(lastCount.countedAt)}{" "}
                          by {lastCount.countedBy}
                        </p>
                      )}
                    </div>

                    {/* System count */}
                    <div className="flex items-center gap-2 md:justify-center">
                      <span className="text-xs text-muted-foreground md:hidden">
                        System:
                      </span>
                      <span className="inline-flex items-center rounded-md bg-muted px-2.5 py-0.5 text-sm font-medium">
                        {systemQty}
                      </span>
                    </div>

                    {/* Actual count input */}
                    <div className="flex items-center gap-2 md:justify-center">
                      <span className="text-xs text-muted-foreground md:hidden">
                        Actual:
                      </span>
                      <Input
                        type="number"
                        min={0}
                        step={1}
                        value={hasEntry ? enteredValue : ""}
                        placeholder={String(systemQty)}
                        onChange={(e) =>
                          handleCountChange(menuProductId, e.target.value)
                        }
                        className="w-24 min-h-[44px] text-center font-medium"
                      />
                    </div>

                    {/* Status / delta */}
                    <div className="flex items-center gap-2">
                      {isChanged && (
                        <>
                          <span
                            className={`text-sm font-medium ${
                              delta > 0
                                ? "text-green-600 dark:text-green-400"
                                : "text-red-600 dark:text-red-400"
                            }`}
                          >
                            {delta > 0 ? "+" : ""}
                            {delta}
                          </span>
                          {isLargeDelta && (
                            <AlertTriangle className="h-4 w-4 text-amber-500" />
                          )}
                        </>
                      )}
                      {hasEntry && !isChanged && (
                        <span className="text-xs text-muted-foreground">
                          No change
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Sticky submit bar (mobile) / inline submit (desktop) */}
      {selectedLocationId && stockOverview && stockOverview.length > 0 && (
        <div className="sticky bottom-0 bg-background border-t p-4 md:relative md:border-t-0 md:pt-0 md:px-6 md:pb-6">
          <div className="flex items-center justify-between gap-4">
            <div className="text-sm text-muted-foreground">
              {hasChanges ? (
                <span className="font-medium text-foreground">
                  {changedRows.length} product
                  {changedRows.length !== 1 ? "s" : ""} changed
                </span>
              ) : (
                "Enter actual counts above"
              )}
            </div>
            <Button
              onClick={handleSubmit}
              disabled={!hasChanges || isSubmitting}
              className="min-w-[140px]"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <ClipboardCheck className="h-4 w-4 mr-2" />
                  Save Count
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
