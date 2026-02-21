/**
 * Inventory Manager Page
 *
 * 3-tab layout:
 * - Packaging: Packaging component inventory (existing)
 * - Ingredients: Production/ingredient inventory (existing)
 * - Finished Goods: Finished goods stock by location (new, Plan 17.1)
 */

import { useState, useMemo } from "react";
import { Package, Plus, Archive, Search, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PageHeader } from "@/components/layout";
import {
  useConvexStorageLocations,
  useConvexInventoryReport,
  useConvexLowStockAlerts,
} from "@/hooks/convex";
import type { Id } from "../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { LowStockAlertsBanner } from "@/components/inventory/LowStockAlertsBanner";
import { ComponentRow } from "@/components/inventory/ComponentRow";
import { ReceiveStockDialog } from "@/components/inventory/ReceiveStockDialog";
import { FinishedGoodsTab } from "@/components/inventory/FinishedGoodsTab";

export function InventoryManager() {
  // Top-level tab: packaging | ingredients | finished_goods
  const [mainTab, setMainTab] = useState<"packaging" | "ingredients" | "finished_goods">("packaging");

  const [selectedLocation, setSelectedLocation] = useState<
    Id<"storageLocations"> | "all"
  >("all");
  const [sortBy, setSortBy] = useState<"name" | "percent_lowest" | "count_lowest" | "most_expensive">("name");
  const [receiveDialogOpen, setReceiveDialogOpen] = useState(false);
  const [showLegacy, setShowLegacy] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Queries - get ALL components (active + legacy) so we can split client-side
  const locations = useConvexStorageLocations(true);
  const report = useConvexInventoryReport(false);
  const lowStockAlerts = useConvexLowStockAlerts();

  // Derive effective category filter from main tab selection
  const effectiveCategoryFilter: "all" | "production" | "packaging" =
    mainTab === "packaging"
      ? "packaging"
      : mainTab === "ingredients"
        ? "production"
        : "all";

  // Split matrix into active and legacy, then filter by location, category, and search
  const { activeMatrix, legacyMatrix } = useMemo(() => {
    if (!report) return { activeMatrix: [], legacyMatrix: [] };

    const applyFilters = (matrix: typeof report.matrix) => {
      let filtered = matrix;

      // Apply search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        filtered = filtered.filter((row) =>
          row.component.name.toLowerCase().includes(q) ||
          row.component.code.toLowerCase().includes(q)
        );
      }

      // Apply effective category filter
      if (effectiveCategoryFilter !== "all") {
        filtered = filtered.filter((row) => row.component.category === effectiveCategoryFilter);
      }

      // Apply location filter
      if (selectedLocation === "all") {
        return filtered;
      }

      return filtered
        .map((row) => {
          const stockAtLocation = row.stockByLocation.find(
            (loc) => loc.locationId === selectedLocation
          );

          // Production components always show (informational/BOM-level rows).
          // They may have zero stock at a location but must not be hidden.
          if (row.component.category === "production") {
            return {
              ...row,
              stockByLocation: stockAtLocation ? [stockAtLocation] : [],
              totalAcrossLocations: stockAtLocation?.totalStock ?? 0,
              totalReservedAcrossLocations: stockAtLocation?.totalReserved ?? 0,
              totalAvailable: stockAtLocation?.available ?? 0,
            };
          }

          // Packaging: only show if stock exists at this location
          if (!stockAtLocation || stockAtLocation.totalStock === 0) {
            return null;
          }

          return {
            ...row,
            stockByLocation: [stockAtLocation],
            totalAcrossLocations: stockAtLocation.totalStock,
            totalReservedAcrossLocations: stockAtLocation.totalReserved,
            totalAvailable: stockAtLocation.available,
          };
        })
        .filter((row): row is NonNullable<typeof row> => row !== null);
    };

    const applySorting = (matrix: ReturnType<typeof applyFilters>) => {
      return [...matrix].sort((a, b) => {
        switch (sortBy) {
          case "percent_lowest": {
            const aPercent = a.component.reorderPoint && a.component.reorderPoint > 0
              ? a.totalAvailable / a.component.reorderPoint
              : Infinity;
            const bPercent = b.component.reorderPoint && b.component.reorderPoint > 0
              ? b.totalAvailable / b.component.reorderPoint
              : Infinity;
            return aPercent - bPercent;
          }
          case "count_lowest":
            return a.totalAvailable - b.totalAvailable;
          case "most_expensive": {
            const aMaxCost = Math.max(...a.stockByLocation.map(s => s.weightedUnitCostIdr), 0);
            const bMaxCost = Math.max(...b.stockByLocation.map(s => s.weightedUnitCostIdr), 0);
            if (aMaxCost === 0 && bMaxCost === 0) return a.component.name.localeCompare(b.component.name);
            return bMaxCost - aMaxCost;
          }
          default: // "name"
            return a.component.name.localeCompare(b.component.name);
        }
      });
    };

    const active = report.matrix.filter((row) => row.component.isActive !== false);
    const legacy = report.matrix.filter((row) => row.component.isActive === false);

    return {
      activeMatrix: applySorting(applyFilters(active)),
      legacyMatrix: applySorting(applyFilters(legacy)),
    };
  }, [report, selectedLocation, effectiveCategoryFilter, sortBy, searchQuery]);

  // Loading state — only applies to packaging/ingredients tabs
  if (
    mainTab !== "finished_goods" &&
    (locations === undefined ||
      report === undefined ||
      lowStockAlerts === undefined)
  ) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-12 w-full" />
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      </div>
    );
  }

  const legacyCount = report
    ? report.matrix.filter((row) => row.component.isActive === false).length
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Inventory"
        description="Stock levels and receiving"
        action={
          mainTab !== "finished_goods" ? (
            <Button
              onClick={() => setReceiveDialogOpen(true)}
              className="shadow-md hover:shadow-lg transition-all duration-300"
            >
              <Plus className="h-4 w-4 mr-2" />
              New Stock Type
            </Button>
          ) : undefined
        }
      />

      {/* Top-level section tabs */}
      <Tabs
        value={mainTab}
        onValueChange={(v) => setMainTab(v as typeof mainTab)}
      >
        <TabsList>
          <TabsTrigger value="packaging">
            <Package className="h-4 w-4 mr-2" />
            Packaging
          </TabsTrigger>
          <TabsTrigger value="ingredients">
            <Package className="h-4 w-4 mr-2" />
            Ingredients
          </TabsTrigger>
          <TabsTrigger value="finished_goods">
            <ShoppingBag className="h-4 w-4 mr-2" />
            Finished Goods
          </TabsTrigger>
        </TabsList>

        {/* ============ PACKAGING / INGREDIENTS tab content ============ */}
        {mainTab !== "finished_goods" && (
          <div className="space-y-4 mt-4">
            {/* Low Stock Alerts */}
            {lowStockAlerts && lowStockAlerts.length > 0 && (
              <LowStockAlertsBanner alerts={lowStockAlerts} />
            )}

            {/* Main Stock Card */}
            <Card>
              <CardHeader className="pb-4">
                <div className="flex flex-col gap-4">
                  {/* Search + Filters Row */}
                  <div className="flex items-center gap-3 flex-wrap">
                    {/* Search */}
                    <div className="relative flex-1 min-w-[200px] max-w-sm">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search components..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9 h-9"
                      />
                    </div>

                    {/* Sort Controls */}
                    <div className="flex gap-1.5 border-l pl-3">
                      {([
                        { key: "name", label: "Name" },
                        { key: "percent_lowest", label: "% Lowest" },
                        { key: "count_lowest", label: "# Lowest" },
                        { key: "most_expensive", label: "Priciest" },
                      ] as const).map(({ key, label }) => (
                        <Badge
                          key={key}
                          variant={sortBy === key ? "default" : "outline"}
                          className={cn(
                            "cursor-pointer text-xs px-3 py-1 transition-colors",
                            sortBy === key
                              ? "bg-foreground text-background"
                              : "hover:bg-muted"
                          )}
                          onClick={() => setSortBy(key)}
                        >
                          {label}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <Tabs
                  value={selectedLocation}
                  onValueChange={(value) =>
                    setSelectedLocation(value as Id<"storageLocations"> | "all")
                  }
                >
                  <TabsList className="mb-4">
                    <TabsTrigger value="all">
                      All Locations
                    </TabsTrigger>
                    {locations && locations.map((loc) => (
                      <TabsTrigger
                        key={loc._id}
                        value={loc._id}
                      >
                        {loc.name}
                      </TabsTrigger>
                    ))}
                  </TabsList>

                  <TabsContent value={selectedLocation} className="mt-0">
                    {/* Active Components */}
                    {activeMatrix.length === 0 ? (
                      <div className="py-16 text-center">
                        <div className="bg-muted/50 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                          <Package className="h-8 w-8 text-muted-foreground" />
                        </div>
                        <p className="text-base font-medium mb-1">No inventory yet</p>
                        <p className="text-sm text-muted-foreground">
                          Click "New Stock Type" to add components
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {activeMatrix.map((row) => (
                          <ComponentRow
                            key={row.component._id}
                            component={row.component}
                            stockByLocation={row.stockByLocation}
                            totalAvailable={row.totalAvailable}
                            totalReserved={row.totalReservedAcrossLocations}
                            isLowStock={row.isLowStock}
                            locations={report!.locations}
                          />
                        ))}
                      </div>
                    )}

                    {/* Legacy Components Section */}
                    {legacyCount > 0 && (
                      <div className="mt-6 pt-4 border-t">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowLegacy(!showLegacy)}
                          className="mb-3 text-muted-foreground"
                        >
                          <Archive className="h-4 w-4 mr-2" />
                          {showLegacy ? "Hide" : "Show"} Legacy Inventory ({legacyCount})
                        </Button>

                        {showLegacy && legacyMatrix.length > 0 && (
                          <div className="space-y-2 opacity-60">
                            {legacyMatrix.map((row) => (
                              <ComponentRow
                                key={row.component._id}
                                component={row.component}
                                stockByLocation={row.stockByLocation}
                                totalAvailable={row.totalAvailable}
                                totalReserved={row.totalReservedAcrossLocations}
                                isLowStock={row.isLowStock}
                                locations={report!.locations}
                                isLegacy
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ============ FINISHED GOODS tab content ============ */}
        <TabsContent value="finished_goods" className="mt-4">
          <FinishedGoodsTab />
        </TabsContent>
      </Tabs>

      {/* Receive Stock Dialog (packaging/ingredients only) */}
      {mainTab !== "finished_goods" && locations && lowStockAlerts && (
        <ReceiveStockDialog
          open={receiveDialogOpen}
          onOpenChange={setReceiveDialogOpen}
          locations={locations}
          lowStockComponents={lowStockAlerts.slice(0, 3).map((a) => a.component)}
          forceCreateMode
        />
      )}
    </div>
  );
}
