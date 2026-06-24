/**
 * DayPlanCell — one column in the WeekCalendarGrid.
 * Shows date label, list of schedule lines via ProductLineEditor,
 * a day subtotal, and an "+ Add product" button.
 */
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils";
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
  onChange,
}: DayPlanCellProps) {
  const dayLabel = DAY_LABELS[dayIndex] ?? `Day ${dayIndex + 1}`;
  const dayTotal = lines.reduce((s, l) => s + l.qty * unitPrice, 0);
  const hasLines = lines.length > 0;

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
