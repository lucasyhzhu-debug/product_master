import { useState } from 'react';
import { Settings } from 'lucide-react';
import { StatCard } from './StatCard';
import { TargetConfigPopover } from './TargetConfigPopover';

interface DashboardHeaderProps {
  minTargetToday: { totalBalls: number; bigBalls: number; midBalls: number; orderCount: number } | undefined;
  maxTarget: { total: number; big: number; mid: number };
  remainingBalls: { total: number; big: number; mid: number };
  ordersLeft: number;
  hasOverdueOrders: boolean;
  canConfigure: boolean;
}

function getUrgency(
  remainingTotal: number,
  maxTotal: number,
  hasOverdueOrders: boolean
): 'green' | 'amber' | 'red' {
  if (hasOverdueOrders) return 'red';
  if (remainingTotal <= maxTotal) return 'green';
  return 'amber';
}

export function DashboardHeader({
  minTargetToday,
  maxTarget,
  remainingBalls,
  ordersLeft,
  hasOverdueOrders,
  canConfigure,
}: DashboardHeaderProps) {
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);

  // Loading state: show skeleton cards
  if (minTargetToday === undefined) {
    return (
      <div className="sticky top-[56px] z-20 bg-card border-b shadow-sm">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 p-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-lg border border-border px-3 py-2.5 min-h-[60px]">
              <div className="animate-pulse space-y-2">
                <div className="h-6 w-12 bg-muted rounded" />
                <div className="h-3 w-16 bg-muted rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const urgency = getUrgency(remainingBalls.total, maxTarget.total, hasOverdueOrders);

  const remainingValue = showBreakdown
    ? `B:${remainingBalls.big} / M:${remainingBalls.mid}`
    : remainingBalls.total;

  return (
    <div className="sticky top-[56px] z-20 bg-card border-b shadow-sm">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 p-3">
        {/* Min Target Today */}
        <StatCard
          label="Min Target"
          value={minTargetToday.totalBalls}
          subtitle={`(${minTargetToday.orderCount} orders)`}
        />

        {/* Max Target */}
        <StatCard
          label="Max Target"
          value={maxTarget.total}
          icon={
            canConfigure ? (
              <TargetConfigPopover
                open={configOpen}
                onOpenChange={setConfigOpen}
                currentConfig={{
                  maxProductionTarget: maxTarget.total,
                  bigBallTarget: maxTarget.big,
                  midBallTarget: maxTarget.mid,
                }}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
                  className="p-1 rounded-md hover:bg-accent transition-colors"
                  aria-label="Configure production targets"
                >
                  <Settings className="h-4 w-4" />
                </button>
              </TargetConfigPopover>
            ) : undefined
          }
        />

        {/* Remaining Balls */}
        <StatCard
          label="Remaining"
          value={remainingValue}
          urgency={urgency}
          onClick={() => setShowBreakdown(!showBreakdown)}
        />

        {/* Orders Left */}
        <StatCard
          label="Orders Left"
          value={ordersLeft}
        />
      </div>
    </div>
  );
}
