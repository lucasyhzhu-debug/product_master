import { useState, useMemo } from "react";
import { useQuery, useConvex } from "convex/react";
import { toast } from "sonner";
import { Download, Loader2 } from "lucide-react";

import { api } from "../../convex/_generated/api";
import { useAuth } from "@/contexts/AuthContext";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { utcToWibDateStr, wibDateStrToUtcMs } from "@/lib/dateUtils";
import { downloadCSV } from "@/lib/csvExport";
import {
  buildExportFilenames,
  generateRawTransactionsCSV,
  generateMultiPeriodPLCSV,
  presetToRange,
  type Granularity,
  type Preset,
  type RawTransactionRow,
  type MultiPeriodPLData,
} from "@/lib/financialExportHelpers";
import { PreflightPanel } from "@/components/financialExport/PreflightPanel";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Surface a Convex `ConvexError` body verbatim (strips the harness wrapper).
 * Falls back to the generic "Could not generate export…" copy on unknown errors.
 */
function humanizeError(err: unknown): string {
  if (!(err instanceof Error)) {
    return "Could not generate export. Try a smaller date range or refresh and retry.";
  }
  const match = err.message.match(
    /Uncaught ConvexError:\s*([\s\S]*?)(?:\r?\n\s*Called by client|$)/,
  );
  if (match && match[1]) return match[1].trim();
  return err.message;
}

/**
 * Phase 76 plan 04 — Financial Data Export page (FIN-03 + FIN-04).
 *
 * Form sections (per UI-SPEC):
 *   1. Export type checkboxes (Raw transactions / P&L summary)
 *   2. Date range — 5 preset chips + From/To date inputs
 *   3. Granularity radio (visible only when P&L checked)
 *   4. Preflight summary (live, debounced 300ms via useDebouncedValue — Improvement 4)
 *   5. Generate CTA + filename preview helper
 *
 * Generate handler:
 *   - One-shot via `useConvex().query(...)` (NOT `useQuery`) so re-renders don't re-download.
 *   - Both backend queries fire in parallel via `Promise.all` (Refinement R5).
 *   - Multi-file downloads sequence with a 100ms gap (Edge case 9 — avoids browser
 *     "popup blocker" false positives).
 *   - Per-export status tracking emits granular toasts on empty-but-both-checked
 *     (Improvement 7 — no silent partial success).
 *
 * Manager+admin role gate is doubled: `<ProtectedRoute allowedRoles>` at the route
 * + `requireRole(ctx, args.token, ["manager","admin"])` inside each Convex query.
 */
export function FinancialExportPage() {
  useDocumentTitle("Financial Data Export");
  const { user } = useAuth();
  const convex = useConvex();

  // Form state
  const [includeRaw, setIncludeRaw] = useState<boolean>(true);
  const [includePL, setIncludePL] = useState<boolean>(true);

  // Date range — initialized to "Last week" preset (prior ISO week, Mon-Sun)
  const initialRange = useMemo(() => presetToRange("last-week"), []);
  const [periodStart, setPeriodStart] = useState<number>(initialRange[0]);
  const [periodEnd, setPeriodEnd] = useState<number>(initialRange[1]);
  const [activePreset, setActivePreset] = useState<Preset | "custom">("last-week");

  const [granularity, setGranularity] = useState<Granularity>("weekly");
  const [loading, setLoading] = useState<boolean>(false);

  // Validation
  const hasAnyType = includeRaw || includePL;
  const hasValidRange = periodStart < periodEnd;
  const canGenerate = hasAnyType && hasValidRange && !loading;
  const disabledTooltip = !hasAnyType
    ? "Select at least one export type."
    : !hasValidRange
      ? "End date must be on or after start date."
      : "";

  // REAL debounce for preflight (Improvement 4). 300ms is the staffreview-confirmed
  // minimum — see useDebouncedValue.ts header for why a setTimeout-based hook is
  // used here (deferring rendering alone is not equivalent to a true debounce).
  const debouncedStart = useDebouncedValue(periodStart, 300);
  const debouncedEnd = useDebouncedValue(periodEnd, 300);
  const debouncedGran = useDebouncedValue(granularity, 300);

  // Live preflight — useQuery for reactive auto-refresh; "skip" when invalid range or no token.
  const preflight = useQuery(
    api.reports.financialExport.getExportPreflight,
    user?.token && hasValidRange
      ? {
          periodStart: debouncedStart,
          periodEnd: debouncedEnd,
          granularity: debouncedGran,
          token: user.token,
        }
      : "skip",
  );

  function applyPreset(p: Preset | "custom") {
    setActivePreset(p);
    if (p !== "custom") {
      const [s, e] = presetToRange(p);
      setPeriodStart(s);
      setPeriodEnd(e);
    }
  }

  async function handleGenerate() {
    if (!user?.token || !canGenerate) return;
    setLoading(true);
    try {
      const filenames = buildExportFilenames(periodStart, periodEnd, granularity);

      // R5 — Run BOTH queries in parallel; only sequence the downloads with 100ms gap.
      // Saves ~1s on large ranges where the P&L query is the slow one.
      const rawPromise: Promise<RawTransactionRow[] | null> = includeRaw
        ? convex.query(api.reports.financialExport.getRawTransactionsExport, {
            periodStart,
            periodEnd,
            token: user.token,
          })
        : Promise.resolve(null);

      const plPromise: Promise<MultiPeriodPLData | null> = includePL
        ? convex.query(api.reports.financialExport.getMultiPeriodPLExport, {
            periodStart,
            periodEnd,
            granularity,
            token: user.token,
          })
        : Promise.resolve(null);

      const [rawResult, plResult] = await Promise.all([rawPromise, plPromise]);

      // I7 — per-export status tracking; granular toast for empty-but-both-checked.
      let rawStatus: "skipped" | "downloaded" | "empty" = "skipped";
      let plStatus: "skipped" | "downloaded" | "empty" = "skipped";
      const downloadedFilenames: string[] = [];

      if (includeRaw) {
        if (rawResult && rawResult.length > 0) {
          downloadCSV(generateRawTransactionsCSV(rawResult), filenames.transactions);
          rawStatus = "downloaded";
          downloadedFilenames.push(filenames.transactions);
        } else {
          rawStatus = "empty";
        }
      }

      if (includePL) {
        // Edge case 9 — 100ms gap between sequential downloads.
        if (downloadedFilenames.length > 0) {
          await new Promise((r) => setTimeout(r, 100));
        }
        // Multi-period P&L is "non-empty" if it has any periods — even zero data still
        // has meaningful structure (header + zero-amount rows).
        if (plResult && plResult.periods.length > 0) {
          downloadCSV(generateMultiPeriodPLCSV(plResult), filenames.pl);
          plStatus = "downloaded";
          downloadedFilenames.push(filenames.pl);
        } else {
          plStatus = "empty";
        }
      }

      // Granular toasts (Improvement 7).
      if (rawStatus === "downloaded" && plStatus === "downloaded") {
        toast.success("Downloaded transactions and P&L summary CSVs.");
      } else if (rawStatus === "empty" && plStatus === "downloaded") {
        toast.success("P&L downloaded; no raw transactions in range.");
      } else if (rawStatus === "downloaded" && plStatus === "empty") {
        toast.success("Raw transactions downloaded; no P&L data in range.");
      } else if (downloadedFilenames.length === 1) {
        toast.success(`Downloaded ${downloadedFilenames[0]}.`);
      } else {
        // Both empty (or both skipped — but canGenerate guards against that).
        toast.error("No data in this range. Adjust the dates and try again.");
      }
    } catch (err) {
      toast.error(humanizeError(err));
    } finally {
      setLoading(false);
    }
  }

  const filenames = useMemo(
    () =>
      hasValidRange
        ? buildExportFilenames(periodStart, periodEnd, granularity)
        : null,
    [hasValidRange, periodStart, periodEnd, granularity],
  );

  return (
    <div className="min-w-[280px]">
      <PageHeader
        title="Financial Data Export"
        description="Download raw transactions and P&L summaries for accountant handoff or external analysis."
      />
      <div className="max-w-2xl mx-auto space-y-6 py-6">
        {/* Section 1 — Export type */}
        <section className="space-y-4">
          <h2 className="text-base font-semibold">Export type</h2>
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <Checkbox
                id="export-raw"
                checked={includeRaw}
                onCheckedChange={(v) => setIncludeRaw(v === true)}
                className="mt-0.5"
              />
              <div>
                <Label htmlFor="export-raw">Raw transactions</Label>
                <p className="text-xs text-muted-foreground">
                  One row per journal entry line, with account code and source document
                  reference.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Checkbox
                id="export-pl"
                checked={includePL}
                onCheckedChange={(v) => setIncludePL(v === true)}
                className="mt-0.5"
              />
              <div>
                <Label htmlFor="export-pl">P&amp;L summary</Label>
                <p className="text-xs text-muted-foreground">
                  Multi-period income statement, one row per period × line item.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Section 2 — Date range */}
        <section className="space-y-4">
          <h2 className="text-base font-semibold">Date range</h2>
          <div
            role="group"
            aria-label="Date range presets"
            className="flex flex-wrap gap-2"
          >
            {(
              ["last-week", "last-month", "last-quarter", "ytd", "custom"] as const
            ).map((p) => (
              <Button
                key={p}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => applyPreset(p)}
                className={
                  activePreset === p ? "ring-2 ring-primary/40 bg-primary/5" : ""
                }
                aria-pressed={activePreset === p}
              >
                {p === "last-week"
                  ? "Last week"
                  : p === "last-month"
                    ? "Last month"
                    : p === "last-quarter"
                      ? "Last quarter"
                      : p === "ytd"
                        ? "Year to date"
                        : "Custom"}
              </Button>
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
            <div className="space-y-1">
              <Label htmlFor="from-date">From</Label>
              <input
                id="from-date"
                type="date"
                value={utcToWibDateStr(periodStart)}
                onChange={(e) => {
                  const ms = wibDateStrToUtcMs(e.target.value);
                  if (!isNaN(ms)) {
                    setPeriodStart(ms);
                    setActivePreset("custom");
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.preventDefault();
                }}
                className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="to-date">To</Label>
              <input
                id="to-date"
                type="date"
                value={utcToWibDateStr(periodEnd - 1)}
                onChange={(e) => {
                  const ms = wibDateStrToUtcMs(e.target.value);
                  if (!isNaN(ms)) {
                    setPeriodEnd(ms + DAY_MS);
                    setActivePreset("custom");
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.preventDefault();
                }}
                className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">WIB timezone</p>
        </section>

        {/* Section 3 — Granularity (P&L summary only) */}
        {includePL && (
          <section className="space-y-4">
            <h2 className="text-base font-semibold">
              Granularity{" "}
              <span className="text-xs font-normal text-muted-foreground">
                (P&amp;L summary only)
              </span>
            </h2>
            <RadioGroup
              value={granularity}
              onValueChange={(v) => setGranularity(v as Granularity)}
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="weekly" id="gran-weekly" />
                <Label htmlFor="gran-weekly">Weekly</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="monthly" id="gran-monthly" />
                <Label htmlFor="gran-monthly">Monthly</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="custom" id="gran-custom" />
                <Label htmlFor="gran-custom">Custom (single period)</Label>
              </div>
            </RadioGroup>
          </section>
        )}

        {/* Section 4 — Preflight summary */}
        <PreflightPanel
          isLoading={
            hasValidRange && preflight === undefined && user?.token !== undefined
          }
          data={preflight ?? undefined}
          hasValidRange={hasValidRange}
        />

        {/* Generate CTA + filename preview */}
        <div className="space-y-3">
          <Button
            type="button"
            onClick={handleGenerate}
            disabled={!canGenerate}
            aria-disabled={!canGenerate}
            title={disabledTooltip || undefined}
            className="w-full"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                Generate exports
              </>
            )}
          </Button>
          {filenames && hasAnyType && (
            <p
              className="text-xs text-muted-foreground truncate"
              title={`${filenames.transactions} / ${filenames.pl}`}
            >
              Files will save as:{" "}
              {includeRaw && filenames.transactions}
              {includeRaw && includePL && " and "}
              {includePL && filenames.pl}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default FinancialExportPage;
