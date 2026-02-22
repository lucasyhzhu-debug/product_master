/**
 * OrderManager - Kanban board view for order management.
 * 6-column horizontal scrolling board replacing the old list/form layout.
 * Includes legend toggles for "my orders" (blue ring) and "orders with notes" (amber ring) highlights.
 *
 * Phase 14 Plan 04: Kanban board UI.
 * Quick 23: highlight my orders and orders with notes.
 */
import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { Button } from '@/components/ui/button';
import { KanbanBoard, type KanbanData } from '@/components/orders/KanbanBoard';
import { OrderSlideOver } from '@/components/orders/OrderSlideOver';
import { useKanbanOrders } from '@/hooks/convex/useOrders';
import { useAuth } from '@/contexts/AuthContext';
import type { Id } from '../../convex/_generated/dataModel';

export function OrderManager() {
  useDocumentTitle('Orders');
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const kanbanData = useKanbanOrders();
  const { user } = useAuth();
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [highlightMine, setHighlightMine] = useState(true);
  const [highlightNotes, setHighlightNotes] = useState(true);

  // Auto-open slide-over from query param (after order submit)
  useEffect(() => {
    const openOrderId = searchParams.get('open');
    if (openOrderId) {
      setSelectedOrderId(openOrderId);
      // Clear the query param
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const handleCardClick = (orderId: string, status: string) => {
    if (status === 'Draft') {
      // Draft cards open the edit form
      navigate(`/orders/new?draft=${orderId}`);
    } else {
      // All other cards open the slide-over
      setSelectedOrderId(orderId);
    }
  };

  const handleCloseSlideOver = () => {
    setSelectedOrderId(null);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Page Header - compact on mobile */}
      <div className="px-4 sm:px-6 lg:px-8 pt-4">
        <div className="flex items-center justify-between mb-3 sm:mb-4">
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

        {/* Highlight legend toggles */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3 sm:mb-4">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={highlightMine}
              onChange={(e) => setHighlightMine(e.target.checked)}
              className="rounded border-gray-300"
            />
            <span className="inline-block w-3 h-3 rounded ring-2 ring-blue-400 bg-white" />
            My orders
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={highlightNotes}
              onChange={(e) => setHighlightNotes(e.target.checked)}
              className="rounded border-gray-300"
            />
            <span className="inline-block w-3 h-3 rounded ring-1 ring-amber-300 bg-white" />
            Orders with notes
          </label>
        </div>
      </div>

      {/* Kanban Board */}
      <KanbanBoard
        data={kanbanData as KanbanData | undefined}
        onCardClick={handleCardClick}
        currentUserId={user?.userId}
        highlightMine={highlightMine}
        highlightNotes={highlightNotes}
      />

      {/* Slide-over panel */}
      <OrderSlideOver
        orderId={selectedOrderId as Id<"orders"> | null}
        open={selectedOrderId !== null}
        onClose={handleCloseSlideOver}
        autoShowWhatsApp={false}
      />
    </div>
  );
}
