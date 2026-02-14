import { AlertTriangle, Box } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PackagingStockItemProps {
  name: string;
  available: number;
  reserved: number;
  reorderPoint: number;
  isLow: boolean;
  isCritical: boolean;
}

export function PackagingStockItem({
  name,
  available,
  reserved,
  reorderPoint,
  isLow,
  isCritical,
}: PackagingStockItemProps) {
  return (
    <div
      className={cn(
        'p-3 rounded-lg border-2',
        isCritical
          ? 'bg-[var(--color-kitchen-critical-bg)] border-[var(--color-kitchen-critical)]/30'
          : isLow
            ? 'bg-[var(--color-kitchen-warning-bg)] border-[var(--color-kitchen-warning)]/30'
            : 'bg-card border-border'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 flex-1 min-w-0">
          <Box className={cn('h-4 w-4 mt-0.5 flex-shrink-0', isCritical ? 'text-[var(--color-kitchen-critical)]' : isLow ? 'text-[var(--color-kitchen-warning)]' : 'text-muted-foreground')} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold text-foreground truncate">{name}</span>
              {(isLow || isCritical) && (
                <AlertTriangle
                  className={cn('h-3.5 w-3.5 flex-shrink-0', isCritical ? 'text-[var(--color-kitchen-critical)]' : 'text-[var(--color-kitchen-warning)]')}
                />
              )}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5 font-medium">
              <span className="font-bold">{available}</span> available
              {reserved > 0 && (
                <span className="ml-1.5">
                  <span className="text-muted-foreground">•</span> {reserved} reserved
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Reorder threshold indicator */}
        {isLow && (
          <div className={cn('text-xs font-bold whitespace-nowrap', isCritical ? 'text-[var(--color-kitchen-critical)]' : 'text-[var(--color-kitchen-warning)]')}>
            &lt; {reorderPoint}
          </div>
        )}
      </div>
    </div>
  );
}
