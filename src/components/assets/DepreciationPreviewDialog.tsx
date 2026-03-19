/**
 * Depreciation preview dialog.
 *
 * Shows "Catch Up to Now" preview: grouped by asset, missing months,
 * and grand total. Confirm to run batch depreciation.
 */
import { useState } from "react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useDepreciationPreview, useRunDepreciation } from "@/hooks/convex/useFixedAssets";

interface DepreciationPreviewDialogProps {
  open: boolean;
  onClose: () => void;
}

export function DepreciationPreviewDialog({ open, onClose }: DepreciationPreviewDialogProps) {
  const preview = useDepreciationPreview();
  const { mutate: runDepreciation } = useRunDepreciation();
  const [running, setRunning] = useState(false);

  const handleConfirm = async () => {
    setRunning(true);
    try {
      const result = await runDepreciation({});
      if (result) {
        toast.success(
          `Depreciation posted: ${result.assetsProcessed} asset(s), ${result.totalJEs} JE(s), ${formatCurrency(result.totalAmount)}`
        );
      }
      onClose();
    } catch {
      // Error toast handled by hook
    } finally {
      setRunning(false);
    }
  };

  if (preview === undefined) {
    return (
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Catch Up to Now</DialogTitle>
          </DialogHeader>
          <div className="py-8 text-center text-sm text-muted-foreground">
            Loading preview...
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const hasItems = preview.items.length > 0;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Catch Up to Now</DialogTitle>
          <DialogDescription>
            Current month: {preview.currentMonth}
          </DialogDescription>
        </DialogHeader>

        {!hasItems ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            All assets are up to date. No depreciation to post.
          </div>
        ) : (
          <div className="space-y-4">
            {/* Summary */}
            <div className="flex items-center gap-4 p-3 rounded-md bg-muted/50 text-sm">
              <div>
                <span className="font-medium">{preview.totalAssets}</span> asset(s)
              </div>
              <div>
                <span className="font-medium">{preview.totalMonths}</span> month(s)
              </div>
              <div className="ml-auto font-semibold">
                Total: {formatCurrency(preview.grandTotal)}
              </div>
            </div>

            {/* Per-asset breakdown */}
            <div className="space-y-3">
              {preview.items.map((item) => (
                <div key={item.assetId} className="border rounded-md p-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-medium">{item.name}</span>
                      <span className="text-xs text-muted-foreground ml-2">{item.assetNumber}</span>
                    </div>
                    <span className="text-sm font-medium">{formatCurrency(item.totalAmount)}</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {item.missingMonths.map((month) => (
                      <Badge key={month} variant="secondary" className="text-xs">
                        {month}
                      </Badge>
                    ))}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatCurrency(item.monthlyAmount)}/month
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={running}>
            Cancel
          </Button>
          {hasItems && (
            <Button onClick={handleConfirm} disabled={running}>
              {running ? "Posting..." : `Post ${preview.totalMonths} JE(s)`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
