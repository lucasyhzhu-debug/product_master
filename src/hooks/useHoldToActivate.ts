/**
 * Reusable hook for hold-to-activate button pattern.
 * Used for confirmation actions requiring user to press and hold.
 */
import { useState, useRef, useCallback, useEffect } from 'react';

interface UseHoldToActivateOptions {
  /** Duration in ms to hold before activation (default: 1000ms) */
  duration?: number;
  /** Callback when hold completes */
  onComplete: () => void;
  /** Disable the hold interaction */
  disabled?: boolean;
}

interface UseHoldToActivateReturn {
  /** Whether currently holding */
  isHolding: boolean;
  /** Progress from 0-100 */
  progress: number;
  /** Event handlers to spread on the button element */
  handlers: {
    onMouseDown: () => void;
    onMouseUp: () => void;
    onMouseLeave: () => void;
    onTouchStart: () => void;
    onTouchEnd: () => void;
    onTouchCancel: () => void;
  };
}

/**
 * Hook for creating hold-to-activate buttons with progress feedback.
 *
 * @example
 * ```tsx
 * const { isHolding, progress, handlers } = useHoldToActivate({
 *   duration: 1000,
 *   onComplete: handleConfirm,
 *   disabled: !canConfirm,
 * });
 *
 * return (
 *   <button {...handlers}>
 *     {isHolding ? `Hold... ${progress}%` : 'Confirm'}
 *   </button>
 * );
 * ```
 */
export function useHoldToActivate({
  duration = 1000,
  onComplete,
  disabled = false,
}: UseHoldToActivateOptions): UseHoldToActivateReturn {
  const [isHolding, setIsHolding] = useState(false);
  const [progress, setProgress] = useState(0);

  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cancel hold and reset state
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
    setProgress(0);
  }, []);

  // Start hold interaction
  const startHold = useCallback(() => {
    if (disabled) return;

    setIsHolding(true);
    setProgress(0);

    // Update progress every 100ms (10 updates per second)
    const updateInterval = 100;
    const progressIncrement = (updateInterval / duration) * 100;

    progressRef.current = setInterval(() => {
      setProgress((prev) => Math.min(prev + progressIncrement, 100));
    }, updateInterval);

    // Complete after duration
    holdTimerRef.current = setTimeout(() => {
      onComplete();
      cancelHold();
    }, duration);
  }, [disabled, duration, onComplete, cancelHold]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
      if (progressRef.current) clearInterval(progressRef.current);
    };
  }, []);

  // Event handlers
  const handlers = {
    onMouseDown: startHold,
    onMouseUp: cancelHold,
    onMouseLeave: cancelHold,
    onTouchStart: startHold,
    onTouchEnd: cancelHold,
    onTouchCancel: cancelHold,
  };

  return {
    isHolding,
    progress,
    handlers,
  };
}
