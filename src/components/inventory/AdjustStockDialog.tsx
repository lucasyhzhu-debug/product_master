/**
 * AdjustStockDialog - Record wastage, correct inventory counts, or fix pricing
 *
 * Three modes:
 * - Wastage: Subtract quantity with categorized reason
 * - Count Correction: Set new absolute quantity with explanation
 * - Price Correction: Fix total cost for the batch (recalculates unit cost)
 *
 * All use useAdjustStock hook. Reason is stored in referenceNote
 * prefixed with [WASTAGE], [COUNT], or [PRICE] for reporting.
 */

import { useState, useEffect } from "react";
import { Trash2, ClipboardCheck, AlertTriangle, DollarSign } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useAdjustStock } from "@/hooks/convex";
import type { Id } from "../../../convex/_generated/dataModel";
import { cn, formatCurrency } from "@/lib/utils";

type AdjustMode = "wastage" | "correction" | "price";

const WASTAGE_REASONS = [
  { value: "damaged", label: "Damaged" },
  { value: "expired", label: "Expired" },
  { value: "lost", label: "Lost / Missing" },
  { value: "quality", label: "Quality Reject" },
  { value: "other", label: "Other" },
] as const;

interface AdjustStockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  batchId: Id<"inventoryBatches">;
  componentName: string;
  currentQuantity: number;
  reservedQuantity: number;
  currentTotalCost: number;
  currentUnitCost: number;
  quantityPurchased: number;
}

export function AdjustStockDialog({
  open,
  onOpenChange,
  batchId,
  componentName,
  currentQuantity,
  reservedQuantity,
  currentTotalCost,
  currentUnitCost,
  quantityPurchased,
}: AdjustStockDialogProps) {
  const [mode, setMode] = useState<AdjustMode>("wastage");
  const [wasteQuantity, setWasteQuantity] = useState("");
  const [newCount, setNewCount] = useState("");
  const [wastageReason, setWastageReason] = useState<string>("damaged");
  const [customReason, setCustomReason] = useState("");
  const [correctionReason, setCorrectionReason] = useState("");
  const [newTotalCost, setNewTotalCost] = useState("");
  const [priceReason, setPriceReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { user } = useAuth();
  const adjustStock = useAdjustStock();

  const maxWastage = currentQuantity - reservedQuantity;

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setMode("wastage");
      setWasteQuantity("");
      setNewCount("");
      setWastageReason("damaged");
      setCustomReason("");
      setCorrectionReason("");
      setNewTotalCost(String(currentTotalCost));
      setPriceReason("");
    }
  }, [open, currentTotalCost]);

  const newUnitCost = newTotalCost && quantityPurchased > 0
    ? Number(newTotalCost) / quantityPurchased
    : null;

  const handleSubmit = async () => {
    let newQuantity: number;
    let reason: string;
    let newCost: number | undefined;

    if (mode === "wastage") {
      const waste = Number(wasteQuantity);
      if (!waste || waste <= 0) {
        toast.error("Waste quantity must be greater than 0");
        return;
      }
      if (waste > maxWastage) {
        toast.error(`Maximum wastage is ${maxWastage} (${reservedQuantity} reserved)`);
        return;
      }
      newQuantity = currentQuantity - waste;

      const reasonLabel =
        wastageReason === "other"
          ? customReason.trim() || "Unspecified"
          : WASTAGE_REASONS.find((r) => r.value === wastageReason)?.label || wastageReason;
      reason = `[WASTAGE] ${reasonLabel}: ${waste} units removed`;
    } else if (mode === "correction") {
      const count = Number(newCount);
      if (count < 0) {
        toast.error("Count cannot be negative");
        return;
      }
      if (count < reservedQuantity) {
        toast.error(`Count cannot be less than reserved quantity (${reservedQuantity})`);
        return;
      }
      if (!correctionReason.trim()) {
        toast.error("Please provide a reason for the correction");
        return;
      }
      newQuantity = count;
      reason = `[COUNT] ${correctionReason.trim()}: ${currentQuantity} → ${count}`;
    } else {
      // Price correction
      const cost = Number(newTotalCost);
      if (!cost || cost <= 0) {
        toast.error("Total cost must be greater than 0");
        return;
      }
      if (!priceReason.trim()) {
        toast.error("Please provide a reason for the price correction");
        return;
      }
      newQuantity = currentQuantity; // No quantity change
      newCost = cost;
      reason = `[PRICE] ${priceReason.trim()}: ${formatCurrency(currentTotalCost)} → ${formatCurrency(cost)}`;
    }

    setIsSubmitting(true);
    try {
      await adjustStock({
        batchId,
        newQuantity,
        newTotalCost: newCost,
        reason,
        createdBy: user?.name ?? "unknown",
      });
      const actionLabel =
        mode === "wastage" ? "Wastage recorded" :
        mode === "correction" ? "Count corrected" :
        "Price corrected";
      toast.success(`${actionLabel} for ${componentName}`);
      onOpenChange(false);
    } catch (error) {
      console.error("Adjustment failed:", error);
      toast.error(error instanceof Error ? error.message : "Adjustment failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {mode === "wastage" ? (
              <Trash2 className="h-5 w-5 text-red-500" />
            ) : mode === "correction" ? (
              <ClipboardCheck className="h-5 w-5 text-blue-500" />
            ) : (
              <DollarSign className="h-5 w-5 text-amber-500" />
            )}
            Adjust Stock
          </DialogTitle>
          <DialogDescription>
            <span className="font-semibold text-foreground">{componentName}</span>
            {" — "}
            Current: {currentQuantity} ({reservedQuantity} reserved)
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-4">
          {/* Mode Toggle */}
          <div className="flex gap-2">
            <Button
              variant={mode === "wastage" ? "default" : "outline"}
              size="sm"
              onClick={() => setMode("wastage")}
              className={cn(
                "flex-1",
                mode === "wastage" && "bg-red-600 hover:bg-red-700 text-white"
              )}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              Wastage
            </Button>
            <Button
              variant={mode === "correction" ? "default" : "outline"}
              size="sm"
              onClick={() => setMode("correction")}
              className={cn(
                "flex-1",
                mode === "correction" && "bg-blue-600 hover:bg-blue-700 text-white"
              )}
            >
              <ClipboardCheck className="h-3.5 w-3.5 mr-1.5" />
              Count
            </Button>
            <Button
              variant={mode === "price" ? "default" : "outline"}
              size="sm"
              onClick={() => setMode("price")}
              className={cn(
                "flex-1",
                mode === "price" && "bg-amber-600 hover:bg-amber-700 text-white"
              )}
            >
              <DollarSign className="h-3.5 w-3.5 mr-1.5" />
              Price
            </Button>
          </div>

          {mode === "wastage" ? (
            <>
              {/* Wastage Quantity */}
              <div className="space-y-2">
                <Label htmlFor="waste-qty" className="text-foreground">Quantity Wasted</Label>
                <Input
                  id="waste-qty"
                  type="number"
                  min="1"
                  max={maxWastage}
                  value={wasteQuantity}
                  onChange={(e) => setWasteQuantity(e.target.value)}
                  placeholder={`Max ${maxWastage}`}
                  className="font-mono"
                />
                {wasteQuantity && Number(wasteQuantity) > 0 && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <AlertTriangle className="h-3 w-3 text-amber-500" />
                    Remaining after: {currentQuantity - Number(wasteQuantity)}
                  </div>
                )}
              </div>

              {/* Wastage Reason */}
              <div className="space-y-2">
                <Label className="text-foreground">Reason</Label>
                <div className="flex flex-wrap gap-2">
                  {WASTAGE_REASONS.map((r) => (
                    <Badge
                      key={r.value}
                      variant={wastageReason === r.value ? "default" : "outline"}
                      className={cn(
                        "cursor-pointer text-xs px-3 py-1.5 transition-colors",
                        wastageReason === r.value
                          ? "bg-red-600 text-white border-red-600"
                          : "hover:bg-muted"
                      )}
                      onClick={() => setWastageReason(r.value)}
                    >
                      {r.label}
                    </Badge>
                  ))}
                </div>
                {wastageReason === "other" && (
                  <Input
                    value={customReason}
                    onChange={(e) => setCustomReason(e.target.value)}
                    placeholder="Describe reason..."
                    className="mt-2"
                  />
                )}
              </div>
            </>
          ) : mode === "correction" ? (
            <>
              {/* Actual Count */}
              <div className="space-y-2">
                <Label htmlFor="new-count" className="text-foreground">Actual Count</Label>
                <Input
                  id="new-count"
                  type="number"
                  min={reservedQuantity}
                  value={newCount}
                  onChange={(e) => setNewCount(e.target.value)}
                  placeholder={`Current: ${currentQuantity}`}
                  className="font-mono"
                />
                {newCount && (
                  <div className="text-sm text-muted-foreground">
                    Difference: {Number(newCount) - currentQuantity >= 0 ? "+" : ""}
                    {Number(newCount) - currentQuantity}
                  </div>
                )}
              </div>

              {/* Correction Reason */}
              <div className="space-y-2">
                <Label htmlFor="correction-reason" className="text-foreground">Reason for Correction *</Label>
                <Input
                  id="correction-reason"
                  value={correctionReason}
                  onChange={(e) => setCorrectionReason(e.target.value)}
                  placeholder="Physical count audit, recount, etc."
                />
              </div>
            </>
          ) : (
            <>
              {/* Current Price Info */}
              <div className="rounded-lg p-3 bg-muted/50 border text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Batch total</span>
                  <span className="font-mono font-medium">{formatCurrency(currentTotalCost)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Unit cost</span>
                  <span className="font-mono font-medium">{formatCurrency(currentUnitCost)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Qty purchased</span>
                  <span className="font-mono font-medium">{quantityPurchased}</span>
                </div>
              </div>

              {/* New Total Cost */}
              <div className="space-y-2">
                <Label htmlFor="new-total-cost" className="text-foreground">
                  Corrected Total Cost (IDR) *
                </Label>
                <Input
                  id="new-total-cost"
                  type="number"
                  min="1"
                  value={newTotalCost}
                  onChange={(e) => setNewTotalCost(e.target.value)}
                  placeholder={String(currentTotalCost)}
                  className="font-mono"
                />
                {newUnitCost !== null && Number(newTotalCost) !== currentTotalCost && (
                  <div className="text-sm text-muted-foreground">
                    New unit cost: {formatCurrency(newUnitCost)}
                    {" "}(was {formatCurrency(currentUnitCost)})
                  </div>
                )}
              </div>

              {/* Price Reason */}
              <div className="space-y-2">
                <Label htmlFor="price-reason" className="text-foreground">Reason for Price Correction *</Label>
                <Input
                  id="price-reason"
                  value={priceReason}
                  onChange={(e) => setPriceReason(e.target.value)}
                  placeholder="Wrong invoice amount, supplier correction, etc."
                />
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting}
            variant={mode === "wastage" ? "destructive" : "default"}
          >
            {isSubmitting
              ? "Saving..."
              : mode === "wastage"
                ? "Record Wastage"
                : mode === "correction"
                  ? "Update Count"
                  : "Update Price"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
