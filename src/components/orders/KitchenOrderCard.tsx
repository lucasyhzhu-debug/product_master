import { useState, useRef, useEffect, useCallback } from 'react';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Undo2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { KitchenOrder } from '@/lib/types';

interface KitchenOrderCardProps {
  order: KitchenOrder;
  onComplete: () => void;
  onRevert: () => void;
  isCompleted?: boolean;
}

function formatDueTime(dueDate: string | null): string {
  if (!dueDate) return '-';
  const date = new Date(dueDate);
  return date.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getUrgencyState(dueDate: string | null): 'overdue' | 'urgent' | 'normal' {
  if (!dueDate) return 'normal';

  const now = new Date();
  const due = new Date(dueDate);
  const diffMs = due.getTime() - now.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  if (diffMs < 0) return 'overdue';
  if (diffHours <= 2) return 'urgent';
  return 'normal';
}

export default function KitchenOrderCard({
  order,
  onComplete,
  onRevert,
  isCompleted = false,
}: KitchenOrderCardProps) {
  const [isHolding, setIsHolding] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const urgency = getUrgencyState(order.due_date);

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
    setIsHolding(true);
    setHoldProgress(0);

    // Progress animation (update every 100ms for smooth progress)
    progressRef.current = setInterval(() => {
      setHoldProgress((prev) => Math.min(prev + 10, 100));
    }, 100);

    // Complete after 1 second
    holdTimerRef.current = setTimeout(() => {
      onComplete();
      cancelHold();
    }, 1000);
  }, [onComplete, cancelHold]);

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

  // Card border styles based on urgency
  const cardClassName = cn(
    'relative overflow-hidden transition-all',
    {
      // Completed state
      'bg-green-50 dark:bg-green-950/20 border-green-300 dark:border-green-800': isCompleted,
      // Overdue state - red pulsing border
      'border-red-500 animate-pulse shadow-red-200 dark:shadow-red-900/30 shadow-lg':
        !isCompleted && urgency === 'overdue',
      // Urgent state - amber pulse
      'border-amber-500 animate-pulse shadow-amber-200 dark:shadow-amber-900/30 shadow-md':
        !isCompleted && urgency === 'urgent',
    }
  );

  return (
    <Card className={cardClassName}>
      {/* Header: Order number, customer name, due time */}
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-mono font-semibold text-lg truncate">
              #{order.order_number}
            </span>
            <span className="text-muted-foreground">-</span>
            <span className="truncate">{order.customer_name}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {urgency === 'urgent' && !isCompleted && (
              <Badge className="bg-amber-500 text-white animate-pulse">
                URGENT
              </Badge>
            )}
            {urgency === 'overdue' && !isCompleted && (
              <Badge className="bg-red-500 text-white animate-pulse">
                OVERDUE
              </Badge>
            )}
            <span className="text-sm text-muted-foreground whitespace-nowrap">
              DUE: {formatDueTime(order.due_date)}
            </span>
          </div>
        </div>
      </CardHeader>

      <Separator />

      {/* Body: Ball counts */}
      <CardContent className="py-6">
        <div className="flex justify-center items-center gap-12">
          {/* Big balls (red circle) */}
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-full bg-red-500" />
              <span className="text-5xl font-bold tabular-nums">
                {order.big_balls_needed}
              </span>
            </div>
            <span className="text-sm text-muted-foreground">big</span>
          </div>

          {/* Mid balls (yellow circle) */}
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-full bg-yellow-500" />
              <span className="text-5xl font-bold tabular-nums">
                {order.mid_balls_needed}
              </span>
            </div>
            <span className="text-sm text-muted-foreground">mid</span>
          </div>
        </div>
      </CardContent>

      <Separator />

      {/* Footer: Hold-to-complete or Undo button */}
      <CardFooter className="py-3">
        {isCompleted ? (
          <Button
            variant="outline"
            className="w-full"
            onClick={onRevert}
          >
            <Undo2 className="h-4 w-4 mr-2" />
            Undo Complete
          </Button>
        ) : (
          <div
            className="relative w-full h-10 rounded-md overflow-hidden cursor-pointer select-none"
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
              className="absolute inset-y-0 left-0 bg-green-500 transition-all duration-100"
              style={{ width: `${holdProgress}%` }}
            />

            {/* Text */}
            <div className="absolute inset-0 flex items-center justify-center text-sm font-medium">
              {isHolding ? (
                <span className="text-white mix-blend-difference">
                  {holdProgress < 100 ? 'Hold...' : 'Completing!'}
                </span>
              ) : (
                <span className="text-secondary-foreground">
                  Hold 1 sec to complete this order
                </span>
              )}
            </div>
          </div>
        )}
      </CardFooter>
    </Card>
  );
}
