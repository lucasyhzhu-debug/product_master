import { useState, useRef, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { playDing } from '@/lib/kitchenSounds';

interface BallCompletionButtonsProps {
  onComplete: (ballType: 'big' | 'mid', count: number) => Promise<void>;
  disabled?: boolean;
}

interface HoldButtonProps {
  ballType: 'big' | 'mid';
  count: number;
  onActivate: () => Promise<void>;
  disabled?: boolean;
}

function HoldButton({ ballType, count, onActivate, disabled }: HoldButtonProps) {
  const [isHolding, setIsHolding] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cancelHold = useCallback(() => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (progressRef.current) {
      clearInterval(progressRef.current);
      progressRef.current = null;
    }
    setIsHolding(false);
    setHoldProgress(0);
  }, []);

  const startHold = useCallback(() => {
    if (disabled) return;

    setIsHolding(true);
    setHoldProgress(0);

    // Progress animation (update every 100ms for smooth progress)
    progressRef.current = setInterval(() => {
      setHoldProgress((prev) => Math.min(prev + 10, 100));
    }, 100);

    // Complete after 1 second
    holdTimerRef.current = setTimeout(async () => {
      await onActivate();
      await playDing();
      cancelHold();
    }, 1000);
  }, [onActivate, cancelHold, disabled]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (holdTimerRef.current) {
        clearTimeout(holdTimerRef.current);
      }
      if (progressRef.current) {
        clearInterval(progressRef.current);
      }
    };
  }, []);

  return (
    <div
      className={cn(
        'relative h-20 rounded-lg overflow-hidden cursor-pointer select-none transition-opacity',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
      onMouseDown={startHold}
      onMouseUp={cancelHold}
      onMouseLeave={cancelHold}
      onTouchStart={startHold}
      onTouchEnd={cancelHold}
      onTouchCancel={cancelHold}
    >
      {/* Background */}
      <div className="absolute inset-0 bg-secondary" />

      {/* Progress fill */}
      <div
        className={cn(
          'absolute inset-y-0 left-0 transition-all duration-100',
          ballType === 'big' ? 'bg-red-500' : 'bg-yellow-500'
        )}
        style={{ width: `${holdProgress}%` }}
      />

      {/* Content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
        {/* Ball circle */}
        <div
          className={cn(
            'w-6 h-6 rounded-full',
            ballType === 'big' ? 'bg-red-500' : 'bg-yellow-500'
          )}
        />

        {/* Text */}
        <div className="text-center">
          <div
            className={cn(
              'text-sm font-bold transition-colors',
              isHolding ? 'text-white mix-blend-difference' : 'text-foreground'
            )}
          >
            +{count} {ballType === 'big' ? 'Big' : 'Mid'}
          </div>
        </div>
      </div>

      {/* Hold instruction (only show when not holding) */}
      {!isHolding && (
        <div className="absolute bottom-1 left-0 right-0 text-center">
          <span className="text-[10px] text-muted-foreground">
            Hold 1s
          </span>
        </div>
      )}
    </div>
  );
}

export default function BallCompletionButtons({
  onComplete,
  disabled = false,
}: BallCompletionButtonsProps) {
  const handleComplete = async (ballType: 'big' | 'mid', count: number) => {
    await onComplete(ballType, count);
  };

  return (
    <Card>
      <CardContent className="p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <HoldButton
            ballType="big"
            count={1}
            onActivate={() => handleComplete('big', 1)}
            disabled={disabled}
          />
          <HoldButton
            ballType="big"
            count={5}
            onActivate={() => handleComplete('big', 5)}
            disabled={disabled}
          />
          <HoldButton
            ballType="mid"
            count={1}
            onActivate={() => handleComplete('mid', 1)}
            disabled={disabled}
          />
          <HoldButton
            ballType="mid"
            count={5}
            onActivate={() => handleComplete('mid', 5)}
            disabled={disabled}
          />
        </div>
      </CardContent>
    </Card>
  );
}
