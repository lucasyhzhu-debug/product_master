/**
 * FGAdjustDialog — Dialog for adjusting finished goods stock.
 *
 * Used for wastage, QC testing samples, freebies, and manual corrections.
 * Supports both deductions (negative) and additions (positive).
 * Requires manager or admin role (enforced by backend adjustStock mutation).
 */

import { useState, useEffect } from "react";
import { SlidersHorizontal, AlertTriangle } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { toast } from "sonner";
import type { Id } from "../../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";

// Reason categories for stock adjustments
const REASON_CATEGORIES = [
  "Wastage",
  "QC / Testing Sample",
  "Freebie / Gift",
  "Manual Correction",
] as const;

type ReasonCategory = typeof REASON_CATEGORIES[number];
type Direction = "deduct" | "add";

interface FGAdjustDialogProps {
  menuProductId: Id<"menuProducts">;
  menuProductName: string;
  locationId: Id<"storageLocations">;
  locationName: string;
  currentQuantity: number;
  open: boolean;
  onClose: () => void;
}

export function FGAdjustDialog({
  menuProductId,
  menuProductName,
  locationId,
  locationName,
  currentQuantity,
  open,
  onClose,
}: FGAdjustDialogProps) {
  const { user } = useAuth();
  const adjustStock = useMutation(api.productInventory.mutations.adjustStock);

  const [reasonCategory, setReasonCategory] = useState<ReasonCategory | "">("");
  const [quantity, setQuantity] = useState("");
  const [direction, setDirection] = useState<Direction>("deduct");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setReasonCategory("");
      setQuantity("");
      setDirection("deduct");
      setNotes("");
    }
  }, [open]);

  const parsedQty = Number(quantity);
  const isValidQty = !isNaN(parsedQty) && parsedQty > 0 && Number.isInteger(parsedQty);
  const resultingQuantity = isValidQty
    ? direction === "deduct"
      ? currentQuantity - parsedQty
      : currentQuantity + parsedQty
    : currentQuantity;
  const isOverDeduction = direction === "deduct" && isValidQty && parsedQty > currentQuantity;
  const isFormValid = reasonCategory !== "" && isValidQty;

  const handleSubmit = async () => {
    if (!isFormValid || !user?.token) return;

    const signedQuantity = direction === "deduct" ? -parsedQty : parsedQty;
    const reason = notes.trim()
      ? `${reasonCategory}: ${notes.trim()}`
      : reasonCategory;

    setIsSubmitting(true);
    try {
      await adjustStock({
        token: user.token,
        menuProductId,
        locationId,
        quantity: signedQuantity,
        reason,
      });

      const directionText = direction === "deduct" ? "Deducted" : "Added";
      toast.success(`${directionText} ${parsedQty} from ${menuProductName} at ${locationName}`);
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to adjust stock");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SlidersHorizontal className="h-5 w-5" />
            Adjust Stock
          </DialogTitle>
          <DialogDescription>
            Adjust stock for <strong>{menuProductName}</strong> at <strong>{locationName}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Current stock context */}
          <div className="rounded-lg bg-muted/50 border p-3 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Current stock</span>
            <span className="text-lg font-bold font-mono">{currentQuantity}</span>
          </div>

          {/* Direction toggle */}
          <div className="space-y-2">
            <Label>Adjustment Type</Label>
            <div className="flex border rounded-md overflow-hidden">
              <button
                type="button"
                onClick={() => setDirection("deduct")}
                className={cn(
                  "flex-1 px-3 py-2 text-sm font-medium transition-colors",
                  direction === "deduct"
                    ? "bg-amber-500 text-white"
                    : "bg-background text-muted-foreground hover:bg-muted"
                )}
              >
                Deduct
              </button>
              <button
                type="button"
                onClick={() => setDirection("add")}
                className={cn(
                  "flex-1 px-3 py-2 text-sm font-medium transition-colors border-l",
                  direction === "add"
                    ? "bg-[var(--color-status-success)] text-white"
                    : "bg-background text-muted-foreground hover:bg-muted"
                )}
              >
                Add
              </button>
            </div>
          </div>

          {/* Reason category */}
          <div className="space-y-2">
            <Label htmlFor="fg-adjust-reason">Reason Category <span className="text-destructive">*</span></Label>
            <Select
              value={reasonCategory}
              onValueChange={(v) => setReasonCategory(v as ReasonCategory)}
            >
              <SelectTrigger id="fg-adjust-reason">
                <SelectValue placeholder="Select a reason..." />
              </SelectTrigger>
              <SelectContent>
                {REASON_CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Quantity */}
          <div className="space-y-2">
            <Label htmlFor="fg-adjust-qty">
              Quantity to {direction === "deduct" ? "Deduct" : "Add"} <span className="text-destructive">*</span>
            </Label>
            <Input
              id="fg-adjust-qty"
              type="number"
              min="1"
              step="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="e.g. 3"
              className={cn(
                "font-mono",
                isOverDeduction && "border-amber-400 focus-visible:ring-amber-400"
              )}
              autoFocus
            />
            {/* Resulting stock preview */}
            {isValidQty && (
              <p className={cn(
                "text-xs",
                isOverDeduction ? "text-amber-600" : "text-muted-foreground"
              )}>
                Stock after adjustment: <span className="font-mono font-semibold">{resultingQuantity}</span>
                {isOverDeduction && (
                  <span className="ml-2 flex items-center gap-1 inline-flex">
                    <AlertTriangle className="h-3 w-3" />
                    Deducting more than current stock
                  </span>
                )}
              </p>
            )}
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="fg-adjust-notes">Notes <span className="text-xs text-muted-foreground">(optional)</span></Label>
            <Textarea
              id="fg-adjust-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional context (e.g. dropped on floor, sample for new customer)"
              rows={2}
              className="resize-none text-sm"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!isFormValid || isSubmitting}
            className={cn(
              direction === "deduct"
                ? "bg-amber-500 hover:bg-amber-600 text-white"
                : ""
            )}
          >
            <SlidersHorizontal className="h-4 w-4 mr-2" />
            {isSubmitting ? "Saving..." : `${direction === "deduct" ? "Deduct" : "Add"} Stock`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
