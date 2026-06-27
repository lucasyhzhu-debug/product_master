/**
 * WeekCalendarGrid — 7-column Mon→Sun calendar grid.
 * Each column is a DayPlanCell. Derives real WIB dates from `weekStart` epoch ms.
 */
import { DayPlanCell } from "./DayPlanCell";
import type { MenuProductOption, ScheduleLineLocal } from "./ProductLineEditor";

const DAY_MS = 86_400_000;

/** localDays[i] = lines for weekday i (0=Mon, 6=Sun) */
export type LocalWeekPlan = ScheduleLineLocal[][];

interface WeekCalendarGridProps {
  /** WIB Monday midnight as UTC epoch ms */
  weekStart: number;
  localDays: LocalWeekPlan;
  products: MenuProductOption[];
  unitPrice: number;
  locked: boolean;
  onChange: (dayIndex: number, lines: ScheduleLineLocal[]) => void;
  /** Per-day cutoff/supplier flags (index 0=Mon … 6=Sun). Optional — defaults to all false. */
  dayFlags?: { pastCutoff: boolean; needsSupplierConfirmation: boolean }[];
  /** The subscription's usual daily qty — explains the supplier-confirmation badge. */
  baselineDailyQty?: number;
}

export function WeekCalendarGrid({
  weekStart,
  localDays,
  products,
  unitPrice,
  locked,
  onChange,
  dayFlags,
  baselineDailyQty,
}: WeekCalendarGridProps) {
  return (
    <div className="grid grid-cols-7 gap-2">
      {Array.from({ length: 7 }, (_, i) => (
        <DayPlanCell
          key={i}
          dayIndex={i}
          dateMs={weekStart + i * DAY_MS}
          lines={localDays[i] ?? []}
          products={products}
          unitPrice={unitPrice}
          locked={locked}
          onChange={(lines) => onChange(i, lines)}
          pastCutoff={dayFlags?.[i]?.pastCutoff ?? false}
          needsSupplierConfirmation={dayFlags?.[i]?.needsSupplierConfirmation ?? false}
          baselineDailyQty={baselineDailyQty}
        />
      ))}
    </div>
  );
}
