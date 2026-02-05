/**
 * Inventory Manager Page
 *
 * Industrial warehouse aesthetic with location tabs,
 * component rows, and low stock alerts.
 */

import { useState, useMemo } from "react";
import { Package, Plus, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  const [receiveDialogOpen, setReceiveDialogOpen] = useState(false);

  // Queries
  const locations = useConvexStorageLocations(true);
  const report = useConvexInventoryReport(true);
  const lowStockAlerts = useConvexLowStockAlerts();

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

  // Calculate stats
  const totalComponents = report.matrix.length;
  const totalStockValue = report.matrix.reduce((sum, row) => {
    return (
      sum +
      row.stockByLocation.reduce(
        (locSum, loc) => locSum + loc.totalStock * loc.weightedUnitCostIdr,
        0
      )
    );
  }, 0);
  const totalReserved = report.matrix.reduce(
    (sum, row) => sum + row.totalReservedAcrossLocations,
    0
  );
  const lowStockCount = lowStockAlerts.length;

  // Filter matrix by location
  const filteredMatrix = useMemo(() => {
    if (selectedLocation === "all") {
      return report.matrix;
    }

    return report.matrix
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
  }, [report.matrix, selectedLocation]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Inventory"
        action={
          <Button onClick={() => setReceiveDialogOpen(true)} size="lg">
            <Plus className="h-5 w-5 mr-2" />
            Receive Stock
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
          variant="primary"
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
        <CardHeader className="border-b border-slate-700">
          <CardTitle className="text-xl font-mono tracking-tight text-slate-100">
            Stock Levels by Location
          </CardTitle>
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
              {filteredMatrix.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                  <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium mb-2">No inventory yet</p>
                  <p className="text-sm">
                    Click "Receive Stock" to add components
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredMatrix.map((row) => (
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
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Receive Stock Dialog */}
      <ReceiveStockDialog
        open={receiveDialogOpen}
        onOpenChange={setReceiveDialogOpen}
        locations={locations}
        lowStockComponents={lowStockAlerts.slice(0, 3).map((a) => a.component)}
      />
    </div>
  );
}
