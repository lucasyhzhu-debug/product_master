/**
 * GoFoodDepotManager - Admin page for GoFood (GoBiz) depot management.
 *
 * Features:
 * - Full-page seed warning blocker when migration not run
 * - Outlet selector for navigating between 3 GoBiz depots
 * - Low-stock alert banner when any product drops below 5 remaining
 * - DepotCockpitTable: stock levels, inline edit, restock suggestions
 * - DepotMappingSection: product mapping per outlet with Save button
 * - Last synced timestamp in header
 *
 * Modeled after K3MartCockpit page layout pattern.
 */

import { useState, useMemo } from 'react';
import { Store, AlertTriangle, Clock } from 'lucide-react';

// UI components
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

// Layout
import { PageHeader } from '@/components/layout/PageHeader';

// GoFood Depot components
import { SeedWarningBlocker } from '@/components/gofoodDepot/SeedWarningBlocker';
import { DepotCockpitTable } from '@/components/gofoodDepot/DepotCockpitTable';
import { DepotMappingSection } from '@/components/gofoodDepot/DepotMappingSection';

// Hooks
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import {
  useGoFoodDepotSeedCheck,
  useGoFoodDepotOutlets,
  useGoFoodDepotStock,
  useGoFoodRestockSuggestions,
  useGoFoodOutletMappings,
  useGoFoodMenuProducts,
  useGoFoodStockOverviewGrouped,
  useGoFoodStorageLocations,
} from '@/hooks/convex/useGoFoodDepot';
import type { Id } from '../../convex/_generated/dataModel';

// ==========================================
// DATE HELPERS
// ==========================================

/** Format a timestamp as a relative time string */
function formatLastSynced(ts?: number): string {
  if (!ts) return 'Never';
  const diffMs = Date.now() - ts;
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return new Date(ts).toLocaleDateString('en-ID', { timeZone: 'Asia/Jakarta' });
}

// ==========================================
// MAIN COMPONENT
// ==========================================

export function GoFoodDepotManager() {
  useDocumentTitle('GoFood Depot Management');

  // ---- ALL HOOKS FIRST (before any conditional returns) ----
  const { data: seedData, isLoading: loadingSeed } = useGoFoodDepotSeedCheck();
  const { data: outlets, isLoading: loadingOutlets } = useGoFoodDepotOutlets();
  const { data: menuProducts } = useGoFoodMenuProducts();
  const { data: stockGrouped } = useGoFoodStockOverviewGrouped();
  const { data: storageLocations } = useGoFoodStorageLocations();

  // Outlet selector state — default to first outlet
  const [selectedOutletId, setSelectedOutletId] = useState<Id<"externalOutlets"> | undefined>(undefined);

  // Resolve selected outlet: use explicit selection or fall back to first outlet
  const resolvedOutletId = useMemo(() => {
    if (!outlets || outlets.length === 0) return undefined;
    if (selectedOutletId) return selectedOutletId;
    return outlets[0]._id as Id<"externalOutlets">;
  }, [outlets, selectedOutletId]);

  // Per-outlet data (uses "skip" when no outlet selected)
  const { data: depotStock, isLoading: loadingStock } = useGoFoodDepotStock(resolvedOutletId);
  const { data: restockSuggestions } = useGoFoodRestockSuggestions(resolvedOutletId);
  const { data: outletMappings } = useGoFoodOutletMappings(resolvedOutletId);

  // ---- DERIVED DATA (all hooks must be above conditional returns) ----
  const selectedOutlet = outlets?.find((o) => o._id === resolvedOutletId);

  // Low-stock detection: any product at this depot with remaining < 5
  const lowStockProducts = useMemo(() => {
    if (!depotStock) return [];
    return depotStock.filter((row) => (row.quantity ?? 0) < 5);
  }, [depotStock]);

  const hasLowStock = lowStockProducts.length > 0;

  // Build restock suggestion map: menuProductId -> suggestion
  const restockMap = useMemo(() => {
    const map = new Map<string, { suggestion: number; breakdown: string }>();
    for (const s of restockSuggestions?.suggestions ?? []) {
      map.set(s.menuProductId, { suggestion: s.suggestion, breakdown: s.breakdown });
    }
    return map;
  }, [restockSuggestions]);

  // ---- LOADING STATE ----
  if (loadingSeed || loadingOutlets) {
    return (
      <div className="space-y-6">
        <PageHeader title="GoFood Depot Management" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  // ---- SEED WARNING BLOCKER ----
  if (seedData?.seedRequired) {
    return (
      <div className="space-y-6">
        <PageHeader title="GoFood Depot Management" />
        <SeedWarningBlocker unlinkedOutlets={seedData.unlinkedOutlets} />
      </div>
    );
  }

  // ---- RENDER ----
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="GoFood Depot Management"
        action={
          selectedOutlet?.lastSyncAt ? (
            <span className="flex items-center gap-1.5 text-muted-foreground text-sm">
              <Clock className="h-3.5 w-3.5" />
              Last synced: {formatLastSynced(selectedOutlet.lastSyncAt)}
            </span>
          ) : undefined
        }
      />

      {/* Outlet Selector */}
      {outlets && outlets.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
            <Store className="h-4 w-4" />
            Outlet:
          </span>
          {outlets.map((outlet) => {
            const isActive = outlet._id === resolvedOutletId;
            return (
              <Button
                key={outlet._id}
                variant={isActive ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedOutletId(outlet._id as Id<"externalOutlets">)}
                className="rounded-full"
              >
                {outlet.name}
              </Button>
            );
          })}
        </div>
      )}

      {/* Low-Stock Alert Banner */}
      {hasLowStock && (
        <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
          <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-800">
              Low Stock Alert — {lowStockProducts.length} product{lowStockProducts.length > 1 ? 's' : ''} below 5 units
            </p>
            <p className="text-sm text-red-700 mt-0.5">
              {lowStockProducts.map((p) => p.menuProductName).join(', ')}
            </p>
          </div>
        </div>
      )}

      {/* Cockpit Table */}
      <div>
        <h2 className="text-base font-semibold text-foreground mb-3">
          Depot Stock —{' '}
          <span className="text-muted-foreground font-normal">
            {selectedOutlet?.name ?? 'No outlet selected'}
          </span>
        </h2>
        {loadingStock ? (
          <Skeleton className="h-48 w-full" />
        ) : resolvedOutletId ? (
          <DepotCockpitTable
            outletId={resolvedOutletId}
            depotStock={(depotStock ?? []) as any[]}
            restockMap={restockMap}
            stockGrouped={(stockGrouped ?? []) as any[]}
            storageLocations={(storageLocations ?? []) as any[]}
            destinationLocationId={selectedOutlet?.linkedStorageLocationId}
          />
        ) : (
          <p className="text-muted-foreground text-sm">No outlet selected.</p>
        )}
      </div>

      {/* Mapping Section */}
      {resolvedOutletId && (
        <div>
          <h2 className="text-base font-semibold text-foreground mb-3">
            Product Mappings
          </h2>
          <DepotMappingSection
            outletId={resolvedOutletId}
            mappings={outletMappings?.mappings ?? []}
            unmappedProducts={outletMappings?.unmappedProducts ?? []}
            menuProducts={menuProducts ?? []}
          />
        </div>
      )}
    </div>
  );
}
