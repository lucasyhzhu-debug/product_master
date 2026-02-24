import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2 } from "lucide-react";
import { useExternalProductMappings } from "@/hooks/convex";
import { ProductMappingCard } from "./ProductMappingCard";

/**
 * Product mapping management tab with per-platform sub-tabs and card pairs.
 * Unmapped items are sorted to the top with amber "Needs mapping" badge.
 */
export function ProductMappingTab() {
  const { data: allMappings, isLoading: loadingMappings } =
    useExternalProductMappings();
  // Use raw Convex query to get menu products with their Convex IDs
  const rawMenuProducts = useQuery(api.menuProducts.queries.list, {});

  const menuProducts = useMemo(
    () =>
      (rawMenuProducts ?? []).map((mp) => ({
        _id: mp._id,
        name: mp.name,
        code: mp.code,
        defaultPrice: mp.defaultPrice,
      })),
    [rawMenuProducts]
  );

  const menuProductMap = useMemo(() => {
    const map = new Map<string, (typeof menuProducts)[number]>();
    for (const mp of menuProducts) {
      map.set(mp._id, mp);
    }
    return map;
  }, [menuProducts]);

  // Split mappings by platform
  const gobizMappings = useMemo(
    () =>
      (allMappings ?? [])
        .filter((m) => m.source === "gobiz")
        .sort((a, b) => {
          // Unmapped first
          if (!a.menuProductId && b.menuProductId) return -1;
          if (a.menuProductId && !b.menuProductId) return 1;
          return a.externalProductName.localeCompare(b.externalProductName);
        }),
    [allMappings]
  );

  const k3martMappings = useMemo(
    () =>
      (allMappings ?? [])
        .filter((m) => m.source === "k3mart")
        .sort((a, b) => {
          if (!a.menuProductId && b.menuProductId) return -1;
          if (a.menuProductId && !b.menuProductId) return 1;
          return a.externalProductName.localeCompare(b.externalProductName);
        }),
    [allMappings]
  );

  const gobizUnmapped = gobizMappings.filter((m) => !m.menuProductId).length;
  const k3martUnmapped = k3martMappings.filter((m) => !m.menuProductId).length;

  if (loadingMappings || !rawMenuProducts) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium text-muted-foreground">
          Map external platform products to internal menu products. Changes
          retroactively update historical sales records.
        </h3>
      </div>

      <Tabs defaultValue="gobiz">
        <TabsList>
          <TabsTrigger value="gobiz">
            GoFood{gobizUnmapped > 0 ? ` (${gobizUnmapped} unmapped)` : ""}
          </TabsTrigger>
          <TabsTrigger value="k3mart">
            K3 Mart{k3martUnmapped > 0 ? ` (${k3martUnmapped} unmapped)` : ""}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="gobiz" className="mt-4">
          {gobizMappings.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No GoFood product mappings yet. Sync GoFood data to discover products.
            </p>
          ) : (
            <div className="space-y-2">
              {gobizMappings.map((mapping) => (
                <ProductMappingCard
                  key={mapping._id}
                  mapping={mapping}
                  menuProducts={menuProducts}
                  linkedMenuProduct={
                    mapping.menuProductId
                      ? menuProductMap.get(mapping.menuProductId)
                      : undefined
                  }
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="k3mart" className="mt-4">
          {k3martMappings.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No K3 Mart product mappings yet. Sync K3 Mart data to discover products.
            </p>
          ) : (
            <div className="space-y-2">
              {k3martMappings.map((mapping) => (
                <ProductMappingCard
                  key={mapping._id}
                  mapping={mapping}
                  menuProducts={menuProducts}
                  linkedMenuProduct={
                    mapping.menuProductId
                      ? menuProductMap.get(mapping.menuProductId)
                      : undefined
                  }
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
