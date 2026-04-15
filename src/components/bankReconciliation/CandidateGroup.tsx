/**
 * CandidateGroup — collapsible group header with count + child rows.
 *
 * UI-SPEC §6.2 — empty groups still render (count 0) so users can see
 * which axes have no candidates in the ±3 day window.
 */

import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface Props {
  title: string;
  count: number;
  defaultExpanded?: boolean;
  children: ReactNode;
}

export function CandidateGroup({ title, count, defaultExpanded = true, children }: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const isEmpty = count === 0;

  return (
    <section className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-2 bg-muted/40 px-3 py-2 text-left text-xs font-semibold text-foreground hover:bg-muted/60"
        aria-expanded={expanded}
      >
        <span className="flex items-center gap-2">
          <ChevronRight
            className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-90")}
            aria-hidden="true"
          />
          {title}
          <Badge variant="outline" className="ml-1 h-5 min-w-[24px] justify-center px-1.5 text-[10px]">
            {count}
          </Badge>
        </span>
      </button>
      {expanded && (
        <div>
          {isEmpty ? (
            <p className="px-3 py-2 text-[11px] text-muted-foreground">
              No candidates in ±3 day window.
            </p>
          ) : (
            children
          )}
        </div>
      )}
    </section>
  );
}
