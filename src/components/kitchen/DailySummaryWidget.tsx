import { useState } from 'react';
import { ChevronDown, ChevronUp, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
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
    <Card className="border-slate-700 bg-slate-800/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-emerald-400" />
            <h3 className="font-semibold text-white">Today's Summary</h3>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-slate-400 hover:text-white"
          >
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="pt-0 space-y-4">
          {/* Stats Grid */}
          <div className="grid grid-cols-4 gap-4">
            <StatItem label="Balls Produced" value={stats.ballsProduced} color="text-purple-400" />
            <StatItem label="Orders Complete" value={stats.ordersCompleted} color="text-emerald-400" />
            <StatItem label="Packages Boxed" value={stats.packagesBoxed} color="text-amber-400" />
            <StatItem label="Stickers Applied" value={stats.stickersApplied} color="text-blue-400" />
          </div>

          {/* Inventory Consumed */}
          {stats.inventoryConsumed.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-slate-400 uppercase mb-2">Inventory Consumed</h4>
              <div className="space-y-1">
                {stats.inventoryConsumed.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between text-sm">
                    <span className="text-slate-300">{item.name}</span>
                    <span className="text-slate-400">{item.quantity}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

function StatItem({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="text-center">
      <div className={cn('text-2xl font-bold', color)}>{value}</div>
      <div className="text-xs text-slate-400 mt-1">{label}</div>
    </div>
  );
}
