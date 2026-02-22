/**
 * ShiftReviewModal
 *
 * Inline review screen (not a dialog) shown before committing an end-of-shift submission.
 * Displays produced + waste summary, then offers Confirm / Back buttons.
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

interface ShiftReviewModalProps {
  produced: ProducedItem[];
  waste: WasteEntry[];
  onConfirm: () => Promise<void>;
  onBack: () => void;
  isSubmitting: boolean;
}

export function ShiftReviewModal({
  produced,
  waste,
  onConfirm,
  onBack,
  isSubmitting,
}: ShiftReviewModalProps) {
  const totalProduced = produced.reduce((s, p) => s + p.quantity, 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Review Shift Summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Production summary */}
        <div>
          <p className="text-sm font-medium text-muted-foreground mb-2 uppercase tracking-wide">
            Production
          </p>
          <ul className="space-y-1">
            {produced.map((item) => (
              <li
                key={item.menuProductId}
                className="flex items-center justify-between text-sm"
              >
                <span className="text-foreground">{item.menuProductName}</span>
                <span className="font-semibold tabular-nums">
                  {item.quantity} units
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground mt-2">
            Total: {totalProduced} units produced
          </p>
        </div>

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

        {/* Inventory note */}
        <p className="text-xs text-muted-foreground">
          Inventory will be updated at the Kitchen location upon confirmation.
        </p>

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
