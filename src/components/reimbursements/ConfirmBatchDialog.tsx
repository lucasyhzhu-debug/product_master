/**
 * ConfirmBatchDialog -- Dialog for confirming a pending reimbursement batch.
 *
 * Collects:
 * - BCA Reference Number (text input, required)
 * - Transfer Date (date input, required -- converted to UTC ms)
 * - Source Bank Account (select dropdown, required -- active accounts only)
 *
 * Shows JE preview (DR 2200, CR 1100) before confirming.
 */
import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency } from "@/lib/utils";
import { useBankAccounts, type BankAccount } from "@/hooks/convex/useBankAccounts";
import { useConfirmBatch } from "@/hooks/convex/useReimbursements";
import type { Id } from "../../../convex/_generated/dataModel";

interface ConfirmBatchDialogProps {
  batchId: Id<"reimbursementBatches"> | null;
  batchNumber: string;
  totalAmount: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ConfirmBatchDialog({
  batchId,
  batchNumber,
  totalAmount,
  open,
  onOpenChange,
}: ConfirmBatchDialogProps) {
  const [bankReference, setBankReference] = useState("");
  const [transferDate, setTransferDate] = useState("");
  const [bankAccountId, setBankAccountId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  const bankAccounts = useBankAccounts(true); // active only
  const confirmBatch = useConfirmBatch();

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setBankReference("");
      setTransferDate("");
      setBankAccountId("");
      setSubmitting(false);
    }
  }, [open]);

  const canSubmit =
    batchId &&
    bankReference.trim() !== "" &&
    transferDate !== "" &&
    bankAccountId !== "" &&
    !submitting;

  const handleConfirm = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      // Convert date string (YYYY-MM-DD) to UTC timestamp at midnight
      const dateMs = new Date(transferDate).getTime();
      await confirmBatch.mutate({
        batchId: batchId,
        bankAccountId: bankAccountId as Id<"bankAccounts">,
        bankReference: bankReference.trim(),
        transferDate: dateMs,
      });
      onOpenChange(false);
    } catch {
      // Error toast handled by createMutationHook
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Confirm Batch {batchNumber}</DialogTitle>
          <DialogDescription>
            Total: {formatCurrency(totalAmount)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* BCA Reference Number */}
          <div className="space-y-1.5">
            <Label htmlFor="bankReference">BCA Reference Number</Label>
            <Input
              id="bankReference"
              value={bankReference}
              onChange={(e) => setBankReference(e.target.value)}
              placeholder="e.g., 1234567890"
              autoFocus
            />
          </div>

          {/* Transfer Date */}
          <div className="space-y-1.5">
            <Label htmlFor="transferDate">Transfer Date</Label>
            <Input
              id="transferDate"
              type="date"
              value={transferDate}
              onChange={(e) => setTransferDate(e.target.value)}
            />
          </div>

          {/* Source Bank Account */}
          <div className="space-y-1.5">
            <Label htmlFor="sourceBank">Source Bank Account</Label>
            <Select value={bankAccountId} onValueChange={setBankAccountId}>
              <SelectTrigger id="sourceBank">
                <SelectValue placeholder="Select bank account..." />
              </SelectTrigger>
              <SelectContent>
                {bankAccounts?.map((acct: BankAccount) => (
                  <SelectItem key={acct._id} value={acct._id}>
                    {acct.name} ({acct.bankName} - {acct.accountNumber})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* JE Preview */}
          <div className="rounded-md bg-muted/50 p-3 text-xs font-mono space-y-1">
            <p className="text-muted-foreground text-xs font-sans mb-1.5">
              Journal Entry Preview:
            </p>
            <p>
              DR 2200 Employee Reimb. Payable:{" "}
              <span className="font-medium">{formatCurrency(totalAmount)}</span>
            </p>
            <p>
              CR 1100 Cash:{" "}
              <span className="font-medium">{formatCurrency(totalAmount)}</span>
            </p>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button onClick={handleConfirm} disabled={!canSubmit}>
              {submitting ? "Confirming..." : "Confirm"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
