/**
 * DayPlanCell — one column in the WeekCalendarGrid.
 * Shows date label, list of schedule lines via ProductLineEditor,
 * a day subtotal, and an "+ Add product" button.
 */
import { AlertTriangle, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn, formatCurrency } from "@/lib/utils";
import { ProductLineEditor } from "./ProductLineEditor";
import type { MenuProductOption, ScheduleLineLocal } from "./ProductLineEditor";
import type { Id } from "../../../convex/_generated/dataModel";

/** Day index 0 = Monday … 6 = Sunday. */
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

interface DayPlanCellProps {
  /** Day index within the week (0=Mon, 6=Sun) */
  dayIndex: number;
  /** Absolute UTC epoch ms for this day (WIB midnight) */
  dateMs: number;
  lines: ScheduleLineLocal[];
  products: MenuProductOption[];
  /** Partner unit price applied to all lines in this week */
  unitPrice: number;
  /** Whether the cell is locked (confirmed week) — disables editing */
  locked: boolean;
  /** Visual-only warning: delivery is past the 13:00 WIB cutoff. Does NOT disable editing. */
  pastCutoff?: boolean;
  /** Visual-only badge: supplier confirmation is still pending. Does NOT disable editing. */
  needsSupplierConfirmation?: boolean;
  /** The subscription's usual daily qty — used to explain the supplier-confirmation badge. */
  baselineDailyQty?: number;
  onChange: (lines: ScheduleLineLocal[]) => void;
}

/** Format epoch ms as "DD MMM" using the locale date in WIB offset. */
function formatDayDate(ms: number): string {
  // Display in WIB by passing the value straight (already WIB-aligned midnight)
  const d = new Date(ms);
  return d.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Jakarta",
  });
}

export function DayPlanCell({
  dayIndex,
  dateMs,
  lines,
  products,
  unitPrice,
  locked,
  pastCutoff,
  needsSupplierConfirmation,
  baselineDailyQty,
  onChange,
}: DayPlanCellProps) {
  const dayLabel = DAY_LABELS[dayIndex] ?? `Day ${dayIndex + 1}`;
  const dayTotal = lines.reduce((s, l) => s + l.qty * unitPrice, 0);
  const dayQty = lines.reduce((s, l) => s + l.qty, 0);
  const hasLines = lines.length > 0;

  // Supplier-confirmation badge context: how far above the usual daily qty.
  const extraOverBaseline =
    baselineDailyQty !== undefined ? dayQty - baselineDailyQty : null;
  const supplierTitle =
    baselineDailyQty !== undefined
      ? `Above the usual ${baselineDailyQty}/day${
          extraOverBaseline && extraOverBaseline > 0 ? ` (+${extraOverBaseline})` : ""
        } — the supplier will be asked to confirm the extra. Editing is still allowed.`
      : "Above the usual daily quantity — the supplier will be asked to confirm the extra. Editing is still allowed.";

  function addLine() {
    if (products.length === 0) return;
    onChange([
      ...lines,
      { menuProductId: products[0]._id as Id<"menuProducts">, qty: 1, unitPrice },
    ]);
  }

  function updateLine(idx: number, updated: ScheduleLineLocal) {
    const next = lines.map((l, i) => (i === idx ? updated : l));
    onChange(next);
  }

  function removeLine(idx: number) {
    onChange(lines.filter((_, i) => i !== idx));
  }

  return (
    <Card
      className={cn(
        "flex flex-col h-full",
        hasLines ? "border-primary/20" : "border-dashed border-muted-foreground/25",
      )}
    >
      <CardHeader className="pb-2 pt-3 px-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {dayLabel}
          </span>
          <span className="text-xs text-muted-foreground">{formatDayDate(dateMs)}</span>
        </div>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col gap-2 px-3 pb-3">
        {/* Cutoff warning — visual only, never disables editing */}
        {pastCutoff && (
          <p
            className="text-[10px] text-amber-600 flex items-center gap-1"
            role="status"
            title="Past today's 1 PM cutoff — you can still edit, but the supplier may already be packing this day."
          >
            <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" /> Past 1 PM cutoff
            — still editable
          </p>
        )}
        {/* Supplier confirmation badge — visual only */}
        {needsSupplierConfirmation && (
          <span
            className="text-[10px] font-medium text-orange-700 bg-orange-100 rounded px-1 py-0.5 w-fit"
            title={supplierTitle}
          >
            Above baseline — needs supplier OK
          </span>
        )}

        {/* Line items */}
        {lines.length === 0 ? (
          <p className="text-xs text-muted-foreground/60 italic flex-1 flex items-center justify-center">
            No delivery
          </p>
        ) : (
          <div className="flex flex-col gap-1.5 flex-1">
            {lines.map((line, idx) => (
              <ProductLineEditor
                key={idx}
                line={line}
                products={products}
                unitPrice={unitPrice}
                locked={locked}
                onChange={(updated) => updateLine(idx, updated)}
                onRemove={() => removeLine(idx)}
              />
            ))}
          </div>
        )}

        {/* Day subtotal */}
        {hasLines && (
          <div className="border-t pt-1.5 flex justify-between items-center">
            <span className="text-xs text-muted-foreground">Day total</span>
            <span className="text-xs font-semibold tabular-nums">
              {formatCurrency(dayTotal)}
            </span>
          </div>
        )}

        {/* Add product */}
        {!locked && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full h-7 text-xs text-muted-foreground border border-dashed"
            onClick={addLine}
            disabled={products.length === 0}
          >
            <Plus className="h-3 w-3 mr-1" />
            Add product
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
