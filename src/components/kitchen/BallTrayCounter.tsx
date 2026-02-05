import { Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface BallTrayCounterProps {
  ballType: 'original' | 'bite_sized';
  count: number;
  pendingOrders: number;
  pendingBalls: number;
  onAdd: (count: number) => void;
  onRemove: () => void;
  disabled?: boolean;
}

const BALL_COLORS = {
  original: {
    fill: '#93C572',
    stroke: '#7B3F00',
    name: 'Original',
  },
  bite_sized: {
    fill: '#93C572',
    stroke: '#7B3F00',
    name: 'Bite-sized',
  },
};

export function BallTrayCounter({
  ballType,
  count,
  pendingOrders,
  pendingBalls,
  onAdd,
  onRemove,
  disabled = false,
}: BallTrayCounterProps) {
  const config = BALL_COLORS[ballType];
  const isLow = count < pendingBalls;

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg width="24" height="22" viewBox="0 0 24 22">
            <ellipse
              cx="12"
              cy="11"
              rx={ballType === 'original' ? '10' : '7.5'}
              ry={ballType === 'original' ? '9' : '7'}
              fill={config.fill}
              stroke={config.stroke}
              strokeWidth="2.5"
            />
            <ellipse
              cx={ballType === 'original' ? '8' : '9'}
              cy={ballType === 'original' ? '7' : '6'}
              rx={ballType === 'original' ? '3' : '2'}
              ry={ballType === 'original' ? '2' : '1.5'}
              fill="rgba(255,255,255,0.35)"
            />
          </svg>
          <span className="font-semibold text-white">{config.name}</span>
        </div>

        {/* Count Badge */}
        <Badge
          variant={isLow ? 'destructive' : 'secondary'}
          className={cn('text-lg font-bold', isLow && 'animate-pulse')}
        >
          {count}
        </Badge>
      </div>

      {/* Pending Info */}
      {pendingOrders > 0 && (
        <div className="text-xs text-slate-400">
          {pendingOrders} order{pendingOrders > 1 ? 's' : ''} need {pendingBalls} ball{pendingBalls > 1 ? 's' : ''}
        </div>
      )}

      {/* Quick Add Buttons */}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={onRemove}
          disabled={disabled || count === 0}
          className="flex-1 border-slate-600 hover:bg-slate-700"
        >
          <Minus className="h-4 w-4 mr-1" />
          Remove
        </Button>

        <Button
          size="sm"
          onClick={() => onAdd(5)}
          disabled={disabled}
          className="flex-1 bg-amber-600 hover:bg-amber-500"
        >
          <Plus className="h-4 w-4 mr-1" />
          +5
        </Button>

        <Button
          size="sm"
          onClick={() => onAdd(10)}
          disabled={disabled}
          className="flex-1 bg-amber-600 hover:bg-amber-500"
        >
          <Plus className="h-4 w-4 mr-1" />
          +10
        </Button>

        <Button
          size="sm"
          onClick={() => onAdd(20)}
          disabled={disabled}
          className="flex-1 bg-amber-600 hover:bg-amber-500"
        >
          <Plus className="h-4 w-4 mr-1" />
          +20
        </Button>
      </div>
    </div>
  );
}
