/**
 * BankLinesPane — left side of the split-view workspace.
 *
 * Shows all bank statement lines (filterable by direction + show-confirmed).
 * Single-row selection drives the right-hand candidates pane.
 *
 * UI-SPEC §6.2 + D-02 (confirmed lines hidden by default).
 *
 * Phase 73 Plan 05 (D-15): honors URL params `channelFilter` + `period`
 * (YYYY-MM) for Revenue Gap drill-down. When set, only credit lines matching
 * the channel + falling within that WIB month are shown. A dismissible chip
 * advertises the active filter and clears the URL params on close.
 */

import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { X } from "lucide-react";
import type { Id } from "../../../convex/_generated/dataModel";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useBankStatementLines } from "@/hooks/convex/useBankReconciliation";
import { wibMidnightToUtc } from "@/lib/dateUtils";
import { BankLineRow } from "./BankLineRow";

interface Props {
  statementId: Id<"bankStatements">;
  selectedLineId: Id<"bankStatementLines"> | null;
  onSelect: (lineId: Id<"bankStatementLines"> | null) => void;
}

type DirFilter = "all" | "debit" | "credit";

/**
 * Parse a YYYY-MM period key into WIB month bounds (UTC epoch ms).
 * I7 — uses the shared `wibMidnightToUtc` helper so this function produces
 * the exact same epoch values as `RevenueGapTab.wibMonthBounds`. Both call
 * sites must agree on WIB offset semantics for drill-down to line up.
 */
function periodBoundsFromKey(key: string | null): { start: number; end: number } | null {
  if (!key) return null;
  const m = key.match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10) - 1;
  if (month < 0 || month > 11) return null;
  const start = wibMidnightToUtc(year, month, 1);
  const end = wibMidnightToUtc(year, month + 1, 1) - 1;
  return { start, end };
}

/**
 * Parse explicit periodStart/periodEnd query params (UTC epoch ms strings)
 * into numeric bounds. WR-06: preferred over `period` when present because
 * it carries custom-range drill-downs that don't fit a YYYY-MM key.
 */
function periodBoundsFromExplicit(
  start: string | null,
  end: string | null,
): { start: number; end: number } | null {
  if (!start || !end) return null;
  const s = Number(start);
  const e = Number(end);
  if (!Number.isFinite(s) || !Number.isFinite(e)) return null;
  if (e < s) return null;
  return { start: s, end: e };
}

/** Format a UTC epoch ms as WIB YYYY-MM-DD for chip display. */
function formatWibDateShort(utcMs: number): string {
  const d = new Date(utcMs + 7 * 60 * 60 * 1000);
  return d.toISOString().split("T")[0];
}

export function BankLinesPane({ statementId, selectedLineId, onSelect }: Props) {
  const [dirFilter, setDirFilter] = useState<DirFilter>("all");
  const [showConfirmed, setShowConfirmed] = useState(false);

  const [searchParams, setSearchParams] = useSearchParams();
  const channelFilter = searchParams.get("channelFilter");
  const periodKey = searchParams.get("period");
  const periodStartRaw = searchParams.get("periodStart");
  const periodEndRaw = searchParams.get("periodEnd");
  // WR-06: explicit periodStart/periodEnd (custom ranges) take precedence
  // over the YYYY-MM `period` key so RevenueGapTab custom drill-downs
  // preserve their scope.
  const periodBounds = useMemo(
    () =>
      periodBoundsFromExplicit(periodStartRaw, periodEndRaw) ??
      periodBoundsFromKey(periodKey),
    [periodStartRaw, periodEndRaw, periodKey],
  );

  // listLines is a single-shot query over all lines for this statement;
  // confirmed-line hiding + direction filter are client-side. Avoids the
  // overhead of multiple withIndex calls per render. Drill-down channel +
  // period filters also run client-side to avoid re-running the query.
  const allLines = useBankStatementLines(statementId);

  const visible = useMemo(() => {
    if (!allLines) return undefined;
    return allLines.filter((l) => {
      if (!showConfirmed && l.status === "confirmed") return false;
      if (dirFilter === "debit" && l.direction !== "debit") return false;
      if (dirFilter === "credit" && l.direction !== "credit") return false;
      if (channelFilter) {
        // Drill-down scopes to credit lines with a matching linkedChannel.
        if (l.direction !== "credit") return false;
        if ((l.linkedChannel ?? null) !== channelFilter) return false;
      }
      if (periodBounds) {
        if (l.date < periodBounds.start || l.date > periodBounds.end) return false;
      }
      return true;
    });
  }, [allLines, dirFilter, showConfirmed, channelFilter, periodBounds]);

  const confirmedCount = useMemo(
    () => (allLines ? allLines.filter((l) => l.status === "confirmed").length : 0),
    [allLines],
  );

  function clearDrillDown() {
    setSearchParams(
      (prev) => {
        const np = new URLSearchParams(prev);
        np.delete("channelFilter");
        np.delete("period");
        np.delete("periodStart");
        np.delete("periodEnd");
        return np;
      },
      { replace: true },
    );
  }

  // Period chip label: show YYYY-MM when preset; show "YYYY-MM-DD → YYYY-MM-DD"
  // when custom (WR-06 — surface the range so the reviewer isn't surprised).
  let periodLabel: string | null = null;
  if (periodBounds) {
    if (periodStartRaw && periodEndRaw) {
      periodLabel = `${formatWibDateShort(periodBounds.start)} → ${formatWibDateShort(periodBounds.end)}`;
    } else if (periodKey) {
      periodLabel = periodKey;
    }
  }

  return (
    <section
      aria-label="Bank lines"
      className="flex flex-col rounded-md border border-border bg-card min-h-[600px] max-h-[calc(100vh-280px)]"
    >
      <header className="flex flex-col gap-2 border-b border-border px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            {(["all", "debit", "credit"] as const).map((d) => (
              <Button
                key={d}
                size="sm"
                variant={dirFilter === d ? "secondary" : "ghost"}
                onClick={() => setDirFilter(d)}
                className="h-7 px-2 text-xs capitalize"
              >
                {d}
              </Button>
            ))}
          </div>
          {confirmedCount > 0 && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowConfirmed((v) => !v)}
              className="h-7 px-2 text-xs"
            >
              {showConfirmed ? `Hide confirmed (${confirmedCount})` : `Show confirmed (${confirmedCount})`}
            </Button>
          )}
        </div>
        {channelFilter && (
          <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-2 py-1 text-xs">
            <span className="text-muted-foreground">Filtered by:</span>
            <span className="font-medium">{channelFilter}</span>
            {periodLabel && (
              <>
                <span className="text-muted-foreground">·</span>
                <span className="font-medium">{periodLabel}</span>
              </>
            )}
            <button
              type="button"
              onClick={clearDrillDown}
              aria-label="Clear drill-down filter"
              className="ml-auto inline-flex h-5 w-5 items-center justify-center rounded hover:bg-muted"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </header>
      <ScrollArea className="flex-1">
        {visible === undefined ? (
          <div className="flex flex-col gap-1 p-3">
            {Array.from({ length: 10 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
            {channelFilter
              ? `No ${channelFilter} lines${periodLabel ? ` in ${periodLabel}` : ""} in this statement.`
              : "No bank lines match the current filter."}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {visible.map((line) => (
              <li key={line._id}>
                <BankLineRow
                  line={line}
                  selected={selectedLineId === line._id}
                  onSelect={() => onSelect(line._id)}
                />
              </li>
            ))}
          </ul>
        )}
      </ScrollArea>
    </section>
  );
}
