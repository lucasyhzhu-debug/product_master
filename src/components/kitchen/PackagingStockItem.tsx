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
        'p-3 rounded-lg border',
        isCritical
          ? 'bg-red-900/20 border-red-800'
          : isLow
            ? 'bg-amber-900/20 border-amber-800'
            : 'bg-slate-800/50 border-slate-700'
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-2 flex-1">
          <Box className={cn('h-4 w-4 mt-0.5', isCritical ? 'text-red-400' : 'text-slate-400')} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-white truncate">{name}</span>
              {(isLow || isCritical) && (
                <AlertTriangle
                  className={cn('h-3 w-3 flex-shrink-0', isCritical ? 'text-red-400' : 'text-amber-400')}
                />
              )}
            </div>
            <div className="text-xs text-slate-400 mt-0.5">
              {available} available
              {reserved > 0 && <span className="ml-1">• {reserved} reserved</span>}
            </div>
          </div>
        </div>

        {/* Reorder threshold indicator */}
        {isLow && (
          <div className="text-xs text-amber-400 font-medium">
            &lt; {reorderPoint}
          </div>
        )}
      </div>
    </div>
  );
}
