import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { actionToast } from "@/lib/actionToast";
import { formatCurrency } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import {
  useBigSellerSyncState,
  useBigSellerOrderStats,
  useStartBigSellerSync,
  useBackfillBigsellerItems,
  useRescanEmptyRows,
} from "@/hooks/convex";

interface BigSellerSyncPanelProps {
  tokenExpired?: boolean;
  /** Raw token expiry (ms) for the sub-day freshness banner (Phase 83-03 D-04). */
  tokenExpiresAt?: number | null;
  onOpenTokenDialog?: () => void;
}

// Steps for the progress display
const SYNC_STEPS = [
  { key: "triggering", label: "Triggering sync..." },
  { key: "polling", label: "Syncing data" },
  { key: "fetching", label: "Fetching orders..." },
  { key: "storing", label: "Storing data..." },
  { key: "complete", label: "Complete" },
] as const;

type SyncStage =
  | "idle"
  | "triggering"
  | "polling"
  | "fetching"
  | "storing"
  | "complete"
  | "failed"
  | "retrying";

function getStepIndex(stage: SyncStage): number {
  switch (stage) {
    case "triggering":
      return 0;
    case "polling":
    case "retrying":
      return 1;
    case "fetching":
      return 2;
    case "storing":
      return 3;
    case "complete":
      return 4;
    case "failed":
      return -1; // special handling
    default:
      return -1;
  }
}

export function BigSellerSyncPanel({
  tokenExpired = false,
  tokenExpiresAt = null,
  onOpenTokenDialog,
}: BigSellerSyncPanelProps) {
  const { user } = useAuth();

  // Phase 83-03 D-04: freshness banner. hoursRemaining is the single production
  // freshness source (staffreview R3) — derived from the precomputed
  // tokenExpiresAt prop, not from re-decoding a raw token here.
  const hoursRemaining =
    tokenExpiresAt != null ? (tokenExpiresAt - Date.now()) / 3600000 : null;
  const tokenExpiredByClock = hoursRemaining != null && hoursRemaining <= 0;
  const showExpiryWarning =
    hoursRemaining != null && hoursRemaining > 0 && hoursRemaining < 24;
  // Either the server-derived expired flag OR the clock-derived one blocks sync.
  const syncBlocked = tokenExpired || tokenExpiredByClock;
  const { data: syncState } = useBigSellerSyncState();
  const { data: orderStats } = useBigSellerOrderStats();
  const startSync = useStartBigSellerSync();
  const backfill = useBackfillBigsellerItems();
  const rescan = useRescanEmptyRows();
  const [isBackfilling, setIsBackfilling] = useState(false);
  const [isRescanning, setIsRescanning] = useState(false);

  // Date range for manual sync
  const today = new Date().toISOString().slice(0, 10);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const [startDate, setStartDate] = useState(thirtyDaysAgo);
  const [endDate, setEndDate] = useState(today);
  const [isSyncing, setIsSyncing] = useState(false);

  // Track if the user initiated the sync in this session
  const userTriggeredRef = useRef(false);
  const clickEventRef = useRef<React.MouseEvent | null>(null);
  const prevStageRef = useRef<SyncStage | undefined>(undefined);

  const stage = (syncState?.stage as SyncStage) ?? "idle";
  // Safe access for fields that only exist on the DB document (not the default idle state)
  const errorMessage = syncState && "errorMessage" in syncState ? (syncState as any).errorMessage as string | undefined : undefined;
  const summary = syncState && "summary" in syncState ? (syncState as any).summary as { totalOrders: number; newOrders: number; updatedOrders: number; totalRevenue: number; unmappedSkus: number } | undefined : undefined;

  const isActive =
    stage === "triggering" ||
    stage === "polling" ||
    stage === "fetching" ||
    stage === "storing" ||
    stage === "retrying";

  // Toast on completion/failure transitions
  useEffect(() => {
    const prevStage = prevStageRef.current;
    prevStageRef.current = stage;

    if (!prevStage) return; // skip initial render

    if (stage === "complete" && prevStage !== "complete") {
      if (userTriggeredRef.current) {
        actionToast("Sync complete!", clickEventRef.current ?? undefined);
        userTriggeredRef.current = false;
        clickEventRef.current = null;
      } else {
        toast.info("BigSeller sync completed");
      }
      setIsSyncing(false);
    } else if (stage === "failed" && prevStage !== "failed") {
      toast.error("BigSeller sync failed: " + (errorMessage || "Unknown error"));
      userTriggeredRef.current = false;
      clickEventRef.current = null;
      setIsSyncing(false);
    }
  }, [stage, errorMessage]);

  const handleSync = async (e: React.MouseEvent) => {
    if (!user?.token) return;

    // Validate date range
    const diffMs =
      new Date(endDate).getTime() - new Date(startDate).getTime();
    const diffDays = diffMs / (24 * 60 * 60 * 1000);
    if (diffDays > 31) {
      toast.error("Date range cannot exceed 31 days");
      return;
    }
    if (diffDays < 0) {
      toast.error("Start date must be before end date");
      return;
    }

    userTriggeredRef.current = true;
    clickEventRef.current = e;
    setIsSyncing(true);

    try {
      const result = await startSync({
        token: user.token,
        startDate,
        endDate,
      });
      if (!result.success) {
        toast.error(result.error || "Failed to start sync");
        setIsSyncing(false);
        userTriggeredRef.current = false;
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to start sync"
      );
      setIsSyncing(false);
      userTriggeredRef.current = false;
    }
  };

  const currentStepIndex = getStepIndex(stage);

  // ── Phase 79 Plan 07: Backfill historical items ────────────────────────────
  const onBackfill = async () => {
    if (!user?.token) {
      toast.error("Not authenticated");
      return;
    }
    setIsBackfilling(true);
    const toastId = toast.loading("Backfilling historical Shopee/TikTok items...");
    try {
      let totalCreated = 0;
      let totalSkipped = 0;
      let totalOrders = 0;
      let hasMore = true;
      let safetyIterations = 0;
      while (hasMore && safetyIterations < 50) {
        safetyIterations++;
        const r = await backfill({ token: user.token, limit: 500 });
        totalCreated += r.created;
        totalSkipped += r.skipped;
        totalOrders += r.processedOrders;
        hasMore = r.hasMore;
      }
      toast.success(
        `Created ${totalCreated} items from ${totalOrders} orders (${totalSkipped} skipped as duplicates)`,
        { id: toastId },
      );
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Backfill failed",
        { id: toastId },
      );
    } finally {
      setIsBackfilling(false);
    }
  };

  // ── Phase 79 Plan 07: Re-check empty rows via fresh sync ───────────────────
  const onRescan = async () => {
    if (!user?.token) {
      toast.error("Not authenticated");
      return;
    }
    setIsRescanning(true);
    const toastId = toast.loading("Re-checking empty rows...");
    try {
      const r = await rescan({ token: user.token });
      if (!r.success) {
        toast.error(
          "error" in r && r.error ? r.error : "Re-check failed",
          { id: toastId },
        );
        return;
      }
      if (r.triggered) {
        toast.success(
          `Re-sync triggered for ${r.emptyOrderCount} empty row${r.emptyOrderCount === 1 ? "" : "s"} (${r.startDate} → ${r.endDate}). Click "Backfill historical items" after sync completes.`,
          { id: toastId },
        );
      } else {
        toast.success("No empty rows found — nothing to re-check.", { id: toastId });
      }
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Re-check failed",
        { id: toastId },
      );
    } finally {
      setIsRescanning(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Sync Controls Row */}
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex items-center gap-2">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">
              Start Date
            </label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-8 text-xs w-[130px]"
              disabled={isActive || isSyncing}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">
              End Date
            </label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="h-8 text-xs w-[130px]"
              disabled={isActive || isSyncing}
            />
          </div>
        </div>
        <Button
          size="sm"
          onClick={handleSync}
          disabled={isActive || isSyncing || syncBlocked || !user?.token}
          className="h-8 text-xs gap-1.5"
        >
          {isActive || isSyncing ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              Syncing...
            </>
          ) : (
            <>
              <RefreshCw className="h-3 w-3" />
              Sync Now
            </>
          )}
        </Button>
      </div>

      {/* Phase 79 Plan 07: Item-level data admin actions */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={onBackfill}
          disabled={isBackfilling || !user?.token}
          className="h-8 text-xs gap-1.5"
        >
          {isBackfilling ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
          Backfill historical items
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onRescan}
          disabled={isRescanning || isActive || !user?.token}
          className="h-8 text-xs gap-1.5"
        >
          {isRescanning ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <CheckCircle2 className="h-3 w-3" />
          )}
          Re-check empty rows
        </Button>
        <span className="text-[11px] text-muted-foreground">
          Materialise per-SKU item rows for past orders / re-sync rows with
          missing SKU data.
        </span>
      </div>

      {/* Token expired warning (server-derived health flag) */}
      {tokenExpired && (
        <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md px-3 py-2">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>Token expired -- paste new token to continue syncing.</span>
          {onOpenTokenDialog && (
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-xs ml-auto"
              onClick={onOpenTokenDialog}
            >
              Paste Token
            </Button>
          )}
        </div>
      )}

      {/* Phase 83-03 D-04: red blocking banner when the token has expired by the
          clock. After auto-refresh lands this rarely fires; when it does the
          cron has been failing ~19 days (actionable signal). */}
      {tokenExpiredByClock && !tokenExpired && (
        <div className="flex items-center gap-2 text-xs text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-md px-3 py-2">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>Token expired -- paste a fresh token to resume syncing.</span>
          {onOpenTokenDialog && (
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-xs ml-auto"
              onClick={onOpenTokenDialog}
            >
              Paste Token
            </Button>
          )}
        </div>
      )}

      {/* Phase 83-03 D-04: yellow warning when the token expires in under 24h. */}
      {showExpiryWarning && (
        <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md px-3 py-2">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>
            Token expires in {Math.ceil(hoursRemaining as number)}h -- paste
            fresh token
          </span>
          {onOpenTokenDialog && (
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-xs ml-auto"
              onClick={onOpenTokenDialog}
            >
              Paste Token
            </Button>
          )}
        </div>
      )}

      {/* Progress Card */}
      {stage !== "idle" && (
        <div className="border rounded-lg p-3 bg-card space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            Sync Progress
            {syncState?.attempt && syncState.attempt > 1
              ? ` (Attempt ${syncState.attempt})`
              : ""}
          </p>
          <div className="space-y-1.5">
            {SYNC_STEPS.map((step, idx) => {
              const isCompleted =
                stage === "complete"
                  ? true
                  : stage === "failed"
                    ? idx < (currentStepIndex === -1 ? 0 : currentStepIndex)
                    : idx < currentStepIndex;
              const isActive =
                stage !== "complete" &&
                stage !== "failed" &&
                idx === currentStepIndex;
              const isFailed =
                stage === "failed" && step.key === "complete";

              // Build label
              let displayLabel: string = step.label;
              if (
                step.key === "polling" &&
                (stage === "polling" || stage === "retrying")
              ) {
                const attempt = syncState?.pollAttempt ?? 0;
                const max = syncState?.maxPolls ?? 8;
                displayLabel =
                  stage === "retrying"
                    ? `Retrying (attempt ${syncState?.attempt ?? 2}/2)...`
                    : `Syncing data (attempt ${attempt}/${max})...`;
              }

              if (isFailed) {
                return (
                  <div
                    key={step.key}
                    className="flex items-center gap-2 text-xs"
                  >
                    <XCircle className="h-3.5 w-3.5 text-[var(--color-status-error,#ef4444)] shrink-0" />
                    <span className="text-[var(--color-status-error,#ef4444)]">
                      Failed
                    </span>
                  </div>
                );
              }

              if (!isCompleted && !isActive) {
                // Not reached yet
                if (
                  idx >
                  (currentStepIndex === -1 ? SYNC_STEPS.length : currentStepIndex)
                ) {
                  return (
                    <div
                      key={step.key}
                      className="flex items-center gap-2 text-xs text-muted-foreground/50"
                    >
                      <div className="h-3.5 w-3.5 rounded-full border border-muted-foreground/30 shrink-0" />
                      <span>{step.label}</span>
                    </div>
                  );
                }
              }

              return (
                <div
                  key={step.key}
                  className="flex items-center gap-2 text-xs"
                >
                  {isCompleted ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                  ) : isActive ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500 shrink-0" />
                  ) : (
                    <div className="h-3.5 w-3.5 rounded-full border border-muted-foreground/30 shrink-0" />
                  )}
                  <span
                    className={
                      isCompleted
                        ? "text-muted-foreground"
                        : isActive
                          ? "font-medium"
                          : "text-muted-foreground/50"
                    }
                  >
                    {displayLabel}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Error message and retry button */}
          {stage === "failed" && errorMessage && (
            <div className="mt-2 text-xs text-[var(--color-status-error,#ef4444)] bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded px-2 py-1.5">
              {errorMessage}
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-xs ml-2"
                onClick={handleSync}
                disabled={tokenExpired}
              >
                Retry
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Summary Card */}
      {stage === "complete" && summary && (
        <div className="border rounded-lg p-3 bg-card">
          {summary.totalOrders === 0 ? (
            <p className="text-xs text-muted-foreground">
              No orders found for this date range.
            </p>
          ) : (
            <div className="space-y-1">
              <p className="text-sm">
                Synced{" "}
                <span className="font-semibold">{summary.totalOrders}</span>{" "}
                orders ({summary.newOrders} new, {summary.updatedOrders}{" "}
                updated). Revenue:{" "}
                <span className="font-semibold">
                  {formatCurrency(summary.totalRevenue)}
                </span>
                .
                {summary.unmappedSkus > 0 && (
                  <>
                    {" "}
                    <Badge
                      variant="outline"
                      className="text-[10px] px-1.5 py-0 border-amber-400 text-amber-600 dark:text-amber-400"
                    >
                      {summary.unmappedSkus} unmapped SKU
                      {summary.unmappedSkus !== 1 ? "s" : ""}
                    </Badge>
                  </>
                )}
              </p>
            </div>
          )}
        </div>
      )}

      {/* COGS Caveat Banner */}
      {orderStats?.allCostFeeZero && orderStats.totalOrders > 0 && (
        <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md px-3 py-2">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>
            Profit below = Revenue minus platform fees only; per-item COGS is zero because
            BigSeller has no product cost configured. To see true profit, enter COGS per SKU
            in the BigSeller dashboard, or map each SKU to a Frollie product in the Frollie
            Product column so BOM-based COGS can be computed in Sales Analytics.
          </span>
        </div>
      )}
    </div>
  );
}
