import { useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface CarouselProps {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  emptyMessage?: string;
  isEmpty?: boolean;
}

export function Carousel({
  title,
  action,
  children,
  emptyMessage = 'No items yet',
  isEmpty = false,
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
    <section className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
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
          {children}
        </div>
      )}
    </section>
  );
}
