/**
 * KanbanColumn - Single column in the Kanban board.
 * Shows column header with count, scrollable card list,
 * and optional "Show Cancelled" toggle for Complete column.
 * Supports sorting user's own orders to the top and passing highlight props.
 *
 * Phase 14 Plan 04: Kanban board UI.
 * Quick 23: highlight my orders and orders with notes.
 */
import { useState, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { KanbanCard, type KanbanOrder } from './KanbanCard';

// ============================================
// Types
// ============================================

export interface KanbanColumnConfig {
  key: string;
  title: string;
  colorClass: string;
}

interface KanbanColumnProps {
  config: KanbanColumnConfig;
  orders: KanbanOrder[];
  onCardClick: (orderId: string, status: string) => void;
  currentUserId?: string;
  highlightMine?: boolean;
  highlightNotes?: boolean;
}

// ============================================
// Component
// ============================================

export function KanbanColumn({ config, orders, onCardClick, currentUserId, highlightMine, highlightNotes }: KanbanColumnProps) {
  const [showCancelled, setShowCancelled] = useState(false);
  const isCompleteColumn = config.key === 'complete';

  // Filter cancelled orders in Complete column
  const cancelledCount = useMemo(
    () => isCompleteColumn ? orders.filter((o) => o.status === 'Cancelled').length : 0,
    [orders, isCompleteColumn]
  );

  const visibleOrders = useMemo(() => {
    if (!isCompleteColumn || showCancelled) return orders;
    return orders.filter((o) => o.status !== 'Cancelled');
  }, [orders, isCompleteColumn, showCancelled]);

  // Sort user's own orders to the top when highlight is active
  const sortedOrders = useMemo(() => {
    if (!highlightMine || !currentUserId) return visibleOrders;
    return [...visibleOrders].sort((a, b) => {
      const aIsMine = a.createdByUserId === currentUserId ? 0 : 1;
      const bIsMine = b.createdByUserId === currentUserId ? 0 : 1;
      return aIsMine - bIsMine;
    });
  }, [visibleOrders, highlightMine, currentUserId]);

  return (
    <div className="flex flex-col min-w-[calc(100vw-2rem)] md:min-w-[280px] md:max-w-[320px] snap-center bg-muted/30 rounded-lg">
      {/* Column header */}
      <div className="px-3 pt-3 pb-2 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">{config.title}</h3>
            <Badge variant="secondary" className="text-xs">
              {visibleOrders.length}
            </Badge>
          </div>
        </div>

        {/* Show Cancelled toggle (Complete column only) */}
        {isCompleteColumn && cancelledCount > 0 && (
          <div className="flex items-center gap-2 mt-2">
            <Switch
              id="show-cancelled"
              checked={showCancelled}
              onCheckedChange={setShowCancelled}
            />
            <Label htmlFor="show-cancelled" className="text-xs text-muted-foreground cursor-pointer">
              Show cancelled ({cancelledCount})
            </Label>
          </div>
        )}
      </div>

      {/* Scrollable card list */}
      <ScrollArea className="flex-1 px-3 pb-3 max-h-[calc(100vh-220px)]">
        <div className="space-y-2 pt-1">
          {sortedOrders.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">
              No orders
            </p>
          ) : (
            sortedOrders.map((order) => (
              <KanbanCard
                key={order._id}
                order={order}
                onCardClick={onCardClick}
                simplified={isCompleteColumn}
                isMine={!!currentUserId && order.createdByUserId === currentUserId}
                highlightMine={highlightMine}
                highlightNotes={highlightNotes}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
