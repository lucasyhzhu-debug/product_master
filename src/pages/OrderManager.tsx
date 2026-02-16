/**
 * OrderManager - Kanban board view for order management.
 * 6-column horizontal scrolling board replacing the old list/form layout.
 *
 * Phase 14 Plan 04: Kanban board UI.
 */
import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { Button } from '@/components/ui/button';
import { KanbanBoard, type KanbanData } from '@/components/orders/KanbanBoard';
import { OrderSlideOver } from '@/components/orders/OrderSlideOver';
import { useKanbanOrders } from '@/hooks/convex/useOrders';
import type { Id } from '../../convex/_generated/dataModel';

export function OrderManager() {
  useDocumentTitle('Orders');
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const kanbanData = useKanbanOrders();
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [autoWhatsApp, setAutoWhatsApp] = useState(false);

  // Auto-open slide-over with WhatsApp from query param (after order submit)
  useEffect(() => {
    const whatsappOrderId = searchParams.get('whatsapp');
    if (whatsappOrderId) {
      setSelectedOrderId(whatsappOrderId);
      setAutoWhatsApp(true);
      // Clear the query param
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const handleCardClick = (orderId: string) => {
    setSelectedOrderId(orderId);
  };

  const handleCloseSlideOver = () => {
    setSelectedOrderId(null);
    setAutoWhatsApp(false);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Page Header - compact on mobile */}
      <div className="px-4 sm:px-6 lg:px-8 pt-4">
        <div className="flex items-center justify-between mb-4 sm:mb-6">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Orders</h1>
            <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">Manage customer orders</p>
          </div>
          <Button size="sm" onClick={() => navigate('/orders/new')} className="gap-1.5 sm:gap-2">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">New Order</span>
            <span className="sm:hidden">New</span>
          </Button>
        </div>
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
        autoShowWhatsApp={autoWhatsApp}
      />
    </div>
  );
}
