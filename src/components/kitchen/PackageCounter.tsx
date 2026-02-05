import { Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface PackageCounterProps {
  productName: string;
  total: number;
  filled: number;
  ballsPerPackage: number;
  boxType: string;
  onIncrement: () => void;
  onDecrement: () => void;
  disabled?: boolean;
}

export function PackageCounter({
  productName,
  total,
  filled,
  ballsPerPackage,
  boxType,
  onIncrement,
  onDecrement,
  disabled = false,
}: PackageCounterProps) {
  const isComplete = filled === total;
  const remaining = total - filled;

  return (
    <div
      className={cn(
        'flex items-center justify-between p-2 rounded-lg transition-colors',
        isComplete ? 'bg-emerald-900/30' : 'bg-slate-600/30'
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm text-white truncate">{productName}</span>
          <span className="text-xs text-slate-400">({boxType})</span>
        </div>
        <div className="text-xs text-slate-400 mt-0.5">
          {ballsPerPackage} balls/pkg
        </div>
      </div>

      {/* Counter Controls */}
      <div className="flex items-center gap-2">
        {/* Decrement Button */}
        <Button
          size="sm"
          variant="outline"
          onClick={onDecrement}
          disabled={disabled || filled === 0}
          className="h-8 w-8 p-0 border-slate-600 hover:bg-slate-700"
        >
          <Minus className="h-4 w-4" />
        </Button>

        {/* Counter Display */}
        <div className="text-center min-w-[60px]">
          <div className={cn(
            'font-bold text-lg',
            isComplete ? 'text-emerald-400' : 'text-white'
          )}>
            {filled}/{total}
          </div>
          {!isComplete && (
            <div className="text-xs text-slate-400">
              {remaining} left
            </div>
          )}
        </div>

        {/* Increment Button */}
        <Button
          size="sm"
          variant="outline"
          onClick={onIncrement}
          disabled={disabled || filled >= total}
          className={cn(
            'h-8 w-8 p-0',
            isComplete
              ? 'border-emerald-600 bg-emerald-900/30'
              : 'border-amber-600 bg-amber-900/30 hover:bg-amber-800'
          )}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
