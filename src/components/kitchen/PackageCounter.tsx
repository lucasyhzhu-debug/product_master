import { Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PackageCounterProps {
  productName: string;
  total: number;
  filled: number;
  ballsPerPackage: number;
  onIncrement: () => void;
  onDecrement: () => void;
  disabled?: boolean;
}

export function PackageCounter({
  productName,
  total,
  filled,
  ballsPerPackage,
  onIncrement,
  onDecrement,
  disabled = false,
}: PackageCounterProps) {
  const isComplete = filled === total;
  const remaining = total - filled;

  return (
    <div
      className={cn(
        'p-4 rounded-lg border-2 transition-all space-y-3',
        isComplete ? 'bg-[var(--color-kitchen-success-bg)] border-[var(--color-kitchen-success)]' : 'bg-card border-border shadow-sm'
      )}
    >
      {/* Product Name - Large and prominent */}
      <div className="flex items-center justify-between">
        <h4 className="text-lg font-bold text-foreground">{productName}</h4>
        {isComplete && (
          <span className="text-xs font-bold text-[var(--color-kitchen-success)] uppercase bg-[var(--color-kitchen-success-bg)] px-2 py-1 rounded">
            Complete
          </span>
        )}
      </div>

      {/* Package Filling Info */}
      <div className="bg-muted rounded-lg p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-muted-foreground">Each package needs:</span>
          <span className="text-lg font-bold text-[var(--color-station-boxing)]">{ballsPerPackage} balls</span>
        </div>
        {!isComplete && remaining > 0 && (
          <div className="flex items-center justify-between pt-2 border-t border-border">
            <span className="text-sm font-medium text-muted-foreground">Still need to fill:</span>
            <span className="text-lg font-bold text-[var(--color-kitchen-critical)]">{remaining} package{remaining !== 1 ? 's' : ''}</span>
          </div>
        )}
      </div>

      {/* Counter Controls - Full width with clear labels */}
      <div className="flex items-center justify-between gap-4 pt-1">
        {/* Decrement Button */}
        <button
          onClick={onDecrement}
          disabled={disabled || filled === 0}
          className="h-14 w-14 flex flex-col items-center justify-center rounded-lg border-2 border-border bg-card hover:bg-muted active:bg-muted/80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors touch-manipulation flex-shrink-0"
          aria-label="Remove one package"
        >
          <Minus className="h-6 w-6 text-foreground/80" />
          <span className="text-xs text-muted-foreground mt-0.5 font-medium">Remove</span>
        </button>

        {/* Counter Display - Large and clear */}
        <div className="text-center flex-1">
          <div className={cn(
            'font-bold text-4xl tabular-nums leading-none mb-1',
            isComplete ? 'text-[var(--color-kitchen-success)]' : 'text-foreground'
          )}>
            {filled}<span className="text-muted-foreground">/{total}</span>
          </div>
          <div className="text-sm text-muted-foreground font-semibold">
            packages filled
          </div>
        </div>

        {/* Increment Button */}
        <button
          onClick={onIncrement}
          disabled={disabled || filled >= total}
          className={cn(
            'h-14 w-14 flex flex-col items-center justify-center rounded-lg border-2 transition-colors touch-manipulation flex-shrink-0',
            isComplete
              ? 'border-[var(--color-kitchen-success)] bg-[var(--color-kitchen-success-bg)] cursor-default'
              : 'border-[var(--color-station-boxing)] bg-[var(--color-station-boxing)] hover:bg-[var(--color-station-boxing-accent)] active:bg-[var(--color-station-boxing-accent)] disabled:opacity-40 disabled:cursor-not-allowed'
          )}
          aria-label="Fill one package"
        >
          <Plus className={cn('h-6 w-6', isComplete ? 'text-[var(--color-kitchen-success)]' : 'text-white')} />
          <span className={cn('text-xs mt-0.5 font-bold', isComplete ? 'text-[var(--color-kitchen-success)]' : 'text-white')}>
            Fill
          </span>
        </button>
      </div>
    </div>
  );
}
