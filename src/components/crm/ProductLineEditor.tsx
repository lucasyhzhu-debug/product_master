/**
 * ProductLineEditor — a single line item within a DayPlanCell.
 * Shows a product dropdown, qty input, and read-only line total.
 * Fires onChange when qty changes; fires onRemove when the X button is clicked.
 */
import { useEffect, useState } from "react";
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

  // Local string state so the qty field is freely editable (can be cleared while
  // typing) without snapping back to 1 on every keystroke. Coerced to ≥1 on blur.
  const [qtyStr, setQtyStr] = useState(String(line.qty));
  useEffect(() => {
    // Keep in sync when the qty changes from outside (e.g. a reset).
    if (Number(qtyStr) !== line.qty) setQtyStr(String(line.qty));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line.qty]);

  function handleQtyChange(raw: string) {
    // Allow digits only (and an empty field while editing).
    const cleaned = raw.replace(/[^0-9]/g, "");
    setQtyStr(cleaned);
    const n = Number(cleaned);
    if (cleaned !== "" && n >= 1) onChange({ ...line, qty: n });
  }

  function handleQtyBlur() {
    const n = Number(qtyStr);
    const next = qtyStr === "" || !Number.isFinite(n) || n < 1 ? 1 : Math.floor(n);
    setQtyStr(String(next));
    if (next !== line.qty) onChange({ ...line, qty: next });
  }

  return (
    <div className="flex items-center gap-2">
      {/* Product selector — takes the remaining width so it never collapses */}
      <div className="flex-1 min-w-[8rem]">
        <Select
          value={line.menuProductId}
          onValueChange={(val) =>
            onChange({ ...line, menuProductId: val as Id<"menuProducts"> })
          }
          disabled={locked}
        >
          <SelectTrigger className="h-9 text-sm">
            <SelectValue placeholder="Select product…" />
          </SelectTrigger>
          <SelectContent>
            {products.map((p) => (
              <SelectItem key={p._id} value={p._id} className="text-sm">
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Qty input — text + numeric inputMode so there are no spinner arrows and
          the field can be cleared while typing. */}
      <Input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={qtyStr}
        onChange={(e) => handleQtyChange(e.target.value)}
        onBlur={handleQtyBlur}
        className="w-16 h-9 text-sm text-center shrink-0"
        aria-label="Quantity"
        disabled={locked}
      />

      {/* Line total */}
      <span className="w-28 text-sm text-right text-muted-foreground tabular-nums shrink-0">
        {formatCurrency(lineTotal)}
      </span>

      {/* Remove — hidden when locked (confirmed week) */}
      {!locked && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
          onClick={onRemove}
          aria-label="Remove line"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
