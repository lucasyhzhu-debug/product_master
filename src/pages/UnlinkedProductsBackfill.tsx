/**
 * Phase 80.2 — Unlinked Products Backfill (admin-only one-time data repair).
 *
 * Route: /admin/unlinked-products-backfill
 * Role:  admin (enforced in <ProtectedRoute> + backend requireRole)
 *
 * Operations:
 *   1. K3Mart Cascade — re-apply every active SKU mapping (one-shot)
 *   2. Direct Backfill — backfill externalRevenueItems for Direct orphan parents (paginated)
 *   3. Preflight Stats — reactive counts of what's pending
 *   4. Channel Deduction Backfill (Phase 74.5.2) — 6 per-source cards that
 *      backfill legacy externalRevenueItems into the unified Layer-4 ledger
 *      (D-15/D-16/D-17/D-18/D-19). Audit gate is informational, not disabling.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Database, Loader2, Play, RotateCw } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import {
  useBackfillInternalRevenueItems,
  useCascadeAllK3MartMappings,
  useChannelBackfillPreflight,
  useDirectBackfillStats,
  useK3MartBackfillStats,
  useRunChannelBackfill,
  type BackfillPageResult,
  type CascadeK3MartResult,
} from "@/hooks/convex";
import type { ExternalSource } from "../../convex/lib/externalSource";

// ============================================================================
// Types (local UI state)
// ============================================================================

interface DirectLoopState {
  running: boolean;
  iterations: number;
  cursor: string | null;
  isDone: boolean;
  // Cumulative counters across all iterations
  parentsScanned: number;
  parentsBackfilled: number;
  itemsInserted: number;
  skippedHasChildren: number;
  skippedMissingOrder: number;
  skippedEmptyOrderItems: number;
}

interface LogEntry {
  timestamp: string;
  operation: string;
  message: string;
  isError: boolean;
}

const INITIAL_LOOP_STATE: DirectLoopState = {
  running: false,
  iterations: 0,
  cursor: null,
  isDone: false,
  parentsScanned: 0,
  parentsBackfilled: 0,
  itemsInserted: 0,
  skippedHasChildren: 0,
  skippedMissingOrder: 0,
  skippedEmptyOrderItems: 0,
};

const BATCH_LIMIT = 200;

// ============================================================================
// Phase 74.5.2 — Channel Deduction Backfill (6 per-source cards)
// ============================================================================

// Phase 74.5.2 Plan 06: 6 per-source cards per D-16 (display-name labels; actual source
// values use ExternalSource literals — notably GoFood surface uses source="gobiz"
// per Pitfall 1).
// ORDERING: matches runbook cutover order (shopee → tiktok → bigseller → k3mart →
// gofood → grabfood), NOT alphabetical — UI workflow ergonomics aligned with Plan 09
// runbook execution order.
const CHANNEL_SOURCES: ReadonlyArray<{
  value: ExternalSource;
  label: string;
  description?: string;
}> = [
  { value: "shopee", label: "Shopee" },
  { value: "tiktok", label: "TikTok" },
  { value: "bigseller", label: "BigSeller" },
  { value: "k3mart", label: "K3Mart" },
  { value: "gobiz", label: "GoFood", description: "Atomic flip — see runbook" },
  {
    value: "grabfood",
    label: "GrabFood",
    description: "Permanent-OFF until OAuth scope granted",
  },
] as const;

// Safety cap for the client-loop (same as the server MAX_ITERATIONS).
const CHANNEL_MAX_ITERATIONS = 500;

interface ChannelBackfillLoopState {
  running: boolean;
  isDone: boolean;
  iterations: number;
  totalDeducted: number;
  totalSkipped: number;
  totalUnroutable: number;
  error?: string;
}

const CHANNEL_INITIAL_STATE: ChannelBackfillLoopState = {
  running: false,
  isDone: false,
  iterations: 0,
  totalDeducted: 0,
  totalSkipped: 0,
  totalUnroutable: 0,
};

/**
 * Per-source backfill card — preflight stats + run button + progress display.
 *
 * D-17 / Pitfall 4: Blocking audit issues are displayed as a YELLOW WARNING
 * (⚠) but do NOT disable the button. Admin retains the choice to proceed.
 *
 * D74.5.2-L15: GrabFood renders as a normal card. When admin clicks Backfill
 * and `pending === 0` (no ingested data), the button is disabled via `isEmpty`
 * and the card displays an "Awaiting OAuth scope" state.
 */
function ChannelBackfillCard({
  source,
  appendLog,
}: {
  source: { value: ExternalSource; label: string; description?: string };
  appendLog: (operation: string, message: string, isError?: boolean) => void;
}) {
  const { user } = useAuth();
  const token = user?.token;
  const preflight = useChannelBackfillPreflight(source.value);
  const runPage = useRunChannelBackfill();
  const [state, setState] = useState<ChannelBackfillLoopState>(CHANNEL_INITIAL_STATE);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const pending = preflight.data?.pendingItems ?? 0;
  const blocking = preflight.data?.blockingAuditIssues ?? 0;
  const isEmpty = !preflight.isLoading && pending === 0;
  // Backend caps at 5000 (see CHANNEL_BACKFILL_PREFLIGHT_CAP); anything at or above
  // the cap means "5000+" — display with a trailing + so the user knows it's truncated.
  const PREFLIGHT_CAP = 5000;
  const pendingDisplay =
    pending >= PREFLIGHT_CAP ? `${PREFLIGHT_CAP}+` : String(pending);
  // GrabFood permanent-OFF: distinct branch from generic isEmpty so the UI can
  // communicate "awaiting OAuth scope" instead of silently showing "No pending items".
  const isGrabFoodAwaitingScope =
    source.value === "grabfood" && isEmpty;

  const handleRun = async () => {
    if (!token) {
      toast.error("Not authenticated");
      return;
    }
    setState({ ...CHANNEL_INITIAL_STATE, running: true });
    appendLog(`${source.label} Backfill`, "Started");

    let iterations = 0;
    let totalDeducted = 0;
    let totalSkipped = 0;
    let totalUnroutable = 0;
    let cursor: string | null = null;

    try {
      while (iterations < CHANNEL_MAX_ITERATIONS) {
        if (!mountedRef.current) return;
        iterations++;
        const page = await runPage({ source: source.value, token, cursor });
        if (!mountedRef.current) return;
        totalDeducted += page.deducted;
        totalSkipped += page.skipped;
        totalUnroutable += page.unroutable;
        cursor = page.continueCursor;
        setState({
          running: true,
          isDone: false,
          iterations,
          totalDeducted,
          totalSkipped,
          totalUnroutable,
        });
        // Terminate when the cursor has walked the whole source (isDone) — NOT
        // on itemsProcessed===0, which un-routable/unmapped rows never reach.
        if (page.isDone) break;
      }

      if (!mountedRef.current) return;

      setState((s) => ({ ...s, running: false, isDone: true }));
      const unroutableSuffix =
        totalUnroutable > 0 ? `, ${totalUnroutable} unroutable (need a routing rule)` : "";
      toast.success(
        `${source.label} backfill complete: ${totalDeducted} deducted, ${totalSkipped} skipped${unroutableSuffix}`,
      );
      appendLog(
        `${source.label} Backfill`,
        `Complete (${iterations} iteration(s), ${totalDeducted} deducted, ${totalSkipped} skipped${unroutableSuffix})`,
      );
    } catch (error) {
      if (!mountedRef.current) return;
      const message = error instanceof Error ? error.message : String(error);
      setState((s) => ({ ...s, running: false, error: message }));
      toast.error(`${source.label} backfill failed: ${message}`);
      appendLog(`${source.label} Backfill`, message, true);
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex items-center justify-between">
        <h4 className="font-medium">{source.label}</h4>
        {isEmpty && !isGrabFoodAwaitingScope && (
          <span className="text-xs text-muted-foreground">No pending items</span>
        )}
      </div>

      {source.description && (
        <p className="text-xs text-muted-foreground">{source.description}</p>
      )}

      {isGrabFoodAwaitingScope ? (
        <div className="text-sm italic text-muted-foreground">
          Awaiting OAuth scope — no items to backfill yet
        </div>
      ) : (
        <div className="text-sm">
          <div>
            Pending items:{" "}
            <span className="font-semibold tabular-nums">
              {preflight.isLoading ? "…" : pendingDisplay}
            </span>
          </div>
          {blocking > 0 && (
            <div className="text-yellow-700 dark:text-yellow-400">
              ⚠ {blocking} blocking audit issue{blocking === 1 ? "" : "s"} — resolve in{" "}
              <a href="/admin/channel-audit" className="underline">
                /admin/channel-audit
              </a>
            </div>
          )}
        </div>
      )}

      <Button
        size="sm"
        variant="outline"
        onClick={handleRun}
        disabled={state.running || !token || isEmpty || isGrabFoodAwaitingScope}
      >
        {state.running ? (
          <>
            <Loader2 className="mr-1 h-3 w-3 animate-spin" /> Running…
          </>
        ) : state.isDone ? (
          "Completed ✓ (Re-run)"
        ) : (
          `Backfill ${source.label}`
        )}
      </Button>

      {(state.running || state.iterations > 0) && (
        <div className="rounded bg-muted/30 p-2 text-xs">
          <div>Iteration {state.iterations}</div>
          <div className="grid grid-cols-2 gap-1">
            <span>
              Deducted:{" "}
              <span className="font-semibold tabular-nums">{state.totalDeducted}</span>
            </span>
            <span>
              Skipped:{" "}
              <span className="font-semibold tabular-nums">{state.totalSkipped}</span>
            </span>
            {state.totalUnroutable > 0 && (
              <span className="col-span-2 text-amber-600 dark:text-amber-500">
                Unroutable (need a routing rule):{" "}
                <span className="font-semibold tabular-nums">{state.totalUnroutable}</span>
              </span>
            )}
          </div>
        </div>
      )}

      {state.error && (
        <div className="text-xs text-red-600 dark:text-red-400">
          Error: {state.error}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Small presentational helpers
// ============================================================================

function StatRow({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex items-baseline justify-between border-b border-border/50 py-1.5 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold tabular-nums">{value}</span>
    </div>
  );
}

function WarningBanner({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-900 dark:border-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-100">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

// ============================================================================
// Page
// ============================================================================

export function UnlinkedProductsBackfill() {
  const { user } = useAuth();
  const token = user?.token ?? "";

  // Split queries run in parallel — each has its own per-query read budget.
  const k3martStats = useK3MartBackfillStats();
  const directStats = useDirectBackfillStats();
  const cascadeK3Mart = useCascadeAllK3MartMappings();
  const backfillDirect = useBackfillInternalRevenueItems();

  // ─── Mount tracking for cursor-loop safety (N1) ───
  // If the admin navigates away mid-backfill, we stop setState-ing and drop
  // remaining iterations. The backend side-effects already-started remain
  // committed (each iteration is its own mutation).
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // ─── K3Mart cascade state ───
  const [cascadeRunning, setCascadeRunning] = useState(false);
  const [cascadeCooldown, setCascadeCooldown] = useState(false);
  const [cascadeResult, setCascadeResult] =
    useState<CascadeK3MartResult | null>(null);

  // ─── Direct backfill loop state ───
  const [directLoop, setDirectLoop] = useState<DirectLoopState>(INITIAL_LOOP_STATE);

  // ─── Execution log ───
  const [log, setLog] = useState<LogEntry[]>([]);

  const appendLog = useCallback(
    (operation: string, message: string, isError = false) => {
      setLog((prev) => [
        {
          timestamp: new Date().toISOString(),
          operation,
          message,
          isError,
        },
        ...prev,
      ]);
    },
    []
  );

  // ─── Handlers ───

  const handleCascade = useCallback(async () => {
    if (!token) {
      toast.error("Not authenticated");
      return;
    }
    setCascadeRunning(true);
    setCascadeResult(null);
    try {
      const result = await cascadeK3Mart({ token });
      if (!mountedRef.current) return;
      setCascadeResult(result);
      toast.success(
        `Cascade complete: ${result.mappingsProcessed} mappings, ${result.externalRevenueUpdatedTotal} parents patched`
      );
      appendLog(
        "K3Mart Cascade",
        `${result.mappingsProcessed} mappings processed, ${result.externalRevenueUpdatedTotal} parents patched in ${result.durationMs}ms`
      );
    } catch (error) {
      if (!mountedRef.current) return;
      const message =
        error instanceof Error ? error.message : "Cascade failed";
      toast.error(message);
      appendLog("K3Mart Cascade", message, true);
    } finally {
      if (mountedRef.current) {
        setCascadeRunning(false);
        // 5s cooldown prevents rapid re-clicks; the cascade is idempotent
        // but re-runs still pay the full read cost.
        setCascadeCooldown(true);
        setTimeout(() => {
          if (mountedRef.current) setCascadeCooldown(false);
        }, 5000);
      }
    }
  }, [token, cascadeK3Mart, appendLog]);

  const handleDirectBackfill = useCallback(async () => {
    if (!token) {
      toast.error("Not authenticated");
      return;
    }
    // Reset and start loop
    setDirectLoop({ ...INITIAL_LOOP_STATE, running: true });
    appendLog("Direct Backfill", `Started (batch size ${BATCH_LIMIT})`);

    let cursor: string | null = null;
    let iterations = 0;
    const cumulative = {
      parentsScanned: 0,
      parentsBackfilled: 0,
      itemsInserted: 0,
      skippedHasChildren: 0,
      skippedMissingOrder: 0,
      skippedEmptyOrderItems: 0,
    };

    // Hard guard against runaway loops
    const MAX_ITERATIONS = 500;
    let loopDone = false;
    try {
      while (iterations < MAX_ITERATIONS) {
        // N1: bail out if component unmounted (user navigated away). Backend
        // side effects from completed iterations remain committed; remaining
        // iterations are dropped and the user can resume by clicking again.
        if (!mountedRef.current) return;

        iterations += 1;
        const page: BackfillPageResult = await backfillDirect({
          token,
          cursor,
          limit: BATCH_LIMIT,
        });

        if (!mountedRef.current) return;

        cumulative.parentsScanned += page.parentsScanned;
        cumulative.parentsBackfilled += page.parentsBackfilled;
        cumulative.itemsInserted += page.itemsInserted;
        cumulative.skippedHasChildren += page.skippedHasChildren;
        cumulative.skippedMissingOrder += page.skippedMissingOrder;
        cumulative.skippedEmptyOrderItems += page.skippedEmptyOrderItems;

        const nextCursor = page.continueCursor;
        const done = page.isDone;

        setDirectLoop({
          running: !done,
          iterations,
          cursor: nextCursor,
          isDone: done,
          ...cumulative,
        });

        if (done) {
          loopDone = true;
          break;
        }
        cursor = nextCursor;
      }

      if (!mountedRef.current) return;

      if (!loopDone) {
        const msg = `Stopped after ${iterations} iterations (safety cap). Run again to continue.`;
        toast.error(msg);
        appendLog("Direct Backfill", msg, true);
        setDirectLoop((prev) => ({ ...prev, running: false }));
        return;
      }

      toast.success(
        `Backfill complete: ${cumulative.parentsBackfilled}/${cumulative.parentsScanned} parents backfilled, ${cumulative.itemsInserted} items inserted`
      );
      appendLog(
        "Direct Backfill",
        `Completed in ${iterations} iteration(s) — scanned ${cumulative.parentsScanned}, backfilled ${cumulative.parentsBackfilled}, inserted ${cumulative.itemsInserted}, skipped (hasChildren=${cumulative.skippedHasChildren}, missingOrder=${cumulative.skippedMissingOrder}, emptyItems=${cumulative.skippedEmptyOrderItems})`
      );
    } catch (error) {
      if (!mountedRef.current) return;
      const message =
        error instanceof Error ? error.message : "Backfill failed";
      toast.error(message);
      appendLog(
        "Direct Backfill",
        `${message} (after ${iterations} iteration(s) — partial progress preserved: scanned ${cumulative.parentsScanned}, backfilled ${cumulative.parentsBackfilled})`,
        true
      );
      setDirectLoop((prev) => ({
        ...prev,
        running: false,
      }));
    }
  }, [token, backfillDirect, appendLog]);

  // ─── Derived display values ───
  const k3mart = k3martStats;
  const direct = directStats;
  const k3martLoading = k3martStats === undefined;
  const directLoading = directStats === undefined;

  const orphanParents = direct?.orphanParents ?? 0;
  const directRemaining = Math.max(0, orphanParents - directLoop.parentsScanned);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Unlinked Products Backfill"
        description="Phase 80.2 — one-time data repair for K3Mart cascade + Direct orphans"
      />

      {/* ============================================================ */}
      {/* Card 1 — Preflight Stats                                      */}
      {/* ============================================================ */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-4 w-4" />
                Preflight Stats
              </CardTitle>
              <CardDescription>
                Reactive — auto-updates after each operation runs.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Per-section warnings (each query has its own scanCapReached flag) */}
          {k3mart?.scanCapReached && (
            <WarningBanner>
              K3Mart scan limit reached — counts may be incomplete.
            </WarningBanner>
          )}
          {direct?.scanCapReached && (
            <WarningBanner>
              Direct scan limit reached — counts may be incomplete.
            </WarningBanner>
          )}
          {k3mart && k3mart.nullProductCodeParents > 0 && (
            <WarningBanner>
              {k3mart.nullProductCodeParents} K3Mart parent(s) have no
              productCode — these cannot be cascaded and must be fixed
              manually.
            </WarningBanner>
          )}

          <div className="grid gap-6 md:grid-cols-2">
            {/* K3Mart sub-section */}
            <div>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                K3Mart
              </h3>
              {k3martLoading ? (
                <Skeleton className="h-40 w-full" />
              ) : (
                <div className="rounded-md border p-3">
                  <StatRow
                    label="Total parents"
                    value={k3mart?.totalParents ?? 0}
                  />
                  <StatRow
                    label="Linked parents"
                    value={k3mart?.linkedParents ?? 0}
                  />
                  <StatRow
                    label="Unlinked parents"
                    value={k3mart?.unlinkedParents ?? 0}
                  />
                  <StatRow
                    label="Null productCode"
                    value={k3mart?.nullProductCodeParents ?? 0}
                  />
                  <StatRow
                    label="Total mappings"
                    value={k3mart?.totalMappings ?? 0}
                  />
                  <StatRow
                    label="Active mappings"
                    value={k3mart?.activeMappings ?? 0}
                  />
                </div>
              )}
            </div>

            {/* Direct sub-section */}
            <div>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Direct (internal)
              </h3>
              {directLoading ? (
                <Skeleton className="h-40 w-full" />
              ) : (
                <div className="rounded-md border p-3">
                  <StatRow
                    label="Total parents"
                    value={direct?.totalParents ?? 0}
                  />
                  <StatRow
                    label="Parents with children"
                    value={direct?.parentsWithChildren ?? 0}
                  />
                  <StatRow
                    label="Orphan parents"
                    value={direct?.orphanParents ?? 0}
                  />
                  <StatRow
                    label="Total children"
                    value={direct?.totalChildren ?? 0}
                  />
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ============================================================ */}
      {/* Card 2 — K3Mart Cascade                                       */}
      {/* ============================================================ */}
      <Card>
        <CardHeader>
          <CardTitle>K3Mart Cascade</CardTitle>
          <CardDescription>
            Re-runs retroactive mapping cascade for every active K3Mart SKU
            mapping. Idempotent — rows already linked to the correct product
            are skipped.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Expected impact:{" "}
            <span className="font-semibold text-foreground">
              {k3mart?.activeMappings ?? "–"}
            </span>{" "}
            mapping(s) processed, up to{" "}
            <span className="font-semibold text-foreground">
              {k3mart?.unlinkedParents ?? "–"}
            </span>{" "}
            parent(s) patched.
          </p>

          <Button
            onClick={handleCascade}
            disabled={cascadeRunning || cascadeCooldown || k3martLoading || !token}
          >
            {cascadeRunning ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Running cascade…
              </>
            ) : cascadeCooldown ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Cooling down…
              </>
            ) : (
              <>
                <Play className="h-4 w-4" />
                Run K3Mart Cascade
              </>
            )}
          </Button>

          {cascadeResult && (
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <div className="font-medium">Last run</div>
              <div className="mt-1 text-muted-foreground">
                {cascadeResult.mappingsProcessed} mappings →{" "}
                <span className="font-semibold text-foreground">
                  {cascadeResult.externalRevenueUpdatedTotal}
                </span>{" "}
                parents patched in{" "}
                <span className="tabular-nums">{cascadeResult.durationMs}ms</span>
                {" · "}
                active {cascadeResult.activeMappings}/
                {cascadeResult.totalMappings}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ============================================================ */}
      {/* Card 3 — Direct Backfill                                      */}
      {/* ============================================================ */}
      <Card>
        <CardHeader>
          <CardTitle>Direct Backfill</CardTitle>
          <CardDescription>
            Backfills <code>externalRevenueItems</code> for Direct (internal)
            orders that lost their child rows. Idempotent. Paginated — runs in
            batches of {BATCH_LIMIT}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Expected impact:{" "}
            <span className="font-semibold text-foreground">
              {direct?.orphanParents ?? "–"}
            </span>{" "}
            orphan parent(s) to process.
          </p>

          <Button
            onClick={handleDirectBackfill}
            disabled={directLoop.running || directLoading || !token}
          >
            {directLoop.running ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Running backfill…
              </>
            ) : (
              <>
                <Play className="h-4 w-4" />
                Run Direct Backfill
              </>
            )}
          </Button>

          {(directLoop.running ||
            directLoop.iterations > 0 ||
            directLoop.isDone) && (
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <div className="font-medium">
                {directLoop.isDone
                  ? "Backfill complete"
                  : directLoop.running
                  ? `Iteration ${directLoop.iterations}`
                  : "Last run (stopped)"}
              </div>
              <div className="mt-1 grid gap-x-4 gap-y-1 sm:grid-cols-2">
                <div className="text-muted-foreground">
                  Parents scanned:{" "}
                  <span className="font-semibold text-foreground tabular-nums">
                    {directLoop.parentsScanned}
                  </span>
                </div>
                <div className="text-muted-foreground">
                  Parents backfilled:{" "}
                  <span className="font-semibold text-foreground tabular-nums">
                    {directLoop.parentsBackfilled}
                  </span>
                </div>
                <div className="text-muted-foreground">
                  Items inserted:{" "}
                  <span className="font-semibold text-foreground tabular-nums">
                    {directLoop.itemsInserted}
                  </span>
                </div>
                <div className="text-muted-foreground">
                  Approx. remaining:{" "}
                  <span className="font-semibold text-foreground tabular-nums">
                    {directLoop.isDone ? 0 : directRemaining}
                  </span>
                </div>
                <div className="text-muted-foreground">
                  Skipped (hasChildren):{" "}
                  <span className="tabular-nums">
                    {directLoop.skippedHasChildren}
                  </span>
                </div>
                <div className="text-muted-foreground">
                  Skipped (missingOrder):{" "}
                  <span className="tabular-nums">
                    {directLoop.skippedMissingOrder}
                  </span>
                </div>
                <div className="text-muted-foreground">
                  Skipped (emptyItems):{" "}
                  <span className="tabular-nums">
                    {directLoop.skippedEmptyOrderItems}
                  </span>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ============================================================ */}
      {/* Card 4 — Channel Deduction Backfill (Phase 74.5.2)            */}
      {/* ============================================================ */}
      <Card>
        <CardHeader>
          <CardTitle>Channel Deduction Backfill</CardTitle>
          <CardDescription>
            Backfill historical <code>externalRevenueItems</code> with unified
            channel deductions. Run BEFORE flipping a channel's{" "}
            <code>channelDeductionEnabled</code> flag (per runbook{" "}
            <code>docs/CHANNEL_INTEGRATION.md</code>). Idempotent — re-running
            after completion is a no-op. Blocking audit issues are informational
            only; the button stays clickable.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {CHANNEL_SOURCES.map((source) => (
              <ChannelBackfillCard
                key={source.value}
                source={source}
                appendLog={appendLog}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ============================================================ */}
      {/* Card 5 — Execution Log                                        */}
      {/* ============================================================ */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <RotateCw className="h-4 w-4" />
                Execution Log
              </CardTitle>
              <CardDescription>
                In-memory only — resets on page refresh.
              </CardDescription>
            </div>
            {log.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLog([])}
                disabled={cascadeRunning || directLoop.running}
              >
                Clear
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {log.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No operations run yet.
            </p>
          ) : (
            <ul className="space-y-2 font-mono text-xs">
              {log.map((entry, idx) => (
                <li
                  key={`${entry.timestamp}-${idx}`}
                  className={
                    entry.isError
                      ? "rounded border border-destructive/30 bg-destructive/5 p-2 text-destructive"
                      : "rounded border border-border bg-muted/30 p-2"
                  }
                >
                  <span className="text-muted-foreground">{entry.timestamp}</span>
                  {" · "}
                  <span className="font-semibold">{entry.operation}</span>
                  {" · "}
                  <span>{entry.message}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default UnlinkedProductsBackfill;
