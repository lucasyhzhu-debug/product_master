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
        "flex flex-col sm:flex-row sm:items-stretch",
        hasLines ? "border-primary/20" : "border-dashed border-muted-foreground/25",
      )}
    >
      {/* Left rail — day label + date, fixed width on wider screens */}
      <CardHeader className="py-3 px-3 sm:w-28 sm:shrink-0 sm:border-r flex flex-col justify-center gap-0.5">
        <span className="text-sm font-semibold text-foreground uppercase tracking-wide">
          {dayLabel}
        </span>
        <span className="text-xs text-muted-foreground">{formatDayDate(dateMs)}</span>
      </CardHeader>

      {/* Center — line items + flags + add button, takes all remaining width */}
      <CardContent className="flex-1 flex flex-col gap-2 px-3 py-3 min-w-0">
        {/* Cutoff warning — visual only, never disables editing */}
        {pastCutoff && (
          <p
            className="text-[11px] text-amber-600 flex items-center gap-1"
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
            className="text-[11px] font-medium text-orange-700 bg-orange-100 rounded px-1.5 py-0.5 w-fit"
            title={supplierTitle}
          >
            Above baseline — needs supplier OK
          </span>
        )}

        {/* Line items */}
        {lines.length === 0 ? (
          <p className="text-sm text-muted-foreground/60 italic py-1">No delivery</p>
        ) : (
          <div className="flex flex-col gap-2">
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

        {/* Add product */}
        {!locked && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full sm:w-fit h-8 text-xs text-muted-foreground border border-dashed"
            onClick={addLine}
            disabled={products.length === 0}
          >
            <Plus className="h-3 w-3 mr-1" />
            Add product
          </Button>
        )}
      </CardContent>

      {/* Right rail — day total, fixed width on wider screens */}
      {hasLines && (
        <div className="px-3 py-3 sm:w-36 sm:shrink-0 sm:border-l flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-1 border-t sm:border-t-0">
          <span className="text-xs text-muted-foreground">Day total</span>
          <span className="text-sm font-semibold tabular-nums">{formatCurrency(dayTotal)}</span>
        </div>
      )}
    </Card>
  );
}
