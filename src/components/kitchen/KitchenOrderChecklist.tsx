import { useState } from 'react';
import { Check, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';

export interface ChecklistItem {
  _id: string;
  productName: string;
  productVariant?: string;
  quantity: number;
  isPacked: boolean;
  canPack: boolean;
}

interface KitchenOrderChecklistProps {
  items: ChecklistItem[];
  onToggle: (orderItemId: string, event?: React.MouseEvent) => void;
  onOverride?: (orderItemId: string, reason: string) => void;
  canOverride?: boolean;
  disabled: boolean;
}

export function KitchenOrderChecklist({ items, onToggle, onOverride, canOverride, disabled }: KitchenOrderChecklistProps) {
  const [overrideItemId, setOverrideItemId] = useState<string | null>(null);
  const [overrideReason, setOverrideReason] = useState('');

  const overrideItem = overrideItemId ? items.find((i) => i._id === overrideItemId) : null;

  return (
    <>
      <div className="space-y-1">
        {items.map((item) => {
          const isDisabled = disabled || (!item.isPacked && !item.canPack && !canOverride);
          const needsOverride = !item.isPacked && !item.canPack;

          const row = (
            <div key={item._id} className="flex items-center gap-1">
              <button
                onClick={(e) => {
                  if (needsOverride && canOverride && onOverride) {
                    setOverrideItemId(item._id);
                    setOverrideReason('');
                  } else if (!isDisabled) {
                    onToggle(item._id, e);
                  }
                }}
                disabled={isDisabled && !needsOverride}
                className={cn(
                  'flex-1 min-h-[48px] px-3 py-2 rounded-lg flex items-center gap-3 text-left transition-colors touch-manipulation',
                  item.isPacked
                    ? 'bg-green-50 dark:bg-green-900/20'
                    : 'hover:bg-muted/50 active:bg-muted',
                  isDisabled && !item.isPacked && !needsOverride && 'opacity-60 cursor-not-allowed'
                )}
              >
                {/* Checkbox circle */}
                <div
                  className={cn(
                    'flex-shrink-0 w-6 h-6 rounded-full transition-all flex items-center justify-center',
                    item.isPacked
                      ? 'bg-green-600 dark:bg-green-500'
                      : 'border-2 border-border'
                  )}
                >
                  {item.isPacked && <Check className="w-4 h-4 text-white" />}
                </div>

                {/* Product info */}
                <div className="flex-1 min-w-0">
                  <p
                    className={cn(
                      'text-base font-medium',
                      item.isPacked && 'line-through text-muted-foreground'
                    )}
                  >
                    {item.quantity}x {item.productName}
                    {item.productVariant && (
                      <span className="text-sm text-muted-foreground ml-1">
                        ({item.productVariant})
                      </span>
                    )}
                  </p>
                </div>
              </button>

              {/* Override button for managers when item cannot be packed */}
              {needsOverride && canOverride && onOverride && (
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-shrink-0 text-amber-600 border-amber-300 hover:bg-amber-50 dark:text-amber-400 dark:border-amber-700 dark:hover:bg-amber-900/20"
                  onClick={() => {
                    setOverrideItemId(item._id);
                    setOverrideReason('');
                  }}
                >
                  <ShieldAlert className="w-3.5 h-3.5 mr-1" />
                  Override
                </Button>
              )}
            </div>
          );

          // Wrap in tooltip if not packable and not overridable
          if (needsOverride && !canOverride) {
            return (
              <TooltipProvider key={item._id}>
                <Tooltip>
                  <TooltipTrigger asChild>{row}</TooltipTrigger>
                  <TooltipContent>
                    <p>Not enough stickered</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            );
          }

          return row;
        })}
      </div>

      {/* Override confirmation dialog */}
      <ConfirmDialog
        open={overrideItemId !== null}
        onOpenChange={(open) => {
          if (!open) setOverrideItemId(null);
        }}
        title="Override Stock Shortage"
        description={
          overrideItem
            ? `Override stock shortage for ${overrideItem.quantity}x ${overrideItem.productName}? This will force-pack the item despite insufficient stickered pool.`
            : ''
        }
        confirmLabel="Override & Pack"
        variant="destructive"
        onConfirm={() => {
          if (overrideItemId && overrideReason.trim() && onOverride) {
            onOverride(overrideItemId, overrideReason.trim());
            setOverrideItemId(null);
          }
        }}
        disabled={!overrideReason.trim()}
      >
        <div className="space-y-2 mt-2">
          <label htmlFor="override-reason" className="text-sm font-medium text-foreground">
            Reason (required)
          </label>
          <Input
            id="override-reason"
            placeholder="e.g., Customer waiting, will restock later"
            value={overrideReason}
            onChange={(e) => setOverrideReason(e.target.value)}
            autoFocus
          />
        </div>
      </ConfirmDialog>
    </>
  );
}
