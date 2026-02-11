/**
 * OutletCardGrid - Responsive grid wrapper for OutletCards with accordion expansion.
 *
 * Renders a responsive grid of OutletCards with accordion state (one expanded at a time).
 * When expanded, shows detailed product stock information, stock flow controls, and movement history.
 */

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { OutletCard } from './OutletCard';
import { ExpandedOutletPanel } from './ExpandedOutletPanel';

interface OutletCardGridProps {
  outlets: Array<{
    outletId: string;
    outletName: string;
    products: Array<{
      menuProductId: string;
      productName: string;
      externalProductCode: string;
      currentStock: number;
      soldToday: number;
      avgDailySales: number;
      daysOfStock: number;
      plannedQty?: number;
      planStatus?: "draft" | "confirmed" | "submitted" | "partial" | "failed";
    }>;
    planStatus: "no_plan" | "draft" | "confirmed" | "submitted" | "partial" | "failed";
    totalStock: number;
    hasLowStock: boolean;
    lastSyncAt?: number;
  }>;
  availableSources: Array<{
    type: "kitchen" | "goldfinch" | "outlet";
    label: string;
    available: number;
    outletId?: string;
  }>;
  availableDestinations: Array<{
    type: "office" | "goldfinch" | "outlet";
    label: string;
    outletId?: string;
  }>;
  movements: Record<string, Array<{
    _id: string;
    direction: "stock_in" | "stock_out";
    quantity: number;
    menuProductId: string;
    productName?: string;
    source?: string;
    destination?: string;
    k3martStatus?: "pending" | "approved" | "rejected" | "canceled";
    submittedAt?: number;
    note?: string;
  }>>;
  onStockFlowSubmit: (outletId: string, data: {
    direction: "stock_in" | "stock_out";
    menuProductId: string;
    externalProductCode: string;
    quantity: number;
    source?: "kitchen" | "goldfinch" | "outlet";
    sourceOutletId?: string;
    destination?: "office" | "goldfinch" | "outlet";
    destinationOutletId?: string;
    note: string;
  }) => Promise<void>;
  onCancelMovement?: (movementId: string) => Promise<void>;
  canAct: boolean;
  isSubmitting?: boolean;
}

export function OutletCardGrid({
  outlets,
  availableSources,
  availableDestinations,
  movements,
  onStockFlowSubmit,
  onCancelMovement,
  canAct,
  isSubmitting = false,
}: OutletCardGridProps) {
  const [expandedOutletId, setExpandedOutletId] = useState<string | null>(null);

  const handleCardClick = (outletId: string) => {
    setExpandedOutletId((current) => (current === outletId ? null : outletId));
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {outlets.map((outlet, index) => {
        const isExpanded = expandedOutletId === outlet.outletId;
        const outletMovements = movements[outlet.outletId] || [];

        return (
          <motion.div
            key={outlet.outletId}
            layout
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2, delay: index * 0.03 }}
            className="contents"
          >
            {/* Outlet Card */}
            <div className={isExpanded ? 'sm:col-span-2 lg:col-span-4' : ''}>
              <OutletCard
                outletId={outlet.outletId}
                outletName={outlet.outletName}
                products={outlet.products.map(p => ({
                  productName: p.productName,
                  stock: p.currentStock,
                  soldToday: p.soldToday,
                  avgDailySales: p.avgDailySales,
                }))}
                planStatus={outlet.planStatus}
                totalStock={outlet.totalStock}
                hasLowStock={outlet.hasLowStock}
                lastSyncAt={outlet.lastSyncAt}
                isExpanded={isExpanded}
                onClick={() => handleCardClick(outlet.outletId)}
              />
            </div>

            {/* Expanded Panel */}
            <AnimatePresence mode="wait">
              {isExpanded && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3 }}
                  className="col-span-full"
                >
                  <ExpandedOutletPanel
                    outletId={outlet.outletId}
                    outletName={outlet.outletName}
                    products={outlet.products}
                    availableSources={availableSources}
                    availableDestinations={availableDestinations}
                    movements={outletMovements}
                    onStockFlowSubmit={(data) => onStockFlowSubmit(outlet.outletId, data)}
                    onCancelMovement={onCancelMovement}
                    canAct={canAct}
                    isSubmitting={isSubmitting}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        );
      })}
    </div>
  );
}
