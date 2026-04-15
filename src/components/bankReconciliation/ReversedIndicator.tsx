/**
 * ReversedIndicator — inline pill shown next to a bank line that was
 * unmatched after confirmation. Carries a tooltip with the reversal JE
 * link per UI-SPEC §8.
 */

import { Undo2 } from "lucide-react";
import type { Id } from "../../../convex/_generated/dataModel";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface Props {
  reversedAt: number;
  reversedByName?: string;
  reversalJournalEntryId: Id<"journalEntries">;
}

function fmtWib(ms: number): string {
  // Render as DD/MM/YYYY in WIB (UTC+7). Bank-reconciliation tool — exact
  // numeric format is the contract; matches StatementHistoryList style.
  const d = new Date(ms + 7 * 60 * 60 * 1000);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
}

export function ReversedIndicator({ reversedAt, reversedByName, reversalJournalEntryId }: Props) {
  const dateStr = fmtWib(reversedAt);
  const userStr = reversedByName ?? "user";
  const tipText = `Reversed by ${userStr} on ${dateStr} (WIB). Reversal journal entry id: ${reversalJournalEntryId}`;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-1 rounded-md border border-[color:var(--color-status-warning)]/30 bg-[color:var(--color-status-warning-bg)] px-1.5 py-0.5 text-xs text-[color:var(--color-status-warning)]">
            <Undo2 className="h-3 w-3" aria-hidden="true" />
            <span>
              Reversed on {dateStr} by {userStr}
            </span>
          </span>
        </TooltipTrigger>
        <TooltipContent>{tipText}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
