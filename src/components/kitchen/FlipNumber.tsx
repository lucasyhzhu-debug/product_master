/**
 * FlipNumber — Solari/split-flap display animation for numbers.
 *
 * Inspired by airport departure boards. Each digit sits on a dark panel
 * and scrolls vertically when the value changes, with staggered timing
 * from right to left.
 */
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface FlipNumberProps {
  value: number;
  className?: string;
  /** Size variant — affects digit panel dimensions */
  size?: 'sm' | 'md' | 'lg';
}

const SIZES = {
  sm: { width: '0.6em', height: '1.15em', gap: '0.5px', fontSize: 'inherit' },
  md: { width: '0.65em', height: '1.2em', gap: '0.5px', fontSize: 'inherit' },
  lg: { width: '0.65em', height: '1.25em', gap: '1px', fontSize: 'inherit' },
} as const;

function FlipDigit({ char, delay = 0, size = 'md' }: { char: string; delay?: number; size?: 'sm' | 'md' | 'lg' }) {
  const s = SIZES[size];

  return (
    <span
      className="relative inline-flex items-center justify-center overflow-hidden rounded-[3px] bg-[#1C2127]"
      style={{ width: s.width, height: s.height, margin: `0 ${s.gap}` }}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={char}
          initial={{ y: '100%' }}
          animate={{ y: '0%' }}
          exit={{ y: '-100%' }}
          transition={{ type: 'spring', stiffness: 300, damping: 25, delay }}
          className="absolute inset-0 flex items-center justify-center text-[#F0EDE8] font-bold leading-none"
        >
          {char}
        </motion.span>
      </AnimatePresence>
      {/* Split-flap center line */}
      <span className="absolute inset-x-0 top-1/2 h-[0.5px] bg-black/20 z-10 pointer-events-none" />
    </span>
  );
}

export function FlipNumber({ value, className, size = 'md' }: FlipNumberProps) {
  const str = String(value);

  return (
    <span className={cn('inline-flex items-center tabular-nums', className)}>
      {str.split('').map((char, i) => {
        if (char === '-') {
          return (
            <span
              key="minus"
              className="inline-flex items-center justify-center text-[#1C2127] font-bold"
              style={{ width: '0.4em' }}
            >
              −
            </span>
          );
        }
        // Key by position from right so digits stay in place as number grows
        const posFromRight = str.length - 1 - i;
        return (
          <FlipDigit
            key={posFromRight}
            char={char}
            delay={posFromRight * 0.04}
            size={size}
          />
        );
      })}
    </span>
  );
}

/**
 * Flowing chevrons animation for action buttons.
 * Shows animated ">>>" when there's a valid quantity to process,
 * suggesting material flows to the next station.
 */
export function FlowChevrons({ color = 'currentColor' }: { color?: string }) {
  return (
    <span className="inline-flex ml-1 gap-[1px] items-center">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          animate={{ opacity: [0.2, 1, 0.2] }}
          transition={{
            duration: 0.8,
            delay: i * 0.2,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          className="text-[11px] leading-none font-bold"
          style={{ color }}
        >
          ›
        </motion.span>
      ))}
    </span>
  );
}
