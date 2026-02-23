/**
 * ProductionTargetsBar
 *
 * Displays today's production targets at the top of the kitchen page:
 * - Two large stat cards: Original Balls (MID_BALL, 45g) and Jumbo Balls (BIG_BALL, 80g)
 * - Packaging breakdown row below: "Nx Product Name" per item
 *
 * Per-component visibility is controlled by enabledComponents prop.
 * Packaging breakdown badges hide for products whose ball type is fully disabled.
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
  /** @deprecated Use enabledComponents instead. Kept for backward compat. */
  showJumbo?: boolean;
  /** Array of enabled component codes, e.g. ["BIG_BALL", "MID_BALL"] */
  enabledComponents?: string[];
  /** Map of menuProductId -> ball type codes used by that product (from BOM) */
  productBallTypes?: Record<string, string[]>;
}

export function ProductionTargetsBar({
  targets,
  showJumbo = true,
  enabledComponents,
  productBallTypes,
}: ProductionTargetsBarProps) {
  // Derive visibility from enabledComponents (new) or fall back to showJumbo (legacy)
  const showOriginal = enabledComponents
    ? enabledComponents.includes("MID_BALL")
    : true;
  const showJumboResolved = enabledComponents
    ? enabledComponents.includes("BIG_BALL")
    : showJumbo;

  // Number of visible stat cards determines grid columns
  const visibleCount = (showOriginal ? 1 : 0) + (showJumboResolved ? 1 : 0);
  const gridClass =
    visibleCount === 2
      ? "grid grid-cols-2 gap-3"
      : visibleCount === 1
        ? "grid grid-cols-1 gap-3"
        : "";

  if (targets === undefined) {
    return (
      <div className="space-y-3">
        {visibleCount > 0 && (
          <div className={gridClass}>
            {showOriginal && <Skeleton className="h-16 rounded-lg" />}
            {showJumboResolved && <Skeleton className="h-16 rounded-lg" />}
          </div>
        )}
        <Skeleton className="h-8 rounded-lg" />
      </div>
    );
  }

  // Filter breakdown badges based on enabled components
  const visibleBreakdown = targets.packagingBreakdown.filter((item) => {
    if (!enabledComponents || !productBallTypes) return true;
    const ballTypes = productBallTypes[item.menuProductId] ?? [];
    if (ballTypes.length === 0) return true; // No BOM data — show anyway
    // Hide only if ALL ball types for this product are disabled
    return ballTypes.some((bt) => enabledComponents.includes(bt));
  });

  // Products whose ball type is partially disabled (mixed) — show with muted style
  const mutedBreakdownIds = new Set<string>(
    targets.packagingBreakdown
      .filter((item) => {
        if (!enabledComponents || !productBallTypes) return false;
        const ballTypes = productBallTypes[item.menuProductId] ?? [];
        if (ballTypes.length <= 1) return false;
        return (
          ballTypes.some((bt) => enabledComponents.includes(bt)) &&
          ballTypes.some((bt) => !enabledComponents.includes(bt))
        );
      })
      .map((item) => item.menuProductId)
  );

  return (
    <div className="space-y-3">
      {/* Ball totals */}
      {visibleCount > 0 && (
        <div className={gridClass}>
          {showOriginal && (
            <StatCard
              label="Original Balls (45g)"
              value={targets.midBalls}
              urgency={targets.midBalls > 0 ? "green" : undefined}
            />
          )}
          {showJumboResolved && (
            <StatCard
              label="Jumbo Balls (80g)"
              value={targets.bigBalls}
              urgency={targets.bigBalls > 0 ? "green" : undefined}
            />
          )}
        </div>
      )}

      {/* Packaging breakdown */}
      {visibleBreakdown.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {visibleBreakdown.map((item) => {
            const isMuted = mutedBreakdownIds.has(item.menuProductId);
            return (
              <span
                key={item.menuProductId}
                className={`inline-flex items-center rounded-full border border-border px-2.5 py-1 text-sm font-medium ${
                  isMuted
                    ? "bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-400"
                    : "bg-muted/50 text-muted-foreground"
                }`}
              >
                <span className="font-semibold text-foreground mr-1">
                  {item.quantity}x
                </span>
                {item.name}
              </span>
            );
          })}
        </div>
      )}

      {visibleBreakdown.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-1">
          No packaging breakdown available
        </p>
      )}
    </div>
  );
}
