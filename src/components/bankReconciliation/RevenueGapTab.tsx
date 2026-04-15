/**
 * RevenueGapTab — Phase 73 Plan 05 (D-13/D-14/D-15).
 *
 * Per-period diagnostic table: where is bank money we haven't recorded as
 * external revenue? Rows join bank credit totals (from bankStatementLines)
 * against externalRevenue gross totals for the same WIB month.
 *
 * Backend: `revenueGapByPeriod` returns `{ rows, unmappedRows }`:
 *  - `rows`: mapped channels + "(unallocated)" bucket
 *  - `unmappedRows`: channels like "tokopedia"/"ovo" that don't map to any
 *    externalSource literal — rendered in a collapsible bottom group
 *
 * Row click navigates to the Review tab with `channelFilter` + `period`
 * URL params. BankLinesPane (Task 2) honors those params.
 *
 * UI-SPEC §6.6. CONTEXT D-13/D-14/D-15.
 */

import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AlertTriangle, CalendarRange, ChevronDown, ChevronRight } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";

import { formatCurrency } from "@/lib/utils";
import { getPlatformPalette } from "@/lib/platformColors";
import {
  getCurrentWibMonth,
  strictWibDateStrToUtcMs,
  wibMidnightToUtc,
} from "@/lib/dateUtils";
import { useRevenueGap } from "@/hooks/convex/useBankReconciliation";

// ---------------------------------------------------------------------------
// Period helpers (WIB)
// ---------------------------------------------------------------------------

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

type Period = {
  start: number;
  end: number;
  /** YYYY-MM label used in URL drill-down + picker. */
  key: string;
  /** Human label like "Nov 2025" or "Nov 1 – Nov 15, 2025". */
  label: string;
  /** True when custom range (YYYY-MM key not meaningful). */
  custom: boolean;
};

function wibMonthBounds(year: number, month: number): { start: number; end: number } {
  // WIB midnight on 1st of month → end is WIB midnight on 1st of next month minus 1ms.
  const start = wibMidnightToUtc(year, month, 1);
  const end = wibMidnightToUtc(year, month + 1, 1) - 1;
  return { start, end };
}

function monthKey(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

function monthLabel(year: number, month: number): string {
  return `${MONTH_LABELS[month]} ${year}`;
}

function currentWibMonthPeriod(): Period {
  const { year, month } = getCurrentWibMonth();
  const { start, end } = wibMonthBounds(year, month);
  return {
    start,
    end,
    key: monthKey(year, month),
    label: monthLabel(year, month),
    custom: false,
  };
}

function periodFromKey(key: string): Period | null {
  const m = key.match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10) - 1;
  if (month < 0 || month > 11) return null;
  const { start, end } = wibMonthBounds(year, month);
  return {
    start,
    end,
    key: monthKey(year, month),
    label: monthLabel(year, month),
    custom: false,
  };
}

function last12Months(): Period[] {
  const { year, month } = getCurrentWibMonth();
  const out: Period[] = [];
  for (let i = 0; i < 12; i++) {
    const total = year * 12 + month - i;
    const y = Math.floor(total / 12);
    const m = ((total % 12) + 12) % 12;
    const { start, end } = wibMonthBounds(y, m);
    out.push({
      start,
      end,
      key: monthKey(y, m),
      label: monthLabel(y, m),
      custom: false,
    });
  }
  return out;
}

function formatWibDate(utcMs: number): string {
  // Convert UTC epoch ms → WIB YYYY-MM-DD for display / inputs.
  const d = new Date(utcMs + 7 * 60 * 60 * 1000);
  return d.toISOString().split("T")[0];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RevenueGapTab() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const initialPeriod = useMemo(() => {
    const urlKey = searchParams.get("period");
    if (urlKey) {
      const p = periodFromKey(urlKey);
      if (p) return p;
    }
    return currentWibMonthPeriod();
  }, [searchParams]);

  const [period, setPeriod] = useState<Period>(initialPeriod);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [customMode, setCustomMode] = useState(false);
  const [customStart, setCustomStart] = useState<string>(() => formatWibDate(initialPeriod.start));
  const [customEnd, setCustomEnd] = useState<string>(() => formatWibDate(initialPeriod.end));
  const [showUnmapped, setShowUnmapped] = useState(true);

  const data = useRevenueGap(period.start, period.end);

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  function selectPresetMonth(p: Period) {
    setPeriod(p);
    setCustomStart(formatWibDate(p.start));
    setCustomEnd(formatWibDate(p.end));
    setCustomMode(false);
    setPickerOpen(false);
  }

  function applyCustomRange() {
    const s = strictWibDateStrToUtcMs(customStart);
    const e = strictWibDateStrToUtcMs(customEnd);
    if (!Number.isFinite(s) || !Number.isFinite(e)) {
      toast.error("Enter valid dates in YYYY-MM-DD format.");
      return;
    }
    if (e < s) {
      toast.error("End date must be on or after the start date.");
      return;
    }
    // T-73-29 mitigation: cap custom range at 365 days.
    const ONE_DAY = 24 * 60 * 60 * 1000;
    const span = (e - s) / ONE_DAY;
    if (span > 366) {
      toast.error("Custom range is capped at 12 months.");
      return;
    }
    // End input is WIB midnight of that date — extend to end-of-day so the
    // final day's transactions are included.
    const endExclusive = e + (24 * 60 * 60 * 1000) - 1;
    setPeriod({
      start: s,
      end: endExclusive,
      key: `custom:${customStart}:${customEnd}`,
      label: `${customStart} → ${customEnd}`,
      custom: true,
    });
    setPickerOpen(false);
  }

  function handleRowClick(channel: string) {
    // Drill-down (D-15): hand off to Review tab with channelFilter + period.
    // Custom ranges can't pack into a single YYYY-MM, so fall back to omitting
    // the period param (Review tab will simply ignore channelFilter date).
    const periodParam = period.custom ? "" : `&period=${period.key}`;
    const channelParam = encodeURIComponent(channel);
    navigate(
      `/bank-reconciliation?tab=review&channelFilter=${channelParam}${periodParam}`,
    );
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const isLoading = data === undefined;
  const rows = data?.rows ?? [];
  const unmappedRows = data?.unmappedRows ?? [];
  const hasAnyRows = rows.length > 0 || unmappedRows.length > 0;
  const months = last12Months();

  return (
    <TooltipProvider delayDuration={200}>
      <Card>
        <CardContent className="space-y-4 pt-6">
          {/* Period picker */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Period:</span>
              <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 gap-2">
                    <CalendarRange className="h-4 w-4" />
                    {period.label}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-64 p-0">
                  {customMode ? (
                    <div className="space-y-3 p-3">
                      <div className="space-y-1">
                        <Label htmlFor="rg-custom-start" className="text-xs">
                          Start date
                        </Label>
                        <Input
                          id="rg-custom-start"
                          type="date"
                          value={customStart}
                          onChange={(e) => setCustomStart(e.target.value)}
                          className="h-8"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="rg-custom-end" className="text-xs">
                          End date
                        </Label>
                        <Input
                          id="rg-custom-end"
                          type="date"
                          value={customEnd}
                          onChange={(e) => setCustomEnd(e.target.value)}
                          className="h-8"
                        />
                      </div>
                      <div className="flex justify-between gap-2 pt-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8"
                          onClick={() => setCustomMode(false)}
                        >
                          Back
                        </Button>
                        <Button size="sm" className="h-8" onClick={applyCustomRange}>
                          Apply
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <ul className="max-h-[320px] overflow-y-auto py-1 text-sm">
                      {months.map((p) => {
                        const active = p.key === period.key;
                        return (
                          <li key={p.key}>
                            <button
                              type="button"
                              onClick={() => selectPresetMonth(p)}
                              className={`flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-muted ${
                                active ? "bg-muted font-semibold" : ""
                              }`}
                            >
                              <span>{p.label}</span>
                              {active && <span className="text-xs text-muted-foreground">current</span>}
                            </button>
                          </li>
                        );
                      })}
                      <li className="border-t border-border">
                        <button
                          type="button"
                          onClick={() => setCustomMode(true)}
                          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-muted-foreground hover:bg-muted"
                        >
                          <CalendarRange className="h-3.5 w-3.5" />
                          Custom…
                        </button>
                      </li>
                    </ul>
                  )}
                </PopoverContent>
              </Popover>
            </div>
            <div className="text-xs text-muted-foreground">
              Click a row to filter the Review tab for that channel + period.
            </div>
          </div>

          {/* Table */}
          <div className="rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[32%]">Channel</TableHead>
                  <TableHead className="text-right">Bank Credits</TableHead>
                  <TableHead className="text-right">External Revenue</TableHead>
                  <TableHead className="text-right">Diff</TableHead>
                  <TableHead className="text-right w-[12%]">Diff %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <>
                    {Array.from({ length: 4 }).map((_, i) => (
                      <TableRow key={`sk-${i}`}>
                        <TableCell colSpan={5}>
                          <Skeleton className="h-6 w-full" />
                        </TableCell>
                      </TableRow>
                    ))}
                  </>
                )}

                {!isLoading && !hasAnyRows && (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="py-10 text-center text-sm text-muted-foreground"
                    >
                      No bank activity recorded for this period.
                    </TableCell>
                  </TableRow>
                )}

                {!isLoading &&
                  rows.map((row) => (
                    <RevenueGapRow
                      key={`mapped-${row.channel}`}
                      channel={row.channel}
                      bankCr={row.bankCr}
                      extRev={row.extRev}
                      diff={row.diff}
                      diffPct={row.diffPct}
                      onClick={() => handleRowClick(row.channel)}
                    />
                  ))}

                {!isLoading && unmappedRows.length > 0 && (
                  <>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableCell colSpan={5} className="py-1.5">
                        <button
                          type="button"
                          onClick={() => setShowUnmapped((v) => !v)}
                          className="flex items-center gap-1 text-xs font-medium text-muted-foreground"
                        >
                          {showUnmapped ? (
                            <ChevronDown className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5" />
                          )}
                          Unmapped channels ({unmappedRows.length})
                          <span className="ml-1 font-normal">
                            — channel not tracked in externalRevenue
                          </span>
                        </button>
                      </TableCell>
                    </TableRow>
                    {showUnmapped &&
                      unmappedRows.map((row) => (
                        <RevenueGapRow
                          key={`unmapped-${row.channel}`}
                          channel={row.channel}
                          bankCr={row.bankCr}
                          extRev={null}
                          diff={row.diff}
                          diffPct={null}
                          unmappedNote
                          onClick={() => handleRowClick(row.channel)}
                        />
                      ))}
                  </>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

const UNALLOC = "(unallocated)";

interface RowProps {
  channel: string;
  bankCr: number;
  extRev: number | null;
  diff: number;
  diffPct: number | null;
  /** Row belongs to the unmapped-channels group — suppress Diff% + infinity warning. */
  unmappedNote?: boolean;
  onClick: () => void;
}

function RevenueGapRow({
  channel,
  bankCr,
  extRev,
  diff,
  diffPct,
  unmappedNote,
  onClick,
}: RowProps) {
  const isUnallocated = channel === UNALLOC;
  const palette = isUnallocated ? null : getPlatformPalette(channel);
  // Infinity case: backend sets extRev=null AND diffPct=null for a MAPPED
  // channel that has bank credits but zero externalRevenue recorded.
  // Unallocated rows also have extRev=null but are handled separately (no
  // warning — the ask is to map them first).
  const isInfinity = !unmappedNote && !isUnallocated && extRev === null && bankCr > 0;

  // Diff colors per UI-SPEC §6.6 — use status tokens where available with
  // graceful fallback to amber/sky so the page still reads correctly on
  // projects without those tokens loaded.
  const diffClass =
    diff === 0
      ? "text-muted-foreground"
      : diff > 0
        ? "text-amber-600 dark:text-amber-400"
        : "text-sky-600 dark:text-sky-400";

  return (
    <TableRow
      className="cursor-pointer hover:bg-muted/50"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <TableCell>
        <div className="flex items-center gap-2">
          <span
            className={`inline-block h-2.5 w-2.5 rounded-full ${
              palette ? palette.dot : "bg-muted-foreground/50"
            }`}
            aria-hidden="true"
          />
          <span className={isUnallocated ? "italic text-muted-foreground" : ""}>{channel}</span>
          {isUnallocated && (
            <Badge
              variant="outline"
              className="border-amber-500 text-amber-700 dark:text-amber-400 text-[10px] uppercase tracking-wide"
            >
              Needs channel mapping
            </Badge>
          )}
          {unmappedNote && (
            <Badge
              variant="outline"
              className="border-muted-foreground/40 text-[10px] uppercase tracking-wide text-muted-foreground"
            >
              Unmapped
            </Badge>
          )}
        </div>
      </TableCell>
      <TableCell className="text-right font-mono tabular-nums">
        {formatCurrency(bankCr)}
      </TableCell>
      <TableCell className="text-right font-mono tabular-nums">
        {extRev === null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          formatCurrency(extRev)
        )}
      </TableCell>
      <TableCell className={`text-right font-mono tabular-nums ${diffClass}`}>
        {diff === 0 ? <span className="text-muted-foreground">—</span> : formatCurrency(diff)}
      </TableCell>
      <TableCell className="text-right font-mono tabular-nums">
        {unmappedNote ? (
          <span className="text-muted-foreground">—</span>
        ) : isInfinity ? (
          <span className="inline-flex items-center justify-end gap-1 text-amber-600 dark:text-amber-400">
            <span>—</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <AlertTriangle className="h-3.5 w-3.5" aria-label="No revenue recorded" />
              </TooltipTrigger>
              <TooltipContent className="max-w-[260px] text-left">
                No external revenue recorded — bank shows money we haven't captured.
              </TooltipContent>
            </Tooltip>
          </span>
        ) : diffPct === null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span className={diffClass}>{`${diffPct.toFixed(1)}%`}</span>
        )}
      </TableCell>
    </TableRow>
  );
}

export default RevenueGapTab;
