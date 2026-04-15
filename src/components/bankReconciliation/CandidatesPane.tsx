/**
 * CandidatesPane — right side of the split-view workspace.
 *
 * Renders 4 grouped candidate types (Reimbursements / Expenses / Payroll / Revenue)
 * for the currently selected bank line. Empty groups still show with count 0
 * per D-05.
 *
 * UI-SPEC §6.2 + Pitfall 2 (selection clears when line changes — handled
 * by the parent SplitViewWorkspace).
 */

import type { Id } from "../../../convex/_generated/dataModel";
import { Search } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCandidatesForLine } from "@/hooks/convex/useBankReconciliation";
import { CandidateGroup } from "./CandidateGroup";
import { CandidateRow, type MatchedType } from "./CandidateRow";

interface Props {
  lineId: Id<"bankStatementLines"> | null;
  selectedCandidate: { type: MatchedType; id: string } | null;
  onSelect: (c: { type: MatchedType; id: string } | null) => void;
  onSearchAll: () => void;
}

export function CandidatesPane({ lineId, selectedCandidate, onSelect, onSearchAll }: Props) {
  const candidates = useCandidatesForLine(lineId);

  if (!lineId) {
    return (
      <section
        aria-label="Candidate records"
        className="flex min-h-[600px] max-h-[calc(100vh-280px)] flex-col rounded-md border border-border bg-card"
      >
        <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
          Select a bank line on the left to see candidate records.
        </div>
      </section>
    );
  }

  if (candidates === undefined) {
    return (
      <section
        aria-label="Candidate records"
        className="flex min-h-[600px] max-h-[calc(100vh-280px)] flex-col rounded-md border border-border bg-card"
      >
        <div className="flex flex-col gap-1 p-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </section>
    );
  }

  const groups: Array<{
    title: string;
    type: MatchedType;
    rows: Array<{
      _id: string;
      type: MatchedType;
      amount: number;
      date: number;
      label: string;
      secondary?: string;
      alreadyLinkedToLineId?: Id<"bankStatementLines">;
    }>;
  }> = [
    {
      title: "Reimbursement Batches",
      type: "reimbursement",
      rows: candidates.reimbursement.map((r) => ({
        _id: r._id,
        type: "reimbursement" as const,
        amount: r.totalAmount,
        date: r.createdAt,
        label: `Batch ${r.batchNumber}`,
        secondary: r.bankReference ? `Ref ${r.bankReference}` : undefined,
        alreadyLinkedToLineId: r.alreadyLinkedToLineId,
      })),
    },
    {
      title: "Expenses",
      type: "expense",
      rows: candidates.expense.map((e) => ({
        _id: e._id,
        type: "expense" as const,
        amount: e.amount,
        date: e.expenseDate,
        label: e.vendorName || e.description || "Expense",
        secondary: e.description && e.vendorName !== e.description ? e.description : undefined,
        alreadyLinkedToLineId: e.alreadyLinkedToLineId,
      })),
    },
    {
      title: "Payroll",
      type: "payroll",
      rows: candidates.payroll.map((p) => ({
        _id: p._id,
        type: "payroll" as const,
        amount: p.amount,
        date: p.periodStart,
        label: p.recipientName,
        secondary: p.payrollNumber,
        alreadyLinkedToLineId: p.alreadyLinkedToLineId,
      })),
    },
    {
      title: "Revenue",
      type: "revenue",
      rows: candidates.revenue.map((r) => ({
        _id: r._id,
        type: "revenue" as const,
        amount: r.revenueGross ?? 0,
        date: r.transactionDate ?? r.periodStart,
        label: r.productName ?? r.source,
        secondary: r.externalTransactionId ?? r.source,
        alreadyLinkedToLineId: r.alreadyLinkedToLineId,
      })),
    },
  ];

  return (
    <section
      aria-label="Candidate records"
      className="flex min-h-[600px] max-h-[calc(100vh-280px)] flex-col rounded-md border border-border bg-card"
    >
      <ScrollArea className="flex-1">
        {groups.map((g) => (
          <CandidateGroup key={g.type} title={g.title} count={g.rows.length}>
            <ul className="divide-y divide-border">
              {g.rows.map((row) => (
                <li key={`${g.type}-${row._id}`}>
                  <CandidateRow
                    candidate={row}
                    selected={
                      selectedCandidate?.type === row.type && selectedCandidate.id === row._id
                    }
                    onSelect={() => onSelect({ type: row.type, id: row._id })}
                  />
                </li>
              ))}
            </ul>
          </CandidateGroup>
        ))}
      </ScrollArea>
      <footer className="border-t border-border p-2">
        <Button variant="ghost" size="sm" onClick={onSearchAll} className="w-full justify-start">
          <Search className="mr-2 h-3.5 w-3.5" />
          Search all records
        </Button>
      </footer>
    </section>
  );
}
