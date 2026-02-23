import type { ReactNode } from 'react';
import { useDroppable } from '@dnd-kit/core';

interface DroppableSlotZoneProps {
  id: string;
  slotType: 'food' | 'packaging' | 'available';
  slotNumber?: number;
  children: ReactNode;
}

export function DroppableSlotZone({
  id,
  slotType,
  slotNumber,
  children,
}: DroppableSlotZoneProps) {
  const { setNodeRef, isOver, active } = useDroppable({
    id,
    data: { slotType, slotNumber },
  });

  // Determine if the drag source is compatible with this drop target
  const sourceSection = active?.data?.current?.section as string | undefined;
  const sourceProduct = active?.data?.current?.product as { productType?: string } | undefined;
  const isPackagingProduct = sourceProduct?.productType === 'packaging';

  const isCompatible =
    slotType === 'available' ||
    (slotType === 'food' && !isPackagingProduct) ||
    (slotType === 'packaging' && isPackagingProduct);

  // Don't highlight if dragging from available back to available
  const isNoOp = slotType === 'available' && sourceSection === 'available';

  let ringClass = '';
  if (isOver && active && !isNoOp) {
    ringClass = isCompatible
      ? 'ring-2 ring-blue-400 bg-[var(--color-status-info-bg)]/50 rounded-lg'
      : 'ring-2 ring-red-300 bg-[var(--color-status-error-bg)]/30 rounded-lg';
  }

  return (
    <div ref={setNodeRef} className={`transition-all duration-150 ${ringClass}`}>
      {children}
    </div>
  );
}
