import { Plus, Minus } from 'lucide-react';
import { BALL_CONFIG, type BallType } from '@/lib/ballTypes';
import { cn } from '@/lib/utils';

interface ProductionLogPanelProps {
  trayInventory: {
    originalBallCount: number;
    biteSizedBallCount: number;
  } | undefined;
  kitchenStats: {
    bigBallsNeeded: number;
    bigBallsCompleted: number;
    midBallsNeeded: number;
    midBallsCompleted: number;
    ordersPending: number;
    ordersCompletedToday: number;
  } | undefined;
  productionTargets: Array<{
    productionUnitTypeId: string;
    unitTypeName: string;
    unitTypeCode: string;
    autoTargetQuantity: number;
    manualOverride?: number;
    effectiveTarget: number;
  }> | undefined;
  onAddBalls: (ballType: 'original' | 'bite_sized', count: number) => void;
  onRemoveBall: (ballType: 'original' | 'bite_sized') => void;
  disabled?: boolean;
}

interface BallCounterSectionProps {
  ballType: BallType;
  count: number;
  onAdd: (count: number) => void;
  onRemove: () => void;
  disabled?: boolean;
}

function BallCounterSection({
  ballType,
  count,
  onAdd,
  onRemove,
  disabled = false,
}: BallCounterSectionProps) {
  const config = BALL_CONFIG[ballType];

  return (
    <div className="bg-white rounded-xl border border-[#E8E2DB] shadow-sm p-4 space-y-3">
      {/* Counter Display */}
      <div className="text-center space-y-1">
        <div className="text-5xl font-bold tabular-nums tracking-tight text-[#1A202C]">
          {count}
        </div>
        <div className="text-sm font-medium text-gray-600">
          {config.displayName} ({config.grams}g)
        </div>
      </div>

      {/* Increment Buttons */}
      <div className="grid grid-cols-4 gap-2">
        {[5, 10, 20, 50].map((increment) => (
          <button
            key={increment}
            onClick={() => onAdd(increment)}
            disabled={disabled}
            className={cn(
              'min-h-[56px] min-w-[56px] rounded-xl font-bold text-lg',
              'bg-[#5B7A5E] hover:bg-[#4A6A4E] text-white',
              'touch-manipulation active:scale-95 transition-transform duration-100',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            <Plus className="h-5 w-5 inline mr-0.5" />
            {increment}
          </button>
        ))}
      </div>

      {/* Minus Button */}
      <button
        onClick={onRemove}
        disabled={disabled || count === 0}
        className={cn(
          'w-full min-h-[56px] rounded-xl font-bold text-lg',
          'border-2 border-gray-300 bg-white text-gray-700',
          'hover:bg-gray-50 active:bg-gray-100',
          'touch-manipulation active:scale-95 transition-transform duration-100',
          'disabled:opacity-50 disabled:cursor-not-allowed'
        )}
      >
        <Minus className="h-5 w-5 inline mr-1" />
        Remove 1
      </button>
    </div>
  );
}

interface TargetGaugeProps {
  label: string;
  current: number;
  target: number;
}

function TargetGauge({ label, current, target }: TargetGaugeProps) {
  const percentage = target > 0 ? Math.min((current / target) * 100, 100) : 0;
  const isComplete = percentage >= 100;

  // SVG parameters for 120px diameter ring
  const size = 120;
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div className="flex flex-col items-center space-y-2">
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Background ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#E8E2DB"
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Progress ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={isComplete ? '#3D7A4A' : '#5B7A5E'}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-500"
        />
        {/* Center text */}
        <text
          x={size / 2}
          y={size / 2}
          textAnchor="middle"
          dominantBaseline="middle"
          className="text-2xl font-bold fill-[#1A202C] transform rotate-90"
          style={{ transformOrigin: 'center' }}
        >
          {current}
        </text>
      </svg>

      <div className="text-center">
        <div className="text-sm font-medium text-gray-900">{label}</div>
        <div className="text-xs text-gray-500">Target: {target}</div>
      </div>
    </div>
  );
}

export function ProductionLogPanel({
  trayInventory,
  kitchenStats,
  productionTargets,
  onAddBalls,
  onRemoveBall,
  disabled = false,
}: ProductionLogPanelProps) {
  // Empty state
  if (trayInventory === undefined) {
    return (
      <div className="h-full bg-[#F8F6F3] px-4 py-6 space-y-4">
        <div className="bg-white rounded-xl border border-[#E8E2DB] p-6 text-center">
          <div className="text-gray-500">
            Loading production data...
          </div>
        </div>
      </div>
    );
  }

  // Map production targets to ball types
  const originalTarget = productionTargets?.find(
    (t) => t.unitTypeCode === 'MID_BALL' || t.unitTypeName.includes('45g')
  );
  const jumboTarget = productionTargets?.find(
    (t) => t.unitTypeCode === 'BIG_BALL' || t.unitTypeName.includes('80g')
  );

  const midBallsCompleted = kitchenStats?.midBallsCompleted ?? 0;
  const bigBallsCompleted = kitchenStats?.bigBallsCompleted ?? 0;

  return (
    <div className="h-full bg-[#F8F6F3] px-4 py-6 space-y-6 overflow-y-auto">
      {/* Section 1: Ball Tray Counters */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-gray-900">Ball Tray</h2>

        <BallCounterSection
          ballType="original"
          count={trayInventory.originalBallCount}
          onAdd={(count) => onAddBalls('original', count)}
          onRemove={() => onRemoveBall('original')}
          disabled={disabled}
        />

        <BallCounterSection
          ballType="bite_sized"
          count={trayInventory.biteSizedBallCount}
          onAdd={(count) => onAddBalls('bite_sized', count)}
          onRemove={() => onRemoveBall('bite_sized')}
          disabled={disabled}
        />
      </div>

      {/* Section 2: Production Targets */}
      {productionTargets && productionTargets.length > 0 ? (
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-gray-900">Today&apos;s Targets</h2>

          <div className="bg-white rounded-xl border border-[#E8E2DB] shadow-sm p-6">
            <div className="grid grid-cols-2 gap-6">
              {originalTarget && (
                <TargetGauge
                  label="Original"
                  current={midBallsCompleted}
                  target={originalTarget.effectiveTarget}
                />
              )}
              {jumboTarget && (
                <TargetGauge
                  label="Jumbo"
                  current={bigBallsCompleted}
                  target={jumboTarget.effectiveTarget}
                />
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-[#E8E2DB] shadow-sm p-6 text-center">
          <div className="text-sm text-gray-500">No production targets set</div>
        </div>
      )}

      {/* Section 3: Order Summary */}
      {kitchenStats && (
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-gray-900">Order Summary</h2>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white rounded-xl border border-[#E8E2DB] shadow-sm p-4 text-center space-y-1">
              <div className="text-3xl font-bold text-[#1A202C] tabular-nums">
                {kitchenStats.ordersPending}
              </div>
              <div className="text-xs text-gray-600 font-medium">Orders Pending</div>
            </div>

            <div className="bg-white rounded-xl border border-[#E8E2DB] shadow-sm p-4 text-center space-y-1">
              <div className="text-3xl font-bold text-[#3D7A4A] tabular-nums">
                {kitchenStats.ordersCompletedToday}
              </div>
              <div className="text-xs text-gray-600 font-medium">Completed Today</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
