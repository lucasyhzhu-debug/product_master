import { useState, useRef, useCallback } from 'react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface HoldButtonProps extends Omit<ButtonProps, 'onClick'> {
  /** Duration in milliseconds to hold before activation (default: 1000ms) */
  holdDuration?: number;
  /** Callback when hold is complete */
  onHoldComplete: () => void;
  /** Optional text to show during hold */
  holdingText?: string;
  children: React.ReactNode;
}

export function HoldButton({
  holdDuration = 1000,
  onHoldComplete,
  holdingText,
  children,
  className,
  disabled,
  ...props
}: HoldButtonProps) {
  const [isHolding, setIsHolding] = useState(false);
  const [progress, setProgress] = useState(0);
  const holdTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  const startHold = useCallback(() => {
    if (disabled) return;

    setIsHolding(true);
    setProgress(0);
    startTimeRef.current = Date.now();

    holdTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const newProgress = Math.min((elapsed / holdDuration) * 100, 100);
      setProgress(newProgress);

      if (elapsed >= holdDuration) {
        // Hold complete
        if (holdTimerRef.current) {
          clearInterval(holdTimerRef.current);
          holdTimerRef.current = null;
        }
        setIsHolding(false);
        setProgress(0);
        onHoldComplete();
      }
    }, 16); // ~60fps updates
  }, [holdDuration, onHoldComplete, disabled]);

  const cancelHold = useCallback(() => {
    if (holdTimerRef.current) {
      clearInterval(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    setIsHolding(false);
    setProgress(0);
  }, []);

  return (
    <Button
      {...props}
      disabled={disabled}
      className={cn(
        'relative overflow-hidden select-none',
        className
      )}
      onMouseDown={startHold}
      onMouseUp={cancelHold}
      onMouseLeave={cancelHold}
      onTouchStart={startHold}
      onTouchEnd={cancelHold}
      onTouchCancel={cancelHold}
    >
      {/* Progress fill */}
      {isHolding && (
        <div
          className="absolute inset-0 bg-current opacity-20 transition-none"
          style={{ width: `${progress}%` }}
        />
      )}

      {/* Content */}
      <span className="relative z-10">
        {isHolding && holdingText ? holdingText : children}
      </span>
    </Button>
  );
}
