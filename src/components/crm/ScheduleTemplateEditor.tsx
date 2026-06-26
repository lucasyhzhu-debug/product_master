/**
 * ScheduleTemplateEditor — the weekly default pattern for a subscription.
 * 7 day-of-week rows (0=Mon..6=Sun); each holds product+qty lines.
 * Carries only { menuProductId, qty } — no per-line price/date (the
 * subscription's confidential unitPrice is applied later at seed/confirm).
 */
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Id } from "../../../convex/_generated/dataModel";

export interface MenuProductOption {
  _id: Id<"menuProducts">;
  name: string;
}
export interface TemplateLine {
  menuProductId: Id<"menuProducts">;
  qty: number;
}
export interface TemplateDay {
  dayOfWeek: number; // 0=Mon..6=Sun
  items: TemplateLine[];
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface Props {
  days: TemplateDay[];
  products: MenuProductOption[];
  onChange: (days: TemplateDay[]) => void;
}

export function ScheduleTemplateEditor({ days, products, onChange }: Props) {
  const firstProduct = products[0]?._id;

  function updateDay(dayIdx: number, items: TemplateLine[]) {
    onChange(days.map((d, i) => (i === dayIdx ? { ...d, items } : d)));
  }

  return (
    <div className="space-y-2">
      {days.map((day, dayIdx) => (
        <div
          key={day.dayOfWeek}
          data-testid={`template-day-${day.dayOfWeek}`}
          className="rounded-md border border-border p-2"
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium w-10">{DAY_LABELS[dayIdx]}</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              disabled={!firstProduct}
              onClick={() =>
                firstProduct &&
                updateDay(dayIdx, [
                  ...day.items,
                  { menuProductId: firstProduct, qty: 1 },
                ])
              }
            >
              <Plus className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
              Add product
            </Button>
          </div>

          {day.items.length === 0 ? (
            <p className="text-xs text-muted-foreground pl-10">No deliveries</p>
          ) : (
            <div className="space-y-1.5">
              {day.items.map((line, lineIdx) => (
                <div key={lineIdx} className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <Select
                      value={line.menuProductId}
                      onValueChange={(val) =>
                        updateDay(
                          dayIdx,
                          day.items.map((l, i) =>
                            i === lineIdx
                              ? { ...l, menuProductId: val as Id<"menuProducts"> }
                              : l,
                          ),
                        )
                      }
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Select product…" />
                      </SelectTrigger>
                      <SelectContent>
                        {products.map((p) => (
                          <SelectItem key={p._id} value={p._id} className="text-xs">
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Input
                    type="number"
                    min={1}
                    value={line.qty}
                    aria-label="Quantity"
                    className="w-16 h-8 text-xs text-center"
                    onChange={(e) =>
                      updateDay(
                        dayIdx,
                        day.items.map((l, i) =>
                          i === lineIdx
                            ? { ...l, qty: Math.max(1, Number(e.target.value) || 1) }
                            : l,
                        ),
                      )
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                    aria-label="Remove line"
                    onClick={() =>
                      updateDay(
                        dayIdx,
                        day.items.filter((_, i) => i !== lineIdx),
                      )
                    }
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
