/**
 * Settlement Form Dialog — Create/Edit consignment settlement.
 *
 * Shows live math preview: revenue x revSharePercent = rev share, remainder = frollie payment.
 * Uses timezone-safe date conversion (local midnight, not UTC).
 * Uses actionToast for success feedback.
 *
 * Phase 74.5.2 Plan 07 (D74.5.2-L7): Adds optional per-product "items" rows.
 * When items are present, the sum must match totalRevenue within ±Rp1 (matches
 * backend assertItemsMatchTotalRevenue tolerance). Items are forwarded to
 * createSettlement which dispatches through saveRevenueItems. The
 * collapseRevenuePeriod write-path (74.5.1) is UNCHANGED.
 */
import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, X } from "lucide-react";
import { useQuery } from "convex/react";
import { toast } from "sonner";
import { actionToast } from "@/lib/actionToast";
import { formatCurrency } from "@/lib/utils";
import {
  useCreateConsignmentSettlement,
  useUpdateConsignmentSettlement,
} from "@/hooks/convex";
import { api } from "../../../convex/_generated/api";
import { computeSettlementPreview, toLocalEpoch, fromEpochToDateString } from "./settlementUtils";
import type { Id } from "../../../convex/_generated/dataModel";
import type { OutletData } from "./OutletFormDialog";

export interface SettlementData {
  _id: Id<"consignmentSettlements">;
  outletId: Id<"consignmentOutlets">;
  periodStart: number;
  periodEnd: number;
  totalRevenue: number;
  revSharePercent: number;
  revShareAmount: number;
  frolliePayment: number;
  status: "pending" | "paid";
  paidAt?: number;
  notes?: string;
}

/**
 * UI-only item row. Total price is derived from unitPrice * quantity on submit
 * (rather than stored) so the cross-row sum validator and display share one
 * truth. `id` is a random UUID scoped to the form lifetime for React keys.
 */
interface ItemRow {
  id: string;
  linkedMenuProductId?: Id<"menuProducts">;
  productName: string;
  unitPrice: number;
  quantity: number;
}

interface SettlementFormDialogProps {
  open: boolean;
  onClose: () => void;
  outlet: OutletData;
  settlement?: SettlementData;
}

// Variance tolerance matches backend assertItemsMatchTotalRevenue (ITEMS_VARIANCE_TOLERANCE_IDR=1).
const ITEMS_VARIANCE_TOLERANCE_IDR = 1;

export function SettlementFormDialog({
  open,
  onClose,
  outlet,
  settlement,
}: SettlementFormDialogProps) {
  const createSettlement = useCreateConsignmentSettlement();
  const updateSettlement = useUpdateConsignmentSettlement();
  // Use the raw Convex query (not the `useMenuProducts` hook) because we need
  // the Convex doc shape (_id: Id<"menuProducts">, defaultPrice, name), not the
  // legacy snake_case transformed shape. Pattern matches AnalyticsFilterBar,
  // AddStockDialog, BigSellerOrdersTable.
  const menuProducts = useQuery(api.menuProducts.queries.list, {
    activeOnly: true,
  });

  const [totalRevenue, setTotalRevenue] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<ItemRow[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const isEdit = !!settlement;

  // Pre-fill for edit mode. Items NOT pre-filled — editing items on an existing
  // settlement is out of scope for 74.5.2 Plan 07 (read-only breakdown on OutletCard
  // handles displaying them); new items are only supported on creation.
  useEffect(() => {
    if (settlement) {
      setTotalRevenue(String(settlement.totalRevenue));
      setPeriodStart(fromEpochToDateString(settlement.periodStart));
      setPeriodEnd(fromEpochToDateString(settlement.periodEnd));
      setNotes(settlement.notes ?? "");
      setItems([]);
    } else {
      setTotalRevenue("");
      setPeriodStart("");
      setPeriodEnd("");
      setNotes("");
      setItems([]);
    }
  }, [settlement, open]);

  // Live math preview
  const revenueNum = parseFloat(totalRevenue) || 0;
  const { revShareAmount, frolliePayment } = computeSettlementPreview(
    revenueNum,
    outlet.revSharePercent
  );

  // Items dynamic-row handlers (pattern mirrored from ProductionComponentsSection.tsx)
  const handleAddItem = () => {
    setItems((prev) => [
      ...prev,
      {
        id: Math.random().toString(36).slice(2, 11),
        productName: "",
        unitPrice: 0,
        quantity: 1,
      },
    ]);
  };

  const handleRemoveItem = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const handleUpdateItem = <K extends keyof ItemRow>(
    id: string,
    field: K,
    value: ItemRow[K],
  ) => {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, [field]: value } : i)),
    );
  };

  // Derived: items total (for sum-validation banner + submit pre-check).
  const itemsTotal = items.reduce(
    (sum, i) => sum + i.unitPrice * i.quantity,
    0,
  );
  const itemsVariance = Math.abs(itemsTotal - revenueNum);
  const itemsMatch = itemsVariance <= ITEMS_VARIANCE_TOLERANCE_IDR;

  const handleSubmit = async (e: React.MouseEvent) => {
    if (!periodStart || !periodEnd) {
      toast.error("Period start and end dates are required");
      return;
    }

    if (!totalRevenue.trim()) {
      toast.error("Total revenue is required");
      return;
    }
    if (revenueNum < 0) {
      toast.error("Revenue cannot be negative");
      return;
    }

    const startEpoch = toLocalEpoch(periodStart);
    const endEpoch = toLocalEpoch(periodEnd);

    if (startEpoch > endEpoch) {
      toast.error("Period start must be before period end");
      return;
    }

    // Guard against editing paid settlements
    if (isEdit && settlement?.status === "paid") {
      toast.error("Cannot edit a paid settlement");
      return;
    }

    // Client-side items sum pre-check (backend enforces too via
    // assertItemsMatchTotalRevenue; this surfaces the error faster).
    if (!isEdit && items.length > 0 && !itemsMatch) {
      toast.error(
        `Item totals must match revenue (±Rp${ITEMS_VARIANCE_TOLERANCE_IDR})`,
      );
      return;
    }

    setSubmitting(true);
    try {
      if (isEdit && settlement) {
        // 74.5.2 Plan 07: updateSettlement does NOT accept items (backend
        // contract unchanged — only createSettlement emits the items payload).
        await updateSettlement({
          settlementId: settlement._id,
          totalRevenue: revenueNum,
          periodStart: startEpoch,
          periodEnd: endEpoch,
          notes: notes.trim() || undefined,
        });
        actionToast("Settlement updated", e);
      } else {
        await createSettlement({
          outletId: outlet._id,
          periodStart: startEpoch,
          periodEnd: endEpoch,
          totalRevenue: revenueNum,
          notes: notes.trim() || undefined,
          // Emit items ONLY when non-empty. Empty array → undefined preserves
          // pre-74.5.1 parent-only write behavior.
          items: items.length > 0
            ? items.map((i) => ({
                externalItemId: undefined,
                productName: i.productName,
                unitPrice: i.unitPrice,
                quantity: i.quantity,
                totalPrice: i.unitPrice * i.quantity,
                linkedMenuProductId: i.linkedMenuProductId,
                isAutoMatched: false,
                matchConfidence: i.linkedMenuProductId
                  ? ("exact" as const)
                  : ("none" as const),
              }))
            : undefined,
        });
        actionToast("Settlement created", e);
      }
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save settlement");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit Settlement" : "Add Settlement"} — {outlet.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="settlement-start">Period Start *</Label>
              <Input
                id="settlement-start"
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="settlement-end">Period End *</Label>
              <Input
                id="settlement-end"
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="settlement-revenue">Total Revenue (IDR) *</Label>
            <Input
              id="settlement-revenue"
              type="number"
              min={0}
              value={totalRevenue}
              onChange={(e) => setTotalRevenue(e.target.value)}
              placeholder="e.g., 5000000"
            />
          </div>

          {/* Live math preview */}
          <div className="bg-muted rounded-lg p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span>Revenue</span>
              <span>{formatCurrency(revenueNum)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Rev Share ({outlet.revSharePercent}%)</span>
              <span className="text-[var(--color-status-warning)]">
                -{formatCurrency(revShareAmount)}
              </span>
            </div>
            <Separator />
            <div className="flex justify-between text-sm font-semibold">
              <span>Frollie Payment</span>
              <span className="text-[var(--color-status-success)]">
                {formatCurrency(frolliePayment)}
              </span>
            </div>
          </div>

          {/* Items section — create-only (hide on edit for 74.5.2 Plan 07 scope). */}
          {!isEdit && (
            <div className="space-y-2 border-t pt-4">
              <div className="flex items-center justify-between">
                <Label>Products sold (optional)</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddItem}
                  disabled={!menuProducts || menuProducts.length === 0}
                >
                  <Plus className="h-4 w-4 mr-1" /> Add product
                </Button>
              </div>

              {items.length > 0 ? (
                <div className="space-y-2">
                  {items.map((item) => (
                    <div key={item.id} className="flex gap-2 items-start">
                      <Select
                        value={item.linkedMenuProductId ?? ""}
                        onValueChange={(v: string) => {
                          // Cast explicitly at the string→Id boundary.
                          const mpId = v
                            ? (v as Id<"menuProducts">)
                            : undefined;
                          const mp = menuProducts?.find((p) => p._id === mpId);
                          handleUpdateItem(item.id, "linkedMenuProductId", mpId);
                          if (mp) {
                            handleUpdateItem(item.id, "productName", mp.name);
                            handleUpdateItem(
                              item.id,
                              "unitPrice",
                              mp.defaultPrice,
                            );
                          }
                        }}
                      >
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder="Select product" />
                        </SelectTrigger>
                        <SelectContent>
                          {menuProducts?.map((mp) => (
                            <SelectItem key={mp._id} value={mp._id}>
                              {mp.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        min={1}
                        placeholder="Qty"
                        className="w-20"
                        value={item.quantity}
                        onChange={(e) =>
                          handleUpdateItem(
                            item.id,
                            "quantity",
                            parseInt(e.target.value, 10) || 0,
                          )
                        }
                      />
                      <Input
                        type="number"
                        min={0}
                        placeholder="Unit price"
                        className="w-32"
                        value={item.unitPrice}
                        onChange={(e) =>
                          handleUpdateItem(
                            item.id,
                            "unitPrice",
                            parseFloat(e.target.value) || 0,
                          )
                        }
                      />
                      <div className="w-24 text-xs self-center tabular-nums">
                        {formatCurrency(item.unitPrice * item.quantity)}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Remove item"
                        onClick={() => handleRemoveItem(item.id)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}

                  {/* Sum validation banner. */}
                  <div
                    className={`text-sm pt-2 ${
                      itemsMatch
                        ? "text-[var(--color-status-success)]"
                        : "text-[var(--color-status-warning)]"
                    }`}
                  >
                    Items total: {formatCurrency(itemsTotal)} / Expected:{" "}
                    {formatCurrency(revenueNum)}
                    {!itemsMatch &&
                      ` — must match (±Rp${ITEMS_VARIANCE_TOLERANCE_IDR})`}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-2">
                  No per-product breakdown. Items are optional — settlement
                  saves as total revenue only.
                </p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="settlement-notes">Notes</Label>
            <Textarea
              id="settlement-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional"
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Saving..." : isEdit ? "Update" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
