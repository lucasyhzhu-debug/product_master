/**
 * KitchenViewV2 — Simplified production-focused kitchen page (Phase 21)
 *
 * Layout:
 *   1. Page header (title + date)
 *   2. ProductionTargetsBar — ball totals (Original/Jumbo) + packaging breakdown
 *   3. EndOfShiftForm — produced quantities + optional waste, 3-step flow
 *   4. Today's shift records — compact list of submissions already recorded today
 *   5. Collapsible "View Today's Orders" — KitchenOrderSummary (read-only, no action buttons)
 *   6. Manager Settings (manager/admin only)
 *
 * Boxing/stickering panels removed from view.
 * Old component files are NOT deleted — Phase 24 handles cleanup.
 * DueDateOrderList removed (Phase 21-07) — order management belongs in Order Management kanban.
 */

import { useState, useEffect } from 'react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { ChevronDown, ChevronUp, Eye, Settings } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ProductionTargetsBar } from '@/components/kitchen/ProductionTargetsBar';
import { EndOfShiftForm } from '@/components/kitchen/EndOfShiftForm';
import { ManagerTargetSettings } from '@/components/kitchen/ManagerTargetSettings';
import { ShiftHistoryList } from '@/components/kitchen/ShiftHistoryList';
import { KitchenOrderSummary } from '@/components/kitchen/KitchenOrderSummary';
import { useKitchenTargets } from '@/hooks/convex/useKitchenTargets';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';

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
  const isManager = user?.role === 'manager' || user?.role === 'admin';

  // ============================================
  // Kitchen targets + shift records (Phase 21)
  // ============================================

  const { today, targets, todayShiftRecords } = useKitchenTargets();

  // ============================================
  // Kitchen config (for ManagerTargetSettings + showJumbo)
  // ============================================

  const config = useQuery(api.kitchenConfig.queries.getConfig);

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
        <ProductionTargetsBar targets={targets} showJumbo={config?.showJumbo ?? true} />
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
          </span>
          {ordersOpen ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </button>

        {ordersOpen && (
          <div className="mt-3">
            <KitchenOrderSummary />
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
