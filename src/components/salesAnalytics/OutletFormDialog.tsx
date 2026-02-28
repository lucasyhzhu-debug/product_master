/**
 * Outlet Form Dialog — Create/Edit consignment outlet.
 *
 * Fields: name (required), revSharePercent (required, 0-100), type (required),
 * address (optional), contactName (optional), notes (optional).
 *
 * Uses actionToast for success feedback, toast.error for failures.
 */
import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { toast } from "sonner";
import { actionToast } from "@/lib/actionToast";
import {
  useCreateConsignmentOutlet,
  useUpdateConsignmentOutlet,
} from "@/hooks/convex";
import type { Id } from "../../../convex/_generated/dataModel";

type OutletType = "cafe" | "retail" | "event";

export interface OutletData {
  _id: Id<"consignmentOutlets">;
  name: string;
  revSharePercent: number;
  type: OutletType;
  address?: string;
  contactName?: string;
  notes?: string;
  isActive: boolean;
}

interface OutletFormDialogProps {
  open: boolean;
  onClose: () => void;
  outlet?: OutletData;
}

export function OutletFormDialog({ open, onClose, outlet }: OutletFormDialogProps) {
  const createOutlet = useCreateConsignmentOutlet();
  const updateOutlet = useUpdateConsignmentOutlet();

  const [name, setName] = useState("");
  const [revSharePercent, setRevSharePercent] = useState("");
  const [type, setType] = useState<OutletType>("cafe");
  const [address, setAddress] = useState("");
  const [contactName, setContactName] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isEdit = !!outlet;

  // Pre-fill for edit mode
  useEffect(() => {
    if (outlet) {
      setName(outlet.name);
      setRevSharePercent(String(outlet.revSharePercent));
      setType(outlet.type);
      setAddress(outlet.address ?? "");
      setContactName(outlet.contactName ?? "");
      setNotes(outlet.notes ?? "");
    } else {
      setName("");
      setRevSharePercent("");
      setType("cafe");
      setAddress("");
      setContactName("");
      setNotes("");
    }
  }, [outlet, open]);

  const handleSubmit = async (e: React.MouseEvent) => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }

    const pct = parseFloat(revSharePercent);
    if (isNaN(pct) || pct < 0 || pct > 100) {
      toast.error("Rev share must be between 0 and 100");
      return;
    }

    setSubmitting(true);
    try {
      if (isEdit && outlet) {
        await updateOutlet({
          outletId: outlet._id,
          name: name.trim(),
          revSharePercent: pct,
          type,
          address: address.trim() || undefined,
          contactName: contactName.trim() || undefined,
          notes: notes.trim() || undefined,
        });
        actionToast("Outlet updated", e);
      } else {
        await createOutlet({
          name: name.trim(),
          revSharePercent: pct,
          type,
          address: address.trim() || undefined,
          contactName: contactName.trim() || undefined,
          notes: notes.trim() || undefined,
        });
        actionToast("Outlet created", e);
      }
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save outlet");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Outlet" : "Add Outlet"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="outlet-name">Name *</Label>
            <Input
              id="outlet-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Legato Goldfinch"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="outlet-revshare">Rev Share % *</Label>
            <Input
              id="outlet-revshare"
              type="number"
              min={0}
              max={100}
              step={0.1}
              value={revSharePercent}
              onChange={(e) => setRevSharePercent(e.target.value)}
              placeholder="e.g., 10"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="outlet-type">Type *</Label>
            <Select value={type} onValueChange={(v) => setType(v as OutletType)}>
              <SelectTrigger id="outlet-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cafe">Cafe</SelectItem>
                <SelectItem value="retail">Retail</SelectItem>
                <SelectItem value="event">Event</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="outlet-address">Address</Label>
            <Input
              id="outlet-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Optional"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="outlet-contact">Contact Name</Label>
            <Input
              id="outlet-contact"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder="Optional"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="outlet-notes">Notes</Label>
            <Textarea
              id="outlet-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional"
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Saving..." : isEdit ? "Update" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
