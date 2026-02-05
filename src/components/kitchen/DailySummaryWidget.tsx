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
    <div className="border-2 border-gray-200 bg-white rounded-lg shadow-sm overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <TrendingUp className="h-5 w-5 text-green-600" />
          <h3 className="font-bold text-base text-gray-900">Today's Summary</h3>
        </div>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4 text-gray-600" />
        ) : (
          <ChevronDown className="h-4 w-4 text-gray-600" />
        )}
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 pt-2 space-y-4 border-t border-gray-200">
          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-3">
            <StatItem label="Balls" value={stats.ballsProduced} color="text-purple-600" />
            <StatItem label="Orders" value={stats.ordersCompleted} color="text-green-600" />
            <StatItem label="Boxed" value={stats.packagesBoxed} color="text-orange-600" />
            <StatItem label="Stickers" value={stats.stickersApplied} color="text-blue-600" />
          </div>

          {/* Inventory Consumed */}
          {stats.inventoryConsumed.length > 0 && (
            <div>
              <h4 className="text-xs font-bold text-gray-700 uppercase mb-2">Materials Used</h4>
              <div className="space-y-1">
                {stats.inventoryConsumed.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between text-sm bg-gray-50 px-2 py-1 rounded">
                    <span className="text-gray-900 font-medium">{item.name}</span>
                    <span className="text-gray-600 font-semibold">{item.quantity}</span>
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
    <div className="bg-gray-50 rounded-lg p-2.5 text-center">
      <div className={cn('text-2xl font-bold tabular-nums', color)}>{value}</div>
      <div className="text-xs text-gray-600 mt-0.5 font-semibold">{label}</div>
    </div>
  );
}
