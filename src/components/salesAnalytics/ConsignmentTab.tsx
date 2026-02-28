/**
 * Consignment Tab — Main entry point for consignment management in Sales Analytics.
 *
 * Features:
 * - Global summary banner (total revenue, outstanding, paid)
 * - Controls: Add Outlet button, Show Archived toggle
 * - Outlet grid with expand/collapse for settlement history
 * - Empty state when no outlets exist
 *
 * CRITICAL: All hooks called before any conditional returns (React hooks order rule).
 */
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Loader2, Store, Plus } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import {
  useConsignmentOutlets,
  useConsignmentGlobalSummary,
} from "@/hooks/convex";
import { OutletCard } from "./OutletCard";
import { OutletFormDialog } from "./OutletFormDialog";
import { EmptyState } from "@/components/shared/EmptyState";
import type { OutletData } from "./OutletFormDialog";

export function ConsignmentTab() {
  // State — all declared before any conditional returns
  const [includeArchived, setIncludeArchived] = useState(false);
  const [showOutletDialog, setShowOutletDialog] = useState(false);
  const [editingOutlet, setEditingOutlet] = useState<OutletData | undefined>(undefined);

  // Query hooks — all called before conditional returns
  const { data: outlets, isLoading: outletsLoading } = useConsignmentOutlets(includeArchived);
  const { data: summary, isLoading: summaryLoading } = useConsignmentGlobalSummary();

  const handleEditOutlet = (outlet: OutletData) => {
    setEditingOutlet(outlet);
    setShowOutletDialog(true);
  };

  const handleCloseOutletDialog = () => {
    setShowOutletDialog(false);
    setEditingOutlet(undefined);
  };

  const isLoading = outletsLoading || summaryLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Global summary banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Total Revenue</p>
            <p className="text-2xl font-bold">
              {formatCurrency(summary?.totalRevenue ?? 0)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Outstanding</p>
            <p className="text-2xl font-bold text-[var(--color-status-warning)]">
              {formatCurrency(summary?.totalOutstanding ?? 0)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Paid</p>
            <p className="text-2xl font-bold text-[var(--color-status-success)]">
              {formatCurrency(summary?.totalPaid ?? 0)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Controls bar */}
      <div className="flex items-center justify-between">
        <Button onClick={() => {
          setEditingOutlet(undefined);
          setShowOutletDialog(true);
        }}>
          <Plus className="h-4 w-4 mr-2" />
          Add Outlet
        </Button>

        <div className="flex items-center gap-2">
          <Switch
            id="show-archived"
            checked={includeArchived}
            onCheckedChange={setIncludeArchived}
          />
          <Label htmlFor="show-archived" className="text-sm">
            Show Archived
          </Label>
        </div>
      </div>

      {/* Outlet grid or empty state */}
      {outlets && outlets.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {outlets.map((outlet) => (
            <OutletCard
              key={outlet._id}
              outlet={outlet as any}
              onEdit={handleEditOutlet}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Store}
          title="No consignment outlets"
          description="Add your first consignment outlet to start tracking revenue share settlements."
          action={{
            label: "Add Outlet",
            onClick: () => {
              setEditingOutlet(undefined);
              setShowOutletDialog(true);
            },
          }}
        />
      )}

      {/* Outlet form dialog */}
      <OutletFormDialog
        open={showOutletDialog}
        onClose={handleCloseOutletDialog}
        outlet={editingOutlet}
      />
    </div>
  );
}
