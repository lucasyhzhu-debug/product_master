/**
 * CandidateRow — single candidate record (expense / revenue / reimbursement / payroll)
 * in the right-hand candidates pane.
 *
 * Already-linked candidates render disabled with a tooltip per RESEARCH Open Q #3.
 * UI-SPEC §6.2.
 */

import type { Id } from "../../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export type MatchedType = "expense" | "revenue" | "reimbursement" | "payroll";

interface Props {
  /** Discriminated by `type` so each row knows how to render its label. */
  candidate: {
    _id: string;
    type: MatchedType;
    amount: number;
    date: number;
    label: string;
    secondary?: string;
    alreadyLinkedToLineId?: Id<"bankStatementLines">;
  };
  selected: boolean;
  onSelect: () => void;
}

function fmtDate(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
}

export function CandidateRow({ candidate, selected, onSelect }: Props) {
  const isLinked = !!candidate.alreadyLinkedToLineId;
  const button = (
    <button
      type="button"
      onClick={isLinked ? undefined : onSelect}
      aria-pressed={selected}
      disabled={isLinked}
      className={cn(
        "flex w-full items-center gap-3 px-3 py-2 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isLinked
          ? "cursor-not-allowed opacity-50"
          : "hover:bg-muted/50",
        selected && !isLinked && "bg-primary/10",
      )}
    >
      <div className="w-32 shrink-0 text-right font-mono tabular-nums">
        {formatCurrency(candidate.amount)}
      </div>
      <div className="w-20 shrink-0 font-mono tabular-nums text-muted-foreground">
        {fmtDate(candidate.date)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="truncate text-foreground">{candidate.label}</div>
        {candidate.secondary && (
          <div className="truncate text-[10px] text-muted-foreground">{candidate.secondary}</div>
        )}
      </div>
    </button>
  );

  if (!isLinked) return button;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="block w-full">{button}</span>
        </TooltipTrigger>
        <TooltipContent>
          Already linked to bank line {String(candidate.alreadyLinkedToLineId).slice(-6)}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
