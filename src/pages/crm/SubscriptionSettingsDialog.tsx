/**
 * SubscriptionSettingsDialog — Task 12
 *
 * Manager actions scoped to a single subscription:
 *   1. Schedule a baseline daily-qty change (effective in 14 days).
 *   2. Give a 30-day termination notice (with a confirm step; disabled when
 *      status is "terminating" or "ended").
 *
 * Design rules:
 *   - Mirrors CrmFieldsEditDialog shape (Dialog / DialogContent / toast / loading).
 *   - Uses useSessionMutation — sessionId is injected by the hook, not the component.
 *   - No on-mount manager-only query (Pitfall #19).
 *   - D12: designed loading + error states.
 */
import { useState } from "react";
import { useSessionMutation } from "convex-helpers/react/sessions";
import { toast } from "sonner";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getErrorMessage } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SubscriptionSettingsDialogProps {
  subscriptionId: Id<"subscriptions">;
  label?: string | null;
  /** Pre-fills the baseline qty input. */
  baselineDailyQty: number;
  /** Controls whether the termination button is enabled. */
  status: string;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SubscriptionSettingsDialog({
  subscriptionId,
  label,
  baselineDailyQty,
  status,
  onClose,
}: SubscriptionSettingsDialogProps) {
  // ── Baseline change state ──────────────────────────────────────────────
  const [newQty, setNewQty] = useState<number>(baselineDailyQty);
  const [baselineLoading, setBaselineLoading] = useState(false);

  // ── Termination state ──────────────────────────────────────────────────
  const [confirmTerminate, setConfirmTerminate] = useState(false);
  const [terminateLoading, setTerminateLoading] = useState(false);

  // ── Mutations (via useSessionMutation — sessionId injected by hook) ────
  // All hooks before any conditional returns (Pitfall #9).
  const scheduleBaselineChange = useSessionMutation(
    api.subscriptions.mutations.scheduleBaselineChange,
  );
  const giveTerminationNotice = useSessionMutation(
    api.subscriptions.mutations.giveTerminationNotice,
  );

  // Termination is available only when the subscription is not already
  // winding down or ended.
  const isTerminable = status !== "terminating" && status !== "ended";

  // ── Handlers ──────────────────────────────────────────────────────────

  async function handleBaselineSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBaselineLoading(true);
    try {
      await scheduleBaselineChange({ subscriptionId, newQty });
      toast.success("Baseline change scheduled (effective in 14 days).");
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to schedule baseline change"));
    } finally {
      setBaselineLoading(false);
    }
  }

  async function handleTerminate() {
    setTerminateLoading(true);
    try {
      await giveTerminationNotice({ subscriptionId });
      toast.success("30-day termination notice given.");
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to give termination notice"));
    } finally {
      setTerminateLoading(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────

  const displayLabel = label ?? `···${String(subscriptionId).slice(-6)}`;

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Manage subscription</DialogTitle>
          <DialogDescription>{displayLabel}</DialogDescription>
        </DialogHeader>

        {/* ── 1. Baseline change ──────────────────────────────────────── */}
        <form onSubmit={handleBaselineSubmit} className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="newBaselineDailyQty">New baseline daily qty</Label>
            <Input
              id="newBaselineDailyQty"
              type="number"
              min={1}
              value={newQty}
              onChange={(e) => setNewQty(Number(e.target.value))}
              disabled={baselineLoading}
            />
          </div>
          <Button type="submit" disabled={baselineLoading}>
            {baselineLoading
              ? "Scheduling…"
              : "Change baseline (effective in 14 days)"}
          </Button>
        </form>

        <hr className="my-2" />

        {/* ── 2. Termination notice ────────────────────────────────────── */}
        {!confirmTerminate ? (
          <Button
            type="button"
            variant="destructive"
            disabled={!isTerminable || terminateLoading}
            onClick={() => setConfirmTerminate(true)}
          >
            Give 30-day termination notice
          </Button>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              This will schedule the subscription to end in 30 days and set its
              status to <strong>terminating</strong>. This cannot be undone.
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setConfirmTerminate(false)}
                disabled={terminateLoading}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={handleTerminate}
                disabled={terminateLoading}
              >
                {terminateLoading
                  ? "Processing…"
                  : "Confirm termination notice"}
              </Button>
            </div>
          </div>
        )}

        <DialogFooter className="pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
