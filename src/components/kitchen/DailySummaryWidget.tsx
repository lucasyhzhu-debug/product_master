import { useState } from 'react';
import { ChevronDown, ChevronUp, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DailySummaryWidgetProps {
  stats: {
    ballsProduced: number;
    ordersCompleted: number;
    packagesBoxed: number;
    stickersApplied: number;
    inventoryConsumed: Array<{
      name: string;
      quantity: number;
    }>;
  };
}

export function DailySummaryWidget({ stats }: DailySummaryWidgetProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="border-2 border-border bg-card rounded-lg shadow-sm overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <TrendingUp className="h-5 w-5 text-[var(--color-kitchen-success)]" />
          <h3 className="font-bold text-base text-foreground">Today's Summary</h3>
        </div>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 pt-2 space-y-4 border-t border-border">
          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-3">
            <StatItem label="Balls" value={stats.ballsProduced} color="text-[var(--color-station-production)]" />
            <StatItem label="Orders" value={stats.ordersCompleted} color="text-[var(--color-kitchen-success)]" />
            <StatItem label="Boxed" value={stats.packagesBoxed} color="text-[var(--color-station-boxing)]" />
            <StatItem label="Stickers" value={stats.stickersApplied} color="text-[var(--color-status-info)]" />
          </div>

          {/* Inventory Consumed */}
          {stats.inventoryConsumed.length > 0 && (
            <div>
              <h4 className="text-xs font-bold text-foreground/80 uppercase mb-2">Materials Used</h4>
              <div className="space-y-1">
                {stats.inventoryConsumed.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between text-sm bg-muted px-2 py-1 rounded">
                    <span className="text-foreground font-medium">{item.name}</span>
                    <span className="text-muted-foreground font-semibold">{item.quantity}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatItem({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-muted rounded-lg p-2.5 text-center">
      <div className={cn('text-2xl font-bold tabular-nums', color)}>{value}</div>
      <div className="text-xs text-muted-foreground mt-0.5 font-semibold">{label}</div>
    </div>
  );
}
