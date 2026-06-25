/**
 * CreditLedgerStatement — tabular display of credit ledger rows for one subscription week.
 *
 * Columns: type · signed amount · week-scoped balanceAfter · per-entry link · createdBy · note.
 *
 * CRM design principles:
 *   A1: per-entry links are real links (order → /orders/:id, invoice → /invoices/:id,
 *       week → /crm/customers/:customerId/subscriptions/:subId?weekId=:weekId).
 *   C9: compact table; progressive disclosure via note column.
 *   C10: balanceAfter is week-scoped (resets per week) — label it clearly; do NOT present
 *        as subscription-lifetime balance.
 *   D12: designed empty state.
 *
 * Note: `balanceAfter` comes from the stored field (already computed server-side by
 * buildLedgerStatement). We do NOT re-key the total (CRM C10).
 */

import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types — mirror LedgerStatementRow from convex/crm/helpers/ledgerStatement.ts
// ---------------------------------------------------------------------------

export type LedgerStatementRow = {
  type: "topup" | "drawdown" | "expiry" | "refund" | "adjustment";
  signedAmount: number;
  balanceAfter: number;
  link: { kind: "order" | "invoice" | "week" | null; id: string | null };
  createdBy: string;
  note?: string;
  at: number;
};

// ---------------------------------------------------------------------------
// Type badge colours
// ---------------------------------------------------------------------------

const TYPE_BADGE: Record<LedgerStatementRow["type"], string> = {
  topup: "bg-green-100 text-green-700",
  drawdown: "bg-blue-100 text-blue-700",
  expiry: "bg-gray-100 text-gray-600",
  refund: "bg-amber-100 text-amber-700",
  adjustment: "bg-purple-100 text-purple-700",
};

// ---------------------------------------------------------------------------
// EntryLink — per-row link resolved from row.link
// ---------------------------------------------------------------------------

interface EntryLinkProps {
  link: LedgerStatementRow["link"];
  customerId: string;
  subscriptionId: string;
}

function EntryLink({ link, customerId, subscriptionId }: EntryLinkProps) {
  if (!link.kind || !link.id) {
    return <span className="text-muted-foreground text-xs">—</span>;
  }

  let to = "";
  let label = "";

  if (link.kind === "order") {
    to = `/orders/${link.id}`;
    label = `Order ···${link.id.slice(-6)}`;
  } else if (link.kind === "invoice") {
    to = `/invoices/${link.id}`;
    label = `Invoice ···${link.id.slice(-6)}`;
  } else if (link.kind === "week") {
    // Link back to SubscriptionPage with ?weekId= so the week selector activates
    // the referenced week (rollover source). T17 back-refs also target this URL shape.
    to = `/crm/customers/${customerId}/subscriptions/${subscriptionId}?weekId=${link.id}`;
    label = `Week ···${link.id.slice(-6)}`;
  }

  return (
    <Link
      to={to}
      className="inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground hover:underline"
    >
      {label}
      <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
    </Link>
  );
}

// ---------------------------------------------------------------------------
// CreditLedgerStatement
// ---------------------------------------------------------------------------

interface CreditLedgerStatementProps {
  rows: LedgerStatementRow[];
  customerId: string;
  subscriptionId: string;
}

export function CreditLedgerStatement({
  rows,
  customerId,
  subscriptionId,
}: CreditLedgerStatementProps) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic py-4 text-center">
        No ledger entries for this week.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-border/60 text-left">
            <th className="py-2 pr-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Type
            </th>
            <th className="py-2 pr-3 text-xs font-medium text-muted-foreground uppercase tracking-wider text-right">
              Amount
            </th>
            <th className="py-2 pr-3 text-xs font-medium text-muted-foreground uppercase tracking-wider text-right">
              Balance (week-scoped)
            </th>
            <th className="py-2 pr-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Link
            </th>
            <th className="py-2 pr-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              By
            </th>
            <th className="py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Note
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr
              key={idx}
              className="border-b border-border/30 last:border-0 hover:bg-muted/30 transition-colors"
            >
              {/* Type */}
              <td className="py-2 pr-3">
                <Badge className={`text-xs ${TYPE_BADGE[row.type]}`}>
                  {row.type}
                </Badge>
              </td>

              {/* Signed amount — positive green, negative red */}
              <td className="py-2 pr-3 text-right font-mono text-xs tabular-nums">
                <span
                  className={
                    row.signedAmount >= 0 ? "text-green-700" : "text-red-600"
                  }
                >
                  {row.signedAmount >= 0 ? "+" : ""}
                  {formatCurrency(row.signedAmount)}
                </span>
              </td>

              {/* balanceAfter — week-scoped (do not re-key) */}
              <td className="py-2 pr-3 text-right font-mono text-xs tabular-nums text-foreground">
                {formatCurrency(row.balanceAfter)}
              </td>

              {/* Per-entry link — A1 */}
              <td className="py-2 pr-3">
                <EntryLink
                  link={row.link}
                  customerId={customerId}
                  subscriptionId={subscriptionId}
                />
              </td>

              {/* createdBy */}
              <td className="py-2 pr-3 text-xs text-muted-foreground truncate max-w-[120px]">
                {row.createdBy}
              </td>

              {/* Note */}
              <td className="py-2 text-xs text-muted-foreground">
                {row.note ?? <span className="opacity-40">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Clarifying footnote — CRM C10: balanceAfter resets per week */}
      <p className="mt-2 text-xs text-muted-foreground/70 italic">
        Balance column is week-scoped and resets at the start of each week.
      </p>
    </div>
  );
}
