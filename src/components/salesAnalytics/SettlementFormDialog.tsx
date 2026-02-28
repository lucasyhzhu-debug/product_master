/**
 * Settlement Form Dialog — Create/Edit consignment settlement.
 *
 * Shows live math preview: revenue x revSharePercent = rev share, remainder = frollie payment.
 * Uses timezone-safe date conversion (local midnight, not UTC).
 * Uses actionToast for success feedback.
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
import { toast } from "sonner";
import { actionToast } from "@/lib/actionToast";
import { formatCurrency } from "@/lib/utils";
import {
  useCreateConsignmentSettlement,
  useUpdateConsignmentSettlement,
} from "@/hooks/convex";
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

interface SettlementFormDialogProps {
  open: boolean;
  onClose: () => void;
  outlet: OutletData;
  settlement?: SettlementData;
}

export function SettlementFormDialog({
  open,
  onClose,
  outlet,
  settlement,
}: SettlementFormDialogProps) {
  const createSettlement = useCreateConsignmentSettlement();
  const updateSettlement = useUpdateConsignmentSettlement();

  const [totalRevenue, setTotalRevenue] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isEdit = !!settlement;

  // Pre-fill for edit mode
  useEffect(() => {
    if (settlement) {
      setTotalRevenue(String(settlement.totalRevenue));
      setPeriodStart(fromEpochToDateString(settlement.periodStart));
      setPeriodEnd(fromEpochToDateString(settlement.periodEnd));
      setNotes(settlement.notes ?? "");
    } else {
      setTotalRevenue("");
      setPeriodStart("");
      setPeriodEnd("");
      setNotes("");
    }
  }, [settlement, open]);

  // Live math preview
  const revenueNum = parseFloat(totalRevenue) || 0;
  const { revShareAmount, frolliePayment } = computeSettlementPreview(
    revenueNum,
    outlet.revSharePercent
  );

  const handleSubmit = async (e: React.MouseEvent) => {
    if (!periodStart || !periodEnd) {
      toast.error("Period start and end dates are required");
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

    setSubmitting(true);
    try {
      if (isEdit && settlement) {
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
      <DialogContent className="sm:max-w-[450px]">
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
