import { cn } from '@/lib/utils';
import { playSoftClick } from '@/lib/kitchenSounds';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

// Ball colors from design spec
const BALL_COLORS = {
  fill: '#93C572',      // Pistachio green
  stroke: '#7B3F00',    // Chocolate brown
} as const;

type PackageStatus = 'empty' | 'filling' | 'filled' | 'packed';

interface ProductPackageProps {
  productName: string;
  ballType: 'original' | 'bite_sized';
  ballsRequired: number;
  ballsFilled: number;
  status: PackageStatus;
  onPack?: () => void;
  onUnpack?: () => void;
  disabled?: boolean;
}

// Status colors for border and background
const statusStyles: Record<PackageStatus, { border: string; bg: string }> = {
  empty: { border: 'border-gray-300 dark:border-gray-600', bg: 'bg-gray-50 dark:bg-gray-900' },
  filling: { border: 'border-red-500', bg: 'bg-red-50 dark:bg-red-950/30' },
  filled: { border: 'border-yellow-500', bg: 'bg-yellow-50 dark:bg-yellow-950/30' },
  packed: { border: 'border-green-500', bg: 'bg-green-50 dark:bg-green-950/30' },
};

// Ball sizes for display (smaller than tray for package view)
const ballDisplaySizes = {
  original: 20,
  bite_sized: 14,
};

function BallIcon({ filled, type }: { filled: boolean; type: 'original' | 'bite_sized' }) {
  const size = ballDisplaySizes[type];

  return (
    <svg
      width={size}
      height={size * 0.94} // Squished oval
      viewBox={`0 0 ${size} ${size * 0.94}`}
      className="shrink-0"
    >
      <ellipse
        cx={size / 2}
        cy={(size * 0.94) / 2}
        rx={size / 2 - 1.5}
        ry={(size * 0.94) / 2 - 1.5}
        fill={filled ? BALL_COLORS.fill : 'transparent'}
        stroke={BALL_COLORS.stroke}
        strokeWidth={2}
        opacity={filled ? 1 : 0.15}
      />
      {filled && (
        // Subtle gradient highlight for 3D effect
        <ellipse
          cx={size / 2 - size * 0.15}
          cy={(size * 0.94) / 2 - size * 0.15}
          rx={size * 0.15}
          ry={size * 0.12}
          fill="rgba(255,255,255,0.3)"
        />
      )}
    </svg>
  );
}

export function ProductPackage({
  productName,
  ballType,
  ballsRequired,
  ballsFilled,
  status,
  onPack,
  onUnpack,
  disabled = false,
}: ProductPackageProps) {
  const isClickable = !disabled && (status === 'filled' || status === 'packed');
  const showTooltip = status === 'filled' && !disabled;

  const handleClick = () => {
    if (disabled) return;

    if (status === 'filled' && onPack) {
      playSoftClick();
      onPack();
    } else if (status === 'packed' && onUnpack) {
      onUnpack();
    }
  };

  const packageContent = (
    <div
      className={cn(
        'rounded-lg border-2 p-2 transition-all',
        statusStyles[status].border,
        statusStyles[status].bg,
        isClickable && 'cursor-pointer hover:shadow-md',
        disabled && 'opacity-60'
      )}
      onClick={handleClick}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={(e) => {
        if (isClickable && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          handleClick();
        }
      }}
    >
      {/* Product name */}
      <div className="text-xs font-medium text-center mb-2 truncate">
        {productName}
      </div>

      {/* Ball slots */}
      <div className="flex flex-wrap justify-center gap-1 min-h-[24px] p-1 rounded bg-white/50 dark:bg-black/20">
        {Array.from({ length: ballsRequired }).map((_, i) => (
          <BallIcon key={i} filled={i < ballsFilled} type={ballType} />
        ))}
      </div>

      {/* Progress */}
      <div className="text-xs text-center mt-2 tabular-nums text-muted-foreground">
        {ballsFilled}/{ballsRequired}
        {status === 'packed' && <span className="ml-1 text-green-600">✓</span>}
      </div>
    </div>
  );

  if (showTooltip) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>{packageContent}</TooltipTrigger>
          <TooltipContent>
            <p>Tap to mark as packed</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return packageContent;
}

export default ProductPackage;
