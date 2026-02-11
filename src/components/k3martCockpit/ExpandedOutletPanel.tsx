/**
 * ExpandedOutletPanel - Orchestrator for expanded outlet view
 *
 * Composes OutletStockDetail, StockFlowForm, and StockMovementHistory into
 * an inline expandable panel shown when user clicks an OutletCard.
 * Uses framer-motion for smooth expand/collapse animation.
 */

import React from 'react';
import { motion } from 'framer-motion';

import { OutletStockDetail } from './OutletStockDetail';
import { StockFlowForm } from './StockFlowForm';
import { StockMovementHistory } from './StockMovementHistory';

interface ExpandedOutletPanelProps {
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
    planStatus?: 'draft' | 'confirmed' | 'submitted' | 'partial' | 'failed';
  }>;
  availableSources: Array<{
    type: 'kitchen' | 'goldfinch' | 'outlet';
    label: string;
    available: number;
    outletId?: string;
  }>;
  availableDestinations: Array<{
    type: 'office' | 'goldfinch' | 'outlet';
    label: string;
    outletId?: string;
  }>;
  movements: Array<{
    _id: string;
    direction: 'stock_in' | 'stock_out';
    quantity: number;
    menuProductId: string;
    productName?: string;
    source?: string;
    destination?: string;
    k3martStatus?: 'pending' | 'approved' | 'rejected' | 'canceled';
    submittedAt?: number;
    note?: string;
  }>;
  onStockFlowSubmit: (data: {
    direction: 'stock_in' | 'stock_out';
    menuProductId: string;
    externalProductCode: string;
    quantity: number;
    source?: 'kitchen' | 'goldfinch' | 'outlet';
    sourceOutletId?: string;
    destination?: 'office' | 'goldfinch' | 'outlet';
    destinationOutletId?: string;
    note: string;
  }) => Promise<void>;
  onCancelMovement?: (movementId: string) => Promise<void>;
  /** Whether this user can perform actions (manager+) vs view-only (kitchen) */
  canAct: boolean;
  isSubmitting?: boolean;
}

export const ExpandedOutletPanel = React.memo(function ExpandedOutletPanel({
  outletId,
  outletName,
  products,
  availableSources,
  availableDestinations,
  movements,
  onStockFlowSubmit,
  onCancelMovement,
  canAct,
  isSubmitting = false,
}: ExpandedOutletPanelProps) {
  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.2, ease: 'easeInOut' }}
      className="overflow-hidden"
    >
      <div className="bg-white border-t border-gray-100">
        {/* Section 1: Stock Detail - Always visible */}
        <div className="border-b border-gray-100">
          <OutletStockDetail products={products} outletName={outletName} />
        </div>

        {/* Section 2: Stock Flow Form - Only for users with canAct permission */}
        {canAct && (
          <div className="border-b border-gray-100">
            <StockFlowForm
              outletId={outletId}
              outletName={outletName}
              products={products}
              availableSources={availableSources}
              availableDestinations={availableDestinations}
              onSubmit={onStockFlowSubmit}
              isSubmitting={isSubmitting}
            />
          </div>
        )}

        {/* Section 3: Movement History - Always visible */}
        <div className="p-3">
          <StockMovementHistory
            movements={movements}
            onCancel={onCancelMovement}
          />
        </div>
      </div>
    </motion.div>
  );
});
