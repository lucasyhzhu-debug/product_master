/**
 * Phase 74.5.1 Plan 09 — ProductInventorySettings
 *
 * Route: `/admin/product-inventory-settings`
 * Role:  admin (ProtectedRoute in App.tsx + requireRole on every mutation)
 *
 * Primary surface: 8-key channel deduction flag map. Per UI-SPEC + D74.5.1-L1/L2:
 *   - `bigseller`  → DISABLED (N/A · aggregate-only)
 *   - `grabfood`   → DISABLED (Blocked · OAuth pending)
 *   - `internal`   → DISABLED (Permanent off — reserveStockForOrderInternal authoritative)
 *   - others (shopee, tiktok, gobiz, k3mart, consignment) → enabled
 *
 * Flip-ON requires typing `FLIP` to confirm (74.5.1 has no backfill UI yet, so
 * every enable action is a "no prior backfill" case — see UI-SPEC §Error States
 * row 3 + §Destructive Confirmations).
 *
 * Existing thresholds/alert-mode settings on `productInventorySettings` are
 * preserved but NOT exposed here (Plan 09 scope is the flag map; reshaping the
 * existing inventory-settings surface is out of scope).
 */

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ChannelFlagRow,
  type FlagState,
} from "@/components/channelIntegration/ChannelFlagRow";
import { useAuth } from "@/contexts/AuthContext";
import { useChannelFlags } from "@/hooks/convex/useChannelRouting";
import { sourceToPlatform } from "../../convex/lib/externalSource";
import type { ExternalSource } from "../../convex/lib/externalSource";

/**
 * Canonical display order per UI-SPEC §ProductInventorySettings.
 * Enabled sources first, disabled at the bottom.
 */
const SOURCE_ORDER: ExternalSource[] = [
  "shopee",
  "tiktok",
  "gobiz",
  "k3mart",
  "consignment",
  "bigseller",
  "grabfood",
  "internal",
];

/**
 * Per-source disabled reasons per D74.5.1-L1/L2 + RESEARCH.md.
 * Tooltip copy is verbatim from UI-SPEC §Inline Status Copy / §ProductInventorySettings.
 */
const DISABLED_REASONS: Partial<
  Record<
    ExternalSource,
    { reason: "na" | "blocked" | "permanent-off"; tooltip: string }
  >
> = {
  bigseller: {
    reason: "na",
    tooltip:
      "BigSeller writes parent revenue rows only. Per-item deduction is not supported.",
  },
  grabfood: {
    reason: "blocked",
    tooltip: "Requires GrabFood orders:read OAuth scope (pending).",
  },
  internal: {
    reason: "permanent-off",
    tooltip:
      "Skipped to avoid double-deduction with reserveStockForOrderInternal. Override requires code review.",
  },
};

/** Total eligible (flippable) sources — used in the progress indicator. */
const ELIGIBLE_COUNT = SOURCE_ORDER.filter(
  (s) => DISABLED_REASONS[s] === undefined,
).length;

interface PendingFlip {
  source: ExternalSource;
  next: boolean;
}

export function ProductInventorySettings() {
  const { user } = useAuth();
  const token = user?.token;

  const { flags, setFlag } = useChannelFlags(token);

  const [pendingFlip, setPendingFlip] = useState<PendingFlip | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [flipping, setFlipping] = useState(false);

  const loading = flags === undefined;

  const onCount = useMemo(() => {
    if (!flags) return 0;
    return SOURCE_ORDER.filter(
      (s) => DISABLED_REASONS[s] === undefined && flags[s] === true,
    ).length;
  }, [flags]);

  const requestFlip = (source: ExternalSource, next: boolean) => {
    setConfirmText("");
    setPendingFlip({ source, next });
  };

  // Flip-ON during 74.5.1 always requires typing FLIP (backfill not yet run).
  // Flip-OFF during rollback also uses destructive variant per UI-SPEC.
  const requiresFlipText = pendingFlip?.next === true;
  const confirmEnabled = requiresFlipText ? confirmText === "FLIP" : true;

  const doFlip = async () => {
    if (!token || !pendingFlip) return;
    setFlipping(true);
    try {
      await setFlag({
        token,
        source: pendingFlip.source,
        enabled: pendingFlip.next,
      });
      toast.success(
        `${sourceToPlatform(pendingFlip.source)} deduction turned ${
          pendingFlip.next ? "on" : "off"
        }`,
      );
      if (pendingFlip.next) {
        toast.warning(
          "Flag on without backfill. Schedule backfill to cover historical sales.",
        );
      }
      setPendingFlip(null);
      setConfirmText("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Flag flip failed: ${msg}`);
    } finally {
      setFlipping(false);
    }
  };

  return (
    <div className="container mx-auto space-y-6 p-6">
      <PageHeader
        title="Product Inventory Settings"
        description="Global thresholds, alert modes, and per-channel deduction flags."
      />

      <Card>
        <CardHeader>
          <CardTitle>Channel deduction</CardTitle>
          <CardDescription>
            Toggle inventory deduction per source. Flags default OFF. Flipping a
            source ON applies only to sales that arrive after the flip —
            historical deduction requires a separate backfill (Phase 74.5.2).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <>
              {SOURCE_ORDER.map((src) => {
                const disabledReason = DISABLED_REASONS[src];
                const state: FlagState = disabledReason
                  ? {
                      disabled: true,
                      reason: disabledReason.reason,
                      tooltip: disabledReason.tooltip,
                    }
                  : { enabled: flags[src] === true };
                return (
                  <ChannelFlagRow
                    key={src}
                    source={src}
                    state={state}
                    onFlip={(next) => requestFlip(src, next)}
                  />
                );
              })}

              <div
                role="status"
                aria-live="polite"
                className="mt-4 rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-sm tabular-nums"
              >
                <span className="font-semibold">{onCount}</span>
                <span className="text-muted-foreground">
                  /{ELIGIBLE_COUNT} eligible channels flipped ON
                </span>
              </div>

              {!token && (
                <Alert variant="destructive" className="mt-4">
                  <AlertTitle>Admin session required</AlertTitle>
                  <AlertDescription>
                    Flag mutations require an authenticated admin session.
                  </AlertDescription>
                </Alert>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={!!pendingFlip}
        onOpenChange={(open) => {
          if (!open) {
            setPendingFlip(null);
            setConfirmText("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingFlip
                ? pendingFlip.next
                  ? `Turn on deduction for ${sourceToPlatform(pendingFlip.source)}?`
                  : `Turn off deduction for ${sourceToPlatform(pendingFlip.source)}?`
                : ""}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingFlip?.next
                ? `Flipping ${sourceToPlatform(pendingFlip.source)} ON without backfilling history will cause drift on all past ${sourceToPlatform(pendingFlip.source)} sales. Run the backfill in Phase 74.5.2, or type FLIP below to override.`
                : `New ${pendingFlip ? sourceToPlatform(pendingFlip.source) : ""} sales will stop deducting inventory. Existing transactions remain. Document reason for rollback in the execution log.`}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {requiresFlipText && (
            <div className="space-y-2">
              <Label htmlFor="flip-confirm" className="text-sm">
                Type <span className="font-mono font-semibold">FLIP</span> to
                confirm
              </Label>
              <Input
                id="flip-confirm"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="FLIP"
                autoComplete="off"
                autoFocus
              />
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={flipping}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={doFlip}
              disabled={!confirmEnabled || flipping}
              className={
                pendingFlip && !pendingFlip.next
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : undefined
              }
            >
              {flipping ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {pendingFlip
                ? pendingFlip.next
                  ? `Turn on ${sourceToPlatform(pendingFlip.source)} deduction`
                  : `Turn off ${sourceToPlatform(pendingFlip.source)} deduction`
                : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default ProductInventorySettings;
