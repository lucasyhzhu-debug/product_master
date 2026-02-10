import { Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BALL_CONFIG, type BallType } from '@/lib/ballTypes';

interface BallTrayCounterProps {
  ballType: BallType;
  count: number;
  pendingOrders: number;
  pendingBalls: number;
  onAdd: (count: number) => void;
  onRemove: () => void;
  disabled?: boolean;
}

export function BallTrayCounter({
  ballType,
  count,
  pendingOrders,
  pendingBalls,
  onAdd,
  onRemove,
  disabled = false,
}: BallTrayCounterProps) {
  const config = BALL_CONFIG[ballType];
  const isLow = count < pendingBalls;

  return (
    <div className="rounded-lg border-2 border-gray-200 bg-white p-4 space-y-3 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <svg width="28" height="26" viewBox="0 0 28 26">
            <ellipse
              cx="14"
              cy="13"
              rx={config.svgRx}
              ry={config.svgRy}
              fill={config.fill}
              stroke={config.stroke}
              strokeWidth="2.5"
            />
            <ellipse
              cx={config.highlightCx}
              cy={config.highlightCy}
              rx={config.highlightRx}
              ry={config.highlightRy}
              fill="rgba(255,255,255,0.4)"
            />
          </svg>
          <span className="font-semibold text-base text-gray-900">{config.name}</span>
        </div>

        {/* Count Badge */}
        <div
          className={cn(
            'text-2xl font-bold tabular-nums px-3 py-1 rounded-lg',
            isLow ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-900'
          )}
        >
          {count}
        </div>
      </div>

      {/* Pending Info */}
      {pendingOrders > 0 && (
        <div className="text-sm text-gray-700 bg-gray-50 rounded px-2.5 py-1.5 font-medium">
          {pendingOrders} order{pendingOrders > 1 ? 's' : ''} need {pendingBalls} ball{pendingBalls > 1 ? 's' : ''}
        </div>
      )}

      {/* Control Buttons */}
      <div className="grid grid-cols-4 gap-2">
        <button
          onClick={onRemove}
          disabled={disabled || count === 0}
          className="col-span-1 h-11 flex items-center justify-center rounded-lg border-2 border-gray-300 bg-white hover:bg-gray-100 active:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors touch-manipulation"
        >
          <Minus className="h-5 w-5 text-gray-700" />
        </button>

        <button
          onClick={() => onAdd(5)}
          disabled={disabled}
          className="h-11 flex items-center justify-center rounded-lg bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation"
        >
          +5
        </button>

        <button
          onClick={() => onAdd(10)}
          disabled={disabled}
          className="h-11 flex items-center justify-center rounded-lg bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation"
        >
          +10
        </button>

        <button
          onClick={() => onAdd(20)}
          disabled={disabled}
          className="h-11 flex items-center justify-center rounded-lg bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation"
        >
          +20
        </button>
      </div>
    </div>
  );
}
