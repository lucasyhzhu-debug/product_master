import type { Doc } from "../../_generated/dataModel";

export type LedgerStatementRow = {
  type: Doc<"creditLedger">["type"];
  signedAmount: number;
  balanceAfter: number;
  link: { kind: "order" | "invoice" | "week" | null; id: string | null };
  createdBy: string;
  note?: string;
  at: number;
};

export function buildLedgerStatement(entries: Doc<"creditLedger">[]): { rows: LedgerStatementRow[] } {
  const rows = entries
    .slice()
    .sort((a, b) => a._creationTime - b._creationTime)
    .map((e) => ({
      type: e.type,
      signedAmount: e.amount, // already signed
      balanceAfter: e.balanceAfter, // week-scoped (resets per week — do NOT re-key)
      link: e.orderId ? { kind: "order" as const, id: e.orderId }
        : e.invoiceId ? { kind: "invoice" as const, id: e.invoiceId }
        : e.rolloverFromWeekId ? { kind: "week" as const, id: e.rolloverFromWeekId }
        : { kind: null, id: null },
      createdBy: e.createdBy,
      note: e.note,
      at: e._creationTime,
    }));
  return { rows };
}
