/**
 * OrderManager - Kanban board view for order management.
 * 6-column horizontal scrolling board replacing the old list/form layout.
 *
 * Phase 14 Plan 04: Kanban board UI.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/layout';
import { KanbanBoard, type KanbanData } from '@/components/orders/KanbanBoard';
import { OrderSlideOver } from '@/components/orders/OrderSlideOver';
import { useKanbanOrders } from '@/hooks/convex/useOrders';
import type { Id } from '../../convex/_generated/dataModel';

export function OrderManager() {
  useDocumentTitle('Orders');
  const navigate = useNavigate();
  const kanbanData = useKanbanOrders();
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  const handleCardClick = (orderId: string) => {
    setSelectedOrderId(orderId);
  };

  const handleCloseSlideOver = () => {
    setSelectedOrderId(null);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Page Header */}
      <div className="px-4 sm:px-6 lg:px-8 pt-4">
        <PageHeader
          title="Orders"
          description="Manage customer orders"
          action={
            <Button onClick={() => navigate('/orders/new')} className="gap-2">
              <Plus className="h-4 w-4" />
              New Order
            </Button>
          }
        />
      </div>

      {/* Kanban Board */}
      <KanbanBoard
        data={kanbanData as KanbanData | undefined}
        onCardClick={handleCardClick}
      />

      {/* Slide-over panel */}
      <OrderSlideOver
        orderId={selectedOrderId as Id<"orders"> | null}
        open={selectedOrderId !== null}
        onClose={handleCloseSlideOver}
      />
    </div>
  );
}
