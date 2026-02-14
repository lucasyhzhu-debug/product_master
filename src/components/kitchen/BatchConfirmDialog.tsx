import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/utils';

interface BatchConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  action: 'sticker' | 'box';
  summary: {
    orderCount: number;
    packageCount: number;
    consumables: Array<{
      name: string;
      quantity: number;
      available: number;
      isLow: boolean;
      fifoBreakdown?: Array<{
        batchNumber: string;
        quantity: number;
        unitCost: number;
      }>;
    }>;
    totalCOGS: number;
  };
  onConfirm: () => void;
  loading?: boolean;
}

export function BatchConfirmDialog({
  open,
  onOpenChange,
  action,
  summary,
  onConfirm,
  loading = false,
}: BatchConfirmDialogProps) {
  const hasLowStock = summary.consumables.some((c) => c.isLow);
  const actionLabel = action === 'sticker' ? 'Apply Stickers' : 'Box Orders';
  const actionVerb = action === 'sticker' ? 'Stickering' : 'Boxing';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Confirm Batch {actionLabel}</DialogTitle>
          <DialogDescription>
            {actionVerb} {summary.orderCount} order{summary.orderCount > 1 ? 's' : ''} ({summary.packageCount}{' '}
            package{summary.packageCount > 1 ? 's' : ''})
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Materials to Consume */}
          <div>
            <h4 className="text-sm font-semibold mb-2">Materials to Consume</h4>
            <div className="space-y-2">
              {summary.consumables.map((item, idx) => (
                <div key={idx} className="space-y-2">
                  <div className="flex items-center justify-between p-2 rounded-lg bg-muted">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{item.name}</span>
                      {item.isLow && (
                        <Badge variant="outline" className="text-[var(--color-kitchen-warning)] border-[var(--color-kitchen-warning)]">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          Low Stock
                        </Badge>
                      )}
                    </div>
                    <div className="text-right text-sm">
                      <div className="font-bold">{item.quantity}</div>
                      <div className="text-xs text-muted-foreground">{item.available} available</div>
                    </div>
                  </div>

                  {/* Show FIFO breakdown if low stock */}
                  {item.isLow && item.fifoBreakdown && item.fifoBreakdown.length > 0 && (
                    <div className="ml-4 pl-3 border-l-2 border-[var(--color-kitchen-warning)] space-y-1">
                      <p className="text-xs text-muted-foreground font-semibold">FIFO Consumption:</p>
                      {item.fifoBreakdown.map((batch, bIdx) => (
                        <div key={bIdx} className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">
                            Batch {batch.batchNumber}: {batch.quantity}×
                          </span>
                          <span className="font-mono">{formatCurrency(batch.unitCost)}/unit</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Total COGS */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted border border-border">
            <span className="font-semibold">Total COGS Impact</span>
            <span className="text-lg font-bold">{formatCurrency(summary.totalCOGS)}</span>
          </div>

          {/* Warning if low stock */}
          {hasLowStock && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-[var(--color-kitchen-warning-bg)] border border-[var(--color-kitchen-warning)]/20">
              <AlertTriangle className="h-5 w-5 text-[var(--color-kitchen-warning)] flex-shrink-0 mt-0.5" />
              <div className="text-sm text-foreground">
                <p className="font-semibold">Low Stock Warning</p>
                <p className="text-xs mt-1">
                  Some materials are running low. Consider reordering before the next batch.
                </p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={loading}>
            {loading ? 'Processing...' : `Confirm ${actionLabel}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
