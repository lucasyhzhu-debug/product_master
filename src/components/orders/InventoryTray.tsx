import { forwardRef } from 'react';
import { motion } from 'framer-motion';
import { Package, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

// Ball character - using circle emoji for visual representation
const BALL_CHAR = '🟢';
const BALLS_PER_LINE = 10;

interface InventoryTrayProps {
  ballType: 'original' | 'bite_sized';
  count: number;
  maxVisible?: number;
  className?: string;
  // Manual fill props
  onFillPendingOrders?: () => void;
  pendingOrderCount?: number;
  pendingBallsNeeded?: number;
  isFillingOrders?: boolean;
}

export const InventoryTray = forwardRef<HTMLDivElement, InventoryTrayProps>(
  function InventoryTray({
    ballType,
    count,
    maxVisible = 100, // Show up to 100 balls as text
    className,
    onFillPendingOrders,
    pendingOrderCount,
    pendingBallsNeeded,
    isFillingOrders,
  }, ref) {
    const label = ballType === 'original' ? 'ORIGINAL' : 'BITE-SIZED';
    const visibleCount = Math.min(count, maxVisible);
    const overflow = Math.max(0, count - maxVisible);

    // Generate ball string with line breaks every BALLS_PER_LINE
    const generateBallDisplay = () => {
      if (visibleCount === 0) {
        // Show 2 rows of empty circles as placeholder
        const emptyRow = '○'.repeat(BALLS_PER_LINE);
        return <span className="text-muted-foreground/20 select-none">{emptyRow + '\n' + emptyRow}</span>;
      }

      // Build array of ball characters
      const ballArray: string[] = [];
      for (let i = 0; i < visibleCount; i++) {
        ballArray.push(BALL_CHAR);
      }

      // Split into rows of BALLS_PER_LINE
      const lines: string[] = [];
      for (let i = 0; i < ballArray.length; i += BALLS_PER_LINE) {
        lines.push(ballArray.slice(i, i + BALLS_PER_LINE).join(''));
      }
      return lines.join('\n');
    };

    return (
      <div ref={ref} className={cn('space-y-2', className)}>
        {/* Tray label */}
        <div className="text-xs font-semibold text-center text-muted-foreground uppercase tracking-wide">
          {label} TRAY
        </div>

        {/* Ball display - simple text box */}
        <div
          className="rounded-xl border-2 border-dashed border-muted-foreground/30 bg-white dark:bg-white p-3 min-h-[80px] mx-auto text-center"
          style={{ maxWidth: 320 }}
        >
          <motion.div
            key={count}
            initial={{ scale: 0.95, opacity: 0.5 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            className="text-lg leading-tight whitespace-pre select-none"
          >
            {generateBallDisplay()}
          </motion.div>
        </div>

        {/* Count display */}
        <div className="text-center">
          <span className="inline-flex items-center justify-center px-3 py-1 rounded-full bg-muted text-lg font-bold tabular-nums">
            {count}
          </span>
          {overflow > 0 && (
            <div className="text-xs text-muted-foreground mt-1">+{overflow} more</div>
          )}
        </div>

        {/* Fill Orders button */}
        {onFillPendingOrders && (
          <motion.div
            animate={{ opacity: isFillingOrders ? 0.7 : 1 }}
            transition={{ duration: 0.2 }}
          >
            <Button
              variant="default"
              size="lg"
              className="w-full h-12 sm:h-14 bg-green-600 hover:bg-green-700
                         disabled:bg-gray-400 disabled:cursor-not-allowed
                         text-white font-bold transition-colors"
              onClick={onFillPendingOrders}
              disabled={count === 0 || (pendingOrderCount ?? 0) === 0 || isFillingOrders}
              aria-disabled={count === 0 || (pendingOrderCount ?? 0) === 0 || isFillingOrders}
              aria-busy={isFillingOrders}
            >
              {isFillingOrders ? (
                <>
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                  Filling...
                </>
              ) : (
                <>
                  <Package className="h-5 w-5 mr-2" />
                  {pendingOrderCount && pendingOrderCount > 0
                    ? `Fill (${pendingOrderCount}) with ${pendingBallsNeeded ?? '?'} balls`
                    : 'Fill Orders'}
                </>
              )}
            </Button>
          </motion.div>
        )}
      </div>
    );
  }
);

export default InventoryTray;
