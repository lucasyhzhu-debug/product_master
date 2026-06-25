/**
 * ReconcileWeekDialog — Close a subscription week by settling its credit pool.
 *
 * Required: a non-empty operator comment before submit is enabled (D12 compulsory gate).
 * Shows a shortfall-fault selector (none / cafe / frollie) + a comment textarea.
 * On success toasts carried/expired tranche counts + any refund due.
 * On error toasts via getErrorMessage and keeps the dialog open for retry.
 */
import { useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useSessionMutation } from "convex-helpers/react/sessions";
import { api } from "../../../convex/_generated/api";
import { getErrorMessage } from "@/lib/utils";
import type { Id } from "../../../convex/_generated/dataModel";

type Fault = "none" | "cafe" | "frollie";

interface ReconcileWeekDialogProps {
  subscriptionWeekId: Id<"subscriptionWeeks">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReconciled?: () => void;
}

export function ReconcileWeekDialog({
  subscriptionWeekId,
  open,
  onOpenChange,
  onReconciled,
}: ReconcileWeekDialogProps) {
  const reconcile = useSessionMutation(api.subscriptions.reconcile.reconcileWeek);

  const [fault, setFault] = useState<Fault>("none");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (submitting) return;
      if (!nextOpen) {
        // Reset state when closing
        setFault("none");
        setNote("");
      }
      onOpenChange(nextOpen);
    },
    [submitting, onOpenChange],
  );

  const handleSubmit = useCallback(async () => {
    if (!note.trim() || submitting) return;
    setSubmitting(true);
    try {
      const r = await reconcile({
        subscriptionWeekId,
        shortfallFault: fault,
        reconcileNote: note.trim(),
      });
      toast.success(
        `Week reconciled — carried ${r.carried.length}, expired ${r.expired.length}` +
          (r.refundDue > 0
            ? `, refund due ${r.refundDue.toLocaleString("id-ID")} IDR`
            : ""),
      );
      setNote("");
      setFault("none");
      onReconciled?.();
      onOpenChange(false);
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to reconcile week"));
    } finally {
      setSubmitting(false);
    }
  }, [note, submitting, reconcile, subscriptionWeekId, fault, onReconciled, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reconcile week</DialogTitle>
          <DialogDescription>
            Close the week: roll over or expire remaining credit and record any shortfall
            fault. A comment is required.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Shortfall fault selector */}
          <div className="space-y-1.5">
            <Label htmlFor="fault">Shortfall fault</Label>
            <Select value={fault} onValueChange={(v) => setFault(v as Fault)}>
              <SelectTrigger id="fault">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None — credit rolls over</SelectItem>
                <SelectItem value="cafe">Cafe fault — expire (recognize as revenue)</SelectItem>
                <SelectItem value="frollie">Frollie fault — refund due</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Required comment */}
          <div className="space-y-1.5">
            <Label htmlFor="reconcileNote">Comment (required)</Label>
            <Textarea
              id="reconcileNote"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Why is this week being reconciled this way?"
              rows={3}
              autoFocus
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!note.trim() || submitting}
            >
              {submitting ? "Reconciling…" : "Reconcile"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
