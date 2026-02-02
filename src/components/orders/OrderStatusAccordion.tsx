import * as React from 'react';
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
}

// ============================================
// Step Status Icon Component
// ============================================

function StepStatusIcon({ status }: { status: StepStatus }) {
  switch (status) {
    case 'completed':
      return (
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-500 text-white">
          <Check className="h-4 w-4" />
        </div>
      );
    case 'current':
      return (
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500 text-white animate-pulse">
          <Clock className="h-4 w-4" />
        </div>
      );
    case 'pending':
    default:
      return (
        <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-muted-foreground/30 text-muted-foreground/50">
          <Circle className="h-4 w-4" />
        </div>
      );
  }
}

// ============================================
// Step Connector Line
// ============================================

function StepConnector({ status }: { status: StepStatus }) {
  return (
    <div
      className={cn(
        'absolute left-4 top-10 h-[calc(100%-2.5rem)] w-0.5 -translate-x-1/2',
        status === 'completed' ? 'bg-green-500' : 'bg-muted-foreground/20'
      )}
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
}: OrderStatusAccordionProps) {
  // Default to opening the current step
  const defaultOpen = defaultOpenStep || steps.find((s) => s.status === 'current')?.id || steps[0]?.id;

  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Order Progress</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Accordion
          type="single"
          collapsible
          defaultValue={defaultOpen}
          className="w-full"
        >
          {steps.map((step, index) => (
            <div key={step.id} className="relative">
              {/* Connector line between steps */}
              {index < steps.length - 1 && <StepConnector status={step.status} />}

              <AccordionItem value={step.id} className="border-b-0 px-4">
                <AccordionTrigger
                  className={cn(
                    'py-4 hover:no-underline',
                    step.status === 'pending' && 'opacity-50'
                  )}
                >
                  <div className="flex items-center gap-3 text-left">
                    <StepStatusIcon status={step.status} />
                    <div>
                      <div
                        className={cn(
                          'font-medium',
                          step.status === 'completed' && 'text-green-600',
                          step.status === 'current' && 'text-blue-600'
                        )}
                      >
                        {step.title}
                      </div>
                      {step.description && (
                        <div className="text-sm text-muted-foreground">
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
                  <AccordionContent className="pl-11 pb-4">
                    {step.content}
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
