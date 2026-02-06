/**
 * Inventory Manager Page
 *
 * Industrial warehouse aesthetic with location tabs,
 * component rows, and low stock alerts.
 */

import { useState, useMemo } from "react";
import { Package, Plus, AlertTriangle, Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PageHeader } from "@/components/layout";
import {
  useConvexStorageLocations,
  useConvexInventoryReport,
  useConvexLowStockAlerts,
} from "@/hooks/convex";
import type { Id } from "../../convex/_generated/dataModel";
import { formatCurrency } from "@/lib/utils";
import { LowStockAlertsBanner } from "@/components/inventory/LowStockAlertsBanner";
import { ComponentRow } from "@/components/inventory/ComponentRow";
import { ReceiveStockDialog } from "@/components/inventory/ReceiveStockDialog";
import { StatCard } from "@/components/inventory/StatCard";

export function InventoryManager() {

  const [selectedLocation, setSelectedLocation] = useState<
    Id<"storageLocations"> | "all"
  >("all");
  const [categoryFilter, setCategoryFilter] = useState<"all" | "production" | "packaging">("all");
  const [sortBy, setSortBy] = useState<"name" | "percent_lowest" | "count_lowest" | "most_expensive">("name");
  const [receiveDialogOpen, setReceiveDialogOpen] = useState(false);
  const [showLegacy, setShowLegacy] = useState(false);

  // Queries - get ALL components (active + legacy) so we can split client-side
  const locations = useConvexStorageLocations(true);
  const report = useConvexInventoryReport(false);
  const lowStockAlerts = useConvexLowStockAlerts();

  // Split matrix into active and legacy, then filter by location and category
  const { activeMatrix, legacyMatrix } = useMemo(() => {
    if (!report) return { activeMatrix: [], legacyMatrix: [] };

    const applyFilters = (matrix: typeof report.matrix) => {
      let filtered = matrix;

      // Apply category filter
      if (categoryFilter !== "all") {
        filtered = filtered.filter((row) => row.component.category === categoryFilter);
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
  }, [report, selectedLocation, categoryFilter, sortBy]);

  // Loading state
  if (
    locations === undefined ||
    report === undefined ||
    lowStockAlerts === undefined
  ) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64" />
        <div className="grid gap-4 lg:grid-cols-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  // Calculate stats from active components only
  const activeRows = report.matrix.filter((row) => row.component.isActive !== false);
  const legacyCount = report.matrix.length - activeRows.length;
  const totalComponents = activeRows.length;
  const totalStockValue = activeRows.reduce((sum, row) => {
    return (
      sum +
      row.stockByLocation.reduce(
        (locSum, loc) => locSum + loc.totalStock * loc.weightedUnitCostIdr,
        0
      )
    );
  }, 0);
  const totalReserved = activeRows.reduce(
    (sum, row) => sum + row.totalReservedAcrossLocations,
    0
  );
  const lowStockCount = lowStockAlerts.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Inventory"
        action={
          <Button
            onClick={() => setReceiveDialogOpen(true)}
            size="lg"
            className="bg-gradient-to-r from-[#E07856] to-[#D66A4A] hover:from-[#D66A4A] hover:to-[#C55A3A] text-white shadow-lg hover:shadow-xl transition-all duration-300"
          >
            <Plus className="h-5 w-5 mr-2" />
            Receive New Stock Type
          </Button>
        }
      />

      {/* Low Stock Alerts */}
      {lowStockAlerts.length > 0 && (
        <LowStockAlertsBanner alerts={lowStockAlerts} />
      )}

      {/* Stats Cards */}
      <div className="grid gap-4 lg:grid-cols-4">
        <StatCard
          title="Total Components"
          value={totalComponents}
          icon={<Package className="h-5 w-5" />}
          variant="terracotta"
        />
        <StatCard
          title="Stock Value"
          value={formatCurrency(totalStockValue)}
          icon={<Package className="h-5 w-5" />}
          variant="success"
        />
        <StatCard
          title="Reserved Units"
          value={totalReserved}
          icon={<Package className="h-5 w-5" />}
          variant="warning"
        />
        <StatCard
          title="Low Stock Items"
          value={lowStockCount}
          icon={<AlertTriangle className="h-5 w-5" />}
          variant={lowStockCount > 0 ? "danger" : "default"}
        />
      </div>

      {/* Location Tabs */}
      <Card className="border-slate-700 bg-gradient-to-br from-slate-800/80 via-slate-800/60 to-slate-900/80">
        <CardHeader className="border-b border-slate-700 border-b-[#E07856]/20">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle className="text-xl font-mono tracking-tight text-slate-100">
              Stock Levels by Location
            </CardTitle>
            <div className="flex flex-wrap gap-3">
              {/* Category Filter */}
              <div className="flex gap-1.5">
                {(["all", "production", "packaging"] as const).map((cat) => (
                  <Badge
                    key={cat}
                    variant={categoryFilter === cat ? "default" : "outline"}
                    className={`cursor-pointer text-xs px-3 py-1 transition-colors ${
                      categoryFilter === cat
                        ? "bg-[#E07856] text-white border-[#E07856] hover:bg-[#D66A4A]"
                        : "bg-slate-700/50 text-slate-300 border-slate-600 hover:bg-slate-600/50"
                    }`}
                    onClick={() => setCategoryFilter(cat)}
                  >
                    {cat === "all" ? "All" : cat.charAt(0).toUpperCase() + cat.slice(1)}
                  </Badge>
                ))}
              </div>
              {/* Sort Controls */}
              <div className="flex gap-1.5 border-l border-slate-700 pl-3">
                {([
                  { key: "name", label: "Name" },
                  { key: "percent_lowest", label: "% Lowest" },
                  { key: "count_lowest", label: "# Lowest" },
                  { key: "most_expensive", label: "Priciest" },
                ] as const).map(({ key, label }) => (
                  <Badge
                    key={key}
                    variant={sortBy === key ? "default" : "outline"}
                    className={`cursor-pointer text-xs px-3 py-1 transition-colors ${
                      sortBy === key
                        ? "bg-slate-600 text-white border-slate-500 hover:bg-slate-500"
                        : "bg-slate-700/50 text-slate-400 border-slate-600 hover:bg-slate-600/50"
                    }`}
                    onClick={() => setSortBy(key)}
                  >
                    {label}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <Tabs
            value={selectedLocation}
            onValueChange={(value) =>
              setSelectedLocation(value as Id<"storageLocations"> | "all")
            }
          >
            <TabsList className="mb-6 bg-slate-700/50">
              <TabsTrigger value="all" className="font-mono">
                All Locations
              </TabsTrigger>
              {locations.map((loc) => (
                <TabsTrigger
                  key={loc._id}
                  value={loc._id}
                  className="font-mono"
                >
                  {loc.name}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value={selectedLocation} className="mt-0">
              {/* Active Components */}
              {activeMatrix.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                  <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium mb-2">No inventory yet</p>
                  <p className="text-sm">
                    Click "Receive Stock" to add components
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
                      locations={report.locations}
                    />
                  ))}
                </div>
              )}

              {/* Legacy Components Section */}
              {legacyCount > 0 && (
                <div className="mt-6 pt-4 border-t border-slate-700/50">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowLegacy(!showLegacy)}
                    className="mb-3 text-slate-400 hover:text-slate-200"
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
                          locations={report.locations}
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

      {/* Receive Stock Dialog (top button - force create mode for new stock types) */}
      <ReceiveStockDialog
        open={receiveDialogOpen}
        onOpenChange={setReceiveDialogOpen}
        locations={locations}
        lowStockComponents={lowStockAlerts.slice(0, 3).map((a) => a.component)}
        forceCreateMode
      />
    </div>
  );
}
