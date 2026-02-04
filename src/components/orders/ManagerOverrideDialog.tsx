/**
 * ManagerOverrideDialog - Dialog for managers to create override vouchers during checkout
 * Creates a single-use, 24-hour voucher with a required reason
 */
import { useState } from "react";
import { ShieldCheck, Percent, Hash, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency } from "@/lib/utils";
import { useCreateManagerOverride } from "@/hooks/convex/useVouchers";
import { useAuth } from "@/contexts/AuthContext";

interface ManagerOverrideDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subtotal: number;
  onOverrideCreated: (voucher: {
    id: string;
    code: string;
    discountType: "amount" | "percentage";
    discountValue: number;
    calculatedDiscount: number;
  }) => void;
}

export function ManagerOverrideDialog({
  open,
  onOpenChange,
  subtotal,
  onOverrideCreated,
}: ManagerOverrideDialogProps) {
  const { user, hasPermission } = useAuth();
  const { createOverride } = useCreateManagerOverride();

  const [discountType, setDiscountType] = useState<"amount" | "percentage">("percentage");
  const [discountValue, setDiscountValue] = useState("");
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Check if user has permission to create overrides
  const canCreateOverride = hasPermission("canCreateOverrideVoucher");

  // Calculate the actual discount amount
  const calculateDiscount = () => {
    const value = parseFloat(discountValue) || 0;
    if (discountType === "percentage") {
      return Math.min(Math.floor((subtotal * value) / 100), subtotal);
    }
    return Math.min(value, subtotal);
  };

  const calculatedDiscount = calculateDiscount();
  const finalPrice = subtotal - calculatedDiscount;

  // Validation
  const isValid =
    discountValue &&
    parseFloat(discountValue) > 0 &&
    (discountType !== "percentage" || parseFloat(discountValue) <= 100) &&
    reason.trim().length >= 5 &&
    finalPrice > 0;

  const handleSubmit = async () => {
    if (!isValid || !canCreateOverride) return;

    setIsSubmitting(true);
    try {
      const result = await createOverride({
        reason: reason.trim(),
        discountType,
        discountValue: parseFloat(discountValue),
      });

      // Pass the created voucher back to parent
      onOverrideCreated({
        id: result.voucherId as string,
        code: result.code,
        discountType,
        discountValue: parseFloat(discountValue),
        calculatedDiscount,
      });

      // Reset form and close dialog
      setDiscountType("percentage");
      setDiscountValue("");
      setReason("");
      onOpenChange(false);
    } catch {
      // Error is already handled by the hook with a toast
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setDiscountType("percentage");
      setDiscountValue("");
      setReason("");
      onOpenChange(false);
    }
  };

  if (!canCreateOverride) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-amber-600" />
              Manager Override
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 text-center">
            <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-3" />
            <p className="text-muted-foreground">
              You do not have permission to create manager overrides.
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Only managers and administrators can create override vouchers.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleClose}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-amber-600" />
            Manager Override
          </DialogTitle>
          <DialogDescription>
            Create a single-use discount voucher that expires in 24 hours.
            This action will be logged for audit purposes.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Current user info */}
          <div className="text-sm text-muted-foreground">
            Creating as: <span className="font-medium">{user?.name}</span>
          </div>

          {/* Order subtotal */}
          <div className="p-3 bg-muted rounded-md">
            <div className="text-sm text-muted-foreground">Order Subtotal</div>
            <div className="text-lg font-semibold">{formatCurrency(subtotal)}</div>
          </div>

          {/* Discount type & value */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Discount Type</Label>
              <Select
                value={discountType}
                onValueChange={(v) => setDiscountType(v as "amount" | "percentage")}
                disabled={isSubmitting}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">
                    <div className="flex items-center gap-2">
                      <Percent className="w-4 h-4" />
                      Percentage
                    </div>
                  </SelectItem>
                  <SelectItem value="amount">
                    <div className="flex items-center gap-2">
                      <Hash className="w-4 h-4" />
                      Fixed Amount
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>
                Value {discountType === "percentage" ? "(%)" : "(Rp)"}
              </Label>
              <Input
                type="number"
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
                placeholder={discountType === "percentage" ? "10" : "50000"}
                min="0"
                max={discountType === "percentage" ? "100" : subtotal}
                disabled={isSubmitting}
              />
            </div>
          </div>

          {/* Preview discount */}
          {parseFloat(discountValue) > 0 && (
            <div className="p-3 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-md">
              <div className="flex justify-between text-sm">
                <span>Discount</span>
                <span className="text-amber-600 font-medium">
                  -{formatCurrency(calculatedDiscount)}
                </span>
              </div>
              <div className="flex justify-between font-semibold mt-1">
                <span>Final Price</span>
                <span className={finalPrice <= 0 ? "text-destructive" : ""}>
                  {formatCurrency(finalPrice)}
                </span>
              </div>
              {finalPrice <= 0 && (
                <p className="text-xs text-destructive mt-2">
                  Final price cannot be zero or negative
                </p>
              )}
            </div>
          )}

          {/* Reason */}
          <div className="space-y-2">
            <Label>Reason for Override *</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain why this override is needed (min 5 characters)"
              rows={3}
              disabled={isSubmitting}
            />
            <p className="text-xs text-muted-foreground">
              This reason will be logged and attached to the voucher.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!isValid || isSubmitting}>
            {isSubmitting ? "Creating..." : "Create Override Voucher"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
