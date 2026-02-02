import * as React from 'react';
import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Check, Circle, Clock, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================
// Types
// ============================================

export type StepState = 'completed' | 'active' | 'pending' | 'error';

export interface AccordionStepItemProps {
  /** Unique identifier for this step */
  id: string;
  /** Step title displayed in header */
  title: string;
  /** Optional subtitle or description */
  subtitle?: string;
  /** Current state of the step */
  state: StepState;
  /** Optional badge text (e.g., "Required", "Optional") */
  badge?: string;
  /** Badge variant */
  badgeVariant?: 'default' | 'secondary' | 'outline' | 'destructive';
  /** Timestamp when step was completed */
  completedAt?: Date;
  /** Content to render when expanded */
  children?: React.ReactNode;
  /** Whether this is the last step (affects connector) */
  isLast?: boolean;
  /** Additional class names */
  className?: string;
  /** Callback when step header is clicked */
  onStepClick?: (id: string) => void;
}

// ============================================
// State Icon Component
// ============================================

function StateIcon({ state }: { state: StepState }) {
  // Mobile: 40px (h-10 w-10), Desktop: 32px (h-8 w-8) for touch-friendly targets
  const baseClasses = 'flex h-10 w-10 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-full';

  switch (state) {
    case 'completed':
      return (
        <div className={cn(baseClasses, 'bg-green-500 text-white')}>
          <Check className="h-5 w-5 sm:h-4 sm:w-4" />
        </div>
      );
    case 'active':
      return (
        <div className={cn(baseClasses, 'bg-blue-500 text-white ring-4 ring-blue-500/20')}>
          <Clock className="h-5 w-5 sm:h-4 sm:w-4" />
        </div>
      );
    case 'error':
      return (
        <div className={cn(baseClasses, 'bg-red-500 text-white')}>
          <AlertCircle className="h-5 w-5 sm:h-4 sm:w-4" />
        </div>
      );
    case 'pending':
    default:
      return (
        <div className={cn(baseClasses, 'border-2 border-muted-foreground/30 text-muted-foreground/50')}>
          <Circle className="h-4 w-4 sm:h-3 sm:w-3" />
        </div>
      );
  }
}

// ============================================
// Connector Line Component
// ============================================

function ConnectorLine({ state, isLast }: { state: StepState; isLast: boolean }) {
  if (isLast) return null;

  return (
    <div
      className={cn(
        // Mobile: left-5 (matches h-10 icon center), Desktop: left-4
        'absolute left-5 sm:left-4 top-14 sm:top-12 h-[calc(100%-3.5rem)] sm:h-[calc(100%-3rem)] w-0.5 -translate-x-1/2',
        state === 'completed' ? 'bg-green-500' : 'bg-muted-foreground/20'
      )}
      aria-hidden="true"
    />
  );
}

// ============================================
// Main Component
// ============================================

export function AccordionStepItem({
  id,
  title,
  subtitle,
  state,
  badge,
  badgeVariant = 'outline',
  completedAt,
  children,
  isLast = false,
  className,
  onStepClick,
}: AccordionStepItemProps) {
  const handleClick = React.useCallback(() => {
    if (onStepClick) {
      onStepClick(id);
    }
  }, [id, onStepClick]);

  return (
    <div className={cn('relative', className)}>
      {/* Vertical connector line */}
      <ConnectorLine state={state} isLast={isLast} />

      <AccordionItem value={id} className="border-0">
        <AccordionTrigger
          onClick={handleClick}
          className={cn(
            // Mobile: larger padding for touch targets (min 44px effective height)
            'py-4 px-4 sm:py-3 hover:no-underline hover:bg-muted/50 rounded-lg transition-colors min-h-[56px] sm:min-h-[48px]',
            state === 'pending' && 'opacity-60 cursor-not-allowed'
          )}
          disabled={state === 'pending'}
        >
          <div className="flex items-center gap-3 flex-1 text-left">
            <StateIcon state={state} />

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'font-medium truncate text-base sm:text-sm',
                    state === 'completed' && 'text-green-600',
                    state === 'active' && 'text-blue-600',
                    state === 'error' && 'text-red-600'
                  )}
                >
                  {title}
                </span>
                {badge && (
                  <Badge variant={badgeVariant} className="text-xs">
                    {badge}
                  </Badge>
                )}
              </div>

              {subtitle && (
                <p className="text-sm sm:text-xs text-muted-foreground truncate">{subtitle}</p>
              )}

              {completedAt && (
                <p className="text-xs text-muted-foreground">
                  Completed {completedAt.toLocaleDateString('id-ID', {
                    day: '2-digit',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              )}
            </div>
          </div>
        </AccordionTrigger>

        {children && (
          <AccordionContent className="px-4 pl-16 sm:pl-14 pb-4">
            <div className="rounded-lg bg-muted/30 p-4">{children}</div>
          </AccordionContent>
        )}
      </AccordionItem>
    </div>
  );
}

export default AccordionStepItem;
