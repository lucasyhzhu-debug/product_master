/**
 * PlannerGrid - Grid orchestrator that assembles the full dispatch planner table.
 *
 * Composes CapacityBar per day column, ChannelGroup per channel,
 * daily column totals, and optional simulation result indicators.
 *
 * Layout: HTML table-like structure (same approach as K3Mart WeeklyPlannerGrid).
 */

import React, { useMemo } from "react";
import { cn } from "@/lib/utils";
import { CapacityBar, CHANNEL_COLORS } from "./CapacityBar";
import { ChannelGroup } from "./ChannelGroup";
import type { SaveCellFn } from "./ChannelGroup";
import type { Id } from "../../../convex/_generated/dataModel";

// ============================================
// Types (matching backend query return)
// ============================================

interface PlanCell {
  plannedQty: number;
  actualQty?: number;
  source: string;
  isReadOnly: boolean;
  isFaded?: boolean;
}

interface ProductRow {
  menuProductId: Id<"menuProducts">;
  productName: string;
  cells: Record<string, PlanCell>;
}

interface OutletRow {
  id: string;
  name: string;
  type: "outlet" | "order" | "consignment";
  orderId?: Id<"orders">;
  orderNumber?: string;
  dueDate?: string;
  productionStartDate?: string;
  products: ProductRow[];
}

interface ChannelSection {
  channelKey: string;
  displayName: string;
  color: string;
  priority: number;
  isEditable: boolean;
  outlets: OutletRow[];
}

export interface UnifiedWeeklyPlanData {
  dates: string[];
  todayStr: string;
  dailyCapacity: number;
  channels: ChannelSection[];
  dailyTotals: Record<string, Record<string, number>>;
  /** BOM-expanded ball count per date (from backend) */
  dailyBallTotals?: Record<string, number>;
}

export interface SimulationResult {
  date: string;
  status: "ok" | "low" | "out";
  shortages: Array<{
    componentTypeName: string;
    required: number;
    available: number;
    deficit: number;
  }>;
  ingredientShortages: Array<{
    ingredientName: string;
    required: number;
    available: number;
    deficit: number;
    runsOutDate: string | null;
  }>;
}

interface PlannerGridProps {
  data: UnifiedWeeklyPlanData;
  onSaveCell: SaveCellFn;
  simulationResults?: SimulationResult[];
  /** Optional per-column action rendered at the top of each date column (above channel rows) */
  renderColumnAction?: (date: string) => React.ReactNode;
}

// ============================================
// Date formatting helpers
// ============================================

function formatDayHeader(date: string): { dayName: string; dateLabel: string } {
  const d = new Date(date + "T00:00:00+07:00");
  const dayName = d.toLocaleDateString("en-US", {
    weekday: "short",
    timeZone: "Asia/Jakarta",
  });
  const dateLabel = d.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Jakarta",
  });
  return { dayName, dateLabel };
}

function isWeekend(date: string): boolean {
  const d = new Date(date + "T00:00:00+07:00");
  const day = d.getDay();
  return day === 0 || day === 6;
}

// ============================================
// Component
// ============================================

export const PlannerGrid = React.memo(function PlannerGrid({
  data,
  onSaveCell,
  simulationResults,
  renderColumnAction,
}: PlannerGridProps) {
  const { dates, todayStr, dailyCapacity, channels, dailyTotals, dailyBallTotals } = data;

  // Build capacity bar segments per day
  const capacitySegments = useMemo(() => {
    const result: Record<string, Array<{ channelKey: string; quantity: number; color: string }>> = {};
    for (const date of dates) {
      const dayTotals = dailyTotals[date] ?? {};
      const segments: Array<{ channelKey: string; quantity: number; color: string }> = [];
      for (const channel of channels) {
        const qty = dayTotals[channel.channelKey] ?? 0;
        if (qty > 0) {
          segments.push({
            channelKey: channel.channelKey,
            quantity: qty,
            color: channel.color || CHANNEL_COLORS[channel.channelKey] || "#888",
          });
        }
      }
      result[date] = segments;
    }
    return result;
  }, [dates, dailyTotals, channels]);

  // Compute grand total per day (across all channels)
  const grandTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const date of dates) {
      const dayTotals = dailyTotals[date] ?? {};
      totals[date] = Object.values(dayTotals).reduce((sum, v) => sum + v, 0);
    }
    return totals;
  }, [dates, dailyTotals]);

  // Build simulation status map
  const simStatusMap = useMemo(() => {
    if (!simulationResults) return null;
    const map: Record<string, SimulationResult> = {};
    for (const r of simulationResults) {
      map[r.date] = r;
    }
    return map;
  }, [simulationResults]);

  // Compute per-channel daily totals for ChannelGroup subtotals
  const channelDailyTotals = useMemo(() => {
    const result: Record<string, Record<string, number>> = {};
    for (const channel of channels) {
      result[channel.channelKey] = {};
      for (const date of dates) {
        result[channel.channelKey][date] =
          dailyTotals[date]?.[channel.channelKey] ?? 0;
      }
    }
    return result;
  }, [channels, dates, dailyTotals]);

  // Empty state
  if (channels.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground">
        No channels configured. Open Settings to configure dispatch channels.
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <div className="min-w-[700px]">
          {/* ==========================================
              TABLE HEADER
              ========================================== */}

          {/* Row 1: Day column headers */}
          <div className="flex border-b bg-muted/30">
            <div className="w-[200px] min-w-[200px] px-3 py-2">
              <span className="text-xs font-medium text-muted-foreground">
                Channel / Product
              </span>
            </div>
            <div className="flex flex-1">
              {dates.map((date) => {
                const { dayName, dateLabel } = formatDayHeader(date);
                const isToday = date === todayStr;
                const weekend = isWeekend(date);
                const simResult = simStatusMap?.[date];

                return (
                  <div
                    key={date}
                    className={cn(
                      "flex-1 text-center py-2 border-l border-border",
                      isToday && "bg-primary/10 border-l-2 border-l-primary",
                      weekend && !isToday && "bg-amber-50/30 dark:bg-amber-900/10",
                      simResult?.status === "out" && "border-l-2 border-l-red-500",
                      simResult?.status === "low" && "border-l-2 border-l-yellow-500",
                      simResult?.status === "ok" && simulationResults && "border-l-2 border-l-green-500"
                    )}
                  >
                    <div className="text-xs font-medium text-foreground">
                      {dayName}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {dateLabel}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Row 2: Capacity bars */}
          <div className="flex border-b">
            <div className="w-[200px] min-w-[200px] px-3 py-1 flex items-center">
              <span className="text-[10px] text-muted-foreground">
                Capacity
              </span>
            </div>
            <div className="flex flex-1">
              {dates.map((date) => (
                <div
                  key={date}
                  className={cn(
                    "flex-1 py-1 border-l border-border",
                    date === todayStr && "bg-primary/5"
                  )}
                >
                  <CapacityBar
                    segments={capacitySegments[date] ?? []}
                    capacity={dailyCapacity}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Row 3: Per-column action buttons (e.g. Save to Kitchen) */}
          {renderColumnAction && (
            <div className="flex border-b">
              <div className="w-[200px] min-w-[200px] px-3 py-1 flex items-center">
                <span className="text-[10px] text-muted-foreground">Kitchen</span>
              </div>
              <div className="flex flex-1">
                {dates.map((date) => (
                  <div
                    key={date}
                    className={cn(
                      "flex-1 py-1 border-l border-border flex items-center justify-center",
                      date === todayStr && "bg-primary/5"
                    )}
                  >
                    {renderColumnAction(date)}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ==========================================
              TABLE BODY: Channel groups
              ========================================== */}
          {channels.map((channel) => (
            <ChannelGroup
              key={channel.channelKey}
              channelKey={channel.channelKey}
              displayName={channel.displayName}
              color={channel.color}
              isEditable={channel.isEditable}
              outlets={channel.outlets}
              dates={dates}
              todayStr={todayStr}
              dailyTotals={channelDailyTotals[channel.channelKey] ?? {}}
              onSaveCell={onSaveCell}
            />
          ))}

          {/* ==========================================
              TABLE FOOTER: Grand totals
              ========================================== */}
          <div className="flex border-t-2 border-border bg-muted/20">
            <div className="w-[200px] min-w-[200px] px-3 py-2">
              <span className="text-sm font-bold text-foreground">Total Products</span>
            </div>
            <div className="flex flex-1">
              {dates.map((date) => {
                const total = grandTotals[date] ?? 0;
                const overCapacity = total > dailyCapacity;
                return (
                  <div
                    key={date}
                    className={cn(
                      "flex-1 h-9 flex items-center justify-center text-sm tabular-nums font-bold border-l border-border",
                      date === todayStr && "bg-primary/5",
                      overCapacity && "text-red-600"
                    )}
                  >
                    {total > 0 ? total : "--"}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Balls footer row: BOM-expanded ball count per day */}
          {dailyBallTotals && Object.keys(dailyBallTotals).length > 0 && (
            <div className="flex border-t border-border bg-blue-50 dark:bg-blue-950/30">
              <div className="w-[200px] min-w-[200px] px-3 py-2">
                <span className="text-sm font-semibold text-blue-700 dark:text-blue-300">Total Units (balls)</span>
              </div>
              <div className="flex flex-1">
                {dates.map((date) => {
                  const balls = dailyBallTotals[date] ?? 0;
                  return (
                    <div
                      key={date}
                      className={cn(
                        "flex-1 h-9 flex items-center justify-center text-sm tabular-nums font-semibold border-l border-border text-blue-700 dark:text-blue-300",
                        date === todayStr && "bg-primary/5"
                      )}
                    >
                      {balls > 0 ? balls.toLocaleString() : "--"}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
