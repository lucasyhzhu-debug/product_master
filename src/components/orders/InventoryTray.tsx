import { useMemo, forwardRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

// Ball colors from design spec
const BALL_COLORS = {
  fill: '#93C572',      // Pistachio green
  stroke: '#7B3F00',    // Chocolate brown
} as const;

// Ball sizes in pixels
const BALL_SIZES = {
  original: 28,
  bite_sized: 18,
} as const;

interface InventoryTrayProps {
  ballType: 'original' | 'bite_sized';
  count: number;
  maxVisible?: number;
  className?: string;
}

interface BallPosition {
  x: number;
  y: number;
  rotation: number;
}

// Generate egg tray style positions - 5x5 grid layout
function calculateBallPositions(
  count: number,
  ballSize: number,
  containerWidth: number,
  containerHeight: number
): BallPosition[] {
  const positions: BallPosition[] = [];
  const visibleCount = Math.min(count, 25); // Max 5x5 = 25

  if (visibleCount === 0) return positions;

  // Egg tray layout: 5 balls per row, 5 rows max
  const ballsPerRow = 5;
  const horizontalPadding = 10;
  const verticalPadding = 6;

  // Calculate spacing to fit balls evenly
  const availableWidth = containerWidth - horizontalPadding * 2;
  const horizontalSpacing = availableWidth / ballsPerRow;

  // Vertical positioning - center rows in container
  const availableHeight = containerHeight - verticalPadding * 2;
  const totalRows = Math.ceil(visibleCount / ballsPerRow);
  const verticalSpacing = availableHeight / Math.max(totalRows, 1);
  const startY = verticalPadding + verticalSpacing / 2;

  for (let i = 0; i < visibleCount; i++) {
    const row = Math.floor(i / ballsPerRow);
    const col = i % ballsPerRow;

    // Center each ball in its cell
    const x = horizontalPadding + col * horizontalSpacing + (horizontalSpacing - ballSize) / 2;
    const y = startY + row * verticalSpacing;

    positions.push({
      x,
      y,
      rotation: 0, // No rotation for clean egg tray look
    });
  }

  return positions;
}

function Ball({
  x,
  y,
  rotation,
  size,
  index,
  isGhost = false,
}: {
  x: number;
  y: number;
  rotation: number;
  size: number;
  index: number;
  isGhost?: boolean;
}) {
  return (
    <motion.div
      initial={isGhost ? false : { scale: 0, y: y - 30 }}
      animate={{ scale: 1, y }}
      exit={{ scale: 0, opacity: 0 }}
      transition={{
        type: 'spring',
        stiffness: 300,
        damping: 20,
        delay: isGhost ? 0 : index * 0.02,
      }}
      style={{
        position: 'absolute',
        left: x,
        top: y,
        transform: `rotate(${rotation}deg)`,
      }}
    >
      <svg
        width={size}
        height={size * 0.94}
        viewBox={`0 0 ${size} ${size * 0.94}`}
        style={{
          filter: isGhost ? undefined : 'drop-shadow(1px 2px 2px rgba(0,0,0,0.15))',
        }}
      >
        {/* Ball body */}
        <ellipse
          cx={size / 2}
          cy={(size * 0.94) / 2}
          rx={size / 2 - 2}
          ry={(size * 0.94) / 2 - 2}
          fill={isGhost ? 'transparent' : BALL_COLORS.fill}
          stroke={BALL_COLORS.stroke}
          strokeWidth={isGhost ? 1.5 : 2.5}
          opacity={isGhost ? 0.12 : 1}
        />
        {/* Highlight for 3D effect */}
        {!isGhost && (
          <>
            <ellipse
              cx={size * 0.35}
              cy={size * 0.3}
              rx={size * 0.18}
              ry={size * 0.12}
              fill="rgba(255,255,255,0.35)"
            />
            {/* Radial gradient overlay */}
            <defs>
              <radialGradient id={`ballGradient-${index}`} cx="30%" cy="30%">
                <stop offset="0%" stopColor="rgba(255,255,255,0.2)" />
                <stop offset="100%" stopColor="rgba(0,0,0,0.05)" />
              </radialGradient>
            </defs>
            <ellipse
              cx={size / 2}
              cy={(size * 0.94) / 2}
              rx={size / 2 - 2}
              ry={(size * 0.94) / 2 - 2}
              fill={`url(#ballGradient-${index})`}
            />
          </>
        )}
      </svg>
    </motion.div>
  );
}

export const InventoryTray = forwardRef<HTMLDivElement, InventoryTrayProps>(
  function InventoryTray({ ballType, count, maxVisible = 25, className }, ref) {
    const ballSize = BALL_SIZES[ballType];
    // Responsive container - smaller on mobile
    const containerWidth = 180;
    const containerHeight = 100;

    const visibleCount = Math.min(count, maxVisible);
    const overflow = Math.max(0, count - maxVisible);

    const positions = useMemo(
      () => calculateBallPositions(visibleCount, ballSize, containerWidth, containerHeight),
      [visibleCount, ballSize]
    );

    // Ghost ball positions for empty state (show 5x3 = 15 ghost balls)
    const ghostPositions = useMemo(
      () => calculateBallPositions(15, ballSize, containerWidth, containerHeight),
      [ballSize]
    );

    const label = ballType === 'original' ? 'ORIGINAL' : 'BITE-SIZED';

    return (
      <div ref={ref} className={cn('space-y-2', className)}>
      {/* Tray label */}
      <div className="text-xs font-semibold text-center text-muted-foreground uppercase tracking-wide">
        {label} TRAY
      </div>

      {/* Tray container - responsive with max-width */}
      <div
        className="relative rounded-xl border-2 border-dashed border-muted-foreground/30 bg-gradient-to-b from-stone-100 to-stone-200 dark:from-stone-800 dark:to-stone-900 overflow-hidden mx-auto"
        style={{ width: '100%', maxWidth: containerWidth, height: containerHeight }}
      >
        {/* Ghost balls for empty state */}
        {count === 0 && (
          <>
            {ghostPositions.map((pos, i) => (
              <Ball
                key={`ghost-${i}`}
                x={pos.x}
                y={pos.y}
                rotation={pos.rotation}
                size={ballSize}
                index={i}
                isGhost
              />
            ))}
          </>
        )}

        {/* Actual balls */}
        <AnimatePresence>
          {positions.map((pos, i) => (
            <Ball
              key={`ball-${i}`}
              x={pos.x}
              y={pos.y}
              rotation={pos.rotation}
              size={ballSize}
              index={i}
            />
          ))}
        </AnimatePresence>
      </div>

      {/* Count display */}
      <div className="text-center">
        <span className="inline-flex items-center justify-center px-3 py-1 rounded-full bg-muted text-lg font-bold tabular-nums">
          {count}
        </span>
        {overflow > 0 && (
          <div className="text-xs text-muted-foreground mt-1">+{overflow} more</div>
        )}
      </div>
    </div>
  );
});

export default InventoryTray;
