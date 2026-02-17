/**
 * DispatchPlanner - Main page for the Unified Dispatch Planner.
 *
 * Shows a rolling 7-day grid with all channels (Direct, GoFood, K3Mart, Consignment),
 * collapsible channel groups, editable cells with auto-save, segmented capacity bars,
 * week navigation, channel settings dialog, and inventory simulation.
 *
 * Desktop-only. Requires canAccessDashboard permission.
 */

import { useState, useMemo, useCallback } from "react";
import { Settings, FlaskConical, Loader2 } from "lucide-react";
import { toast } from "sonner";

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

// Hooks
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import {
  useDispatchPlannerWeekly,
  useDispatchPlannerSettings,
  useDispatchSavePlanCell,
  useDispatchSimulateInventory,
} from "@/hooks/convex";

// ============================================
// Date helpers
// ============================================

/** Get the Monday of the current week in Jakarta timezone */
function getCurrentMonday(): string {
  const now = new Date();
  const todayStr = now.toLocaleDateString("en-CA", {
    timeZone: "Asia/Jakarta",
  });
  const today = new Date(todayStr + "T00:00:00+07:00");
  const dayOfWeek = today.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  today.setDate(today.getDate() + mondayOffset);
  return today.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
}

// ============================================
// Main Component
// ============================================

export function DispatchPlanner() {
  useDocumentTitle("Dispatch Planner");

  // Week navigation state
  const [startDate, setStartDate] = useState(() => getCurrentMonday());
  const isCurrentWeek = startDate === getCurrentMonday();

  // Settings dialog state
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Simulation state
  const [simulationStartDate, setSimulationStartDate] = useState("");
  const [simulationLoading, setSimulationLoading] = useState(false);

  // Data hooks
  const { data: weeklyData, isLoading: loadingWeekly } =
    useDispatchPlannerWeekly(startDate);
  const { data: settingsData } = useDispatchPlannerSettings();
  const savePlanCell = useDispatchSavePlanCell();
  const { data: simulationResults, isLoading: loadingSimulation } =
    useDispatchSimulateInventory(simulationStartDate);

  // Handle week navigation
  const handleNavigate = useCallback((newStart: string) => {
    setStartDate(newStart);
    // Clear simulation when navigating to a new week
    setSimulationStartDate("");
  }, []);

  // Handle cell save
  const handleSaveCell: SaveCellFn = useCallback(
    async (channel, outletId, menuProductId, date, qty) => {
      try {
        await savePlanCell({
          channel,
          outletId: outletId as any,
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

  // Handle simulate inventory
  const handleSimulate = useCallback(() => {
    setSimulationLoading(true);
    setSimulationStartDate(startDate);
    // Loading will resolve when the query returns
  }, [startDate]);

  // Stop showing loading once simulation data arrives
  const simLoading = simulationLoading && loadingSimulation;
  if (simulationLoading && !loadingSimulation) {
    // Simulation data has arrived
    setSimulationLoading(false);
  }

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
        <PageHeader title="Dispatch Planner" description="Loading..." />
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
        title="Dispatch Planner"
        description={subtitle}
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSimulate}
              disabled={simLoading}
              className="gap-2"
            >
              {simLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FlaskConical className="h-4 w-4" />
              )}
              Simulate Inventory
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSettingsOpen(true)}
              className="gap-2"
            >
              <Settings className="h-4 w-4" />
              Settings
            </Button>
          </div>
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
          simulationResults={
            simulationStartDate === startDate
              ? simulationResults ?? undefined
              : undefined
          }
        />
      ) : (
        <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground">
          No data available for this week.
        </div>
      )}

      {/* Channel Settings Dialog */}
      <ChannelSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
      />
    </div>
  );
}
