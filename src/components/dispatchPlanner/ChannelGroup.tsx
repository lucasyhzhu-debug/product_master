/**
 * ChannelGroup - Collapsible channel section in the Dispatch Planner grid.
 *
 * 3-level hierarchy: Channel header > Outlet rows > Product rows
 * - Channel header: colored left border, name, expand/collapse, subtotal row
 * - Outlet sub-header: indented, outlet name
 * - Product rows: most indented, product name + 7 day cells
 * - Direct orders: shows faded cell at production-start day, solid at dueDate
 * - Smooth expand/collapse animation via CSS max-height transition
 *
 * Sticky headers work within a scroll container (overflow-y: auto on the card).
 * Each channel group wrapper has position:relative + a reverse-order z-index so
 * earlier groups' sticky headers always paint above later groups' content rows.
 *
 * NOTE: We intentionally do NOT use Framer Motion overflow-hidden or transform-based
 * animations on this component. Those create new stacking contexts that break sticky
 * z-index layering between channel groups. CSS max-height transition is used instead.
 */

import React, { useState, useMemo, useCallback } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { PlannerCell } from "./PlannerCell";
import type { Id } from "../../../convex/_generated/dataModel";

// Framer Motion is intentionally NOT imported here — see module comment above.

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

/** Height of a single channel header row in pixels (used for stacking offset) */
export const CHANNEL_HEADER_HEIGHT = 36;

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
  /** Pixel offset from scroll container top where the FIRST channel header should stick */
  stickyTop?: number;
  /** Zero-based index of this channel in the list (for incremental sticky stacking) */
  channelIndex?: number;
  /** Total number of channels (used to compute reverse-order z-index for correct layering) */
  totalChannels?: number;
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
  channelIndex = 0,
  totalChannels = 1,
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

  // Incremental sticky top: each channel header stacks below the previous ones.
  // Channel 0 sticks at stickyTop, channel 1 at stickyTop + 36, etc.
  const computedStickyTop = stickyTop != null
    ? stickyTop + channelIndex * CHANNEL_HEADER_HEIGHT
    : undefined;

  // Reverse-order z-index on the wrapper: the first channel group in DOM order
  // gets the highest z so its sticky header always paints above later groups' content.
  // Base z-index is 20; we add (totalChannels - channelIndex) so index 0 is highest.
  // z-index 20+N keeps all channel groups below the grid header (z-30) and WeekNav (z-40).
  const wrapperZIndex = 20 + (totalChannels - channelIndex);

  if (outlets.length === 0) return null;

  return (
    // position:relative + explicit z-index ensures this group forms its own
    // stacking context at the right level. Reverse order means group 0 always
    // sits above group 1, group 1 above group 2, etc. — so earlier groups'
    // sticky headers are never covered by later groups' content rows.
    <div
      className="border-b last:border-b-0"
      style={{ position: "relative", zIndex: wrapperZIndex }}
    >
      {/* Channel header — sticky within scroll container.
          z-[25] is effectively overridden by the wrapper's z-index context,
          but we still set it for clarity. The wrapper z-index is what matters
          for cross-group layering. Within the group, the header's sticky
          position ensures it stacks above its own content rows. */}
      <button
        onClick={toggleExpand}
        className="w-full flex items-center hover:bg-muted/30 transition-colors sticky bg-card shadow-[0_1px_0_0_var(--color-border)]"
        style={{
          borderLeft: `4px solid ${color}`,
          top: computedStickyTop != null ? `${computedStickyTop}px` : undefined,
          // Use the local z-index that beats any non-positioned sibling within this group.
          // The wrapper's stacking context handles cross-group ordering.
          zIndex: wrapperZIndex + 5,
        }}
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

      {/* Expanded content: outlet rows and product rows.
          CSS max-height transition instead of Framer Motion — avoids the
          transform/will-change stacking context that Framer Motion creates
          during animation, which would break sticky z-index layering. */}
      <div
        style={{
          borderLeft: `4px solid ${color}20`,
          overflow: "hidden",
          maxHeight: isExpanded ? "10000px" : "0px",
          // No transition on expand (instant open), very fast collapse.
          // A long transition on max-height causes a delay before content
          // appears because CSS animates from 0 to 10000px even if content
          // is only 200px. We use a quick collapse only.
          transition: isExpanded ? "max-height 0ms" : "max-height 200ms ease-in-out",
        }}
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
      </div>
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
