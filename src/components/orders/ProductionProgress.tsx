import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// ============================================
// Types
// ============================================

export interface ProductionUnit {
  code: string;
  name: string;
  color?: string;
  unitsRequired: number;
  unitsCompleted: number;
  unitsRemaining: number;
}

interface ProductionProgressProps {
  /** Production units to display */
  units: ProductionUnit[];
  /** Whether to show compact view */
  compact?: boolean;
  /** Additional class names */
  className?: string;
}

// ============================================
// Color Mapping
// ============================================

const DEFAULT_COLORS: Record<string, { bg: string; text: string; progress: string }> = {
  BIG_BALL: { bg: 'bg-blue-100', text: 'text-blue-700', progress: 'bg-blue-500' },
  MID_BALL: { bg: 'bg-purple-100', text: 'text-purple-700', progress: 'bg-purple-500' },
  SMALL_BALL: { bg: 'bg-green-100', text: 'text-green-700', progress: 'bg-green-500' },
  default: { bg: 'bg-gray-100', text: 'text-gray-700', progress: 'bg-gray-500' },
};

function getColors(code: string) {
  return DEFAULT_COLORS[code] || DEFAULT_COLORS.default;
}

// ============================================
// Single Unit Progress Bar
// ============================================

function UnitProgressBar({
  unit,
  compact = false,
}: {
  unit: ProductionUnit;
  compact?: boolean;
}) {
  const colors = getColors(unit.code);
  const percentage =
    unit.unitsRequired > 0
      ? Math.round((unit.unitsCompleted / unit.unitsRequired) * 100)
      : 0;
  const isComplete = unit.unitsRemaining <= 0;

  return (
    <div className={cn('space-y-1.5', compact && 'space-y-1')}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={cn('font-medium text-xs', colors.bg, colors.text)}
          >
            {unit.name}
          </Badge>
          {isComplete && (
            <Badge variant="default" className="text-xs bg-green-500">
              Done
            </Badge>
          )}
        </div>
        <span className={cn('text-sm font-medium', compact && 'text-xs')}>
          {unit.unitsCompleted}/{unit.unitsRequired}
        </span>
      </div>

      <div className="relative">
        <Progress
          value={percentage}
          className={cn('h-2', compact && 'h-1.5')}
        />
        {/* Custom colored overlay for the filled portion */}
        <div
          className={cn(
            'absolute inset-0 rounded-full overflow-hidden pointer-events-none'
          )}
        >
          <div
            className={cn('h-full rounded-full', colors.progress)}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>

      {!compact && unit.unitsRemaining > 0 && (
        <p className="text-xs text-muted-foreground">
          {unit.unitsRemaining} remaining
        </p>
      )}
    </div>
  );
}

// ============================================
// Main Component
// ============================================

export function ProductionProgress({
  units,
  compact = false,
  className,
}: ProductionProgressProps) {
  // Calculate overall progress
  const totalRequired = units.reduce((sum, u) => sum + u.unitsRequired, 0);
  const totalCompleted = units.reduce((sum, u) => sum + u.unitsCompleted, 0);
  const overallPercentage =
    totalRequired > 0 ? Math.round((totalCompleted / totalRequired) * 100) : 0;
  const isAllComplete = units.every((u) => u.unitsRemaining <= 0);

  if (units.length === 0) {
    return (
      <div className={cn('text-sm text-muted-foreground', className)}>
        No production data
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', compact && 'space-y-2', className)}>
      {/* Overall progress header */}
      <div className="flex items-center justify-between">
        <span className={cn('font-medium', compact && 'text-sm')}>
          Production Progress
        </span>
        <div className="flex items-center gap-2">
          {isAllComplete ? (
            <Badge variant="default" className="bg-green-500">
              Complete
            </Badge>
          ) : (
            <span className={cn('text-sm text-muted-foreground', compact && 'text-xs')}>
              {overallPercentage}%
            </span>
          )}
        </div>
      </div>

      {/* Individual unit progress bars */}
      <div className={cn('space-y-3', compact && 'space-y-2')}>
        {units.map((unit) => (
          <UnitProgressBar key={unit.code} unit={unit} compact={compact} />
        ))}
      </div>
    </div>
  );
}

export default ProductionProgress;
