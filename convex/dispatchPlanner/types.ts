/**
 * Shared types for the dispatch planner module.
 * Used by queries.ts and helpers/ directory.
 */
import type { Id } from "../_generated/dataModel";

/** Cell data for a single date slot in the grid */
export interface PlanCell {
  plannedQty: number;
  actualQty?: number;
  source: string;
  isReadOnly: boolean;
  isFaded?: boolean;
}

/** Product row within an outlet */
export interface ProductRow {
  menuProductId: Id<"menuProducts">;
  productName: string;
  cells: Record<string, PlanCell>;
}

/** Outlet row within a channel */
export interface OutletRow {
  id: string;
  name: string;
  type: "outlet" | "order" | "consignment";
  orderId?: Id<"orders">;
  orderNumber?: string;
  dueDate?: string;
  productionStartDate?: string;
  products: ProductRow[];
}

/** Channel section in the grid */
export interface ChannelSection {
  channelKey: string;
  displayName: string;
  color: string;
  priority: number;
  isEditable: boolean;
  outlets: OutletRow[];
}

/** Full return type for getUnifiedWeeklyPlan */
export interface UnifiedWeeklyPlan {
  dates: string[];
  todayStr: string;
  dailyCapacity: number;
  channels: ChannelSection[];
  dailyTotals: Record<string, Record<string, number>>;
  /** BOM-expanded ball count per date (sum of bigBalls + midBalls across all channels) */
  dailyBallTotals: Record<string, number>;
  /** BOM-expanded ball count per date per channel (for capacity bars and channel subtotals) */
  dailyBallTotalsByChannel: Record<string, Record<string, number>>;
}
