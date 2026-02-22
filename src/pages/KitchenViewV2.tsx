/**
 * KitchenViewV2 — Simplified production-focused kitchen page (Phase 21)
 *
 * Layout:
 *   1. Page header (title + date)
 *   2. ProductionTargetsBar — ball totals (Original/Jumbo) + packaging breakdown
 *   3. EndOfShiftForm — produced quantities + optional waste, 3-step flow
 *   4. Today's shift records — compact list of submissions already recorded today
 *   5. Collapsible "View Today's Orders" — DueDateOrderList (hidden by default)
 *
 * Boxing/stickering panels removed from view.
 * Old component files are NOT deleted — Phase 24 handles cleanup.
 */

import { useState, useEffect, useMemo } from 'react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { ChevronDown, ChevronUp, Eye, Settings } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { LoadingCards } from '@/components/shared';
import { DueDateOrderList } from '@/components/kitchen';
import { ProductionTargetsBar } from '@/components/kitchen/ProductionTargetsBar';
import { EndOfShiftForm } from '@/components/kitchen/EndOfShiftForm';
import { ManagerTargetSettings } from '@/components/kitchen/ManagerTargetSettings';
import { ShiftHistoryList } from '@/components/kitchen/ShiftHistoryList';
import { useKitchenTargets } from '@/hooks/convex/useKitchenTargets';
import { useKitchenProduction } from '@/hooks/convex/useKitchenProduction';
import { useProtectedMutation } from '@/hooks/convex/useProtectedMutation';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { ConvexError } from 'convex/values';
import { toast } from 'sonner';
import { actionToast } from '@/lib/actionToast';
import type { Id } from '../../convex/_generated/dataModel';

/** Extract error message from ConvexError or regular Error */
function extractErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ConvexError) return String(error.data);
  if (error instanceof Error) return error.message;
  return fallback;
}

/** Format a timestamp (ms) as a local time string */
function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function KitchenViewV2() {
  useDocumentTitle('Kitchen Production');

  // ============================================
  // Auth — must be called before any conditional returns
  // ============================================

  const { user, hasPermission } = useAuth();
  const canEditKitchen = hasPermission('canEditKitchen');
  const canConfigure = canEditKitchen && (user?.role === 'manager' || user?.role === 'admin');
  const isManager = user?.role === 'manager' || user?.role === 'admin';

  // ============================================
  // Kitchen targets + shift records (Phase 21)
  // ============================================

  const { today, targets, todayShiftRecords } = useKitchenTargets();

  // ============================================
  // Kitchen config (for ManagerTargetSettings)
  // ============================================

  const config = useQuery(api.kitchenConfig.queries.getConfig);

  // ============================================
  // Kitchen production data (for orders section)
  // ============================================

  const {
    isLoading: isProductionLoading,
    packingOrders,
    k3MartSummary,
  } = useKitchenProduction();

  // ============================================
  // Mutations for orders collapsible section
  // ============================================

  const togglePackOrderLineItem = useProtectedMutation(api.orders.mutations.index.togglePackOrderLineItem);
  const markOrderReady = useProtectedMutation(api.orders.mutations.index.markOrderReady);
  const sendBack = useProtectedMutation(api.orders.mutations.index.sendBackToOrderDesk);
  const setProductTarget = useProtectedMutation(api.productionTargets.mutations.setProductTarget);

  // ============================================
  // Collapsible orders toggle state
  // ============================================

  const [ordersOpen, setOrdersOpen] = useState(false);

  // ============================================
  // Wake lock to prevent phone sleep
  // ============================================

  useEffect(() => {
    let wakeLock: WakeLockSentinel | null = null;

    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLock = await navigator.wakeLock.request('screen');
        }
      } catch {
        // Wake lock not supported or denied — silently ignore
      }
    };

    requestWakeLock();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      wakeLock?.release();
    };
  }, []);

  // ============================================
  // Order count for the toggle button label
  // ============================================

  const orderCount = useMemo(() => {
    const regular = packingOrders?.length ?? 0;
    const k3mart = k3MartSummary?.items?.length ?? 0;
    return regular + k3mart;
  }, [packingOrders, k3MartSummary]);

  // ============================================
  // Handlers — orders
  // ============================================

  const handleTogglePack = async (orderId: string, orderItemId: string, event?: React.MouseEvent) => {
    try {
      await togglePackOrderLineItem({
        orderId: orderId as Id<'orders'>,
        orderItemId: orderItemId as Id<'orderItems'>,
      });
      actionToast('Packed', event);
    } catch (error) {
      actionToast(extractErrorMessage(error, 'Failed to toggle pack'), event, 'error');
    }
  };

  const handleMarkOrderReady = async (orderId: string, event?: React.MouseEvent) => {
    try {
      await markOrderReady({ orderId: orderId as Id<'orders'> });
      actionToast('Order marked as ready!', event);
    } catch (error) {
      actionToast(extractErrorMessage(error, 'Failed to mark order ready'), event, 'error');
    }
  };

  const handleSendBack = async (orderId: string) => {
    try {
      await sendBack({ orderId: orderId as Id<'orders'> });
      toast.success('Order sent back to order desk');
    } catch (error) {
      toast.error(extractErrorMessage(error, 'Failed to send back'));
    }
  };

  const handleOverride = async (orderId: string, orderItemId: string, reason: string) => {
    try {
      await togglePackOrderLineItem({
        orderId: orderId as Id<'orders'>,
        orderItemId: orderItemId as Id<'orderItems'>,
        forceOverride: true,
        overrideReason: reason,
      });
      toast.success('Override applied — item packed');
    } catch (error) {
      toast.error(extractErrorMessage(error, 'Override failed'));
    }
  };

  const handleSetProductTarget = async (menuProductId: string, source: string, quantity: number) => {
    try {
      await setProductTarget({
        date: today,
        source,
        menuProductId: menuProductId as Id<'menuProducts'>,
        quantity,
      });
    } catch (error) {
      toast.error(extractErrorMessage(error, 'Failed to set target'));
    }
  };

  // ============================================
  // Loading state — only block on production data
  // targets and shift records show skeletons inline
  // ============================================

  if (isProductionLoading) {
    return <LoadingCards count={3} />;
  }

  // ============================================
  // Render
  // ============================================

  return (
    <div className="flex flex-col gap-6 p-4 max-w-4xl mx-auto pb-12">
      {/* Page header */}
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Kitchen</h1>
          {!canEditKitchen && (
            <Badge variant="secondary" className="flex items-center gap-1.5 text-sm">
              <Eye className="h-3.5 w-3.5" />
              View Only
            </Badge>
          )}
        </div>
        <div className="text-sm text-muted-foreground font-medium">
          {new Date().toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
          })}
        </div>
      </header>

      {/* Section 1: Production targets */}
      <section>
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3">
          Today's Targets
        </h2>
        <ProductionTargetsBar targets={targets} />
      </section>

      {/* Section 2: End-of-shift form */}
      <section>
        <EndOfShiftForm targets={targets} today={today} />
      </section>

      {/* Section 3: Today's shift records (compact list) */}
      {todayShiftRecords !== undefined && todayShiftRecords.length > 0 && (
        <section>
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-2">
            {todayShiftRecords.length} submission{todayShiftRecords.length !== 1 ? 's' : ''} today
          </h2>
          <div className="space-y-2">
            {todayShiftRecords.map((record) => {
              const totalProduced = record.produced.reduce(
                (sum, p) => sum + p.quantity,
                0
              );
              const totalWaste = record.waste.reduce(
                (sum, w) => sum + w.quantity,
                0
              );
              return (
                <Card key={record._id} className="bg-muted/30">
                  <CardContent className="py-2.5 px-3">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-medium text-foreground truncate">
                          {record.submittedBy}
                        </span>
                        <span className="text-muted-foreground shrink-0">
                          {formatTime(record.submittedAt)}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0 text-right text-xs text-muted-foreground">
                        <span>
                          <span className="font-medium text-foreground">{totalProduced}</span> produced
                        </span>
                        {totalWaste > 0 && (
                          <span>
                            <span className="font-medium text-destructive">{totalWaste}</span> waste
                          </span>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {/* Section 4: Collapsible orders toggle */}
      <section>
        <button
          type="button"
          className="flex items-center justify-between w-full rounded-lg border border-border bg-card px-4 py-3 text-sm font-medium text-foreground hover:bg-accent/50 transition-colors"
          onClick={() => setOrdersOpen((v) => !v)}
        >
          <span>
            {ordersOpen ? 'Hide' : 'View'} Today's Orders
            {orderCount > 0 && (
              <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                {orderCount}
              </span>
            )}
          </span>
          {ordersOpen ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </button>

        {ordersOpen && (
          <div className="mt-3">
            <DueDateOrderList
              orders={packingOrders ?? []}
              k3MartSummary={k3MartSummary}
              onTogglePack={handleTogglePack}
              onMarkReady={handleMarkOrderReady}
              onSendBack={handleSendBack}
              onOverride={canConfigure ? handleOverride : undefined}
              onK3MartQuantityChange={
                handleSetProductTarget
                  ? (mpId: string, qty: number) =>
                      handleSetProductTarget(mpId, 'consignment', qty)
                  : undefined
              }
              canOverride={canConfigure}
              canEdit={canConfigure}
              disabled={!canEditKitchen}
            />
          </div>
        )}
      </section>

      {/* Section 5: Manager settings (manager/admin only) */}
      {isManager && (
        <section className="space-y-6 border-t pt-6">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Settings className="h-5 w-5 text-muted-foreground" />
            Manager Settings
          </h2>
          <ManagerTargetSettings
            config={config}
            targets={targets}
            today={today}
          />
          <ShiftHistoryList />
        </section>
      )}
    </div>
  );
}
