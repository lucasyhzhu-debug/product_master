/**
 * AdjustStockDialog - Record wastage or correct inventory counts
 *
 * Two modes:
 * - Wastage: Subtract quantity with categorized reason
 * - Count Correction: Set new absolute quantity with explanation
 *
 * Both use useConvexAdjustStock hook. Reason is stored in referenceNote
 * prefixed with [WASTAGE] or [COUNT] for reporting.
 */

import { useState, useEffect } from "react";
import { Trash2, ClipboardCheck, AlertTriangle } from "lucide-react";
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
import { toast } from "sonner";
import { useConvexAdjustStock } from "@/hooks/convex";
import type { Id } from "../../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";

type AdjustMode = "wastage" | "correction";

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
}

export function AdjustStockDialog({
  open,
  onOpenChange,
  batchId,
  componentName,
  currentQuantity,
  reservedQuantity,
}: AdjustStockDialogProps) {
  const [mode, setMode] = useState<AdjustMode>("wastage");
  const [wasteQuantity, setWasteQuantity] = useState("");
  const [newCount, setNewCount] = useState("");
  const [wastageReason, setWastageReason] = useState<string>("damaged");
  const [customReason, setCustomReason] = useState("");
  const [correctionReason, setCorrectionReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const adjustStock = useConvexAdjustStock();

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
    }
  }, [open]);

  const handleSubmit = async () => {
    let newQuantity: number;
    let reason: string;

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
    } else {
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
    }

    setIsSubmitting(true);
    try {
      await adjustStock({
        batchId,
        newQuantity,
        reason,
        createdBy: "current-user",
      });
      const actionLabel = mode === "wastage" ? "Wastage recorded" : "Count corrected";
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
              <Trash2 className="h-5 w-5 text-red-400" />
            ) : (
              <ClipboardCheck className="h-5 w-5 text-blue-400" />
            )}
            Adjust Stock
          </DialogTitle>
          <DialogDescription>
            <span className="font-semibold text-slate-200">{componentName}</span>
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
              <Trash2 className="h-4 w-4 mr-2" />
              Record Wastage
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
              <ClipboardCheck className="h-4 w-4 mr-2" />
              Count Correction
            </Button>
          </div>

          {mode === "wastage" ? (
            <>
              {/* Wastage Quantity */}
              <div className="space-y-2">
                <Label htmlFor="waste-qty">Quantity Wasted</Label>
                <div className="flex items-center gap-2">
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
                </div>
                {wasteQuantity && Number(wasteQuantity) > 0 && (
                  <div className="flex items-center gap-2 text-sm text-slate-400">
                    <AlertTriangle className="h-3 w-3 text-amber-400" />
                    Remaining after: {currentQuantity - Number(wasteQuantity)}
                  </div>
                )}
              </div>

              {/* Wastage Reason */}
              <div className="space-y-2">
                <Label>Reason</Label>
                <div className="flex flex-wrap gap-2">
                  {WASTAGE_REASONS.map((r) => (
                    <Badge
                      key={r.value}
                      variant={wastageReason === r.value ? "default" : "outline"}
                      className={cn(
                        "cursor-pointer text-xs px-3 py-1.5 transition-colors",
                        wastageReason === r.value
                          ? "bg-red-600 text-white border-red-600"
                          : "bg-slate-700/50 text-slate-300 border-slate-600 hover:bg-slate-600/50"
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
          ) : (
            <>
              {/* Actual Count */}
              <div className="space-y-2">
                <Label htmlFor="new-count">Actual Count</Label>
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
                  <div className="text-sm text-slate-400">
                    Difference: {Number(newCount) - currentQuantity >= 0 ? "+" : ""}
                    {Number(newCount) - currentQuantity}
                  </div>
                )}
              </div>

              {/* Correction Reason */}
              <div className="space-y-2">
                <Label htmlFor="correction-reason">Reason for Correction *</Label>
                <Input
                  id="correction-reason"
                  value={correctionReason}
                  onChange={(e) => setCorrectionReason(e.target.value)}
                  placeholder="Physical count audit, recount, etc."
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
                : "Update Count"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
