import { motion } from 'framer-motion';

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

interface FlyingBallProps {
  ballType: 'original' | 'bite_sized';
  fromPosition: { x: number; y: number };
  toPosition: { x: number; y: number };
  delay?: number;
  onComplete?: () => void;
}

export function FlyingBall({
  ballType,
  fromPosition,
  toPosition,
  delay = 0,
  onComplete,
}: FlyingBallProps) {
  const size = BALL_SIZES[ballType];

  return (
    <motion.div
      style={{
        position: 'fixed',
        left: fromPosition.x - size / 2,
        top: fromPosition.y - size / 2,
        zIndex: 1000,
        pointerEvents: 'none',
      }}
      initial={{ scale: 1, opacity: 1 }}
      animate={{
        left: toPosition.x - size / 2,
        top: toPosition.y - size / 2,
        scale: [1, 1.3, 0.8],
      }}
      transition={{
        duration: 0.5,
        delay,
        ease: [0.25, 0.1, 0.25, 1], // Smooth bezier curve
      }}
      onAnimationComplete={onComplete}
    >
      <svg
        width={size}
        height={size * 0.94}
        viewBox={`0 0 ${size} ${size * 0.94}`}
        style={{
          filter: 'drop-shadow(2px 3px 3px rgba(0,0,0,0.25))',
        }}
      >
        {/* Ball body */}
        <ellipse
          cx={size / 2}
          cy={(size * 0.94) / 2}
          rx={size / 2 - 2}
          ry={(size * 0.94) / 2 - 2}
          fill={BALL_COLORS.fill}
          stroke={BALL_COLORS.stroke}
          strokeWidth={2.5}
        />
        {/* Highlight for 3D effect */}
        <ellipse
          cx={size * 0.35}
          cy={size * 0.3}
          rx={size * 0.18}
          ry={size * 0.12}
          fill="rgba(255,255,255,0.4)"
        />
      </svg>
    </motion.div>
  );
}

export default FlyingBall;
