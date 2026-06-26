import type { Doc } from "../../_generated/dataModel";

export type LedgerStatementRow = {
  type: Doc<"creditLedger">["type"];
  signedAmount: number;
  balanceAfter: number;
  /** label = human identifier (order/invoice number); falls back to the id tail in the UI (A1). */
  link: { kind: "order" | "invoice" | "week" | null; id: string | null; label: string | null };
  /** Resolved actor display name (C10) — NOT the raw user id. */
  createdBy: string;
  note?: string;
  at: number;
};

/** Optional resolvers so callers (queries with ctx) can inject names/labels (A1/C10). */
export interface LedgerStatementResolvers {
  /** userId → display name. */
  actorName?: (userId: string) => string | undefined;
  /** linked order/invoice id → human number. */
  linkLabel?: (kind: "order" | "invoice" | "week", id: string) => string | undefined;
}

export function buildLedgerStatement(
  entries: Doc<"creditLedger">[],
  resolvers: LedgerStatementResolvers = {},
): { rows: LedgerStatementRow[] } {
  const rows = entries
    .slice()
    .sort((a, b) => a._creationTime - b._creationTime)
    .map((e) => {
      const link = e.orderId ? { kind: "order" as const, id: e.orderId }
        : e.invoiceId ? { kind: "invoice" as const, id: e.invoiceId }
        : e.rolloverFromWeekId ? { kind: "week" as const, id: e.rolloverFromWeekId }
        : { kind: null, id: null };
      const label =
        link.kind && link.id ? resolvers.linkLabel?.(link.kind, link.id) ?? null : null;
      return {
        type: e.type,
        signedAmount: e.amount, // already signed
        balanceAfter: e.balanceAfter, // week-scoped (resets per week — do NOT re-key)
        link: { ...link, label },
        // Resolve the actor name; fall back to "System" (never leak the raw id — C10).
        createdBy: resolvers.actorName?.(e.createdBy) ?? "System",
        note: e.note,
        at: e._creationTime,
      };
    });
  return { rows };
}
