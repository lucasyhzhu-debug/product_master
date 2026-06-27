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

const DAY_MS = 86_400_000;

/** Format epoch ms as "DD MMM YYYY" in WIB. */
function formatWibDate(ms: number): string {
  return new Date(ms).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });
}

export interface SubscriptionSettingsDialogProps {
  subscriptionId: Id<"subscriptions">;
  label?: string | null;
  /** Pre-fills the baseline qty input. */
  baselineDailyQty: number;
  /** Controls whether the termination button is enabled. */
  status: string;
  /** Scheduled end date (set once a termination notice is given). */
  endDate?: number | null;
  /** When the termination notice was given. */
  terminationNoticeDate?: number | null;
  /** Notice period (days) — projects the end date shown in the confirm step. Default 30. */
  terminationNoticeDays?: number;
  /** A not-yet-effective baseline change, if one is staged. */
  pendingBaselineChange?: { newQty: number; effectiveDate: number } | null;
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
  endDate,
  terminationNoticeDate,
  terminationNoticeDays = 30,
  pendingBaselineChange,
  onClose,
}: SubscriptionSettingsDialogProps) {
  // ── Baseline change state ──────────────────────────────────────────────
  const [newQty, setNewQty] = useState<number>(baselineDailyQty);
  const [baselineLoading, setBaselineLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);

  // ── Termination state ──────────────────────────────────────────────────
  const [confirmTerminate, setConfirmTerminate] = useState(false);
  const [terminateLoading, setTerminateLoading] = useState(false);

  // ── Mutations (via useSessionMutation — sessionId injected by hook) ────
  // All hooks before any conditional returns (Pitfall #9).
  const scheduleBaselineChange = useSessionMutation(
    api.subscriptions.mutations.scheduleBaselineChange,
  );
  const cancelBaselineChange = useSessionMutation(
    api.subscriptions.mutations.cancelBaselineChange,
  );
  const giveTerminationNotice = useSessionMutation(
    api.subscriptions.mutations.giveTerminationNotice,
  );

  // A subscription that is ending (or ended) should not accept new baseline
  // changes or another termination notice.
  const isWindingDown = status === "terminating" || status === "ended";
  const isTerminable = !isWindingDown;
  // Projected end date shown in the confirm step (the authoritative value is
  // computed server-side; this is display-only).
  const projectedEndDate = Date.now() + terminationNoticeDays * DAY_MS;

  // ── Handlers ──────────────────────────────────────────────────────────

  async function handleBaselineSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!Number.isInteger(newQty) || newQty < 1) return;
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

  async function handleCancelBaseline() {
    setCancelLoading(true);
    try {
      await cancelBaselineChange({ subscriptionId });
      toast.success("Pending baseline change cancelled.");
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to cancel baseline change"));
    } finally {
      setCancelLoading(false);
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

        {/* ── Pending baseline change record (persistent — B7 "what's next") ── */}
        {pendingBaselineChange && (
          <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 flex items-center justify-between gap-2">
            <span>
              Pending change: baseline <strong>{baselineDailyQty}</strong> →{" "}
              <strong>{pendingBaselineChange.newQty}</strong>, effective{" "}
              <strong>{formatWibDate(pendingBaselineChange.effectiveDate)}</strong>
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs shrink-0"
              onClick={handleCancelBaseline}
              disabled={cancelLoading}
            >
              {cancelLoading ? "Cancelling…" : "Cancel change"}
            </Button>
          </div>
        )}

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
              disabled={baselineLoading || isWindingDown}
            />
          </div>
          <Button type="submit" disabled={baselineLoading || isWindingDown}>
            {baselineLoading
              ? "Scheduling…"
              : "Change baseline (effective in 14 days)"}
          </Button>
          {isWindingDown && (
            <p className="text-xs text-muted-foreground">
              Baseline changes are disabled while a subscription is winding down.
            </p>
          )}
        </form>

        <hr className="my-2" />

        {/* ── 2. Termination notice ────────────────────────────────────── */}
        {isWindingDown ? (
          <div className="rounded-md border border-muted bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            {status === "ended" ? (
              <>
                This subscription has ended
                {endDate ? <> on <strong>{formatWibDate(endDate)}</strong></> : null}.
              </>
            ) : (
              <>
                This subscription is ending
                {endDate ? <> on <strong>{formatWibDate(endDate)}</strong></> : null}
                {terminationNoticeDate ? (
                  <> (notice given {formatWibDate(terminationNoticeDate)})</>
                ) : null}
                .
              </>
            )}
          </div>
        ) : !confirmTerminate ? (
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
              This will schedule the subscription to end on{" "}
              <strong>{formatWibDate(projectedEndDate)}</strong> (in{" "}
              {terminationNoticeDays} days) and set its status to{" "}
              <strong>terminating</strong>. This cannot be undone.
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
