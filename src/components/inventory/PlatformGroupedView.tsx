/**
 * PlatformGroupedView — Renders finished goods inventory grouped by platform bucket.
 *
 * Buckets: Internal Inventory (office/kitchen), GoFood (depot), K3Mart (venue).
 * Read-only summary view showing product totals per platform.
 */

import { useMemo } from "react";
import { Package, Layers } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { GroupedProductRow } from "./finishedGoodsUtils";
import { bucketLocationType } from "./finishedGoodsUtils";

export type PlatformGroupedViewProps = {
  productGroups: GroupedProductRow[];
};

export function PlatformGroupedView({ productGroups }: PlatformGroupedViewProps) {
  // Build platform bucket -> products map
  const buckets = useMemo(() => {
    const map = new Map<
      "internal" | "gofood" | "k3mart",
      Array<{
        menuProductId: string;
        menuProductName: string;
        menuProductCode: string;
        quantity: number;
      }>
    >([
      ["internal", []],
      ["gofood", []],
      ["k3mart", []],
    ]);

    for (const group of productGroups) {
      // Sum quantity per platform bucket for this product
      const bucketTotals = new Map<"internal" | "gofood" | "k3mart", number>([
        ["internal", 0],
        ["gofood", 0],
        ["k3mart", 0],
      ]);

      for (const loc of group.locations) {
        const bucket = bucketLocationType(loc.locationType);
        if (bucket !== "other") {
          bucketTotals.set(bucket, (bucketTotals.get(bucket) ?? 0) + loc.quantity);
        }
      }

      for (const [bucket, total] of bucketTotals) {
        if (total > 0 || group.locations.some((l) => bucketLocationType(l.locationType) === bucket)) {
          // Only add product to bucket if there are any locations of that type
          const hasLocationsOfType = group.locations.some(
            (l) => bucketLocationType(l.locationType) === bucket
          );
          if (hasLocationsOfType) {
            map.get(bucket)!.push({
              menuProductId: group.menuProductId,
              menuProductName: group.menuProductName,
              menuProductCode: group.menuProductCode,
              quantity: total,
            });
          }
        }
      }
    }

    // Sort products alphabetically within each bucket
    for (const products of map.values()) {
      products.sort((a, b) => a.menuProductName.localeCompare(b.menuProductName));
    }

    return map;
  }, [productGroups]);

  const sections: Array<{ bucket: "internal" | "gofood" | "k3mart"; label: string }> = [
    { bucket: "internal", label: "Internal Inventory" },
    { bucket: "gofood", label: "GoFood" },
    { bucket: "k3mart", label: "K3Mart" },
  ];

  const hasSections = sections.some((s) => (buckets.get(s.bucket)?.length ?? 0) > 0);

  if (!hasSections) {
    return (
      <div className="py-10 text-center text-muted-foreground text-sm">
        No finished goods inventory tracked yet.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {sections.map(({ bucket, label }) => {
        const products = buckets.get(bucket) ?? [];
        if (products.length === 0) return null;

        const sectionTotal = products.reduce((s, p) => s + p.quantity, 0);

        return (
          <Card key={bucket}>
            <CardHeader className="pb-2 pt-3 px-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span className="font-semibold text-sm">{label}</span>
                </div>
                <span className="text-sm font-bold whitespace-nowrap">
                  {sectionTotal} units
                </span>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-3">
              <div className="space-y-1">
                {products.map((product) => {
                  const isZero = product.quantity === 0;
                  return (
                    <div
                      key={product.menuProductId}
                      className={cn(
                        "flex items-center justify-between gap-2 py-1.5 px-2 rounded",
                        isZero && "opacity-50 bg-muted/30",
                        !isZero && "hover:bg-muted/20"
                      )}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Package className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                        <span className={cn("text-sm truncate", isZero && "text-muted-foreground")}>
                          {product.menuProductName}
                        </span>
                        <span className="text-xs text-muted-foreground font-mono">
                          {product.menuProductCode}
                        </span>
                      </div>
                      <span
                        className={cn(
                          "text-sm font-semibold w-8 text-right",
                          isZero && "text-muted-foreground"
                        )}
                      >
                        {product.quantity}
                      </span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
