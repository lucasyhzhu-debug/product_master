/**
 * DispatchPlanner - Main page for the Unified Dispatch Planner.
 *
 * Shows a rolling 7-day grid with all channels (Direct, GoFood, K3Mart, Consignment),
 * collapsible channel groups, editable cells with auto-save, segmented capacity bars,
 * week navigation, channel settings dialog, and inventory simulation.
 *
 * Desktop-only. Requires canAccessDashboard permission.
 */

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { Settings, Utensils } from "lucide-react";
import { toast } from "sonner";
import type { Id } from "../../convex/_generated/dataModel";

// UI
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

// Layout
import { PageHeader } from "@/components/layout/PageHeader";

// Dispatch Planner components
import {
  WeekNav,
  PlannerGrid,
  ChannelSettingsDialog,
} from "@/components/dispatchPlanner";
import type { SaveCellFn } from "@/components/dispatchPlanner";
import { MaterialsCheckPanel } from "@/components/dispatchPlanner/MaterialsCheckPanel";

// Hooks
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import {
  useDispatchPlannerWeekly,
  useDispatchPlannerSettings,
  useDispatchChannelConfig,
  useDispatchSeedDefaults,
  useDispatchSavePlanCell,
  useGetBallTotalsForDate,
  useSetKitchenDailyOverride,
} from "@/hooks/convex";

// ============================================
// Date helpers
// ============================================

/**
 * Get yesterday's date in Jakarta timezone (UTC+7).
 * This anchors the 7-day grid so today is always the second column.
 */
export function getYesterday(): string {
  const now = new Date();
  // Get today in Jakarta timezone
  const todayStr = now.toLocaleDateString("en-CA", {
    timeZone: "Asia/Jakarta",
  });
  // Subtract 1 day
  const today = new Date(todayStr + "T12:00:00+07:00");
  today.setDate(today.getDate() - 1);
  return today.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
}

// ============================================
// Save targets for kitchen (per-day button)
// ============================================

function SaveTargetButton({ date }: { date: string }) {
  const ballTotals = useGetBallTotalsForDate(date);
  const setOverride = useSetKitchenDailyOverride();
  const [saving, setSaving] = useState(false);

  const hasData = ballTotals && (ballTotals.bigBalls > 0 || ballTotals.midBalls > 0);

  const handleSave = async () => {
    if (!ballTotals) {
      toast.error("No dispatch plan data for this date");
      return;
    }
    setSaving(true);
    try {
      await setOverride({
        date,
        bigBallOverride: ballTotals.bigBalls,
        midBallOverride: ballTotals.midBalls,
        packagingOverrides: ballTotals.packagingBreakdown.map((p) => ({
          menuProductId: p.menuProductId as Id<"menuProducts">,
          quantity: p.quantity,
        })),
        source: "restock_planner",
      });
      toast.success(`Targets saved for kitchen on ${date}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save targets");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleSave}
      disabled={saving || !hasData}
      title={hasData ? `${ballTotals.bigBalls} Jumbo + ${ballTotals.midBalls} Original balls` : "No dispatch plan for this date"}
      className="w-full flex-col gap-0.5 h-auto py-1 px-1 text-[10px] leading-tight"
    >
      <Utensils className="h-3 w-3" />
      <span>{saving ? "Saving…" : "Save to\nKitchen"}</span>
    </Button>
  );
}

// ============================================
// Main Component
// ============================================

export function DispatchPlanner() {
  useDocumentTitle("Planner");

  // Week navigation state
  const [startDate, setStartDate] = useState(() => getYesterday());
  const isCurrentWeek = startDate === getYesterday();

  // Settings dialog state
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Data hooks
  const { data: weeklyData, isLoading: loadingWeekly } =
    useDispatchPlannerWeekly(startDate);
  const { data: settingsData } = useDispatchPlannerSettings();
  const { data: channelConfig } = useDispatchChannelConfig();
  const seedDefaults = useDispatchSeedDefaults();
  const savePlanCell = useDispatchSavePlanCell();

  // Auto-seed on first visit when no channel config exists
  const seededRef = useRef(false);
  useEffect(() => {
    if (channelConfig !== undefined && channelConfig.length === 0 && !seededRef.current) {
      seededRef.current = true;
      seedDefaults({}).then(() => {
        toast.success("Restock planner initialized with default settings");
      }).catch((err: unknown) => {
        console.error("Failed to seed defaults:", err);
      });
    }
  }, [channelConfig, seedDefaults]);

  // Handle week navigation
  const handleNavigate = useCallback((newStart: string) => {
    setStartDate(newStart);
  }, []);

  // Handle cell save
  const handleSaveCell: SaveCellFn = useCallback(
    async (channel, outletId, menuProductId, date, qty) => {
      try {
        // "direct-manual" is a display-only sentinel from the query — NOT a valid Convex ID.
        // Strip it to undefined so the mutation validator accepts the call.
        const resolvedOutletId =
          outletId === "direct-manual" ? undefined : (outletId as any);
        await savePlanCell({
          channel,
          outletId: resolvedOutletId,
          menuProductId: menuProductId as any,
          date,
          plannedQty: qty,
        });
      } catch (error) {
        console.error("Failed to save cell:", error);
        toast.error("Failed to save plan");
      }
    },
    [savePlanCell]
  );

  // Derive capacity from settings
  const capacity = settingsData?.dailyCapacity ?? 200;

  // Format subtitle
  const subtitle = useMemo(() => {
    const totalChannels = weeklyData?.channels?.length ?? 0;
    return `${totalChannels} channel${totalChannels !== 1 ? "s" : ""} active | Capacity: ${capacity}/day`;
  }, [weeklyData, capacity]);

  // Loading state
  if (loadingWeekly) {
    return (
      <div className="space-y-6">
        <PageHeader title="Planner" description="Loading..." />
        <Skeleton className="h-14 w-full rounded-lg" />
        <Skeleton className="h-8 w-full rounded-lg" />
        <div className="space-y-1">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Page Header with actions */}
      <PageHeader
        title="Planner"
        description={subtitle}
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSettingsOpen(true)}
            className="gap-2"
          >
            <Settings className="h-4 w-4" />
            Settings
          </Button>
        }
      />

      {/* Week Navigation */}
      <WeekNav
        startDate={startDate}
        onNavigate={handleNavigate}
        isCurrentWeek={isCurrentWeek}
      />

      {/* Main Grid */}
      {weeklyData ? (
        <PlannerGrid
          data={weeklyData}
          onSaveCell={handleSaveCell}
          renderColumnAction={(date) => <SaveTargetButton date={date} />}
        />
      ) : (
        <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground">
          No data available for this week.
        </div>
      )}

      {/* Materials Check Panel */}
      <MaterialsCheckPanel startDate={startDate} />

      {/* Channel Settings Dialog */}
      <ChannelSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
      />
    </div>
  );
}
