/**
 * OutletDialog - Add/edit GrabFood outlet dialog.
 * Extracted from GrabFoodManager.tsx for maintainability.
 */

import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

import { useProtectedMutation } from "@/hooks/convex/useProtectedMutation";
import { api } from "../../../convex/_generated/api";

export interface OutletDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingOutlet: { name: string; merchantId: string } | null;
}

export function OutletDialog({ open, onOpenChange, editingOutlet }: OutletDialogProps) {
  const [name, setName] = useState("");
  const [merchantId, setMerchantId] = useState("");
  const [saving, setSaving] = useState(false);

  const upsertOutlet = useProtectedMutation(
    api.externalData.mutations.upsertOutlet
  );

  // Populate fields when editing
  useEffect(() => {
    if (open) {
      setName(editingOutlet?.name ?? "");
      setMerchantId(editingOutlet?.merchantId ?? "");
    }
  }, [open, editingOutlet]);

  const handleSave = async () => {
    if (!name.trim() || !merchantId.trim()) {
      toast.error("Outlet name and MerchantID are required");
      return;
    }

    setSaving(true);
    try {
      await upsertOutlet({
        source: "grabfood" as any,
        externalId: merchantId.trim(),
        name: name.trim(),
        isActive: true,
      });
      toast.success(
        editingOutlet ? "Outlet updated" : "Outlet added"
      );
      onOpenChange(false);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to save outlet"
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {editingOutlet ? "Edit Outlet" : "Add GrabFood Outlet"}
          </DialogTitle>
          <DialogDescription>
            {editingOutlet
              ? "Update the outlet name or MerchantID."
              : "Register a new GrabFood outlet. The MerchantID can be found in the GrabFood Merchant Portal."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor="outlet-name">Outlet Name</Label>
            <Input
              id="outlet-name"
              placeholder="e.g. Crystal, Goldfinch, Tamtem"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={saving}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="outlet-merchant-id">MerchantID</Label>
            <Input
              id="outlet-merchant-id"
              placeholder="e.g. GFSBPOS-254-353"
              value={merchantId}
              onChange={(e) => setMerchantId(e.target.value)}
              disabled={saving}
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              Find this in GrabFood Merchant Portal or from live order webhooks.
            </p>
          </div>

          <Button
            onClick={handleSave}
            disabled={saving || !name.trim() || !merchantId.trim()}
            className="w-full min-h-[44px]"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
                Saving...
              </>
            ) : editingOutlet ? (
              "Update Outlet"
            ) : (
              "Add Outlet"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
