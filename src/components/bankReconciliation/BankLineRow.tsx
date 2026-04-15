/**
 * BankLineRow — single bank statement line in the BankLinesPane.
 *
 * UI-SPEC §6.2 + §4 direction colors. 56px row, 64px when selected
 * (achieved via background — no border-width change to avoid layout shift).
 */

import type { Doc } from "../../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { ReversedIndicator } from "./ReversedIndicator";

interface Props {
  line: Doc<"bankStatementLines">;
  selected: boolean;
  onSelect: () => void;
}

function fmtShortDate(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

const STATUS_LABEL: Record<Doc<"bankStatementLines">["status"], string> = {
  unmatched: "Unmatched",
  auto_matched: "Auto-matched",
  suggested: "Suggested",
  confirmed: "Confirmed",
};

export function BankLineRow({ line, selected, onSelect }: Props) {
  const isCredit = line.direction === "credit";
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "flex w-full items-center gap-3 border-l-4 border-transparent px-3 py-2 text-left text-xs transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected && "border-primary bg-primary/5",
      )}
    >
      <ConfidenceBadge confidence={line.confidence} />
      <div className="w-12 shrink-0 font-mono tabular-nums text-muted-foreground">
        {fmtShortDate(line.date)}
      </div>
      <div
        className={cn(
          "w-8 shrink-0 rounded border px-1 text-center text-[10px] font-semibold",
          isCredit
            ? "border-[color:var(--color-status-success)]/40 text-[color:var(--color-status-success)]"
            : "border-[color:var(--color-status-error)]/40 text-[color:var(--color-status-error)]",
        )}
        aria-label={isCredit ? "Credit (money in)" : "Debit (money out)"}
      >
        {isCredit ? "CR" : "DB"}
      </div>
      <div
        className={cn(
          "w-32 shrink-0 text-right font-mono tabular-nums",
          isCredit
            ? "text-[color:var(--color-status-success)]"
            : "text-[color:var(--color-status-error)]",
        )}
      >
        {isCredit ? "+" : "−"}
        {formatCurrency(line.amountIdr)}
      </div>
      <div className="flex-1 min-w-0 truncate text-foreground">
        {line.parsedCounterparty || line.rawDescription}
      </div>
      <div className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
        {STATUS_LABEL[line.status]}
      </div>
      {line.reversedAt && line.reversalJournalEntryId && (
        <ReversedIndicator
          reversedAt={line.reversedAt}
          reversalJournalEntryId={line.reversalJournalEntryId}
        />
      )}
    </button>
  );
}
