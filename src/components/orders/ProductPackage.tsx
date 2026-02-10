import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { playSoftClick } from '@/lib/kitchenSounds';
import { BALL_CONFIG, type BallType } from '@/lib/ballTypes';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

type PackageStatus = 'empty' | 'filling' | 'filled' | 'packed';

interface ProductPackageProps {
  productName: string;
  ballType: BallType;
  ballsRequired: number;
  ballsFilled: number;
  status: PackageStatus;
  onPack?: () => void;
  onUnpack?: () => void;
  disabled?: boolean;
}

// Status colors for border and background
// Distinct backgrounds AND borders for clear visual distinction
// Dark mode uses 30% opacity for better visibility
const statusStyles: Record<PackageStatus, { border: string; bg: string }> = {
  empty: { border: 'border-gray-300 dark:border-gray-500', bg: 'bg-gray-50 dark:bg-gray-700/30' },
  filling: { border: 'border-orange-500', bg: 'bg-orange-50 dark:bg-orange-900/30' },
  filled: { border: 'border-yellow-500', bg: 'bg-yellow-100 dark:bg-yellow-800/30' },
  packed: { border: 'border-green-500', bg: 'bg-green-100 dark:bg-green-800/30' },
};

function BallIcon({ filled, type }: { filled: boolean; type: BallType }) {
  const config = BALL_CONFIG[type];
  // Original (45g) = smaller ball = 14px, Jumbo (80g) = larger ball = 20px
  const size = config.grams >= 80 ? 20 : 14;

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
        fill={filled ? config.fill : 'transparent'}
        stroke={config.stroke}
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
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2 }}
      whileTap={isClickable ? { scale: 0.95 } : undefined}
      className={cn(
        'rounded-lg border-[3px] p-1.5 sm:p-2 transition-colors',
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
      {/* Product name - only show if provided */}
      {productName && (
        <div className="text-[10px] sm:text-xs font-medium text-center mb-1 sm:mb-2 truncate">
          {productName}
        </div>
      )}

      {/* Ball slots */}
      <div className="flex flex-wrap justify-center gap-0.5 sm:gap-1 min-h-[20px] sm:min-h-[24px] p-1 rounded bg-white/50 dark:bg-black/20">
        {Array.from({ length: ballsRequired }).map((_, i) => (
          <motion.div
            key={i}
            initial={false}
            animate={i < ballsFilled ? { scale: [1, 1.2, 1] } : { scale: 1 }}
            transition={{ duration: 0.2, delay: i * 0.05 }}
          >
            <BallIcon filled={i < ballsFilled} type={ballType} />
          </motion.div>
        ))}
      </div>

      {/* Progress */}
      <div className="text-[10px] sm:text-xs text-center mt-1 sm:mt-2 tabular-nums text-muted-foreground">
        {ballsFilled}/{ballsRequired}
        {status === 'packed' && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="ml-1 text-green-600"
          >
            ✓
          </motion.span>
        )}
      </div>
    </motion.div>
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
