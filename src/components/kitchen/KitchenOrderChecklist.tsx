import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

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
  disabled: boolean;
}

export function KitchenOrderChecklist({ items, onToggle, disabled }: KitchenOrderChecklistProps) {
  return (
    <div className="space-y-1">
      {items.map((item) => {
        const isDisabled = disabled || (!item.isPacked && !item.canPack);

        const row = (
          <button
            key={item._id}
            onClick={(e) => {
              if (!isDisabled) onToggle(item._id, e);
            }}
            disabled={isDisabled}
            className={cn(
              'w-full min-h-[48px] px-3 py-2 rounded-lg flex items-center gap-3 text-left transition-colors touch-manipulation',
              item.isPacked
                ? 'bg-green-50 dark:bg-green-900/20'
                : 'hover:bg-muted/50 active:bg-muted',
              isDisabled && !item.isPacked && 'opacity-60 cursor-not-allowed'
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
        );

        // Wrap in tooltip if not packable
        if (!item.isPacked && !item.canPack) {
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
  );
}
