/**
 * Settlement Timeline — Vertical chronological cards showing settlement history.
 *
 * Newest first (per user decision).
 * Pending settlements have Edit, Mark as Paid, and Delete actions.
 * Paid settlements are locked (no actions).
 * Mark as Paid and Delete use ConfirmDialog (irreversible actions).
 *
 * Phase 74.5.2 Plan 07 (D74.5.2-L7): per-settlement expandable "Products sold"
 * subsection via the new `SettlementItemsBreakdown` sub-component. Lazy-loads
 * (`"skip"` pattern) — the getSettlementItems query only fires when the user
 * expands. Empty-state message covers pre-74.5.1 settlements (no linkedRevenueId).
 */
import { useState } from "react";
import { useQuery } from "convex/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { formatCurrency } from "@/lib/utils";
import { formatSettlementDate, fromEpochToDateString, toLocalEpoch } from "./settlementUtils";
import { Pencil, CheckCircle2, Trash2, ChevronDown } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import type { SettlementData } from "./SettlementFormDialog";

interface SettlementTimelineProps {
  settlements: SettlementData[];
  onEdit: (settlement: SettlementData) => void;
  onMarkPaid: (settlement: SettlementData, paidAt: number) => void;
  onDelete: (settlement: SettlementData) => void;
}

/**
 * Per-settlement expandable product breakdown. Returns the items emitted for
 * this settlement's `linkedRevenueId` via the Plan 07 `getSettlementItems`
 * query, enriched with the linked menuProduct.
 *
 * Lazy-loads via the `"skip"` pattern — the query only fires after the user
 * expands the row. Settlements without `linkedRevenueId` (pre-74.5.1) return
 * `[]` and render the empty-state message.
 *
 * Renders nothing if the user has no auth token (shouldn't happen inside
 * ProtectedRoute, but defensive).
 */
type SettlementItem = Doc<"externalRevenueItems"> & {
  menuProduct: Doc<"menuProducts"> | null;
};

function SettlementItemsBreakdown({
  settlementId,
}: {
  settlementId: Id<"consignmentSettlements">;
}) {
  const { user } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const token = user?.token;

  // Use "skip" until expanded — no network fetch on collapsed rows.
  const items = useQuery(
    api.consignment.queries.getSettlementItems,
    expanded && token ? { settlementId, token } : "skip",
  ) as SettlementItem[] | undefined;

  if (!token) return null;

  const isEmpty = items !== undefined && items.length === 0;

  return (
    <div className="mt-2">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setExpanded(!expanded)}
        className="text-xs"
      >
        <ChevronDown
          className={`h-3 w-3 mr-1 transition-transform ${
            expanded ? "rotate-180" : ""
          }`}
        />
        {expanded ? "Hide products" : "Show products sold"}
      </Button>
      {expanded && (
        <div className="mt-2 pl-4 border-l">
          {items === undefined ? (
            <p className="text-xs text-muted-foreground">Loading…</p>
          ) : isEmpty ? (
            <p className="text-xs text-muted-foreground">
              No per-product breakdown available for this settlement.
            </p>
          ) : (
            <table className="text-xs w-full">
              <thead className="text-left">
                <tr>
                  <th className="py-1 font-medium">Product</th>
                  <th className="py-1 text-right font-medium">Qty</th>
                  <th className="py-1 text-right font-medium">Unit price</th>
                  <th className="py-1 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item._id}>
                    <td className="py-1">
                      {item.menuProduct?.name ?? item.productName}
                    </td>
                    <td className="py-1 text-right tabular-nums">
                      {item.quantity}
                    </td>
                    <td className="py-1 text-right tabular-nums">
                      {formatCurrency(item.unitPrice)}
                    </td>
                    <td className="py-1 text-right tabular-nums">
                      {formatCurrency(item.totalPrice)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t">
                <tr>
                  <td className="py-1 font-medium" colSpan={2}>
                    {items.length} product{items.length !== 1 ? "s" : ""}
                  </td>
                  <td className="py-1 text-right text-muted-foreground">
                    Subtotal:
                  </td>
                  <td className="py-1 text-right font-medium tabular-nums">
                    {formatCurrency(
                      items.reduce((s, i) => s + i.totalPrice, 0),
                    )}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

export function SettlementTimeline({
  settlements,
  onEdit,
  onMarkPaid,
  onDelete,
}: SettlementTimelineProps) {
  const [confirmPaidId, setConfirmPaidId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [paidDate, setPaidDate] = useState<string>("");

  if (settlements.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        No settlements yet. Add a settlement to get started.
      </p>
    );
  }

  // Find target settlements for dialogs (lifted out of .map())
  const targetPaid = settlements.find((s) => s._id === confirmPaidId);
  const targetDelete = settlements.find((s) => s._id === confirmDeleteId);

  return (
    <div className="relative pl-6">
      {/* Vertical timeline line */}
      <div className="absolute left-2 top-2 bottom-2 w-0.5 bg-border" />

      <div className="space-y-4">
        {settlements.map((s) => {
          const isPending = s.status === "pending";

          return (
            <div key={s._id} className="relative">
              {/* Timeline dot */}
              <div
                className={`absolute -left-4 top-3 w-3 h-3 rounded-full border-2 border-background ${
                  isPending
                    ? "bg-[var(--color-status-warning)]"
                    : "bg-[var(--color-status-success)]"
                }`}
              />

              {/* Settlement card */}
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                {/* Period + Status */}
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-sm font-medium">
                    {formatSettlementDate(s.periodStart)} — {formatSettlementDate(s.periodEnd)}
                  </h4>
                  {isPending ? (
                    <Badge className="bg-[var(--color-status-warning-bg)] text-[var(--color-status-warning)] hover:bg-[var(--color-status-warning-bg)]">
                      Pending
                    </Badge>
                  ) : (
                    <Badge className="bg-[var(--color-status-success-bg)] text-[var(--color-status-success)] hover:bg-[var(--color-status-success-bg)]">
                      Paid{s.paidAt ? ` ${formatSettlementDate(s.paidAt)}` : ""}
                    </Badge>
                  )}
                </div>

                {/* Financial details */}
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Revenue</span>
                    <p className="font-medium">{formatCurrency(s.totalRevenue)}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">
                      Rev Share ({s.revSharePercent}%)
                    </span>
                    <p className="font-medium">{formatCurrency(s.revShareAmount)}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Frollie</span>
                    <p className="font-medium text-[var(--color-status-success)]">
                      {formatCurrency(s.frolliePayment)}
                    </p>
                  </div>
                </div>

                {/* Notes */}
                {s.notes && (
                  <p className="text-xs text-muted-foreground italic">{s.notes}</p>
                )}

                {/* Actions — only for pending settlements */}
                {isPending && (
                  <div className="flex gap-2 pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onEdit(s)}
                    >
                      <Pencil className="h-3 w-3 mr-1" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setPaidDate(fromEpochToDateString(Date.now()));
                        setConfirmPaidId(s._id);
                      }}
                    >
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Mark as Paid
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setConfirmDeleteId(s._id)}
                      className="text-[var(--color-status-error)]"
                    >
                      <Trash2 className="h-3 w-3 mr-1" />
                      Delete
                    </Button>
                  </div>
                )}

                {/* Phase 74.5.2 Plan 07: per-settlement per-product breakdown. */}
                <SettlementItemsBreakdown settlementId={s._id} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Mark as Paid confirmation — single instance outside map */}
      {targetPaid && (
        <ConfirmDialog
          open={!!confirmPaidId}
          onOpenChange={(v) => {
            if (!v) {
              setConfirmPaidId(null);
              setPaidDate("");
            }
          }}
          title="Mark as Paid"
          description={`Mark this ${formatCurrency(targetPaid.frolliePayment)} settlement as paid? This action cannot be undone.`}
          confirmLabel="Mark as Paid"
          disabled={!paidDate}
          onConfirm={() => {
            onMarkPaid(targetPaid, toLocalEpoch(paidDate));
            setConfirmPaidId(null);
          }}
        >
          <div className="space-y-2 py-2">
            <Label htmlFor="paid-date">Paid Date</Label>
            <Input
              id="paid-date"
              type="date"
              value={paidDate}
              max={fromEpochToDateString(Date.now())}
              onChange={(e) => setPaidDate(e.target.value)}
            />
          </div>
        </ConfirmDialog>
      )}

      {/* Delete confirmation — single instance outside map */}
      {targetDelete && (
        <ConfirmDialog
          open={!!confirmDeleteId}
          onOpenChange={(v) => !v && setConfirmDeleteId(null)}
          title="Delete Settlement"
          description={`Delete this ${formatCurrency(targetDelete.totalRevenue)} settlement? This will also remove the linked revenue record.`}
          confirmLabel="Delete"
          variant="destructive"
          onConfirm={() => {
            onDelete(targetDelete);
            setConfirmDeleteId(null);
          }}
        />
      )}
    </div>
  );
}
