/**
 * ProductLineEditor — a single line item within a DayPlanCell.
 * Shows a product dropdown, qty input, and read-only line total.
 * Fires onChange when qty changes; fires onRemove when the X button is clicked.
 */
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency } from "@/lib/utils";
import type { Id } from "../../../convex/_generated/dataModel";

export interface MenuProductOption {
  _id: Id<"menuProducts">;
  name: string;
}

export interface ScheduleLineLocal {
  menuProductId: Id<"menuProducts">;
  qty: number;
  unitPrice: number;
}

interface ProductLineEditorProps {
  line: ScheduleLineLocal;
  products: MenuProductOption[];
  /** Partner price — read only, displayed per-line */
  unitPrice: number;
  /** When true the row is read-only — inputs and Remove are disabled (confirmed week). */
  locked?: boolean;
  onChange: (updated: ScheduleLineLocal) => void;
  onRemove: () => void;
}

export function ProductLineEditor({
  line,
  products,
  unitPrice,
  locked = false,
  onChange,
  onRemove,
}: ProductLineEditorProps) {
  const lineTotal = line.qty * unitPrice;

  return (
    <div className="flex items-center gap-2">
      {/* Product selector */}
      <div className="flex-1 min-w-0">
        <Select
          value={line.menuProductId}
          onValueChange={(val) =>
            onChange({ ...line, menuProductId: val as Id<"menuProducts"> })
          }
          disabled={locked}
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

      {/* Qty input */}
      <Input
        type="number"
        min={1}
        value={line.qty}
        onChange={(e) =>
          onChange({ ...line, qty: Math.max(1, Number(e.target.value) || 1) })
        }
        className="w-16 h-8 text-xs text-center"
        aria-label="Quantity"
        disabled={locked}
      />

      {/* Line total */}
      <span className="w-24 text-xs text-right text-muted-foreground tabular-nums shrink-0">
        {formatCurrency(lineTotal)}
      </span>

      {/* Remove — hidden when locked (confirmed week) */}
      {!locked && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
          onClick={onRemove}
          aria-label="Remove line"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}
