/**
 * BankLinesPane — left side of the split-view workspace.
 *
 * Shows all bank statement lines (filterable by direction + show-confirmed).
 * Single-row selection drives the right-hand candidates pane.
 *
 * UI-SPEC §6.2 + D-02 (confirmed lines hidden by default).
 */

import { useMemo, useState } from "react";
import type { Id } from "../../../convex/_generated/dataModel";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useBankStatementLines } from "@/hooks/convex/useBankReconciliation";
import { BankLineRow } from "./BankLineRow";

interface Props {
  statementId: Id<"bankStatements">;
  selectedLineId: Id<"bankStatementLines"> | null;
  onSelect: (lineId: Id<"bankStatementLines"> | null) => void;
}

type DirFilter = "all" | "debit" | "credit";

export function BankLinesPane({ statementId, selectedLineId, onSelect }: Props) {
  const [dirFilter, setDirFilter] = useState<DirFilter>("all");
  const [showConfirmed, setShowConfirmed] = useState(false);

  // listLines is a single-shot query over all lines for this statement;
  // confirmed-line hiding + direction filter are client-side. Avoids the
  // overhead of multiple withIndex calls per render.
  const allLines = useBankStatementLines(statementId);

  const visible = useMemo(() => {
    if (!allLines) return undefined;
    return allLines.filter((l) => {
      if (!showConfirmed && l.status === "confirmed") return false;
      if (dirFilter === "debit" && l.direction !== "debit") return false;
      if (dirFilter === "credit" && l.direction !== "credit") return false;
      return true;
    });
  }, [allLines, dirFilter, showConfirmed]);

  const confirmedCount = useMemo(
    () => (allLines ? allLines.filter((l) => l.status === "confirmed").length : 0),
    [allLines],
  );

  return (
    <section
      aria-label="Bank lines"
      className="flex flex-col rounded-md border border-border bg-card min-h-[600px] max-h-[calc(100vh-280px)]"
    >
      <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
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
            No bank lines match the current filter.
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
