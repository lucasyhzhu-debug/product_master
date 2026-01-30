import { useRef } from 'react';
import { ChevronLeft, ChevronRight, type LucideIcon } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface CarouselProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
  children: React.ReactNode;
  emptyMessage?: string;
  isEmpty?: boolean;
  itemCount?: number;
  /** Data attribute for onboarding tour targeting */
  'data-tour-step'?: string;
}

export function Carousel({
  title,
  description,
  icon: Icon,
  action,
  children,
  emptyMessage = 'No items yet',
  isEmpty = false,
  itemCount,
  'data-tour-step': dataTourStep,
}: CarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: 'left' | 'right') => {
    if (!scrollRef.current) return;
    const scrollAmount = 300;
    scrollRef.current.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    });
  };

  return (
    <section className="mb-8" data-tour-step={dataTourStep}>
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-start gap-3">
          {Icon && (
            <div className="mt-0.5 p-2 rounded-lg bg-primary/10">
              <Icon className="h-5 w-5 text-primary" />
            </div>
          )}
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
              {itemCount !== undefined && (
                <span className="text-sm text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                  {itemCount}
                </span>
              )}
            </div>
            {description && (
              <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isEmpty && (
            <>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => scroll('left')}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => scroll('right')}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </>
          )}
          {action}
        </div>
      </div>

      {isEmpty ? (
        <div className="flex items-center justify-center h-40 border rounded-lg bg-muted/50">
          <p className="text-muted-foreground">{emptyMessage}</p>
        </div>
      ) : (
        <div
          ref={scrollRef}
          className={cn(
            "flex gap-4 overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent",
            "-mx-1 px-1" // Allow box shadow to show
          )}
        >
          <AnimatePresence mode="popLayout">
            {children}
          </AnimatePresence>
        </div>
      )}
    </section>
  );
}
