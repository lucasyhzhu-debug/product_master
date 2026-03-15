/**
 * VoidReasonDialog -- Shared void reason dialog used by PayrollManager and ReimbursementManager.
 *
 * Error-resilient: keeps dialog open and preserves reason text when onConfirm rejects.
 * The caller is responsible for showing error toasts in their try/catch around the mutation.
 */
import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

interface VoidReasonDialogProps {
  title: string;
  description: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => Promise<void>;
  confirmLabel?: string;
  confirmingLabel?: string;
}

export function VoidReasonDialog({
  title,
  description,
  open,
  onOpenChange,
  onConfirm,
  confirmLabel = "Void Entry",
  confirmingLabel = "Voiding...",
}: VoidReasonDialogProps) {
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (!reason.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onConfirm(reason.trim());
      // Success: reset and close
      setReason("");
      setIsSubmitting(false);
      onOpenChange(false);
    } catch {
      // Error: keep dialog open, preserve reason text for retry
      setIsSubmitting(false);
    }
  }, [reason, isSubmitting, onConfirm, onOpenChange]);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        // Reset reason when closing via X or overlay click
        setReason("");
      }
      onOpenChange(nextOpen);
    },
    [onOpenChange],
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="voidReason">Reason for voiding</Label>
            <Textarea
              id="voidReason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Enter reason..."
              rows={3}
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleSubmit}
              disabled={!reason.trim() || isSubmitting}
            >
              {isSubmitting ? confirmingLabel : confirmLabel}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
