import { useState } from 'react';
import { Store, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface K3MartKitchenSummary {
  items: Array<{
    menuProductId: string;
    productName: string;
    consignmentTarget: number;
    totalOutletStock: number;
    totalSoldToday: number;
    gapToTarget: number;
    outletBreakdown: Array<{
      outletName: string;
      stock: number;
      soldToday: number;
    }>;
  }>;
  lastSyncAt: number | null;
  totalOutlets: number;
  syncStatus: 'success' | 'error' | null;
}

interface K3MartSyntheticCardProps {
  summary: K3MartKitchenSummary;
  onQuantityChange?: (menuProductId: string, quantity: number) => void;
  canEdit: boolean;
}

export function K3MartSyntheticCard({
  summary,
  onQuantityChange,
  canEdit,
}: K3MartSyntheticCardProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());

  if (summary.items.length === 0) return null;

  const handleStartEdit = (menuProductId: string, currentTarget: number) => {
    if (!canEdit) return;
    setEditingId(menuProductId);
    setEditValue(String(currentTarget));
  };

  const handleSaveEdit = (menuProductId: string) => {
    const newQty = parseInt(editValue, 10);
    if (!isNaN(newQty) && newQty >= 0 && onQuantityChange) {
      onQuantityChange(menuProductId, newQty);
    }
    setEditingId(null);
  };

  const handleToggleCheck = (menuProductId: string) => {
    setCheckedItems((prev) => {
      const next = new Set(prev);
      if (next.has(menuProductId)) {
        next.delete(menuProductId);
      } else {
        next.add(menuProductId);
      }
      return next;
    });
  };

  return (
    <div className="border-2 border-dashed border-purple-400 dark:border-purple-600 bg-purple-50 dark:bg-purple-900/10 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-purple-300 dark:border-purple-700 flex items-center gap-2">
        <Store className="w-5 h-5 text-purple-600 dark:text-purple-400" />
        <span className="text-lg font-bold text-purple-700 dark:text-purple-300">
          K3Mart
        </span>
        <span className="text-xs text-purple-500 dark:text-purple-400 ml-auto">
          {summary.totalOutlets} outlet{summary.totalOutlets !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Items */}
      <div className="px-4 py-3 space-y-3">
        {summary.items.map((item) => {
          const isChecked = checkedItems.has(item.menuProductId);
          const isEditing = editingId === item.menuProductId;

          return (
            <div key={item.menuProductId} className="space-y-1">
              {/* Product row */}
              <div className="flex items-center gap-3">
                {/* Visual-only checkbox */}
                <button
                  onClick={() => handleToggleCheck(item.menuProductId)}
                  className="flex-shrink-0 touch-manipulation"
                >
                  <div
                    className={cn(
                      'w-6 h-6 rounded-full transition-all flex items-center justify-center',
                      isChecked
                        ? 'bg-purple-600 dark:bg-purple-500'
                        : 'border-2 border-purple-300 dark:border-purple-600'
                    )}
                  >
                    {isChecked && <Check className="w-4 h-4 text-white" />}
                  </div>
                </button>

                {/* Product name */}
                <span
                  className={cn(
                    'flex-1 font-medium text-base',
                    isChecked && 'line-through text-muted-foreground'
                  )}
                >
                  {item.productName}
                </span>

                {/* Consignment target -- inline editable */}
                {isEditing ? (
                  <input
                    type="number"
                    min={0}
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={() => handleSaveEdit(item.menuProductId)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveEdit(item.menuProductId);
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    autoFocus
                    className="w-16 text-right px-2 py-1 rounded border border-purple-400 bg-white dark:bg-purple-900/30 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                ) : (
                  <button
                    onClick={() => handleStartEdit(item.menuProductId, item.consignmentTarget)}
                    disabled={!canEdit}
                    className={cn(
                      'text-sm font-semibold px-2 py-1 rounded',
                      canEdit
                        ? 'hover:bg-purple-200 dark:hover:bg-purple-800/40 cursor-pointer'
                        : 'cursor-default',
                      'text-purple-700 dark:text-purple-300'
                    )}
                    title={canEdit ? 'Tap to edit target' : undefined}
                  >
                    Target: {item.consignmentTarget}
                  </button>
                )}
              </div>

              {/* Outlet breakdown */}
              {item.outletBreakdown.length > 0 && (
                <div className="ml-9 flex flex-wrap gap-1">
                  {item.outletBreakdown.map((outlet) => (
                    <span
                      key={outlet.outletName}
                      className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                    >
                      {outlet.outletName}: {outlet.stock}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Sync status footer */}
      {summary.lastSyncAt && (
        <div className="px-4 py-2 border-t border-purple-300 dark:border-purple-700 text-xs text-purple-500 dark:text-purple-400">
          Last sync: {new Date(summary.lastSyncAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
          {summary.syncStatus === 'error' && (
            <span className="ml-2 text-red-500 font-semibold">Sync error</span>
          )}
        </div>
      )}
    </div>
  );
}
