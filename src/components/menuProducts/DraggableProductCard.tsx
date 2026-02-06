import type { ReactNode } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import type { PosProduct, AvailableProduct, PackagingPosProduct } from '@/hooks/convex/useMenuProducts';

interface DraggableProductCardProps {
  id: string;
  product: PosProduct | AvailableProduct | PackagingPosProduct;
  section: 'food-pos' | 'packaging-pos' | 'available';
  children: ReactNode;
  disabled?: boolean;
}

export function DraggableProductCard({
  id,
  product,
  section,
  children,
  disabled = false,
}: DraggableProductCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id,
    data: { product, section },
    disabled,
  });

  const style = transform
    ? {
        transform: CSS.Translate.toString(transform),
      }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative group ${isDragging ? 'opacity-50 ring-2 ring-primary/30 rounded-lg' : ''}`}
    >
      {/* Drag handle - always visible for touch devices */}
      <div
        {...listeners}
        {...attributes}
        className="absolute left-0 top-0 bottom-0 w-6 flex items-center justify-center z-10 cursor-grab active:cursor-grabbing rounded-l-lg hover:bg-muted/50 transition-colors"
        aria-label="Drag to reorder"
      >
        <GripVertical className="h-4 w-4 text-muted-foreground/60" />
      </div>
      {/* Content with left padding for drag handle */}
      <div className="pl-5">
        {children}
      </div>
    </div>
  );
}
