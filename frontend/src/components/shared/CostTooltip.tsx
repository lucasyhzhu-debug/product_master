import { Info } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { formatCurrency } from '@/lib/utils';

interface CostBreakdownItem {
  label: string;
  cost: number | null;
}

interface CostTooltipProps {
  items: CostBreakdownItem[];
  total?: number | null;
}

export function CostTooltip({ items, total }: CostTooltipProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Info className="h-4 w-4 text-muted-foreground cursor-help" />
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <div className="space-y-1 text-xs">
            {items.map((item, index) => (
              <div key={index} className="flex justify-between gap-4">
                <span>{item.label}:</span>
                <span className="font-medium">{formatCurrency(item.cost)}</span>
              </div>
            ))}
            {total !== undefined && (
              <>
                <div className="border-t border-border my-1" />
                <div className="flex justify-between gap-4 font-medium">
                  <span>Total:</span>
                  <span>{formatCurrency(total)}</span>
                </div>
              </>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
