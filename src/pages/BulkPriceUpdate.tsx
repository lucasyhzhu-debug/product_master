/**
 * BulkPriceUpdate -- Inline bulk editing of ingredient and material costs.
 *
 * Phase 68: COGS Bulk Price Update
 *
 * Layout:
 * - PageHeader with back navigation to hub
 * - Tabs: Ingredients | Materials
 * - Editable table: Name | Unit | Volume | Price | Shipping | Cost/Unit
 * - "Save All Changes" button (disabled until at least one row differs from DB)
 * - Changed rows highlighted with visual indicator
 */

import { useState, useMemo, useCallback } from "react";
import { DollarSign, Loader2, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/layout/PageHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import {
  useIngredients,
  useBulkUpdateIngredientPrices,
  useBulkUpdateMaterialPrices,
} from "@/hooks/convex";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { formatCurrency } from "@/lib/utils";
import type { Id } from "../../convex/_generated/dataModel";

// ============================================================================
// TYPES
// ============================================================================

interface PriceRow {
  id: string;
  name: string;
  brand?: string;
  unitType: string;
  baseUnit: string;
  volumePurchased: number;
  priceExclShipping: number;
  shippingCost: number;
  costPerBaseUnit: number;
}

interface EditedValues {
  volumePurchased: number;
  priceExclShipping: number;
  shippingCost: number;
}

// ============================================================================
// COST PREVIEW HELPER
// ============================================================================

/** Mirrors convex/lib/costCalculator.ts logic for preview */
function previewCostPerBaseUnit(
  priceExclShipping: number,
  shippingCost: number,
  volumePurchased: number,
  unitType: string
): number {
  const totalCost = priceExclShipping + shippingCost;
  let baseVolume = volumePurchased;
  if (unitType === "kg" || unitType === "l") baseVolume = volumePurchased * 1000;
  if (unitType === "m") baseVolume = volumePurchased * 100;
  if (baseVolume <= 0) return 0;
  return totalCost / baseVolume;
}

// ============================================================================
// INLINE EDITABLE TABLE
// ============================================================================

function BulkTable({
  rows,
  edits,
  onEdit,
  onReset,
  onSave,
  isSaving,
  label,
}: {
  rows: PriceRow[] | undefined;
  edits: Map<string, EditedValues>;
  onEdit: (id: string, field: keyof EditedValues, value: string) => void;
  onReset: () => void;
  onSave: () => void;
  isSaving: boolean;
  label: string;
}) {
  if (rows === undefined) {
    return (
      <div className="space-y-3 mt-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No {label.toLowerCase()} found. Add some first via the {label} page.
      </div>
    );
  }

  const changedCount = edits.size;

  return (
    <div className="space-y-4">
      {/* Action bar */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {rows.length} {label.toLowerCase()} total
          {changedCount > 0 && (
            <Badge variant="secondary" className="ml-2">
              {changedCount} changed
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {changedCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={onReset}
              disabled={isSaving}
            >
              <RotateCcw className="h-4 w-4 mr-1" />
              Reset
            </Button>
          )}
          <Button
            size="sm"
            onClick={onSave}
            disabled={changedCount === 0 || isSaving}
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-1" />
            )}
            Save {changedCount > 0 ? `(${changedCount})` : ""}
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left px-3 py-2.5 font-medium">Name</th>
              <th className="text-left px-3 py-2.5 font-medium w-16">Unit</th>
              <th className="text-right px-3 py-2.5 font-medium w-28">Volume</th>
              <th className="text-right px-3 py-2.5 font-medium w-32">Price (IDR)</th>
              <th className="text-right px-3 py-2.5 font-medium w-28">Shipping</th>
              <th className="text-right px-3 py-2.5 font-medium w-32">Cost/{"\u200B"}Unit</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const edited = edits.get(row.id);
              const isChanged = !!edited;
              const vol = edited?.volumePurchased ?? row.volumePurchased;
              const price = edited?.priceExclShipping ?? row.priceExclShipping;
              const shipping = edited?.shippingCost ?? row.shippingCost;
              const previewCost = isChanged
                ? previewCostPerBaseUnit(price, shipping, vol, row.unitType)
                : row.costPerBaseUnit;

              return (
                <tr
                  key={row.id}
                  className={
                    isChanged
                      ? "border-b bg-amber-50 dark:bg-amber-950/30"
                      : "border-b hover:bg-muted/30"
                  }
                >
                  <td className="px-3 py-2">
                    <div className="font-medium">{row.name}</div>
                    {row.brand && (
                      <div className="text-xs text-muted-foreground">
                        {row.brand}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {row.unitType}
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      type="number"
                      min={0}
                      step="any"
                      className="w-24 text-right h-8 ml-auto"
                      value={vol}
                      onChange={(e) => onEdit(row.id, "volumePurchased", e.target.value)}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      type="number"
                      min={0}
                      step="any"
                      className="w-28 text-right h-8 ml-auto"
                      value={price}
                      onChange={(e) => onEdit(row.id, "priceExclShipping", e.target.value)}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      type="number"
                      min={0}
                      step="any"
                      className="w-24 text-right h-8 ml-auto"
                      value={shipping}
                      onChange={(e) => onEdit(row.id, "shippingCost", e.target.value)}
                    />
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs whitespace-nowrap">
                    {isChanged ? (
                      <div>
                        <span className="line-through text-muted-foreground mr-1">
                          {formatCurrency(row.costPerBaseUnit)}
                        </span>
                        <span className="font-semibold text-amber-700 dark:text-amber-400">
                          {formatCurrency(previewCost)}
                        </span>
                        <div className="text-[10px] text-muted-foreground">
                          per {row.baseUnit}
                        </div>
                      </div>
                    ) : (
                      <div>
                        {formatCurrency(row.costPerBaseUnit)}
                        <div className="text-[10px] text-muted-foreground">
                          per {row.baseUnit}
                        </div>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function BulkPriceUpdate() {
  useDocumentTitle("Bulk Price Update");

  const [activeTab, setActiveTab] = useState<"ingredients" | "materials">(
    "ingredients"
  );

  // Data
  const ingredients = useIngredients();
  const materials = useQuery(api.materials.queries.list, {});

  // Mutations
  const bulkUpdateIngredients = useBulkUpdateIngredientPrices();
  const bulkUpdateMaterials = useBulkUpdateMaterialPrices();

  // Edit state -- separate maps for each tab
  const [ingredientEdits, setIngredientEdits] = useState<
    Map<string, EditedValues>
  >(new Map());
  const [materialEdits, setMaterialEdits] = useState<
    Map<string, EditedValues>
  >(new Map());
  const [isSaving, setIsSaving] = useState(false);

  // Map data to rows
  const ingredientRows: PriceRow[] | undefined = useMemo(
    () =>
      ingredients?.map((i) => ({
        id: i._id as string,
        name: i.name,
        brand: i.brand,
        unitType: i.unitType,
        baseUnit: i.baseUnit ?? i.unitType,
        volumePurchased: i.volumePurchased,
        priceExclShipping: i.priceExclShipping,
        shippingCost: i.shippingCost,
        costPerBaseUnit: i.costPerBaseUnit ?? 0,
      })),
    [ingredients]
  );

  const materialRows: PriceRow[] | undefined = useMemo(
    () =>
      materials?.map((m) => ({
        id: m._id as string,
        name: m.name,
        brand: m.brand,
        unitType: m.unitType,
        baseUnit: m.baseUnit ?? m.unitType,
        volumePurchased: m.volumePurchased,
        priceExclShipping: m.priceExclShipping,
        shippingCost: m.shippingCost,
        costPerBaseUnit: m.costPerBaseUnit ?? 0,
      })),
    [materials]
  );

  // Edit handler factory
  const makeEditHandler = useCallback(
    (
      rows: PriceRow[] | undefined,
      setEdits: React.Dispatch<React.SetStateAction<Map<string, EditedValues>>>
    ) => {
      return (id: string, field: keyof EditedValues, value: string) => {
        const parsed = parseFloat(value);
        const numValue = isNaN(parsed) ? 0 : Math.max(0, parsed);
        const row = rows?.find((r) => r.id === id);
        if (!row) return;

        setEdits((prev) => {
          const next = new Map(prev);
          const current = next.get(id) ?? {
            volumePurchased: row.volumePurchased,
            priceExclShipping: row.priceExclShipping,
            shippingCost: row.shippingCost,
          };
          const updated = { ...current, [field]: numValue };

          // Remove from edits if all values match original
          if (
            updated.volumePurchased === row.volumePurchased &&
            updated.priceExclShipping === row.priceExclShipping &&
            updated.shippingCost === row.shippingCost
          ) {
            next.delete(id);
          } else {
            next.set(id, updated);
          }
          return next;
        });
      };
    },
    []
  );

  const handleIngredientEdit = useCallback(
    (id: string, field: keyof EditedValues, value: string) =>
      makeEditHandler(ingredientRows, setIngredientEdits)(id, field, value),
    [ingredientRows, makeEditHandler]
  );

  const handleMaterialEdit = useCallback(
    (id: string, field: keyof EditedValues, value: string) =>
      makeEditHandler(materialRows, setMaterialEdits)(id, field, value),
    [materialRows, makeEditHandler]
  );

  // Save handlers
  const handleSaveIngredients = useCallback(async () => {
    if (ingredientEdits.size === 0) return;
    setIsSaving(true);
    try {
      const updates = Array.from(ingredientEdits.entries()).map(
        ([id, vals]) => ({
          id: id as Id<"ingredients">,
          ...vals,
        })
      );
      const result = await bulkUpdateIngredients.mutate({ updates });
      const count = result?.updated ?? updates.length;
      toast.success(`Updated ${count} ingredient${count !== 1 ? "s" : ""}`);
      setIngredientEdits(new Map());
    } catch {
      // Error toast handled by mutation hook
    } finally {
      setIsSaving(false);
    }
  }, [ingredientEdits, bulkUpdateIngredients]);

  const handleSaveMaterials = useCallback(async () => {
    if (materialEdits.size === 0) return;
    setIsSaving(true);
    try {
      const updates = Array.from(materialEdits.entries()).map(([id, vals]) => ({
        id: id as Id<"packagingMaterials">,
        ...vals,
      }));
      const result = await bulkUpdateMaterials.mutate({ updates });
      const count = result?.updated ?? updates.length;
      toast.success(`Updated ${count} material${count !== 1 ? "s" : ""}`);
      setMaterialEdits(new Map());
    } catch {
      // Error toast handled by mutation hook
    } finally {
      setIsSaving(false);
    }
  }, [materialEdits, bulkUpdateMaterials]);

  return (
    <div>
      <PageHeader
        title="Bulk Price Update"
        description="Update ingredient and material costs in bulk. Changes recalculate COGS automatically."
        backTo="/"
        backLabel="Back to Hub"
        badge={
          <DollarSign className="h-6 w-6 text-muted-foreground" />
        }
      />

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as "ingredients" | "materials")}
      >
        <TabsList>
          <TabsTrigger value="ingredients">
            Ingredients
            {ingredientEdits.size > 0 && (
              <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-xs">
                {ingredientEdits.size}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="materials">
            Materials
            {materialEdits.size > 0 && (
              <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-xs">
                {materialEdits.size}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ingredients">
          <BulkTable
            rows={ingredientRows}
            edits={ingredientEdits}
            onEdit={handleIngredientEdit}
            onReset={() => setIngredientEdits(new Map())}
            onSave={handleSaveIngredients}
            isSaving={isSaving}
            label="Ingredients"
          />
        </TabsContent>

        <TabsContent value="materials">
          <BulkTable
            rows={materialRows}
            edits={materialEdits}
            onEdit={handleMaterialEdit}
            onReset={() => setMaterialEdits(new Map())}
            onSave={handleSaveMaterials}
            isSaving={isSaving}
            label="Materials"
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
