/**
 * Settlement Timeline — Vertical chronological cards showing settlement history.
 *
 * Newest first (per user decision).
 * Pending settlements have Edit, Mark as Paid, and Delete actions.
 * Paid settlements are locked (no actions).
 * Mark as Paid and Delete use ConfirmDialog (irreversible actions).
 */
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { formatCurrency } from "@/lib/utils";
import { formatSettlementDate, fromEpochToDateString, toLocalEpoch } from "./settlementUtils";
import { Pencil, CheckCircle2, Trash2 } from "lucide-react";
import type { SettlementData } from "./SettlementFormDialog";

interface SettlementTimelineProps {
  settlements: SettlementData[];
  onEdit: (settlement: SettlementData) => void;
  onMarkPaid: (settlement: SettlementData, paidAt: number) => void;
  onDelete: (settlement: SettlementData) => void;
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
              </div>
            </div>
          );
        })}
      </div>

      {/* Mark as Paid confirmation — single instance outside map */}
      {targetPaid && (
        <ConfirmDialog
          open={!!confirmPaidId}
          onOpenChange={(v) => !v && setConfirmPaidId(null)}
          title="Mark as Paid"
          description={`Mark this ${formatCurrency(targetPaid.frolliePayment)} settlement as paid? This action cannot be undone.`}
          confirmLabel="Mark as Paid"
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
