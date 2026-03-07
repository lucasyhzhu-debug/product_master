/**
 * FreeVoucherDialog - Self-contained dialog for creating 100% discount vouchers.
 * Manages its own form state and submit handler internally.
 */
import { useState } from "react";
import type { FreeVoucherInput } from "@/hooks/convex/useVouchers";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";

interface FreeVoucherDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  createFreeVoucher: (input: FreeVoucherInput) => Promise<unknown>;
}

const initialFreeForm = {
  name: "",
  reasonType: "QA Testing" as "QA Testing" | "Gift" | "Other",
  reasonOther: "",
  code: "",
  usageLimit: "",
  validUntil: "",
};

export function FreeVoucherDialog({
  open,
  onOpenChange,
  createFreeVoucher,
}: FreeVoucherDialogProps) {
  const [freeForm, setFreeForm] = useState(initialFreeForm);
  const [isSubmittingFree, setIsSubmittingFree] = useState(false);

  const handleCreateFree = async () => {
    if (!freeForm.name.trim()) {
      toast.error("Voucher name is required");
      return;
    }
    if (freeForm.reasonType === "Other" && !freeForm.reasonOther.trim()) {
      toast.error("Please describe the reason");
      return;
    }
    const freeReason =
      freeForm.reasonType === "Other"
        ? `Other: ${freeForm.reasonOther.trim()}`
        : freeForm.reasonType;

    const freeInput: FreeVoucherInput = {
      name: freeForm.name.trim(),
      freeReason,
      code: freeForm.code.trim() || undefined,
      usageLimit: freeForm.usageLimit ? parseInt(freeForm.usageLimit) : undefined,
      validUntil: freeForm.validUntil
        ? new Date(freeForm.validUntil + "T23:59:59").getTime()
        : undefined,
    };

    setIsSubmittingFree(true);
    try {
      await createFreeVoucher(freeInput);
      onOpenChange(false);
      setFreeForm(initialFreeForm);
    } finally {
      setIsSubmittingFree(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create Free Voucher</DialogTitle>
          <DialogDescription>
            Creates a 100% discount voucher. Admin only.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="free-name">Voucher Name *</Label>
            <Input
              id="free-name"
              value={freeForm.name}
              onChange={(e) => setFreeForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="QA Test — Feb 2026"
            />
          </div>
          {/* Reason */}
          <div className="space-y-2">
            <Label>Reason *</Label>
            <Select
              value={freeForm.reasonType}
              onValueChange={(v: "QA Testing" | "Gift" | "Other") =>
                setFreeForm((p) => ({ ...p, reasonType: v, reasonOther: "" }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="QA Testing">QA Testing</SelectItem>
                <SelectItem value="Gift">Gift</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
            {freeForm.reasonType === "Other" && (
              <Input
                value={freeForm.reasonOther}
                onChange={(e) => setFreeForm((p) => ({ ...p, reasonOther: e.target.value }))}
                placeholder="Describe the reason..."
              />
            )}
          </div>
          {/* Optional Code */}
          <div className="space-y-2">
            <Label htmlFor="free-code">Custom Code (optional)</Label>
            <Input
              id="free-code"
              value={freeForm.code}
              onChange={(e) =>
                setFreeForm((p) => ({ ...p, code: e.target.value.toUpperCase().replace(/\s+/g, "-") }))
              }
              placeholder="Auto-generated (FREE-XXXX-XXXX)"
              className="font-mono"
            />
          </div>
          {/* Optional Usage Limit */}
          <div className="space-y-2">
            <Label htmlFor="free-limit">Usage Limit (optional)</Label>
            <Input
              id="free-limit"
              type="number"
              min="1"
              value={freeForm.usageLimit}
              onChange={(e) => setFreeForm((p) => ({ ...p, usageLimit: e.target.value }))}
              placeholder="Leave empty for unlimited"
            />
          </div>
          {/* Optional Expiry */}
          <div className="space-y-2">
            <Label htmlFor="free-until">Valid Until (optional)</Label>
            <Input
              id="free-until"
              type="date"
              value={freeForm.validUntil}
              onChange={(e) => setFreeForm((p) => ({ ...p, validUntil: e.target.value }))}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmittingFree}
          >
            Cancel
          </Button>
          <Button onClick={handleCreateFree} disabled={isSubmittingFree}>
            {isSubmittingFree ? "Creating..." : "Create Free Voucher"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
