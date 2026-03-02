/**
 * PlannerGrid - Grid orchestrator that assembles the full dispatch planner table.
 *
 * Composes CapacityBar per day column, ChannelGroup per channel,
 * daily column totals, and optional simulation result indicators.
 *
 * All sticky positioning is relative to the parent scroll container
 * (overflow-y: auto on the card in DispatchPlanner). WeekNav sticks at top-0,
 * this grid header sticks at top-{weekNavHeight}, and channel headers stack below.
 */

import React, { useMemo, useRef, useState, useEffect } from "react";
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
  /** BOM-expanded ball count per date per channel (for capacity bars and channel subtotals) */
  dailyBallTotalsByChannel?: Record<string, Record<string, number>>;
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
  /** Height of WeekNav in pixels — grid header sticks below it */
  weekNavHeight?: number;
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
  weekNavHeight = 56,
}: PlannerGridProps) {
  const { dates, todayStr, dailyCapacity, channels, dailyTotals, dailyBallTotals, dailyBallTotalsByChannel } = data;

  // Build capacity bar segments per day using BOM-expanded ball counts
  const capacitySegments = useMemo(() => {
    const result: Record<string, Array<{ channelKey: string; quantity: number; color: string }>> = {};
    for (const date of dates) {
      // Use BOM-expanded ball counts per channel when available, fall back to raw product counts
      const dayBallsByChannel = dailyBallTotalsByChannel?.[date] ?? {};
      const dayTotals = dailyTotals[date] ?? {};
      const segments: Array<{ channelKey: string; quantity: number; color: string }> = [];
      for (const channel of channels) {
        const qty = dayBallsByChannel[channel.channelKey] ?? dayTotals[channel.channelKey] ?? 0;
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
  }, [dates, dailyTotals, dailyBallTotalsByChannel, channels]);

  // Compute grand total per day (across all channels) using BOM-expanded ball counts
  const grandTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const date of dates) {
      // Use BOM-expanded ball totals when available, fall back to raw product totals
      if (dailyBallTotals?.[date] != null) {
        totals[date] = dailyBallTotals[date];
      } else {
        const dayTotals = dailyTotals[date] ?? {};
        totals[date] = Object.values(dayTotals).reduce((sum, v) => sum + v, 0);
      }
    }
    return totals;
  }, [dates, dailyTotals, dailyBallTotals]);

  // Build simulation status map
  const simStatusMap = useMemo(() => {
    if (!simulationResults) return null;
    const map: Record<string, SimulationResult> = {};
    for (const r of simulationResults) {
      map[r.date] = r;
    }
    return map;
  }, [simulationResults]);

  // Compute per-channel daily totals for ChannelGroup subtotals using BOM-expanded ball counts
  const channelDailyTotals = useMemo(() => {
    const result: Record<string, Record<string, number>> = {};
    for (const channel of channels) {
      result[channel.channelKey] = {};
      for (const date of dates) {
        // Use BOM-expanded ball counts per channel when available, fall back to raw product counts
        result[channel.channelKey][date] =
          dailyBallTotalsByChannel?.[date]?.[channel.channelKey] ??
          dailyTotals[date]?.[channel.channelKey] ?? 0;
      }
    }
    return result;
  }, [channels, dates, dailyTotals, dailyBallTotalsByChannel]);

  // Measure grid header height so channel headers can stack right below it
  const headerRef = useRef<HTMLDivElement>(null);
  const [headerHeight, setHeaderHeight] = useState(120);

  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setHeaderHeight(entry.contentRect.height);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Channel headers stick at: weekNavHeight + grid header height
  const channelStickyTop = weekNavHeight + headerHeight;

  // Empty state
  if (channels.length === 0) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        No channels configured. Open Settings to configure dispatch channels.
      </div>
    );
  }

  return (
    <div className="min-w-[700px]">
      {/* ==========================================
          GRID HEADER (sticky below WeekNav)
          Sticks at top: weekNavHeight within the scroll container.
          z-30 beats channel group wrappers (z-21..23) and content rows.
          ========================================== */}
      <div
        ref={headerRef}
        className="sticky z-30 bg-card border-b shadow-sm"
        style={{ top: `${weekNavHeight}px` }}
      >
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
      </div>

      {/* ==========================================
          TABLE BODY: Channel groups + footer
          No stacking context on the wrapper — all sticky headers
          share the scroll container's stacking context.
          Each ChannelGroup gets a reverse-order z-index so that
          earlier groups' sticky headers always paint above later
          groups' content rows.
          ========================================== */}
      <div>
        {channels.map((channel, index) => (
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
            stickyTop={channelStickyTop}
            channelIndex={index}
            totalChannels={channels.length}
          />
        ))}

        {/* ==========================================
            TABLE FOOTER: Grand totals (BOM-expanded ball counts)
            ========================================== */}
        <div className="flex border-t-2 border-border bg-muted/20">
          <div className="w-[200px] min-w-[200px] px-3 py-2">
            <span className="text-sm font-bold text-foreground">Total Balls</span>
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
                  {total > 0 ? total.toLocaleString() : "--"}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
});
