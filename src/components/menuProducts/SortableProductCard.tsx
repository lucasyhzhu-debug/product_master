import type { ReactNode } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import type { PosProduct, AvailableProduct, PackagingPosProduct } from '@/hooks/convex/useMenuProducts';

interface SortableProductCardProps {
  id: string;
  product: PosProduct | AvailableProduct | PackagingPosProduct;
  section: 'food-pos' | 'packaging-pos';
  children: ReactNode;
}

export function SortableProductCard({
  id,
  product,
  section,
  children,
}: SortableProductCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isSorting,
  } = useSortable({
    id,
    data: { product, section },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative group ${isDragging ? 'opacity-50 z-50 ring-2 ring-primary/30 rounded-lg' : ''} ${isSorting && !isDragging ? 'transition-transform duration-200' : ''}`}
    >
      {/* Drag handle */}
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
