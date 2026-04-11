/**
 * Outlet Card — Displays outlet info, running totals, and expandable settlement timeline.
 *
 * Shows type badge, active/archived status, rev share percentage.
 * Running totals in a 2x2 grid.
 * Expand/collapse reveals settlement history and Add Settlement button.
 */
import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, ChevronDown, Plus, Pencil } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useConsignmentSettlements, useMarkConsignmentPaid, useDeleteConsignmentSettlement } from "@/hooks/convex";
import { SettlementTimeline } from "./SettlementTimeline";
import { SettlementFormDialog } from "./SettlementFormDialog";
import { toast } from "sonner";
import { actionToast } from "@/lib/actionToast";
import type { Id } from "../../../convex/_generated/dataModel";
import type { OutletData } from "./OutletFormDialog";
import type { SettlementData } from "./SettlementFormDialog";

export interface OutletWithTotals {
  _id: Id<"consignmentOutlets">;
  name: string;
  revSharePercent: number;
  type: "cafe" | "retail" | "event";
  isActive: boolean;
  address?: string;
  contactName?: string;
  notes?: string;
  totals: {
    totalRevenue: number;
    totalRevShare: number;
    totalFrollie: number;
    outstanding: number;
    paidTotal: number;
    settlementCount: number;
  };
  [key: string]: unknown; // Allow extra Convex doc fields
}

interface OutletCardProps {
  outlet: OutletWithTotals;
  onEdit: (outlet: OutletData) => void;
}

const TYPE_LABELS: Record<string, string> = {
  cafe: "Cafe",
  retail: "Retail",
  event: "Event",
};

export function OutletCard({ outlet, onEdit }: OutletCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [showSettlementDialog, setShowSettlementDialog] = useState(false);
  const [editingSettlement, setEditingSettlement] = useState<SettlementData | undefined>(undefined);

  // Only fetch settlements when expanded
  const { data: settlements, isLoading: settlementsLoading } = useConsignmentSettlements(
    expanded ? outlet._id : null
  );

  const markAsPaid = useMarkConsignmentPaid();
  const deleteSettlement = useDeleteConsignmentSettlement();

  const handleMarkPaid = async (s: SettlementData, paidAt: number) => {
    try {
      await markAsPaid({ settlementId: s._id, paidAt });
      actionToast("Settlement marked as paid");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to mark as paid");
    }
  };

  const handleDelete = async (s: SettlementData) => {
    try {
      await deleteSettlement({ settlementId: s._id });
      actionToast("Settlement deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete settlement");
    }
  };

  const handleEditSettlement = (s: SettlementData) => {
    setEditingSettlement(s);
    setShowSettlementDialog(true);
  };

  const handleCloseSettlementDialog = () => {
    setShowSettlementDialog(false);
    setEditingSettlement(undefined);
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-base">{outlet.name}</h3>
              <Badge variant="outline">{TYPE_LABELS[outlet.type] ?? outlet.type}</Badge>
              {!outlet.isActive && (
                <Badge className="bg-muted text-muted-foreground hover:bg-muted">
                  Archived
                </Badge>
              )}
            </div>
            <Button variant="ghost" size="sm" onClick={() => onEdit(outlet)}>
              <Pencil className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            {outlet.revSharePercent}% rev share
          </p>
        </CardHeader>

        <CardContent className="space-y-3">
          {/* Running totals grid */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="text-xs text-muted-foreground">Total Revenue</span>
              <p className="text-sm font-medium">{formatCurrency(outlet.totals.totalRevenue)}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Rev Share Paid</span>
              <p className="text-sm font-medium">{formatCurrency(outlet.totals.totalRevShare)}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Frollie Payment</span>
              <p className="text-sm font-medium">{formatCurrency(outlet.totals.totalFrollie)}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Outstanding</span>
              <p
                className={`text-sm font-medium ${
                  outlet.totals.outstanding > 0
                    ? "text-[var(--color-status-warning)]"
                    : ""
                }`}
              >
                {formatCurrency(outlet.totals.outstanding)}
              </p>
            </div>
          </div>

          {/* Expand/Collapse */}
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={() => setExpanded(!expanded)}
          >
            <ChevronDown
              className={`h-4 w-4 mr-1 transition-transform ${
                expanded ? "rotate-180" : ""
              }`}
            />
            {expanded
              ? "Hide Settlements"
              : `Show Settlements (${outlet.totals.settlementCount})`}
          </Button>

          {/* Expanded: Settlement timeline + Add button */}
          {expanded && (
            <div className="pt-2 space-y-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditingSettlement(undefined);
                  setShowSettlementDialog(true);
                }}
              >
                <Plus className="h-3 w-3 mr-1" />
                Add Settlement
              </Button>

              {settlementsLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <SettlementTimeline
                  settlements={(settlements ?? []) as SettlementData[]}
                  onEdit={handleEditSettlement}
                  onMarkPaid={handleMarkPaid}
                  onDelete={handleDelete}
                />
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Settlement form dialog */}
      <SettlementFormDialog
        open={showSettlementDialog}
        onClose={handleCloseSettlementDialog}
        outlet={outlet}
        settlement={editingSettlement}
      />
    </>
  );
}
