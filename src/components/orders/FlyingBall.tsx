import { motion } from 'framer-motion';

// Ball colors from design spec (matches InventoryTray and ProductPackage)
const BALL_COLORS = {
  fill: '#93C572', // Pistachio green
  stroke: '#7B3F00', // Chocolate brown
} as const;

// Ball sizes matching ProductPackage display
const BALL_SIZES = {
  original: 24,
  bite_sized: 16,
} as const;

interface FlyingBallProps {
  id: string;
  startPosition: { x: number; y: number };
  endPosition: { x: number; y: number };
  ballType: 'original' | 'bite_sized';
  delay?: number;
  onComplete: () => void;
}

export function FlyingBall({
  id,
  startPosition,
  endPosition,
  ballType,
  delay = 0,
  onComplete,
}: FlyingBallProps) {
  const size = BALL_SIZES[ballType];

  // Calculate arc height based on distance (larger distance = higher arc)
  const dx = endPosition.x - startPosition.x;
  const dy = endPosition.y - startPosition.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const arcHeight = Math.min(100, distance * 0.3);

  // Midpoint for the arc
  const midX = (startPosition.x + endPosition.x) / 2;
  const midY = Math.min(startPosition.y, endPosition.y) - arcHeight;

  return (
    <motion.div
      key={id}
      initial={{
        x: startPosition.x - size / 2,
        y: startPosition.y - size / 2,
        scale: 1,
        opacity: 1,
      }}
      animate={{
        x: [
          startPosition.x - size / 2,
          midX - size / 2,
          endPosition.x - size / 2,
        ],
        y: [
          startPosition.y - size / 2,
          midY - size / 2,
          endPosition.y - size / 2,
        ],
        scale: [1, 1.1, 0.9],
        rotate: [0, 180, 360],
        opacity: [1, 1, 0],
      }}
      transition={{
        duration: 0.5,
        delay,
        ease: 'easeOut',
        times: [0, 0.5, 1],
      }}
      onAnimationComplete={onComplete}
      style={{
        position: 'fixed',
        zIndex: 100,
        pointerEvents: 'none',
        filter: 'drop-shadow(2px 3px 3px rgba(0,0,0,0.2))',
      }}
    >
      <svg
        width={size}
        height={size * 0.94}
        viewBox={`0 0 ${size} ${size * 0.94}`}
      >
        {/* Ball with 3D effect */}
        <defs>
          <radialGradient
            id={`flyingBallGradient-${id}`}
            cx="35%"
            cy="35%"
            r="60%"
          >
            <stop offset="0%" stopColor="rgba(255,255,255,0.3)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.05)" />
          </radialGradient>
        </defs>
        <ellipse
          cx={size / 2}
          cy={(size * 0.94) / 2}
          rx={size / 2 - 2}
          ry={(size * 0.94) / 2 - 2}
          fill={BALL_COLORS.fill}
          stroke={BALL_COLORS.stroke}
          strokeWidth={2.5}
        />
        <ellipse
          cx={size / 2}
          cy={(size * 0.94) / 2}
          rx={size / 2 - 2}
          ry={(size * 0.94) / 2 - 2}
          fill={`url(#flyingBallGradient-${id})`}
        />
        {/* Highlight for 3D effect */}
        <ellipse
          cx={size * 0.35}
          cy={size * 0.3}
          rx={size * 0.15}
          ry={size * 0.1}
          fill="rgba(255,255,255,0.35)"
        />
      </svg>
    </motion.div>
  );
}

export default FlyingBall;
