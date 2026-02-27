/**
 * PushConfirmDialog - Confirmation dialog showing diff summary before pushing menu changes to GrabFood.
 * Shows price changes, availability changes, and new items.
 */
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";

interface PendingChanges {
  priceChanges: Array<{
    name: string;
    oldPrice: number;
    newPrice: number;
    grabfoodItemId: string;
  }>;
  availabilityChanges: Array<{
    name: string;
    newStatus: "AVAILABLE" | "UNAVAILABLE";
    grabfoodItemId: string;
  }>;
  newItems: Array<{
    name: string;
    price: number;
  }>;
  totalChanges: number;
}

interface PushConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  changes: PendingChanges;
  onConfirm: () => void;
  isPushing: boolean;
}

const MERCHANT_ID = "6-C7XYAECCTNKXJ6";

export function PushConfirmDialog({
  open,
  onOpenChange,
  changes,
  onConfirm,
  isPushing,
}: PushConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Push Changes to GrabFood</DialogTitle>
          <DialogDescription>
            Review the changes before pushing to GrabFood.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Merchant ID */}
          <div className="text-xs text-muted-foreground">
            Merchant: <span className="font-mono">{MERCHANT_ID}</span>
          </div>

          {/* Price Changes */}
          {changes.priceChanges.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-2">
                Price Changes ({changes.priceChanges.length})
              </h4>
              <div className="space-y-1">
                {changes.priceChanges.map((c, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between text-sm bg-muted rounded px-2 py-1.5"
                  >
                    <span className="truncate mr-2">{c.name}</span>
                    <span className="flex items-center gap-1 shrink-0">
                      <span className="text-muted-foreground line-through">
                        {formatCurrency(c.oldPrice)}
                      </span>
                      <span className="text-[var(--color-grabfood)] font-medium">
                        {formatCurrency(c.newPrice)}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Availability Changes */}
          {changes.availabilityChanges.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-2">
                Availability Changes ({changes.availabilityChanges.length})
              </h4>
              <div className="space-y-1">
                {changes.availabilityChanges.map((c, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between text-sm bg-muted rounded px-2 py-1.5"
                  >
                    <span className="truncate mr-2">{c.name}</span>
                    <Badge
                      variant={c.newStatus === "AVAILABLE" ? "default" : "secondary"}
                      className={
                        c.newStatus === "AVAILABLE"
                          ? "bg-[var(--color-status-success)] text-white"
                          : ""
                      }
                    >
                      {c.newStatus === "AVAILABLE" ? "Available" : "Unavailable"}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* New Items */}
          {changes.newItems.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-2">
                New Items ({changes.newItems.length})
              </h4>
              <div className="space-y-1">
                {changes.newItems.map((c, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between text-sm bg-muted rounded px-2 py-1.5"
                  >
                    <span className="truncate mr-2">{c.name}</span>
                    <span className="text-[var(--color-grabfood)] font-medium shrink-0">
                      {formatCurrency(c.price)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Total */}
          <div className="text-sm font-medium text-center">
            Total: {changes.totalChanges} change{changes.totalChanges !== 1 ? "s" : ""}
          </div>

          {/* Warning */}
          <p className="text-xs text-muted-foreground text-center">
            Changes will be pushed to GrabFood. This triggers a menu re-sync.
          </p>

          {/* Actions */}
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={isPushing}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={onConfirm}
              disabled={isPushing}
              className="bg-[var(--color-grabfood)] hover:bg-[var(--color-grabfood-accent)] text-white"
            >
              {isPushing ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Pushing...
                </>
              ) : (
                "Push to GrabFood"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
