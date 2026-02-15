/**
 * KanbanColumn - Single column in the Kanban board.
 * Shows column header with count, scrollable card list,
 * and optional "Show Cancelled" toggle for Complete column.
 *
 * Phase 14 Plan 04: Kanban board UI.
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
  onCardClick: (orderId: string) => void;
}

// ============================================
// Component
// ============================================

export function KanbanColumn({ config, orders, onCardClick }: KanbanColumnProps) {
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

  return (
    <div className="flex flex-col min-w-[85vw] md:min-w-[280px] md:max-w-[320px] snap-center bg-muted/30 rounded-lg">
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
        <div className="space-y-2">
          {visibleOrders.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">
              No orders
            </p>
          ) : (
            visibleOrders.map((order) => (
              <KanbanCard
                key={order._id}
                order={order}
                onCardClick={onCardClick}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
