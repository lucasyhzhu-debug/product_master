import { useEffect, useCallback, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import { Camera, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';

interface FeedbackCaptureModeProps {
  isActive: boolean;
  onCapture: (blob: Blob, elementSelector: string) => void;
  onCancel: () => void;
}

interface ElementBounds {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function FeedbackCaptureMode({
  isActive,
  onCapture,
  onCancel,
}: FeedbackCaptureModeProps) {
  const [hoveredElement, setHoveredElement] = useState<HTMLElement | null>(null);
  const [elementBounds, setElementBounds] = useState<ElementBounds | null>(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [isCapturing, setIsCapturing] = useState(false);
  const rafId = useRef<number | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const previousElementRef = useRef<HTMLElement | null>(null);

  // Get element selector for display and reference
  const getElementSelector = useCallback((element: HTMLElement): string => {
    if (element.id) return `#${element.id}`;
    if (element.className) {
      const classes = element.className
        .split(' ')
        .filter((c) => c.trim() && !c.startsWith('hover:'))
        .slice(0, 2);
      if (classes.length > 0) {
        return `${element.tagName.toLowerCase()}.${classes.join('.')}`;
      }
    }
    return element.tagName.toLowerCase();
  }, []);

  // Get element info for tooltip
  const getElementInfo = useCallback(
    (element: HTMLElement): { tag: string; className: string } => {
      const tag = element.tagName;
      const className = element.className
        .split(' ')
        .filter((c) => c.trim() && !c.startsWith('hover:'))
        .slice(0, 2)
        .join(' ');

      return {
        tag,
        className: className.length > 30 ? className.slice(0, 30) + '...' : className,
      };
    },
    []
  );

  // Throttled mouse move handler
  const handleMouseMove = useCallback((e: MouseEvent) => {
    // Don't update if we're currently capturing
    if (isCapturing) return;

    // Update mouse position immediately for smooth tooltip
    setMousePosition({ x: e.clientX, y: e.clientY });

    // Throttle element detection with RAF
    if (rafId.current) return;

    rafId.current = requestAnimationFrame(() => {
      const element = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;

      // Don't highlight the overlay itself or its children
      if (element && overlayRef.current?.contains(element)) {
        rafId.current = null;
        return;
      }

      if (element && element !== previousElementRef.current) {
        const rect = element.getBoundingClientRect();
        setElementBounds({
          top: rect.top + window.scrollY,
          left: rect.left + window.scrollX,
          width: rect.width,
          height: rect.height,
        });
        setHoveredElement(element);
        previousElementRef.current = element;
      }

      rafId.current = null;
    });
  }, [isCapturing]);

  // Handle element click to capture
  const handleClick = useCallback(
    async (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (!hoveredElement || isCapturing) return;

      // Don't capture if clicking on the overlay
      if (overlayRef.current?.contains(e.target as Node)) return;

      setIsCapturing(true);

      try {
        const canvas = await html2canvas(hoveredElement, {
          useCORS: true,
          logging: false,
          scale: 2,
          backgroundColor: null,
          onclone: (clonedDoc: Document) => {
            // Remove any highlight styles from cloned document
            const clonedElement = clonedDoc.querySelector(
              `[data-element-id="${hoveredElement.getAttribute('data-element-id')}"]`
            );
            if (clonedElement) {
              (clonedElement as HTMLElement).style.outline = '';
            }
          },
        });

        // Convert to JPEG blob for compression
        canvas.toBlob(
          (blob: Blob | null) => {
            if (blob) {
              const selector = getElementSelector(hoveredElement);
              onCapture(blob, selector);
              toast.success('Element captured successfully');
            } else {
              toast.error('Failed to create image from canvas');
              setIsCapturing(false);
            }
          },
          'image/jpeg',
          0.8 // 80% quality
        );
      } catch (error) {
        console.error('Failed to capture element:', error);
        toast.error('Failed to capture element. Please try again.', {
          description: error instanceof Error ? error.message : 'Unknown error',
          action: {
            label: 'Retry',
            onClick: () => {
              setIsCapturing(false);
              // The user can click again to retry
            },
          },
        });
        setIsCapturing(false);
      }
    },
    [hoveredElement, isCapturing, getElementSelector, onCapture]
  );

  // Handle escape key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    },
    [onCancel]
  );

  // Setup event listeners
  useEffect(() => {
    if (!isActive) return;

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('click', handleClick, true);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('click', handleClick, true);
      document.removeEventListener('keydown', handleKeyDown);

      // Cleanup RAF
      if (rafId.current) {
        cancelAnimationFrame(rafId.current);
        rafId.current = null;
      }
    };
  }, [isActive, handleMouseMove, handleClick, handleKeyDown]);

  // Reset state when deactivated
  useEffect(() => {
    if (!isActive) {
      setHoveredElement(null);
      setElementBounds(null);
      setMousePosition({ x: 0, y: 0 });
      setIsCapturing(false);
      previousElementRef.current = null;
    }
  }, [isActive]);

  if (!isActive) return null;

  const elementInfo = hoveredElement ? getElementInfo(hoveredElement) : null;

  return (
    <>
      {/* Full-screen overlay */}
      <div
        ref={overlayRef}
        className="fixed inset-0 z-[60] bg-black/10 cursor-crosshair"
        style={{ pointerEvents: 'none' }}
      >
        {/* Instructions card */}
        <Card className="fixed top-4 left-1/2 -translate-x-1/2 px-4 py-3 shadow-lg pointer-events-auto">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900">
              <Camera className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="space-y-0.5">
              <p className="text-sm font-medium">
                {isCapturing ? 'Capturing element...' : 'Click on an element to capture'}
              </p>
              <p className="text-xs text-muted-foreground">Press Escape to cancel</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onCancel}
              className="ml-2"
              disabled={isCapturing}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </Card>

        {/* Element highlight overlay */}
        {elementBounds && !isCapturing && (
          <div
            className="fixed pointer-events-none transition-all duration-75"
            style={{
              top: elementBounds.top,
              left: elementBounds.left,
              width: elementBounds.width,
              height: elementBounds.height,
              outline: '2px solid #3b82f6',
              backgroundColor: 'rgba(59, 130, 246, 0.1)',
              zIndex: 9999,
            }}
          />
        )}

        {/* Tooltip following cursor */}
        {elementInfo && !isCapturing && (
          <div
            className="fixed pointer-events-none bg-gray-900 text-white text-xs px-2 py-1.5 rounded shadow-lg"
            style={{
              top: mousePosition.y + 10,
              left: mousePosition.x + 10,
              zIndex: 10000,
            }}
          >
            <div className="font-mono">
              <span className="text-blue-400">{elementInfo.tag}</span>
              {elementInfo.className && (
                <span className="text-gray-300 ml-1">.{elementInfo.className}</span>
              )}
            </div>
          </div>
        )}

        {/* Capturing indicator */}
        {isCapturing && (
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
            <Card className="px-6 py-4 shadow-xl">
              <div className="flex items-center gap-3">
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-blue-600 border-t-transparent" />
                <p className="text-sm font-medium">Capturing element...</p>
              </div>
            </Card>
          </div>
        )}
      </div>
    </>
  );
}
