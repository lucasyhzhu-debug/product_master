/**
 * ShiftSuccessScreen
 *
 * Displayed after a successful shift record submission.
 * Shows a card list of produced items and waste rows with sequential Framer Motion
 * stagger animation. Uses CheckCircle2 icon per produced row.
 */

import { CheckCircle2 } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { resolveUnit } from "@/lib/componentUnit";

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

interface ShiftSuccessScreenProps {
  produced: ProducedItem[];
  waste: WasteEntry[];
  targets?: TargetItem[];
  onDone: () => void;
  /** Component production data */
  componentProduced?: Array<{ kitchenComponentName: string; grams: number; unit?: string }>;
}

// Framer Motion stagger variants
const container = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.12,
      delayChildren: 0.2,
    },
  },
};

const itemVariant = {
  hidden: { opacity: 0, x: -10 },
  show: { opacity: 1, x: 0, transition: { duration: 0.3 } },
};

export function ShiftSuccessScreen({
  produced,
  waste,
  onDone,
  componentProduced,
}: ShiftSuccessScreenProps) {
  return (
    <Card className="border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20 dark:border-emerald-800">
      <CardContent className="pt-6 pb-4 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <CheckCircle2 className="h-8 w-8 text-emerald-500 shrink-0" />
          <h3 className="text-lg font-semibold text-foreground">Shift Recorded</h3>
        </div>

        {/* Produced items — stagger animation */}
        {produced.length > 0 && (
          <motion.div
            variants={container}
            initial="hidden"
            animate="show"
            className="space-y-2"
          >
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Production
            </p>
            {produced.map((p) => (
              <motion.div
                key={p.menuProductId}
                variants={itemVariant}
                className="flex items-center justify-between rounded-lg border border-emerald-200 dark:border-emerald-800 bg-white dark:bg-card p-3"
              >
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                  <span className="text-sm font-medium">{p.menuProductName}</span>
                </div>
                <span className="text-sm font-semibold tabular-nums">{p.quantity} units</span>
              </motion.div>
            ))}
          </motion.div>
        )}

        {/* Component production items */}
        {componentProduced && componentProduced.length > 0 && (
          <motion.div
            variants={container}
            initial="hidden"
            animate="show"
            className="space-y-2"
          >
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Components
            </p>
            {componentProduced.map((c, idx) => (
              <motion.div
                key={idx}
                variants={itemVariant}
                className="flex items-center justify-between rounded-lg border border-emerald-200 dark:border-emerald-800 bg-white dark:bg-card p-3"
              >
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                  <span className="text-sm font-medium">{c.kitchenComponentName}</span>
                </div>
                <span className="text-sm font-semibold tabular-nums">{c.grams}{resolveUnit(c.unit)}</span>
              </motion.div>
            ))}
          </motion.div>
        )}

        {/* Waste items — separate section */}
        {waste.length > 0 && (
          <motion.div
            variants={container}
            initial="hidden"
            animate="show"
            className="space-y-2"
          >
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Waste
            </p>
            {waste.map((w, idx) => (
              <motion.div
                key={`${w.menuProductId}-${w.reason}-${idx}`}
                variants={itemVariant}
                className="flex items-center justify-between rounded-lg border border-border bg-white dark:bg-card p-3"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm">{w.menuProductName}</span>
                  <span className="text-xs text-muted-foreground">
                    ({REASON_LABELS[w.reason] ?? w.reason})
                  </span>
                </div>
                <span className="text-sm font-semibold tabular-nums text-destructive">
                  -{w.quantity}
                </span>
              </motion.div>
            ))}
          </motion.div>
        )}

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
