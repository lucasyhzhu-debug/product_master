/**
 * K3MartCockpit - Main page component for K3 Mart Management Cockpit
 *
 * This page assembles all the K3 Mart cockpit components into a unified
 * dispatch planning and inventory management interface.
 *
 * Features:
 * - Production readiness alerts (if deficit detected)
 * - Inventory source panel (Office, Goldfinch, K3 Mart totals)
 * - Today's dispatch view with outlet cards
 * - Weekly planner (always visible, main feature of the cockpit)
 * - Bulk submission flow with progress dialog
 */

import { useState, useMemo, useCallback } from 'react';
import { Calendar, Store, TrendingUp, RefreshCw, Settings } from 'lucide-react';
import { toast } from 'sonner';

// UI components
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

// Layout
import { PageHeader } from '@/components/layout/PageHeader';

// K3 Mart Cockpit components
import {
  OutletCardGrid,
  WeeklyPlannerGrid,
  InventorySourcePanel,
  ProductionReadinessBar,
  BulkSubmitDialog,
} from '@/components/k3martCockpit';
import { OutletSettingsModal } from '@/components/k3martCockpit/OutletSettingsModal';

// Hooks
import { useAuth } from '@/contexts/AuthContext';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import {
  useConvexOutletStockSummary,
  useConvexProductionReadiness,
  useConvexInventorySources,
  useConvexSubmitStockFlow,
  useConvexSubmitBulkStockIns,
  useConvexSyncK3MartSales,
  useConvexSyncK3MartStock,
  useConvexOutletSettings,
  useConvexToggleOutletActive,
  useConvexSaveOutletSettings,
} from '@/hooks/convex';

// ==========================================
// CLIENT-SIDE DATE HELPERS
// ==========================================

/** Get today's date in YYYY-MM-DD format (Jakarta timezone) */
function getTodayJakarta(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
}

/** Format date as "Mon, Feb 11" */
function formatDateShort(date: string): string {
  const d = new Date(date + 'T00:00:00+07:00');
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'Asia/Jakarta',
  });
}

// ==========================================
// MAIN COMPONENT
// ==========================================

export function K3MartCockpit() {
  useDocumentTitle('K3 Mart Cockpit');

  // Auth context
  const { user } = useAuth();
  const role = user?.role || 'kitchen';
  const canAct = role === 'manager' || role === 'admin';

  // Date state
  const today = useMemo(() => getTodayJakarta(), []);

  // UI state
  const [bulkSubmitDialogOpen, setBulkSubmitDialogOpen] = useState(false);
  const [bulkSubmitResults, setBulkSubmitResults] = useState<
    Array<{ outletId: string; status: 'pending' | 'submitting' | 'success' | 'failed'; error?: string }>
  >([]);
  const [bulkSubmitCompleted, setBulkSubmitCompleted] = useState(0);

  // Queries
  const { data: outletStockData, isLoading: loadingOutletStock } = useConvexOutletStockSummary(today);
  const { data: productionReadinessData, isLoading: loadingProductionReadiness } =
    useConvexProductionReadiness(today);
  const { data: inventorySourcesData, isLoading: loadingInventorySources } = useConvexInventorySources();

  // Actions
  const submitStockFlow = useConvexSubmitStockFlow();
  const submitBulkStockIns = useConvexSubmitBulkStockIns();
  const syncK3MartSales = useConvexSyncK3MartSales();
  const syncK3MartStock = useConvexSyncK3MartStock();
  const [syncing, setSyncing] = useState(false);

  // Outlet settings
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { data: outletSettingsData } = useConvexOutletSettings();
  const toggleOutletActive = useConvexToggleOutletActive();
  const saveOutletSettings = useConvexSaveOutletSettings();

  // ==========================================
  // HANDLERS
  // ==========================================

  /** Handle sync K3Mart data */
  const handleSync = useCallback(async () => {
    setSyncing(true);
    try {
      await Promise.allSettled([
        syncK3MartSales({ triggeredBy: 'k3mart-cockpit' }),
        syncK3MartStock({ triggeredBy: 'k3mart-cockpit' }),
      ]);
      toast.success('K3Mart data refreshed');
    } catch {
      toast.error('Sync failed');
    } finally {
      setSyncing(false);
    }
  }, [syncK3MartSales, syncK3MartStock]);

  /** Handle toggle outlet active */
  const handleToggleOutletActive = useCallback(async (outletId: string, isActive: boolean) => {
    await toggleOutletActive({ outletId: outletId as any, isActive });
  }, [toggleOutletActive]);

  /** Handle save outlet settings */
  const handleSaveOutletSettings = useCallback(async (
    outletId: string,
    products: Array<{
      productKey: string;
      menuProductId?: string;
      weekdayTarget: number;
      weekendTarget: number;
      customPrice?: number;
      isHidden?: boolean;
    }>
  ) => {
    await saveOutletSettings({
      outletId: outletId as any,
      products: products.map(p => ({
        ...p,
        menuProductId: p.menuProductId as any,
      })),
    });
  }, [saveOutletSettings]);

  /** Handle stock flow submission (from individual outlet panel) */
  const handleStockFlowSubmit = useCallback(
    async (
      outletId: string,
      data: {
        direction: 'stock_in' | 'stock_out';
        menuProductId: string;
        externalProductCode: string;
        quantity: number;
        source?: 'kitchen' | 'goldfinch' | 'outlet';
        sourceOutletId?: string;
        destination?: 'office' | 'goldfinch' | 'outlet';
        destinationOutletId?: string;
        note: string;
      }
    ) => {
      try {
        // Find the outlet to get its external numeric ID
        const outlet = outletStockData?.outlets.find((o: any) => o._id === outletId);
        if (!outlet) throw new Error('Outlet not found');

        // Map product code to numeric product ID from K3 config
        const productEntry = Object.entries({
          47068: 'F03131-P00001',
          47069: 'F03131-P00002',
        }).find(([, code]) => code === data.externalProductCode);
        const productId = productEntry ? parseInt(productEntry[0]) : 0;

        await submitStockFlow({
          outletExternalId: parseInt(outlet.externalId),
          outletId: outletId as any, // Id<"externalOutlets">
          requestType: data.direction === 'stock_in' ? 1 : 0,
          items: [{
            productId,
            productCode: data.externalProductCode,
            productName: data.externalProductCode, // Will be resolved by action
            qty: data.quantity,
          }],
          note: data.note || undefined,
          source: data.source,
          submittedBy: user?.name || 'unknown',
        });
        toast.success('Stock flow submitted');
      } catch (error) {
        console.error('Failed to submit stock flow:', error);
        toast.error('Failed to submit stock flow');
        throw error;
      }
    },
    [submitStockFlow, outletStockData, user]
  );

  /** Handle bulk submit today's plan */
  const handleSubmitTodaysPlan = useCallback(async () => {
    if (!outletStockData) return;

    const outlets = outletStockData.outlets;
    setBulkSubmitResults(outlets.map((o) => ({ outletId: o._id, status: 'pending' as const })));
    setBulkSubmitCompleted(0);
    setBulkSubmitDialogOpen(true);

    try {
      await submitBulkStockIns({
        date: today,
        submittedBy: user?.name || 'unknown',
      });

      setBulkSubmitResults((prev) =>
        prev.map((r) => ({ ...r, status: 'success' as const }))
      );
      setBulkSubmitCompleted(outlets.length);
      toast.success('Bulk submission complete');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Submission failed';
      console.error('Failed bulk submit:', error);

      setBulkSubmitResults((prev) =>
        prev.map((r) =>
          r.status === 'pending' || r.status === 'submitting'
            ? { ...r, status: 'failed' as const, error: errorMsg }
            : r
        )
      );
      setBulkSubmitCompleted(outlets.length);
      toast.error('Bulk submission failed');
    }
  }, [outletStockData, submitBulkStockIns, today, user]);

  // ==========================================
  // DERIVED DATA
  // ==========================================

  // Build inventory sources structure
  const inventorySources = useMemo(() => {
    if (!inventorySourcesData) {
      return {
        office: { total: 0, products: [] },
        goldfinch: { total: 0, products: [] },
        k3mart: { total: 0, products: [] },
      };
    }

    const officeProducts = inventorySourcesData.office.map((p: any) => ({
      productName: p.productName,
      quantity: p.stickered,
    }));
    const officeTotal = officeProducts.reduce((sum: number, p: any) => sum + p.quantity, 0);

    const goldfinchProducts = inventorySourcesData.goldfinch.map((p: any) => ({
      productName: p.productName,
      quantity: p.quantity,
    }));
    const goldfinchTotal = goldfinchProducts.reduce((sum: number, p: any) => sum + p.quantity, 0);

    const k3martProducts = inventorySourcesData.k3martTotal.map((p: any) => ({
      productName: p.productName,
      quantity: p.totalStock,
    }));
    const k3martTotal = k3martProducts.reduce((sum: number, p: any) => sum + p.quantity, 0);

    return {
      office: { total: officeTotal, products: officeProducts },
      goldfinch: { total: goldfinchTotal, products: goldfinchProducts },
      k3mart: { total: k3martTotal, products: k3martProducts },
    };
  }, [inventorySourcesData]);

  // Build production readiness items (deficit calculation wired from backend data)
  const productionReadinessItems = useMemo(() => {
    if (!productionReadinessData) return [];

    return productionReadinessData.products
      .filter((p) => p.deficit > 0)
      .map((p) => ({
        menuProductId: p.menuProductId,
        productName: p.productName,
        stickeredCount: p.stickered,
        plannedTotal: p.plannedToday + p.plannedTomorrow,
        deficit: p.deficit,
        currentTarget: p.stickered,
      }));
  }, [productionReadinessData]);

  // Build outlet card grid data with dispatch plan data from outlet-first query
  const outletCardGridData = useMemo(() => {
    if (!outletStockData) {
      return {
        outlets: [],
        availableSources: [],
        availableDestinations: [],
        movements: {},
      };
    }

    const outlets = outletStockData.outlets.map((o: any) => {
      const totalStock = o.products.reduce((sum: number, p: any) => sum + p.quantity, 0);
      const hasLowStock = o.products.some((p: any) => p.quantity < p.avgDailySales7d * 2);

      return {
        outletId: o._id,
        outletName: o.name,
        products: o.products.map((p: any) => ({
          menuProductId: p.menuProductId ?? '',
          productName: p.productName,
          externalProductCode: p.externalProductCode,
          currentStock: p.quantity,
          soldToday: p.soldToday,
          avgDailySales: p.avgDailySales7d,
          daysOfStock: p.avgDailySales7d > 0 ? p.quantity / p.avgDailySales7d : 999,
          plannedQty: 0,
          planStatus: 'no_plan' as const,
        })),
        planStatus: 'no_plan' as const,
        totalStock,
        hasLowStock,
        lastSyncAt: o.lastSyncAt,
      };
    });

    // Sources/destinations from inventory data
    const availableSources = [
      {
        type: 'kitchen' as const,
        label: 'Kitchen Office',
        available: inventorySources.office.total,
      },
      {
        type: 'goldfinch' as const,
        label: 'Goldfinch Depot',
        available: inventorySources.goldfinch.total,
      },
    ];

    const availableDestinations = [
      { type: 'office' as const, label: 'Kitchen Office' },
      { type: 'goldfinch' as const, label: 'Goldfinch Depot' },
    ];

    return {
      outlets,
      availableSources,
      availableDestinations,
      movements: {},
    };
  }, [outletStockData, inventorySources]);

  // ==========================================
  // RENDER
  // ==========================================

  // Loading state (only for top sections, planner manages its own loading)
  const isLoading = loadingOutletStock || loadingProductionReadiness || loadingInventorySources;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="K3 Mart Cockpit" description={`Today: ${formatDateShort(today)}`} />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="K3 Mart Cockpit"
        description={`Today: ${formatDateShort(today)}`}
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={handleSync}
            disabled={syncing}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing...' : 'Refresh Data'}
          </Button>
        }
      />

      {/* ALERT ZONE: Production Readiness Bar */}
      {productionReadinessItems.length > 0 && (
        <ProductionReadinessBar
          items={productionReadinessItems}
          onApproveBump={(menuProductId, newTarget) => {
            // BACKLOG: K3MART-06 -- Implement production bump approval workflow
            console.log('Approve bump:', menuProductId, newTarget);
            toast.info('Bump approval not yet implemented');
          }}
          isLoading={loadingProductionReadiness}
        />
      )}

      {/* Inventory Source Panel */}
      <InventorySourcePanel sources={inventorySources} isLoading={loadingInventorySources} />

      {/* WEEKLY PLANNER (always visible -- main feature of cockpit) */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 px-1">
          <Calendar className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Weekly Planner</h2>
        </div>
        <WeeklyPlannerGrid />
      </div>

      {/* TODAY'S DISPATCH */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Store className="h-5 w-5" style={{ color: 'var(--color-k3mart)' }} />
            <h2 className="text-lg font-semibold text-foreground">Today&apos;s Dispatch</h2>
            <span className="text-sm text-muted-foreground">({formatDateShort(today)})</span>
          </div>
          {canAct && outletCardGridData.outlets.length > 0 && (
            <Button
              onClick={handleSubmitTodaysPlan}
              className="bg-amber-600 hover:bg-amber-700 text-white"
              disabled={bulkSubmitDialogOpen}
            >
              <TrendingUp className="h-4 w-4 mr-2" />
              Submit Today&apos;s Plan
            </Button>
          )}
        </div>

        {outletCardGridData.outlets.length === 0 ? (
          <div className="rounded-xl border bg-card shadow-sm p-8 text-center text-muted-foreground">
            No outlets available for dispatch
          </div>
        ) : (
          <OutletCardGrid
            outlets={outletCardGridData.outlets}
            availableSources={outletCardGridData.availableSources}
            availableDestinations={outletCardGridData.availableDestinations}
            movements={outletCardGridData.movements}
            onStockFlowSubmit={handleStockFlowSubmit}
            canAct={canAct}
          />
        )}
      </div>

      {/* Bulk Submit Dialog */}
      <BulkSubmitDialog
        isOpen={bulkSubmitDialogOpen}
        onClose={() => setBulkSubmitDialogOpen(false)}
        outlets={outletCardGridData.outlets.map((o: any) => ({
          outletId: o.outletId,
          outletName: o.outletName,
        }))}
        results={bulkSubmitResults}
        completedCount={bulkSubmitCompleted}
      />
    </div>
  );
}
