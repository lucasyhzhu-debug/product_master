/**
 * KitchenViewV2 — Simplified production-focused kitchen page.
 *
 * Layout:
 *   1. Page header (title + date + chef name when assigned)
 *   2. ProductionTargetsBar — ball totals + packaging breakdown
 *   3. EndOfShiftForm — produced quantities + optional waste, 3-step flow
 *   4. Today's shift records — compact list of submissions already recorded today
 *   5. Collapsible "View Today's Orders" — KitchenOrderSummary (read-only)
 *   6. Manager Settings (manager/admin only)
 */

import { useState, useEffect, useMemo } from 'react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { ChevronDown, ChevronUp, Eye, Settings } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ProductionTargetsBar } from '@/components/kitchen/ProductionTargetsBar';
import { EndOfShiftForm } from '@/components/kitchen/EndOfShiftForm';
import { ManagerTargetSettings } from '@/components/kitchen/ManagerTargetSettings';
import { ShiftHistoryList } from '@/components/kitchen/ShiftHistoryList';
import { KitchenOrderSummary } from '@/components/kitchen/KitchenOrderSummary';
import { DailySummaryWidget } from '@/components/kitchen/DailySummaryWidget';
import { AttendanceStrip, ClockOutNudgeDialog } from '@/components/staffAttendance';
import { useCurrentOpenShift } from '@/hooks/convex/useAttendance';
import { useKitchenTargets } from '@/hooks/convex/useKitchenTargets';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { sumByUnit } from '@/lib/componentUnit';

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

  const { today, targets, todayShiftRecords, kitchenComponents, dailyComponentSummary, unitByCode } =
    useKitchenTargets();

  // ============================================
  // Kitchen config (for ManagerTargetSettings + enabledComponents)
  // ============================================

  const config = useQuery(api.kitchenConfig.queries.getConfig);

  // ============================================
  // BOM lookup for productBallTypes map
  // menuProductComponents.listAll + componentTypes.list filtered to production
  // ============================================

  const menuProductComps = useQuery(api.menuProductComponents.queries.listAll);
  const componentTypesList = useQuery(api.componentTypes.queries.list, {});

  // enabledComponents = which ball-type codes are active. Default (null config)
  // enables ALL production pcs codes so new ball types in a menu product's BOM
  // aren't silently hidden from the End of Shift form.
  //
  // While componentTypesList is loading we return `undefined` so downstream
  // filters treat it as "no filter — show all". Returning a two-code fallback
  // would briefly hide non-BIG/MID products on first paint.

  const enabledComponents: string[] | undefined = useMemo(() => {
    // When componentTracking is present, derive enabled production codes from it
    if (config?.componentTracking && config.componentTracking.length > 0) {
      // Get all production codes (tier-1 pcs) to filter componentTracking entries
      const prodCodes = new Set(
        (componentTypesList ?? [])
          .filter((ct) => ct.category === 'production' && ct.unit === 'pcs' && ct.isActive)
          .map((ct) => ct.code)
      );
      const derived = config.componentTracking
        .filter((e) => e.tracked && prodCodes.has(e.code))
        .map((e) => e.code);
      // If the derived list is empty (e.g. user only tracked kitchen leaves),
      // fall back to legacy enabledProductionComponents or componentTypesList
      // so products aren't all hidden from the shift form.
      if (derived.length > 0) return derived;
      if (config.enabledProductionComponents && config.enabledProductionComponents.length > 0) {
        return config.enabledProductionComponents;
      }
      return undefined;
    }
    // Legacy: use enabledProductionComponents
    if (config?.enabledProductionComponents) {
      return config.enabledProductionComponents;
    }
    if (!componentTypesList) return undefined; // loading — no filter
    return componentTypesList
      .filter((ct) => ct.category === 'production' && ct.unit === 'pcs' && ct.isActive)
      .map((ct) => ct.code);
  }, [config?.componentTracking, config?.enabledProductionComponents, componentTypesList]);

  const productBallTypes = useMemo(() => {
    if (!menuProductComps || !componentTypesList) return undefined;
    // Exclude inactive rows so stale BOM links to dedupe shadows don't leak
    // codes that fail to match any active `enabledComponents` entry.
    const prodTypes = componentTypesList.filter(
      (ct) => ct.category === 'production' && ct.isActive
    );
    const codeMap = new Map(prodTypes.map((ct) => [String(ct._id), ct.code]));

    const result: Record<string, string[]> = {};
    for (const comp of menuProductComps) {
      const code = codeMap.get(String(comp.componentTypeId));
      if (!code) continue;
      const key = String(comp.menuProductId);
      if (!result[key]) result[key] = [];
      if (!result[key].includes(code)) result[key].push(code);
    }
    return result;
  }, [menuProductComps, componentTypesList]);

  // ============================================
  // Users list for chef selector in EndOfShiftForm
  // ============================================

  const allUsers = useQuery(api.auth.queries.listUsers);
  const kitchenUsers = useMemo(
    () => (allUsers ?? []).filter((u) => u.isActive).map((u) => ({ _id: String(u._id), name: u.name })),
    [allUsers]
  );

  // Ball production per-person attribution for DailySummaryWidget.

  const ballPerPerson = useMemo(() => {
    if (!todayShiftRecords || todayShiftRecords.length === 0) return [];
    const personMap = new Map<string, { submittedBy: string; chefName?: string; totalProduced: number; totalWaste: number }>();

    for (const record of todayShiftRecords) {
      const key = record.chefName ?? record.submittedBy;
      const produced = record.produced.reduce((sum: number, p: { quantity: number }) => sum + p.quantity, 0);
      const waste = record.waste.reduce((sum: number, w: { quantity: number }) => sum + w.quantity, 0);
      const existing = personMap.get(key);
      if (existing) {
        existing.totalProduced += produced;
        existing.totalWaste += waste;
      } else {
        personMap.set(key, {
          submittedBy: record.submittedBy,
          chefName: record.chefName,
          totalProduced: produced,
          totalWaste: waste,
        });
      }
    }
    return Array.from(personMap.values());
  }, [todayShiftRecords]);

  // Chef name from the most recent shift record, surfaced in the page header.

  const latestChefName = todayShiftRecords && todayShiftRecords.length > 0
    ? (todayShiftRecords[0] as { chefName?: string }).chefName
    : undefined;

  // ============================================
  // Collapsible orders toggle state
  // ============================================

  const [ordersOpen, setOrdersOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // ============================================
  // Phase 74 — Attendance: open-shift lookup + D-08 self-clock-out nudge state
  // ============================================

  const openShift = useCurrentOpenShift();
  const [nudgeOpen, setNudgeOpen] = useState(false);

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
      {/* Phase 74: Attendance strip — running timer + Clock-Out button when clocked in;
          renders null otherwise, so zero visual footprint in default state. */}
      <AttendanceStrip />

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
        <div className="flex flex-col items-end gap-0.5">
          <div className="text-sm text-muted-foreground font-medium">
            {new Date().toLocaleDateString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
            })}
          </div>
          {latestChefName && (
            <div className="text-xs text-muted-foreground">
              Shift for: <span className="font-medium text-foreground">{latestChefName}</span>
            </div>
          )}
        </div>
      </header>

      {/* Section 1: Production targets */}
      <section>
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3">
          Today's Targets
        </h2>
        <ProductionTargetsBar
          targets={targets}
          enabledComponents={enabledComponents}
          productBallTypes={productBallTypes}
        />
      </section>

      {/* Section 2: End-of-shift form */}
      <section>
        <EndOfShiftForm
          targets={targets}
          today={today}
          enabledComponents={enabledComponents}
          productBallTypes={productBallTypes}
          users={kitchenUsers}
          kitchenComponents={kitchenComponents ?? []}
          enabledKitchenComponentCodes={
            (() => {
              const kitchenCodeSet = new Set((kitchenComponents ?? []).map((c) => c.code));
              if (config?.componentTracking && config.componentTracking.length > 0) {
                return config.componentTracking
                  .filter((e) => e.tracked && kitchenCodeSet.has(e.code))
                  .map((e) => e.code);
              }
              const legacy = config?.enabledKitchenComponents;
              if (!legacy) return undefined;
              return legacy.filter((code) => kitchenCodeSet.has(code));
            })()
          }
          unitByCode={unitByCode}
          isManager={isManager}
          currentUserId={user?.userId}
          onSubmitted={(selectedChefId: string) => {
            const isSelf =
              selectedChefId === "" ||
              String(selectedChefId) === String(user?.userId ?? "");
            if (isSelf && openShift && !openShift.deletedAt) setNudgeOpen(true);
          }}
        />
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
                (sum: number, p: { quantity: number }) => sum + p.quantity,
                0
              );
              const totalWaste = record.waste.reduce(
                (sum: number, w: { quantity: number }) => sum + w.quantity,
                0
              );
              const { grams: componentGrams, pieces: componentPieces } = sumByUnit(
                record.componentProduced ?? []
              );
              return (
                <Card key={record._id} className="bg-muted/30">
                  <CardContent className="py-2.5 px-3">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-medium text-foreground break-words">
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
                        {componentGrams > 0 && (
                          <span>
                            <span className="font-medium text-foreground">{componentGrams}g</span> components
                          </span>
                        )}
                        {componentPieces > 0 && (
                          <span>
                            <span className="font-medium text-foreground">{componentPieces} pcs</span> components
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

      {/* Section 3b: Daily Summary */}
      {todayShiftRecords !== undefined && todayShiftRecords.length > 0 && (
        <section>
          <DailySummaryWidget
            stats={{
              ballsProduced: todayShiftRecords.reduce(
                (sum: number, r) => sum + r.produced.reduce((s: number, p: { quantity: number }) => s + p.quantity, 0),
                0
              ),
              ordersCompleted: 0,
              packagesBoxed: 0,
              stickersApplied: 0,
              inventoryConsumed: [],
            }}
            componentSummary={dailyComponentSummary ?? []}
            ballPerPerson={ballPerPerson}
          />
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

      {/* Section 5: Manager settings (manager/admin only) — collapsible */}
      {isManager && (
        <section className="border-t pt-4">
          <button
            type="button"
            className="flex items-center justify-between w-full rounded-lg border border-border bg-card px-4 py-3 text-sm font-medium text-foreground hover:bg-accent/50 transition-colors"
            onClick={() => setSettingsOpen((v) => !v)}
          >
            <span className="flex items-center gap-2">
              <Settings className="h-4 w-4 text-muted-foreground" />
              Manager Settings
            </span>
            {settingsOpen ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </button>

          {settingsOpen && (
            <div className="mt-3 space-y-6">
              <ManagerTargetSettings
                config={config}
                targets={targets}
                today={today}
              />
              <ShiftHistoryList />
            </div>
          )}
        </section>
      )}

      {/* Phase 74 D-08: Self-clock-out nudge. Opens ONLY when the submitter is
          clocking out themselves (see onSubmitted handler above). Renders null when
          attendanceId is null — safe to render unconditionally. */}
      <ClockOutNudgeDialog
        open={nudgeOpen}
        onOpenChange={setNudgeOpen}
        attendanceId={openShift?._id ?? null}
      />
    </div>
  );
}
