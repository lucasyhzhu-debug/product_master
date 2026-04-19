/**
 * Phase 80.2 — Unlinked Products Backfill (admin-only one-time data repair).
 *
 * Route: /admin/unlinked-products-backfill
 * Role:  admin (enforced in <ProtectedRoute> + backend requireRole)
 *
 * Three operations:
 *   1. K3Mart Cascade — re-apply every active SKU mapping (one-shot)
 *   2. Direct Backfill — backfill externalRevenueItems for Direct orphan parents (paginated)
 *   3. Preflight Stats — reactive counts of what's pending
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
  useDirectBackfillStats,
  useK3MartBackfillStats,
  type BackfillPageResult,
  type CascadeK3MartResult,
} from "@/hooks/convex";

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
      {/* Card 4 — Execution Log                                        */}
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
