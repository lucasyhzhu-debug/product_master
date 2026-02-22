/**
 * ProductionTargetsBar
 *
 * Displays today's production targets at the top of the kitchen page:
 * - Two large stat cards: Original Balls (MID_BALL, 45g) and Jumbo Balls (BIG_BALL, 80g)
 * - Packaging breakdown row below: "Nx Product Name" per item
 *
 * Shows zeros instead of hiding when targets are zero (per user decision).
 * No source label shown (per user decision).
 */

import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "./StatCard";

/** Shape returned by kitchenConfig.queries.getKitchenTargetsForDate */
export interface KitchenTargets {
  bigBalls: number;
  midBalls: number;
  packagingBreakdown: Array<{
    menuProductId: string;
    name: string;
    quantity: number;
  }>;
  source: "override" | "dispatch_plan" | "defaults";
}

interface ProductionTargetsBarProps {
  targets: KitchenTargets | undefined;
}

export function ProductionTargetsBar({ targets }: ProductionTargetsBarProps) {
  if (targets === undefined) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-16 rounded-lg" />
          <Skeleton className="h-16 rounded-lg" />
        </div>
        <Skeleton className="h-8 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Ball totals */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="Original Balls (45g)"
          value={targets.midBalls}
          urgency={targets.midBalls > 0 ? "green" : undefined}
        />
        <StatCard
          label="Jumbo Balls (80g)"
          value={targets.bigBalls}
          urgency={targets.bigBalls > 0 ? "green" : undefined}
        />
      </div>

      {/* Packaging breakdown */}
      {targets.packagingBreakdown.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {targets.packagingBreakdown.map((item) => (
            <span
              key={item.menuProductId}
              className="inline-flex items-center rounded-full border border-border bg-muted/50 px-2.5 py-1 text-sm font-medium text-muted-foreground"
            >
              <span className="font-semibold text-foreground mr-1">
                {item.quantity}x
              </span>
              {item.name}
            </span>
          ))}
        </div>
      )}

      {targets.packagingBreakdown.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-1">
          No packaging breakdown available
        </p>
      )}
    </div>
  );
}
