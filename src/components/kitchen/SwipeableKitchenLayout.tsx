import { useState, useRef, useEffect } from 'react';
import { motion, useMotionValue } from 'framer-motion';
import type { PanInfo } from 'framer-motion';

interface SwipeableKitchenLayoutProps {
  children: React.ReactNode[];
  activeIndex: number;
  onIndexChange: (index: number) => void;
  stationCounts?: number[];
}

const STATIONS = [
  {
    label: 'Pro',
    fullName: 'Production Log',
    color: 'var(--color-station-production)',
    lightBg: 'var(--color-station-production-light)',
    accent: 'var(--color-station-production-accent)',
  },
  {
    label: 'Box',
    fullName: 'Boxing',
    color: 'var(--color-station-boxing)',
    lightBg: 'var(--color-station-boxing-light)',
    accent: 'var(--color-station-boxing-accent)',
  },
  {
    label: 'Stk',
    fullName: 'Stickering',
    color: 'var(--color-station-stickering)',
    lightBg: 'var(--color-station-stickering-light)',
    accent: 'var(--color-station-stickering-accent)',
  },
];

export function SwipeableKitchenLayout({
  children,
  activeIndex,
  onIndexChange,
  stationCounts = [0, 0, 0],
}: SwipeableKitchenLayoutProps) {
  const [containerWidth, setContainerWidth] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);

  // Measure container width
  useEffect(() => {
    if (!containerRef.current) return;

    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.offsetWidth);
      }
    };

    updateWidth();

    const resizeObserver = new ResizeObserver(updateWidth);
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  // Update position when activeIndex changes externally
  useEffect(() => {
    if (!isDragging && containerWidth > 0) {
      x.set(-activeIndex * containerWidth);
    }
  }, [activeIndex, containerWidth, isDragging, x]);

  const handleDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    setIsDragging(false);

    const offset = info.offset.x;
    const velocity = info.velocity.x;

    // Calculate threshold (30% of container width)
    const threshold = containerWidth * 0.3;

    let newIndex = activeIndex;

    // Determine swipe direction based on velocity or offset
    if (Math.abs(velocity) > 200) {
      // High velocity swipe
      if (velocity > 0 && activeIndex > 0) {
        newIndex = activeIndex - 1; // Swipe right (go to previous)
      } else if (velocity < 0 && activeIndex < children.length - 1) {
        newIndex = activeIndex + 1; // Swipe left (go to next)
      }
    } else if (Math.abs(offset) > threshold) {
      // Slow drag beyond threshold
      if (offset > 0 && activeIndex > 0) {
        newIndex = activeIndex - 1;
      } else if (offset < 0 && activeIndex < children.length - 1) {
        newIndex = activeIndex + 1;
      }
    }

    if (newIndex !== activeIndex) {
      onIndexChange(newIndex);
    } else {
      // Snap back to current position
      x.set(-activeIndex * containerWidth);
    }
  };

  const handleDragStart = () => {
    setIsDragging(true);
  };

  return (
    <div className="md:hidden">
      {/* Station Pill Bar */}
      <div className="sticky top-0 z-20 bg-card border-b border-border px-4 py-3">
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
          {STATIONS.map((station, index) => {
            const isActive = activeIndex === index;
            const count = stationCounts[index];

            return (
              <button
                key={station.label}
                onClick={() => onIndexChange(index)}
                className="relative px-3 py-1.5 min-w-[52px] rounded-full text-sm font-semibold transition-all touch-manipulation flex-shrink-0"
                style={{
                  backgroundColor: isActive ? station.color : station.lightBg,
                  color: isActive ? '#ffffff' : station.accent,
                }}
              >
                {station.label}
                {count > 0 && (
                  <span
                    className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-bold text-white rounded-full px-1"
                    style={{ backgroundColor: station.accent }}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Swipeable Panel Container */}
      <div ref={containerRef} className="overflow-hidden">
        <motion.div
          drag="x"
          dragElastic={0.15}
          dragConstraints={{ left: -(children.length - 1) * containerWidth, right: 0 }}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          style={{ x }}
          animate={{ x: -activeIndex * containerWidth }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="flex"
        >
          {children.map((child, index) => (
            <div
              key={index}
              className="w-full flex-shrink-0"
              style={{ width: containerWidth || '100%' }}
            >
              {child}
            </div>
          ))}
        </motion.div>
      </div>
    </div>
  );
}
