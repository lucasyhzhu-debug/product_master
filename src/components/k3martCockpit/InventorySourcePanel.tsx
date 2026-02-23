/**
 * InventorySourcePanel - Collapsible summary of stock across all sources.
 *
 * Shows horizontal summary cards for Office inventory, Goldfinch depot,
 * and total K3 Mart outlet stock. Expands to show per-product breakdown.
 */

import { memo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, Building2, Warehouse, Store, AlertTriangle } from 'lucide-react';

interface InventorySourcePanelProps {
  sources: {
    office: {
      total: number;
      products: Array<{ productName: string; quantity: number }>;
    };
    goldfinch: {
      total: number;
      products: Array<{ productName: string; quantity: number }>;
    };
    k3mart: {
      total: number;
      products: Array<{ productName: string; quantity: number }>;
    };
  };
  isLoading?: boolean;
}

export const InventorySourcePanel = memo(function InventorySourcePanel({
  sources,
  isLoading = false,
}: InventorySourcePanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (isLoading) {
    return (
      <div className="bg-card rounded-xl shadow-sm border border-border p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="h-20 bg-muted rounded-lg animate-pulse" />
          <div className="h-20 bg-muted rounded-lg animate-pulse" />
          <div className="h-20 bg-muted rounded-lg animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted transition-colors"
      >
        <h3 className="font-semibold text-sm text-foreground">Inventory Sources</h3>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {/* Summary Cards */}
      <div className="px-4 pb-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Office Available */}
          <div className="bg-[var(--color-status-info-bg)] rounded-lg p-3 border border-[var(--color-status-info)]/30">
            <div className="flex items-start justify-between mb-2">
              <Building2 className="h-5 w-5 text-blue-600" />
              {sources.office.total === 0 && (
                <div className="flex items-center gap-1 bg-[var(--color-status-error-bg)] text-[var(--color-status-error)] text-[10px] font-semibold px-2 py-0.5 rounded-full">
                  <AlertTriangle className="h-3 w-3" />
                  Depleted
                </div>
              )}
            </div>
            <div className="text-xl font-bold text-foreground">
              {sources.office.total}
            </div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">
              Office
            </div>
          </div>

          {/* Goldfinch Depot */}
          <div className="bg-[var(--color-status-info-bg)] rounded-lg p-3 border border-[var(--color-status-info)]/30">
            <div className="flex items-start justify-between mb-2">
              <Warehouse className="h-5 w-5 text-purple-600" />
              {sources.goldfinch.total === 0 && (
                <div className="flex items-center gap-1 bg-[var(--color-status-error-bg)] text-[var(--color-status-error)] text-[10px] font-semibold px-2 py-0.5 rounded-full">
                  <AlertTriangle className="h-3 w-3" />
                  Depleted
                </div>
              )}
            </div>
            <div className="text-xl font-bold text-foreground">
              {sources.goldfinch.total}
            </div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">
              Goldfinch
            </div>
          </div>

          {/* K3 Mart Outlets */}
          <div
            className="rounded-lg p-3 border"
            style={{
              backgroundColor: 'var(--color-k3mart-light)',
              borderColor: 'var(--color-k3mart-medium)',
            }}
          >
            <div className="flex items-start justify-between mb-2">
              <Store className="h-5 w-5" style={{ color: 'var(--color-k3mart)' }} />
              {sources.k3mart.total === 0 && (
                <div className="flex items-center gap-1 bg-[var(--color-status-error-bg)] text-[var(--color-status-error)] text-[10px] font-semibold px-2 py-0.5 rounded-full">
                  <AlertTriangle className="h-3 w-3" />
                  Depleted
                </div>
              )}
            </div>
            <div className="text-xl font-bold text-foreground">
              {sources.k3mart.total}
            </div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">
              At Outlets
            </div>
          </div>
        </div>
      </div>

      {/* Breakdown Section (collapsible) */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="border-t border-border overflow-hidden"
          >
            <div className="px-4 py-3 space-y-4">
              {/* Office Breakdown */}
              <div>
                <h4 className="text-xs font-semibold text-blue-600 mb-2 flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5" />
                  Office Stock ({sources.office.products.length} products)
                </h4>
                {sources.office.products.length > 0 ? (
                  <div className="space-y-1">
                    {sources.office.products.map((product) => (
                      <div
                        key={product.productName}
                        className="flex items-center justify-between text-xs px-2 py-1.5 rounded bg-[var(--color-status-info-bg)]"
                      >
                        <span className="text-foreground truncate">{product.productName}</span>
                        <span className="font-bold text-foreground tabular-nums ml-2">
                          {product.quantity}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground italic px-2 py-1.5">No stock</div>
                )}
              </div>

              {/* Goldfinch Breakdown */}
              <div>
                <h4 className="text-xs font-semibold text-purple-600 mb-2 flex items-center gap-1.5">
                  <Warehouse className="h-3.5 w-3.5" />
                  Goldfinch Depot ({sources.goldfinch.products.length} products)
                </h4>
                {sources.goldfinch.products.length > 0 ? (
                  <div className="space-y-1">
                    {sources.goldfinch.products.map((product) => (
                      <div
                        key={product.productName}
                        className="flex items-center justify-between text-xs px-2 py-1.5 rounded bg-[var(--color-status-info-bg)]"
                      >
                        <span className="text-foreground truncate">{product.productName}</span>
                        <span className="font-bold text-foreground tabular-nums ml-2">
                          {product.quantity}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground italic px-2 py-1.5">No stock</div>
                )}
              </div>

              {/* K3 Mart Breakdown */}
              <div>
                <h4
                  className="text-xs font-semibold mb-2 flex items-center gap-1.5"
                  style={{ color: 'var(--color-k3mart)' }}
                >
                  <Store className="h-3.5 w-3.5" />
                  K3 Mart Outlets ({sources.k3mart.products.length} products)
                </h4>
                {sources.k3mart.products.length > 0 ? (
                  <div className="space-y-1">
                    {sources.k3mart.products.map((product) => (
                      <div
                        key={product.productName}
                        className="flex items-center justify-between text-xs px-2 py-1.5 rounded"
                        style={{ backgroundColor: 'var(--color-k3mart-light)' }}
                      >
                        <span className="text-foreground truncate">{product.productName}</span>
                        <span className="font-bold text-foreground tabular-nums ml-2">
                          {product.quantity}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground italic px-2 py-1.5">No stock</div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});
