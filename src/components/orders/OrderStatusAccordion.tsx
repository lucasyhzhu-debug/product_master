import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Check, Circle, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { OrderStatus } from '@/lib/types';

// ============================================
// Types
// ============================================

export type StepStatus = 'completed' | 'current' | 'pending';

export interface OrderStep {
  id: string;
  title: string;
  description?: string;
  status: StepStatus;
  content?: React.ReactNode;
  completedAt?: Date;
}

interface OrderStatusAccordionProps {
  steps: OrderStep[];
  currentStatus: OrderStatus;
  defaultOpenStep?: string;
  className?: string;
  /** Callback when a step is expanded */
  onStepChange?: (stepId: string | undefined) => void;
}

// ============================================
// Animation Variants
// ============================================

const iconVariants = {
  initial: { scale: 0.8, opacity: 0 },
  animate: { scale: 1, opacity: 1 },
  completed: {
    scale: [1, 1.2, 1],
    transition: { duration: 0.3 },
  },
};

const pulseVariants = {
  animate: {
    scale: [1, 1.05, 1],
    opacity: [1, 0.8, 1],
    transition: {
      duration: 2,
      repeat: Infinity,
      ease: 'easeInOut',
    },
  },
};

const connectorVariants = {
  initial: { scaleY: 0, originY: 0 },
  animate: { scaleY: 1, transition: { duration: 0.4, ease: 'easeOut' } },
};

// ============================================
// Step Status Icon Component
// ============================================

function StepStatusIcon({ status, stepId }: { status: StepStatus; stepId: string }) {
  return (
    <AnimatePresence mode="wait">
      {status === 'completed' && (
        <motion.div
          key={`${stepId}-completed`}
          initial="initial"
          animate="completed"
          variants={iconVariants}
          className="flex h-10 w-10 sm:h-8 sm:w-8 items-center justify-center rounded-full bg-green-500 text-white shadow-sm"
          aria-label="Step completed"
        >
          <Check className="h-5 w-5 sm:h-4 sm:w-4" />
        </motion.div>
      )}
      {status === 'current' && (
        <motion.div
          key={`${stepId}-current`}
          initial="initial"
          animate="animate"
          variants={pulseVariants}
          className="flex h-10 w-10 sm:h-8 sm:w-8 items-center justify-center rounded-full bg-blue-500 text-white shadow-md ring-4 ring-blue-500/20"
          aria-label="Current step"
        >
          <Clock className="h-5 w-5 sm:h-4 sm:w-4" />
        </motion.div>
      )}
      {status === 'pending' && (
        <motion.div
          key={`${stepId}-pending`}
          initial="initial"
          animate="animate"
          variants={iconVariants}
          className="flex h-10 w-10 sm:h-8 sm:w-8 items-center justify-center rounded-full border-2 border-muted-foreground/30 text-muted-foreground/50"
          aria-label="Pending step"
        >
          <Circle className="h-5 w-5 sm:h-4 sm:w-4" />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ============================================
// Step Connector Line
// ============================================

function StepConnector({ status, isAnimated }: { status: StepStatus; isAnimated?: boolean }) {
  return (
    <motion.div
      initial={isAnimated ? 'initial' : false}
      animate="animate"
      variants={isAnimated ? connectorVariants : undefined}
      className={cn(
        'absolute left-5 sm:left-4 top-12 sm:top-10 h-[calc(100%-3rem)] sm:h-[calc(100%-2.5rem)] w-0.5 -translate-x-1/2',
        status === 'completed' ? 'bg-green-500' : 'bg-muted-foreground/20'
      )}
      aria-hidden="true"
    />
  );
}

// ============================================
// Main Component
// ============================================

export function OrderStatusAccordion({
  steps,
  currentStatus: _currentStatus,
  defaultOpenStep,
  className,
  onStepChange,
}: OrderStatusAccordionProps) {
  // Default to opening the current step
  const defaultOpen = defaultOpenStep || steps.find((s) => s.status === 'current')?.id || steps[0]?.id;

  // Track previous status for animation
  const [prevStatuses, setPrevStatuses] = React.useState<Record<string, StepStatus>>({});

  // Update previous statuses when steps change
  React.useEffect(() => {
    const newStatuses: Record<string, StepStatus> = {};
    steps.forEach((step) => {
      newStatuses[step.id] = step.status;
    });
    setPrevStatuses(newStatuses);
  }, [steps]);

  // Check if a step just completed
  const justCompleted = (stepId: string, currentStatus: StepStatus) => {
    return prevStatuses[stepId] === 'current' && currentStatus === 'completed';
  };

  return (
    <Card
      className={cn('overflow-hidden', className)}
      role="region"
      aria-label="Order progress tracker"
    >
      <CardHeader className="pb-2 px-4 sm:px-6">
        <CardTitle className="text-base sm:text-lg">Order Progress</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Accordion
          type="single"
          collapsible
          defaultValue={defaultOpen}
          onValueChange={onStepChange}
          className="w-full"
        >
          {steps.map((step, index) => (
            <div key={step.id} className="relative">
              {/* Connector line between steps */}
              {index < steps.length - 1 && (
                <StepConnector
                  status={step.status}
                  isAnimated={justCompleted(step.id, step.status)}
                />
              )}

              <AccordionItem
                value={step.id}
                className="border-b-0 px-4 sm:px-6"
              >
                <AccordionTrigger
                  className={cn(
                    'py-4 sm:py-3 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-lg',
                    'min-h-[56px] sm:min-h-[48px]', // Touch-friendly tap targets
                    step.status === 'pending' && 'opacity-50 cursor-not-allowed',
                    step.status === 'current' && 'bg-blue-50/50 dark:bg-blue-950/20 -mx-2 px-2 rounded-lg'
                  )}
                  disabled={step.status === 'pending'}
                  aria-describedby={`step-${step.id}-description`}
                >
                  <div className="flex items-center gap-3 sm:gap-3 text-left w-full">
                    <StepStatusIcon status={step.status} stepId={step.id} />
                    <div className="flex-1 min-w-0">
                      <div
                        className={cn(
                          'font-medium text-base sm:text-sm truncate',
                          step.status === 'completed' && 'text-green-600 dark:text-green-400',
                          step.status === 'current' && 'text-blue-600 dark:text-blue-400'
                        )}
                      >
                        {step.title}
                      </div>
                      {step.description && (
                        <div
                          id={`step-${step.id}-description`}
                          className="text-sm sm:text-xs text-muted-foreground truncate"
                        >
                          {step.description}
                        </div>
                      )}
                      {step.completedAt && (
                        <div className="text-xs text-muted-foreground">
                          {step.completedAt.toLocaleDateString('id-ID', {
                            day: '2-digit',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </AccordionTrigger>

                {step.content && (
                  <AccordionContent className="pl-13 sm:pl-11 pb-4 pr-2">
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      {step.content}
                    </motion.div>
                  </AccordionContent>
                )}
              </AccordionItem>
            </div>
          ))}
        </Accordion>
      </CardContent>
    </Card>
  );
}

export default OrderStatusAccordion;
