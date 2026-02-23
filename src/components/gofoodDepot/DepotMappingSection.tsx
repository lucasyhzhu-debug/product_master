/**
 * DepotMappingSection - Product mapping editor for a GoFood outlet.
 *
 * Shows all GoFood product names for this outlet with their linked internal
 * menu product (dropdown). Unmapped products are flagged with a warning icon.
 * Uses explicit Save button (not auto-save) per UX requirements.
 */

import { useState, useEffect } from 'react';
import { AlertTriangle, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useGoFoodSaveOutletMappings, useGoFoodInitOutletMappings } from '@/hooks/convex/useGoFoodDepot';
import type { Id } from '../../../convex/_generated/dataModel';

// ============================================================================
// TYPES
// ============================================================================

interface MappingRow {
  _id: Id<"gofoodOutletProductMappings">;
  externalProductName: string;
  menuProductId?: Id<"menuProducts">;
  menuProductName?: string;
  isActive: boolean;
}

interface MenuProduct {
  _id: Id<"menuProducts">;
  name: string;
  code: string;
  isActive?: boolean;
}

interface DepotMappingSectionProps {
  outletId: Id<"externalOutlets">;
  mappings: MappingRow[];
  unmappedProducts: string[];
  menuProducts: MenuProduct[];
}

// Local editable state shape
interface EditableMappingRow {
  externalProductName: string;
  menuProductId: string; // empty string = unmapped
  isActive: boolean;
  isNew: boolean; // true for unmapped products being added
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function DepotMappingSection({
  outletId,
  mappings,
  unmappedProducts,
  menuProducts,
}: DepotMappingSectionProps) {
  const saveOutletMappings = useGoFoodSaveOutletMappings();
  const initOutletMappings = useGoFoodInitOutletMappings();

  const [saving, setSaving] = useState(false);
  const [initDone, setInitDone] = useState(false);

  // Build editable rows from server data + unmapped products
  const [editRows, setEditRows] = useState<EditableMappingRow[]>([]);

  // Initialize edit rows when mappings or unmappedProducts change
  useEffect(() => {
    const existing: EditableMappingRow[] = mappings.map((m) => ({
      externalProductName: m.externalProductName,
      menuProductId: m.menuProductId ? (m.menuProductId as string) : '',
      isActive: m.isActive,
      isNew: false,
    }));

    const newUnmapped: EditableMappingRow[] = unmappedProducts
      .filter((name) => !existing.some((r) => r.externalProductName === name))
      .map((name) => ({
        externalProductName: name,
        menuProductId: '',
        isActive: true,
        isNew: true,
      }));

    setEditRows([...existing, ...newUnmapped]);
  }, [mappings, unmappedProducts]);

  // Auto-init: if no mappings yet and outlet has never been initialized, call initOutletMappingsFromPrevious
  useEffect(() => {
    if (!initDone && mappings.length === 0 && outletId) {
      setInitDone(true);
      initOutletMappings({ outletId }).catch(() => {
        // Silent — init is best-effort
      });
    }
  }, [mappings.length, outletId, initDone, initOutletMappings]);

  const handleMenuProductChange = (externalName: string, menuProductId: string) => {
    setEditRows((prev) =>
      prev.map((r) =>
        r.externalProductName === externalName
          ? { ...r, menuProductId }
          : r
      )
    );
  };

  const handleActiveToggle = (externalName: string) => {
    setEditRows((prev) =>
      prev.map((r) =>
        r.externalProductName === externalName
          ? { ...r, isActive: !r.isActive }
          : r
      )
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveOutletMappings({
        outletId,
        mappings: editRows.map((r) => ({
          externalProductName: r.externalProductName,
          menuProductId: r.menuProductId
            ? (r.menuProductId as Id<"menuProducts">)
            : undefined,
          isActive: r.isActive,
        })),
      });
      toast.success('Product mappings saved');
    } catch (err) {
      toast.error('Failed to save mappings');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  if (editRows.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-6 text-center text-muted-foreground text-sm">
        No GoFood products found for this outlet in the last 30 days.
        Sync GoBiz data first to populate product mappings.
      </div>
    );
  }

  const unmappedCount = editRows.filter((r) => !r.menuProductId).length;

  return (
    <div className="rounded-xl border bg-card overflow-hidden shadow-sm">
      <div className="px-4 py-3 border-b bg-muted/30 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">GoFood Products</span>
          {unmappedCount > 0 && (
            <Badge variant="outline" className="text-[var(--color-status-warning)] border-[var(--color-status-warning)]/40 bg-[var(--color-status-warning-bg)] text-xs">
              {unmappedCount} unmapped
            </Badge>
          )}
        </div>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">GoFood Product</th>
            <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Linked Menu Product</th>
            <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">Active</th>
          </tr>
        </thead>
        <tbody>
          {editRows.map((row) => {
            const isMapped = !!row.menuProductId;
            return (
              <tr key={row.externalProductName} className="border-b last:border-0 hover:bg-muted/20">
                {/* GoFood product name */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {!isMapped && (
                      <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" />
                    )}
                    <span className={isMapped ? 'text-foreground' : 'text-[var(--color-status-warning)]'}>
                      {row.externalProductName}
                    </span>
                    {!isMapped && (
                      <Badge variant="outline" className="text-[var(--color-status-warning)] border-[var(--color-status-warning)]/40 bg-[var(--color-status-warning-bg)] text-xs ml-1">
                        Unmapped
                      </Badge>
                    )}
                  </div>
                </td>

                {/* Menu product dropdown */}
                <td className="px-4 py-3">
                  <Select
                    value={row.menuProductId || '__none__'}
                    onValueChange={(val) =>
                      handleMenuProductChange(
                        row.externalProductName,
                        val === '__none__' ? '' : val
                      )
                    }
                  >
                    <SelectTrigger className="w-60 h-8 text-sm">
                      <SelectValue placeholder="Select product..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">
                        <span className="text-muted-foreground italic">None (unmapped)</span>
                      </SelectItem>
                      {menuProducts
                        .filter((mp) => mp.isActive !== false)
                        .map((mp) => (
                          <SelectItem key={mp._id} value={mp._id as string}>
                            {mp.name}
                            {mp.code && (
                              <span className="text-muted-foreground ml-1 text-xs">
                                ({mp.code})
                              </span>
                            )}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </td>

                {/* Active toggle */}
                <td className="px-4 py-3 text-center">
                  <button
                    onClick={() => handleActiveToggle(row.externalProductName)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                      row.isActive ? 'bg-primary' : 'bg-muted'
                    }`}
                    title={row.isActive ? 'Active — click to deactivate' : 'Inactive — click to activate'}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform ${
                        row.isActive ? 'translate-x-4' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Explicit Save Button */}
      <div className="px-4 py-3 border-t bg-muted/20 flex justify-end">
        <Button
          onClick={handleSave}
          disabled={saving}
          className="gap-2"
        >
          <Save className="h-4 w-4" />
          {saving ? 'Saving...' : 'Save Mappings'}
        </Button>
      </div>
    </div>
  );
}
