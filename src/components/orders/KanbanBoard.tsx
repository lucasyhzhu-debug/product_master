/**
 * KanbanBoard - Horizontal scrolling board with 6 columns for order management.
 * Columns: Draft | Awaiting Payment | Payment Received | Being Prepared | Awaiting Delivery | Complete
 * Passes highlight props (currentUserId, highlightMine, highlightNotes) through to columns.
 *
 * Phase 14 Plan 04: Kanban board UI.
 * Quick 23: highlight my orders and orders with notes.
 */
import { Skeleton } from '@/components/ui/skeleton';
import { KanbanColumn, type KanbanColumnConfig } from './KanbanColumn';
import type { KanbanOrder } from './KanbanCard';

// ============================================
// Column Configuration
// ============================================

const KANBAN_COLUMNS: KanbanColumnConfig[] = [
  { key: 'draft', title: 'Draft', colorClass: 'bg-gray-500' },
  { key: 'awaiting_payment', title: 'Awaiting Payment', colorClass: 'bg-amber-500' },
  { key: 'payment_received', title: 'Payment Received', colorClass: 'bg-blue-500' },
  { key: 'being_prepared', title: 'Being Prepared', colorClass: 'bg-purple-500' },
  { key: 'awaiting_delivery', title: 'Awaiting Delivery', colorClass: 'bg-green-500' },
  { key: 'complete', title: 'Complete', colorClass: 'bg-emerald-600' },
];

// ============================================
// Types
// ============================================

export type KanbanData = Record<string, KanbanOrder[]>;

interface KanbanBoardProps {
  data: KanbanData | undefined;
  onCardClick: (orderId: string, status: string) => void;
  currentUserId?: string;
  highlightMine?: boolean;
  highlightNotes?: boolean;
}

// ============================================
// Loading Skeleton
// ============================================

function KanbanSkeleton() {
  return (
    <div className="flex gap-4 p-4 overflow-x-auto snap-x snap-mandatory">
      {KANBAN_COLUMNS.map((col) => (
        <div
          key={col.key}
          className="min-w-[calc(100vw-2rem)] md:min-w-[280px] md:max-w-[320px] snap-center bg-muted/30 rounded-lg p-3 space-y-3"
        >
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-5 w-8 rounded-full" />
          </div>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-lg" />
          ))}
        </div>
      ))}
    </div>
  );
}

// ============================================
// Component
// ============================================

export function KanbanBoard({ data, onCardClick, currentUserId, highlightMine, highlightNotes }: KanbanBoardProps) {
  if (data === undefined) {
    return <KanbanSkeleton />;
  }

  return (
    <div className="flex gap-4 p-4 overflow-x-auto snap-x snap-mandatory h-[calc(100vh-140px)]">
      {KANBAN_COLUMNS.map((col) => (
        <KanbanColumn
          key={col.key}
          config={col}
          orders={data[col.key] ?? []}
          onCardClick={onCardClick}
          currentUserId={currentUserId}
          highlightMine={highlightMine}
          highlightNotes={highlightNotes}
        />
      ))}
    </div>
  );
}
