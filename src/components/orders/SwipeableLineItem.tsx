import { useRef, useEffect } from 'react';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import { Trash2 } from 'lucide-react';

interface SwipeableLineItemProps {
  onRemove: () => void;
  children: React.ReactNode;
}

export function SwipeableLineItem({ onRemove, children }: SwipeableLineItemProps) {
  const x = useMotionValue(0);
  const deleteOpacity = useTransform(x, [-100, -60, 0], [1, 0.5, 0]);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  return (
    <div className="relative overflow-hidden rounded-lg">
      <motion.div
        className="absolute inset-y-0 right-0 flex items-center px-4 bg-destructive rounded-r-lg"
        style={{ opacity: deleteOpacity }}
      >
        <Trash2 className="h-5 w-5 text-destructive-foreground" />
      </motion.div>
      <motion.div
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: -100, right: 0 }}
        dragElastic={0.1}
        onDragEnd={(_, info) => {
          if (info.offset.x < -60 || info.velocity.x < -500) {
            animate(x, -300, { duration: 0.2 });
            setTimeout(() => {
              if (isMounted.current) onRemove();
            }, 200);
          } else {
            animate(x, 0, { type: 'spring', stiffness: 300, damping: 30 });
          }
        }}
        style={{ x }}
        className="relative bg-background"
      >
        {children}
      </motion.div>
    </div>
  );
}
