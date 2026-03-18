/**
 * Void depreciation month dialog.
 *
 * Lets admin select a month to void all depreciation JEs from.
 * Shows count of JEs that will be reversed.
 */
import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useVoidDepreciationMonth } from "@/hooks/convex/useFixedAssets";

interface VoidDepreciationDialogProps {
  open: boolean;
  onClose: () => void;
}

export function VoidDepreciationDialog({ open, onClose }: VoidDepreciationDialogProps) {
  const { mutate: voidMonth } = useVoidDepreciationMonth();
  const [selectedMonth, setSelectedMonth] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Generate recent months for selection (last 12 months)
  const months = useMemo(() => {
    const result: string[] = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      result.push(`${yyyy}-${mm}`);
    }
    return result;
  }, []);

  const handleConfirm = async () => {
    if (!selectedMonth) return;
    setSubmitting(true);
    try {
      await voidMonth({ month: selectedMonth });
      setSelectedMonth("");
      onClose();
    } catch {
      // Error toast handled by hook
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Void Depreciation Month</DialogTitle>
          <DialogDescription>
            Reverse all depreciation JEs for a specific month.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Month to Void</Label>
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger>
                <SelectValue placeholder="Select month" />
              </SelectTrigger>
              <SelectContent>
                {months.map((month) => (
                  <SelectItem key={month} value={month}>
                    {month}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedMonth && (
            <p className="text-sm text-muted-foreground">
              This will create reversing journal entries for all depreciation JEs
              posted in {selectedMonth}.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={submitting || !selectedMonth}
          >
            {submitting ? "Voiding..." : "Void Month"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
