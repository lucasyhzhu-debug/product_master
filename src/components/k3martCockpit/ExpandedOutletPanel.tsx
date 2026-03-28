/**
 * ExpandedOutletPanel - Orchestrator for expanded outlet view
 *
 * Composes OutletStockDetail and StockFlowForm into
 * an inline expandable panel shown when user clicks an OutletCard.
 * Uses framer-motion for smooth expand/collapse animation.
 */

import React from 'react';
import { motion } from 'framer-motion';

import { OutletStockDetail } from './OutletStockDetail';
import { StockFlowForm } from './StockFlowForm';

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
    /** Price per unit for this product at this outlet */
    price?: number;
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
  onStockFlowSubmit,
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
      <div className="bg-card border-t border-border">
        {/* Section 1: Stock Detail - Always visible */}
        <div className="border-b border-border">
          <OutletStockDetail products={products} outletName={outletName} />
        </div>

        {/* Section 2: Stock Flow Form - Only for users with canAct permission */}
        {canAct && (
          <StockFlowForm
            outletId={outletId}
            outletName={outletName}
            products={products.map(p => ({
              menuProductId: p.menuProductId,
              externalProductCode: p.externalProductCode,
              productName: p.productName,
              currentStock: p.currentStock,
              price: p.price,
            }))}
            availableSources={availableSources}
            availableDestinations={availableDestinations}
            onSubmit={onStockFlowSubmit}
            isSubmitting={isSubmitting}
          />
        )}
      </div>
    </motion.div>
  );
});
