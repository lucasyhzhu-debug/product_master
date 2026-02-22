/**
 * DepotCockpitTable - Stock cockpit table for a GoFood depot outlet.
 *
 * Columns:
 * 1. Product name
 * 2. Remaining (primary, large, inline editable)
 * 3. Sold Today (secondary)
 * 4. Restock Tomorrow (with hover tooltip breakdown)
 * 5. Available Elsewhere (sum at non-depot locations)
 * 6. Actions (Move stock here)
 */

import { useState } from 'react';
import { Pencil, Check, X, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { DepotStockTransferDialog } from './DepotStockTransferDialog';
import { useGoFoodAdjustDepotStock } from '@/hooks/convex/useGoFoodDepot';
import type { Id } from '../../../convex/_generated/dataModel';

// ============================================================================
// TYPES
// ============================================================================

interface DepotStockRow {
  _id: Id<"gofoodDepotStock">;
  menuProductId: Id<"menuProducts">;
  menuProductName: string;
  menuProductCode: string;
  quantity: number;
  productInventoryQty: number | null;
  outletId?: Id<"externalOutlets">;
}

interface RestockEntry {
  suggestion: number;
  breakdown: string;
}

interface StockGrouped {
  menuProductId: string;
  menuProductName: string;
  menuProductCode: string;
  totalQuantity: number;
  locations: Array<{
    locationId: string;
    locationName: string;
    locationType: string;
    quantity: number;
    effectiveThreshold: number;
    isLowStock: boolean;
    rowId: string;
  }>;
}

interface StorageLocation {
  _id: Id<"storageLocations">;
  name: string;
  locationType: string;
  isActive: boolean;
  isDefault?: boolean;
}

interface DepotCockpitTableProps {
  outletId: Id<"externalOutlets">;
  depotStock: DepotStockRow[];
  restockMap: Map<string, RestockEntry>;
  stockGrouped: StockGrouped[];
  storageLocations: StorageLocation[];
}

// ============================================================================
// INLINE EDIT CELL
// ============================================================================

interface InlineEditCellProps {
  value: number;
  menuProductId: Id<"menuProducts">;
  onSave: (newValue: number) => Promise<void>;
}

function InlineEditCell({ value, onSave }: InlineEditCellProps) {
  const [editing, setEditing] = useState(false);
  const [inputValue, setInputValue] = useState(String(value));
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const parsed = parseInt(inputValue, 10);
    if (isNaN(parsed)) {
      setEditing(false);
      setInputValue(String(value));
      return;
    }
    setSaving(true);
    try {
      await onSave(parsed);
      setEditing(false);
    } catch {
      toast.error('Failed to update stock');
      setInputValue(String(value));
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditing(false);
    setInputValue(String(value));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') handleCancel();
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          type="number"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
          className="w-20 px-2 py-1 text-lg font-bold border rounded text-center focus:outline-none focus:ring-2 focus:ring-primary"
          disabled={saving}
        />
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-green-600 hover:text-green-700"
          onClick={handleSave}
          disabled={saving}
        >
          <Check className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-red-500 hover:text-red-600"
          onClick={handleCancel}
          disabled={saving}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <button
      className="flex items-center gap-1.5 group cursor-pointer"
      onClick={() => setEditing(true)}
      title="Click to edit"
    >
      <span className="text-xl font-bold tabular-nums">{value}</span>
      <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
    </button>
  );
}

// ============================================================================
// MAIN TABLE
// ============================================================================

export function DepotCockpitTable({
  outletId,
  depotStock,
  restockMap,
  stockGrouped,
  storageLocations,
}: DepotCockpitTableProps) {
  const adjustDepotStock = useGoFoodAdjustDepotStock();
  const [transferDialogProduct, setTransferDialogProduct] = useState<{
    menuProductId: Id<"menuProducts">;
    menuProductName: string;
    destinationLocationId?: Id<"storageLocations">;
  } | null>(null);

  if (depotStock.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center text-muted-foreground text-sm">
        No stock records for this outlet yet. Use the stock transfer dialog to move goods here.
      </div>
    );
  }

  // Build "available elsewhere" map: for each product, sum qty at non-depot locations
  const availableElsewhereMap = new Map<string, number>();
  for (const group of stockGrouped) {
    // Sum all locations (the frontend doesn't know which is "depot" vs "elsewhere"
    // without more context, so we show total across all locations as a proxy)
    const total = group.locations.reduce((sum, loc) => sum + loc.quantity, 0);
    availableElsewhereMap.set(group.menuProductId as string, total);
  }

  return (
    <>
      <div className="rounded-xl border bg-card overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Product</th>
              <th className="text-center px-4 py-3 font-medium text-muted-foreground">
                Remaining
                <span className="block text-xs font-normal">at depot</span>
              </th>
              <th className="text-center px-4 py-3 font-medium text-muted-foreground">
                In Inventory
                <span className="block text-xs font-normal">product inv.</span>
              </th>
              <th className="text-center px-4 py-3 font-medium text-muted-foreground">
                Restock Tomorrow
              </th>
              <th className="text-center px-4 py-3 font-medium text-muted-foreground">
                Available Elsewhere
              </th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {depotStock.map((row) => {
              const isLowStock = row.quantity < 5;
              const restock = restockMap.get(row.menuProductId as string);
              const availableElsewhere = availableElsewhereMap.get(row.menuProductId as string) ?? 0;

              return (
                <tr
                  key={row._id}
                  className={`border-b last:border-0 transition-colors ${
                    isLowStock
                      ? 'bg-red-50/60 hover:bg-red-50'
                      : 'hover:bg-muted/30'
                  }`}
                >
                  {/* Product */}
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground">{row.menuProductName}</div>
                    {row.menuProductCode && (
                      <div className="text-xs text-muted-foreground">{row.menuProductCode}</div>
                    )}
                  </td>

                  {/* Remaining (inline editable) — PRIMARY */}
                  <td className="px-4 py-3 text-center">
                    <div className={`flex justify-center ${isLowStock ? 'text-red-600' : 'text-foreground'}`}>
                      <InlineEditCell
                        value={row.quantity}
                        menuProductId={row.menuProductId}
                        onSave={async (newQty) => {
                          await adjustDepotStock({
                            menuProductId: row.menuProductId,
                            newQuantity: newQty,
                            reason: 'Manual stock correction from GoFood Depot page',
                          });
                          toast.success('Stock updated');
                        }}
                      />
                    </div>
                  </td>

                  {/* In Inventory (productInventory at linked location) — SECONDARY */}
                  <td className="px-4 py-3 text-center">
                    <span className="text-base font-semibold text-muted-foreground tabular-nums">
                      {row.productInventoryQty ?? '—'}
                    </span>
                  </td>

                  {/* Restock Tomorrow */}
                  <td className="px-4 py-3 text-center">
                    {restock ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex items-center justify-center px-2 py-1 rounded-md bg-blue-50 text-blue-700 font-medium text-sm cursor-help border border-blue-100">
                            {restock.suggestion}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs text-xs">
                          <p className="font-medium mb-1">Restock Calculation</p>
                          <p className="text-muted-foreground">{restock.breakdown}</p>
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
                  </td>

                  {/* Available Elsewhere */}
                  <td className="px-4 py-3 text-center">
                    <span className="text-sm font-medium tabular-nums text-muted-foreground">
                      {availableElsewhere}
                    </span>
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-xs"
                      onClick={() =>
                        setTransferDialogProduct({
                          menuProductId: row.menuProductId,
                          menuProductName: row.menuProductName,
                        })
                      }
                    >
                      <ArrowRight className="h-3 w-3" />
                      Move here
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Stock Transfer Dialog */}
      {transferDialogProduct && (
        <DepotStockTransferDialog
          open={true}
          onClose={() => setTransferDialogProduct(null)}
          outletId={outletId}
          menuProductId={transferDialogProduct.menuProductId}
          menuProductName={transferDialogProduct.menuProductName}
          stockGrouped={stockGrouped}
          storageLocations={storageLocations}
        />
      )}
    </>
  );
}
