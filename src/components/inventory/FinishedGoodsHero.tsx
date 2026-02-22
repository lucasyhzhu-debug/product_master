/**
 * FinishedGoodsHero — Hero summary section for the Finished Goods inventory tab.
 *
 * Displays:
 * - Grand total per product type (sum across all locations)
 * - Location-type breakdown: Internal / GoFood Outlets / K3Mart
 * - Low-stock and zero-stock alert count
 *
 * Data source: getStockOverviewGrouped query (from plan 19-01)
 * Computation is done client-side from the flat grouped data.
 */

import { Package, MapPin, AlertTriangle, TrendingDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// ============================================================================
// TYPES
// ============================================================================

type LocationEntry = {
  locationId: string;
  locationName: string;
  locationType: string;
  quantity: number;
  isLowStock: boolean;
  effectiveThreshold: number;
};

type ProductGroup = {
  menuProductId: string;
  menuProductName: string;
  menuProductCode: string;
  isActive: boolean;
  defaultPrice: number;
  locations: LocationEntry[];
  totalQuantity: number;
};

// Location type buckets:
// - Internal:       office | kitchen
// - GoFood Outlets: depot (locations linked to gobiz externalOutlet)
//                   For now we bucket ALL depot-type locations here.
// - K3Mart:         venue (K3Mart-linked consignment)
// - Consignment bucket: hidden until Phase 21 adds consignment locations.

function bucketLocationType(locationType: string): "internal" | "gofood" | "k3mart" | "other" {
  switch (locationType) {
    case "office":
    case "kitchen":
      return "internal";
    case "depot":
      return "gofood";
    case "venue":
      return "k3mart";
    default:
      return "other";
  }
}

// ============================================================================
// STAT CARD
// ============================================================================

type StatCardProps = {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sublabel?: string;
  variant?: "default" | "warning" | "muted";
};

function StatCard({ icon, label, value, sublabel, variant = "default" }: StatCardProps) {
  return (
    <Card
      className={cn(
        "flex-1 min-w-[140px]",
        variant === "warning" && "border-orange-300/50 bg-orange-500/10 dark:border-orange-500/30 dark:bg-orange-500/10",
        variant === "muted" && "bg-muted/40"
      )}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "mt-0.5 rounded-md p-2 flex-shrink-0",
              variant === "warning"
                ? "bg-orange-100 text-orange-600 dark:bg-orange-500/20 dark:text-orange-400"
                : variant === "muted"
                  ? "bg-muted text-muted-foreground"
                  : "bg-primary/10 text-primary"
            )}
          >
            {icon}
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground font-medium truncate">{label}</p>
            <p
              className={cn(
                "text-2xl font-bold leading-tight",
                variant === "warning" && "text-orange-700 dark:text-orange-400"
              )}
            >
              {value}
            </p>
            {sublabel && (
              <p className="text-xs text-muted-foreground mt-0.5 truncate">{sublabel}</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// HERO COMPONENT
// ============================================================================

type FinishedGoodsHeroProps = {
  /**
   * Flat grouped data from getStockOverviewGrouped query.
   * Each entry is one product with an array of per-location quantities.
   */
  productGroups: ProductGroup[];

  /**
   * Global low-stock threshold (from settings). Defaults to 5.
   */
  globalLowStockThreshold?: number;
};

export function FinishedGoodsHero({
  productGroups,
  globalLowStockThreshold = 5,
}: FinishedGoodsHeroProps) {
  // ---- Grand total across all products and locations ----
  const grandTotal = productGroups.reduce((sum, g) => sum + g.totalQuantity, 0);

  // ---- Location-type breakdown ----
  let internalTotal = 0;
  let gofoodTotal = 0;
  let k3martTotal = 0;

  for (const group of productGroups) {
    for (const loc of group.locations) {
      const bucket = bucketLocationType(loc.locationType);
      if (bucket === "internal") internalTotal += loc.quantity;
      else if (bucket === "gofood") gofoodTotal += loc.quantity;
      else if (bucket === "k3mart") k3martTotal += loc.quantity;
      // "other" is not counted in any named bucket
    }
  }

  // ---- Alert counts ----
  // Count distinct (product, location) pairs that are low stock or zero stock.
  let lowStockCount = 0;   // quantity > 0 but <= threshold
  let zeroStockCount = 0;  // quantity === 0

  for (const group of productGroups) {
    for (const loc of group.locations) {
      if (loc.quantity === 0) {
        zeroStockCount++;
      } else if (loc.quantity <= (loc.effectiveThreshold ?? globalLowStockThreshold)) {
        lowStockCount++;
      }
    }
  }

  const alertCount = lowStockCount + zeroStockCount;

  // Build alert label
  const alertLabel =
    alertCount === 0
      ? "All stock healthy"
      : [
          lowStockCount > 0
            ? `${lowStockCount} low`
            : null,
          zeroStockCount > 0
            ? `${zeroStockCount} empty`
            : null,
        ]
          .filter(Boolean)
          .join(", ") + " location" + (alertCount !== 1 ? "s" : "");

  return (
    <div className="space-y-3">
      {/* Product count summary */}
      <p className="text-sm text-muted-foreground">
        Tracking{" "}
        <span className="font-semibold text-foreground">{productGroups.length}</span>{" "}
        product{productGroups.length !== 1 ? "s" : ""} —{" "}
        <span className="font-semibold text-foreground">{grandTotal}</span> total units
      </p>

      {/* Stat cards row */}
      <div className="flex flex-wrap gap-3">
        {/* Internal Inventory */}
        <StatCard
          icon={<Package className="h-4 w-4" />}
          label="Internal Inventory"
          value={internalTotal}
          sublabel="Office + Kitchen"
        />

        {/* GoFood Outlets */}
        <StatCard
          icon={<MapPin className="h-4 w-4" />}
          label="GoFood Outlets"
          value={gofoodTotal}
          sublabel="Depot locations"
        />

        {/* K3Mart (Consignment hidden until Phase 21) */}
        <StatCard
          icon={<Package className="h-4 w-4" />}
          label="K3Mart"
          value={k3martTotal}
          sublabel="Venue locations"
          variant="muted"
        />

        {/* Alert count */}
        <StatCard
          icon={
            alertCount > 0 ? (
              <AlertTriangle className="h-4 w-4" />
            ) : (
              <TrendingDown className="h-4 w-4" />
            )
          }
          label={alertCount > 0 ? "Alerts" : "Stock Health"}
          value={alertCount > 0 ? alertCount : "OK"}
          sublabel={alertLabel}
          variant={alertCount > 0 ? "warning" : "default"}
        />
      </div>
    </div>
  );
}
