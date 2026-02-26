/**
 * ChannelGroup - Collapsible channel section in the Dispatch Planner grid.
 *
 * 3-level hierarchy: Channel header > Outlet rows > Product rows
 * - Channel header: colored left border, name, expand/collapse, subtotal row
 * - Outlet sub-header: indented, outlet name
 * - Product rows: most indented, product name + 7 day cells
 * - Direct orders: shows faded cell at production-start day, solid at dueDate
 * - Smooth expand/collapse animation with Framer Motion
 */

import React, { useState, useMemo, useCallback } from "react";
import { ChevronDown } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { PlannerCell } from "./PlannerCell";
import type { Id } from "../../../convex/_generated/dataModel";

// ============================================
// Types
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

interface OutletData {
  id: string;
  name: string;
  type: "outlet" | "order" | "consignment";
  orderId?: Id<"orders">;
  orderNumber?: string;
  dueDate?: string;
  productionStartDate?: string;
  products: ProductRow[];
}

export type SaveCellFn = (
  channel: string,
  outletId: string,
  menuProductId: string,
  date: string,
  qty: number
) => void;

interface ChannelGroupProps {
  channelKey: string;
  displayName: string;
  color: string;
  isEditable: boolean;
  outlets: OutletData[];
  dates: string[];
  todayStr: string;
  dailyTotals: Record<string, number>;
  onSaveCell: SaveCellFn;
  defaultExpanded?: boolean;
  /** Pixel offset from viewport top where channel header should stick */
  stickyTop?: number;
}

// ============================================
// Component
// ============================================

export const ChannelGroup = React.memo(function ChannelGroup({
  channelKey,
  displayName,
  color,
  isEditable,
  outlets,
  dates,
  todayStr,
  dailyTotals,
  onSaveCell,
  defaultExpanded = false,
  stickyTop,
}: ChannelGroupProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const toggleExpand = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  // Calculate channel subtotals per day
  const subtotals = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const date of dates) {
      totals[date] = dailyTotals[date] ?? 0;
    }
    return totals;
  }, [dates, dailyTotals]);

  if (outlets.length === 0) return null;

  return (
    <div className="border-b last:border-b-0">
      {/* Channel header row — sticky below grid header */}
      <button
        onClick={toggleExpand}
        className="w-full flex items-center hover:bg-muted/30 transition-colors sticky z-10 bg-card shadow-[0_1px_0_0_var(--color-border)]"
        style={{ borderLeft: `4px solid ${color}`, top: stickyTop != null ? `${stickyTop}px` : undefined }}
      >
        {/* Label column */}
        <div className="w-[200px] min-w-[200px] flex items-center gap-2 px-3 py-2">
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform flex-shrink-0",
              !isExpanded && "-rotate-90"
            )}
          />
          <span className="font-semibold text-sm truncate">{displayName}</span>
          <span className="text-xs text-muted-foreground">
            ({outlets.length})
          </span>
        </div>

        {/* Subtotal cells */}
        <div className="flex flex-1">
          {dates.map((date) => (
            <div
              key={date}
              className={cn(
                "flex-1 h-9 flex items-center justify-center text-sm tabular-nums font-bold border-l border-border",
                date === todayStr && "bg-primary/5",
                new Date(date + "T00:00:00+07:00").getDay() === 0 ||
                  new Date(date + "T00:00:00+07:00").getDay() === 6
                  ? "bg-amber-50/30 dark:bg-amber-900/10"
                  : ""
              )}
            >
              {subtotals[date] > 0 ? subtotals[date] : "--"}
            </div>
          ))}
        </div>
      </button>

      {/* Expanded content: outlet rows and product rows */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden"
            style={{ borderLeft: `4px solid ${color}20` }}
          >
            {outlets.map((outlet) => (
              <OutletSection
                key={outlet.id}
                outlet={outlet}
                channelKey={channelKey}
                isEditable={isEditable}
                dates={dates}
                todayStr={todayStr}
                onSaveCell={onSaveCell}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

// ============================================
// Outlet Section (sub-component)
// ============================================

interface OutletSectionProps {
  outlet: OutletData;
  channelKey: string;
  isEditable: boolean;
  dates: string[];
  todayStr: string;
  onSaveCell: SaveCellFn;
}

const OutletSection = React.memo(function OutletSection({
  outlet,
  channelKey,
  isEditable,
  dates,
  todayStr,
  onSaveCell,
}: OutletSectionProps) {
  return (
    <div>
      {/* Outlet sub-header */}
      <div className="flex items-center bg-muted/20">
        <div className="w-[200px] min-w-[200px] px-3 py-1.5 pl-8">
          <span className="text-xs font-medium text-muted-foreground truncate block">
            {outlet.name}
          </span>
        </div>
        <div className="flex flex-1">
          {dates.map((date) => (
            <div key={date} className="flex-1 h-7 border-l border-border" />
          ))}
        </div>
      </div>

      {/* Product rows */}
      {outlet.products.map((product) => (
        <ProductRowComponent
          key={`${outlet.id}-${product.menuProductId}`}
          product={product}
          outlet={outlet}
          channelKey={channelKey}
          isEditable={isEditable}
          dates={dates}
          todayStr={todayStr}
          onSaveCell={onSaveCell}
        />
      ))}
    </div>
  );
});

// ============================================
// Product Row (sub-component)
// ============================================

interface ProductRowComponentProps {
  product: ProductRow;
  outlet: OutletData;
  channelKey: string;
  isEditable: boolean;
  dates: string[];
  todayStr: string;
  onSaveCell: SaveCellFn;
}

const ProductRowComponent = React.memo(function ProductRowComponent({
  product,
  outlet,
  channelKey,
  isEditable,
  dates,
  todayStr,
  onSaveCell,
}: ProductRowComponentProps) {
  const handleSave = useCallback(
    (date: string, qty: number) => {
      onSaveCell(channelKey, outlet.id, product.menuProductId as string, date, qty);
    },
    [onSaveCell, channelKey, outlet.id, product.menuProductId]
  );

  return (
    <div className="flex items-center border-t border-border/50">
      {/* Product name */}
      <div className="w-[200px] min-w-[200px] px-3 py-1 pl-12">
        <span className="text-xs text-foreground truncate block">
          {product.productName}
        </span>
      </div>

      {/* Day cells */}
      <div className="flex flex-1">
        {dates.map((date) => {
          const cell = product.cells[date];
          const isPast = date < todayStr;
          const cellReadOnly = !isEditable || cell?.isReadOnly || false;

          return (
            <div
              key={date}
              className={cn(
                "flex-1 border-l border-border",
                date === todayStr && "bg-primary/5",
                !isPast &&
                  (new Date(date + "T00:00:00+07:00").getDay() === 0 ||
                    new Date(date + "T00:00:00+07:00").getDay() === 6)
                  ? "bg-amber-50/30 dark:bg-amber-900/10"
                  : ""
              )}
            >
              <PlannerCell
                value={cell?.plannedQty ?? 0}
                isReadOnly={cellReadOnly}
                isFaded={cell?.isFaded ?? false}
                isPast={isPast}
                onSave={(qty) => handleSave(date, qty)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
});
