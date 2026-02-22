/**
 * ShiftSuccessScreen
 *
 * Displayed after a successful shift record submission.
 * Shows a brief summary of what was recorded and a Done button to reset.
 */

import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const REASON_LABELS: Record<string, string> = {
  qa_testing: "QA",
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

interface ShiftSuccessScreenProps {
  produced: ProducedItem[];
  waste: WasteEntry[];
  onDone: () => void;
}

export function ShiftSuccessScreen({
  produced,
  waste,
  onDone,
}: ShiftSuccessScreenProps) {
  const producedSummary = produced
    .map((p) => `${p.quantity} ${p.menuProductName}`)
    .join(", ");

  const wasteSummary =
    waste.length > 0
      ? waste
          .map(
            (w) =>
              `${w.quantity} ${w.menuProductName} (${REASON_LABELS[w.reason] ?? w.reason})`
          )
          .join(", ")
      : null;

  return (
    <Card className="border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20 dark:border-emerald-800">
      <CardContent className="pt-6 pb-4 flex flex-col items-center text-center space-y-4">
        <CheckCircle2 className="h-12 w-12 text-emerald-500" />

        <div>
          <h3 className="text-lg font-semibold text-foreground mb-1">
            Shift Recorded
          </h3>
          <p className="text-sm text-muted-foreground">
            Produced:{" "}
            <span className="text-foreground font-medium">{producedSummary}</span>
          </p>
          {wasteSummary && (
            <p className="text-sm text-muted-foreground mt-0.5">
              Waste:{" "}
              <span className="text-foreground font-medium">{wasteSummary}</span>
            </p>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          Inventory has been updated at the Kitchen location.
        </p>

        <Button onClick={onDone} variant="outline" className="w-full">
          Done
        </Button>
      </CardContent>
    </Card>
  );
}
