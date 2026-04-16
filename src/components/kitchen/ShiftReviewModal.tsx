/**
 * ShiftReviewModal
 *
 * Inline review screen (not a dialog) shown before committing an end-of-shift submission.
 * Displays produced + waste summary with target deltas, then offers Confirm / Back buttons.
 *
 * Target delta (Gap 10): each product row shows produced count, optional waste count,
 * and a +/- variance against the target (produced + waste = total made).
 * Waste is stored separately in the shift record but counts toward "total made" here.
 */

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

const REASON_LABELS: Record<string, string> = {
  qa_testing: "QA / Testing",
  spoilage: "Spoilage",
  waste: "Waste",
};

interface ProducedItem {
  menuProductId: string;
  menuProductName: string;
  quantity: number;
}

interface WasteEntry {
  menuProductId: string;
  menuProductName: string;
  reason: string;
  quantity: number;
}

interface TargetItem {
  menuProductId: string;
  name: string;
  quantity: number;
}

interface ShiftReviewModalProps {
  produced: ProducedItem[];
  waste: WasteEntry[];
  /** Packaging breakdown targets for delta calculation */
  targets?: TargetItem[];
  onConfirm: () => Promise<void>;
  onBack: () => void;
  isSubmitting: boolean;
  /** Inline error from mutation failure — rendered above action buttons */
  error?: string | null;
  /** Phase 69: Component production data */
  componentProduced?: Array<{ kitchenComponentName: string; grams: number; unit?: string }>;
  /** Phase 69: Component waste data */
  componentWaste?: Array<{ kitchenComponentName: string; grams: number; reason: string; unit?: string }>;
}

export function ShiftReviewModal({
  produced,
  waste,
  targets = [],
  onConfirm,
  onBack,
  isSubmitting,
  error,
  componentProduced,
  componentWaste,
}: ShiftReviewModalProps) {
  const totalProduced = produced.reduce((s, p) => s + p.quantity, 0);
  const totalWaste = waste.reduce((s, w) => s + w.quantity, 0);

  // Build target map for O(1) lookup
  const targetMap = new Map(targets.map((t) => [t.menuProductId, t.quantity]));

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Review Shift Summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Production summary — card-style rows with target deltas */}
        <div>
          <p className="text-sm font-medium text-muted-foreground mb-2 uppercase tracking-wide">
            Production
          </p>
          <ul className="space-y-2">
            {produced.map((item) => {
              const target = targetMap.get(item.menuProductId) ?? 0;
              const wasteForProduct = waste
                .filter((w) => w.menuProductId === item.menuProductId)
                .reduce((sum, w) => sum + w.quantity, 0);
              const totalMade = item.quantity + wasteForProduct;
              const delta = target > 0 ? totalMade - target : null;
              const deltaColor =
                delta === null
                  ? ""
                  : delta >= 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-amber-600 dark:text-amber-400";
              const deltaSign = delta !== null && delta >= 0 ? "+" : "";

              return (
                <li
                  key={item.menuProductId}
                  className="rounded-lg border border-border bg-card p-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{item.menuProductName}</span>
                    <div className="text-right">
                      <span className="text-sm font-semibold tabular-nums">
                        {item.quantity} produced
                      </span>
                      {wasteForProduct > 0 && (
                        <span className="text-xs text-muted-foreground ml-1">
                          + {wasteForProduct} waste
                        </span>
                      )}
                    </div>
                  </div>
                  {target > 0 && delta !== null && (
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xs text-muted-foreground">
                        Target: {target}
                      </span>
                      <span className={`text-xs font-medium tabular-nums ${deltaColor}`}>
                        {deltaSign}{delta} ({totalMade}/{target})
                      </span>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        {/* Phase 69: Component production summary */}
        {componentProduced && componentProduced.length > 0 && (
          <>
            <Separator />
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                Components
              </p>
              <ul className="space-y-1">
                {componentProduced.map((item, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-foreground">{item.kitchenComponentName}</span>
                    <span className="font-semibold tabular-nums">
                      {item.grams}{item.unit || "g"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}

        {/* Phase 69: Component waste summary */}
        {componentWaste && componentWaste.length > 0 && (
          <>
            <Separator />
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                Component Waste
              </p>
              <ul className="space-y-1">
                {componentWaste.map((item, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-foreground">
                      {item.kitchenComponentName}{" "}
                      <span className="text-muted-foreground">
                        ({REASON_LABELS[item.reason] ?? item.reason})
                      </span>
                    </span>
                    <span className="font-semibold tabular-nums text-destructive">
                      -{item.grams}{item.unit || "g"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}

        {/* Waste summary (only if any) */}
        {waste.length > 0 && (
          <>
            <Separator />
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                Waste
              </p>
              <ul className="space-y-1">
                {waste.map((entry, idx) => (
                  <li
                    key={`${entry.menuProductId}-${entry.reason}-${idx}`}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-foreground">
                      {entry.menuProductName}{" "}
                      <span className="text-muted-foreground">
                        ({REASON_LABELS[entry.reason] ?? entry.reason})
                      </span>
                    </span>
                    <span className="font-semibold tabular-nums text-destructive">
                      -{entry.quantity} units
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}

        <Separator />

        {/* Totals summary */}
        <div className="rounded-lg bg-muted/50 p-3 space-y-1">
          <div className="flex justify-between text-sm">
            <span>Total produced</span>
            <span className="font-semibold tabular-nums">{totalProduced}</span>
          </div>
          {totalWaste > 0 && (
            <div className="flex justify-between text-sm text-destructive/80">
              <span>Total waste</span>
              <span className="font-semibold tabular-nums">{totalWaste}</span>
            </div>
          )}
          <div className="flex justify-between text-sm font-medium border-t border-border/50 pt-1 mt-1">
            <span>Total made (produced + waste)</span>
            <span className="tabular-nums">{totalProduced + totalWaste}</span>
          </div>
        </div>

        {/* Inventory note */}
        <p className="text-xs text-muted-foreground">
          Inventory will be updated at the Kitchen location upon confirmation.
        </p>

        {/* Inline error (mutation failure) */}
        {error && (
          <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-700 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
            {error}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-3 pt-1">
          <Button
            variant="outline"
            onClick={onBack}
            disabled={isSubmitting}
            className="flex-1"
          >
            Back
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isSubmitting}
            className="flex-1"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Submitting…
              </>
            ) : (
              "Confirm & Submit"
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
