/**
 * ReceiveStockDialog - Stock receiving with inline component creation
 *
 * Supports two modes:
 * 1. Select existing component → receive stock
 * 2. Create new packaging component → receive first batch
 */

import { useState, useEffect } from "react";
import { Package, Plus, DollarSign, Truck, Calendar, Boxes, ArrowLeft } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
// Select imports removed - replaced with button grid in Wave 5
import { toast } from "sonner";
import {
  useConvexReceiveStock,
  useConvexCreateComponentAndReceiveStock,
  useConvexInventoryTrackedComponents,
  useConvexLatestBatch,
} from "@/hooks/convex";
import type { Id } from "../../../convex/_generated/dataModel";
import type { ComponentType } from "@/hooks/convex";
import { formatCurrency, cn, SELECTABLE_STAGES, CONSUMPTION_STAGE_LABELS } from "@/lib/utils";
import type { SelectableStage } from "@/lib/utils";

interface ReceiveStockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locations: Array<{ _id: Id<"storageLocations">; name: string; isDefault?: boolean }>;
  lowStockComponents?: ComponentType[];
  preselectedComponentId?: Id<"componentTypes">;
  forceCreateMode?: boolean;
}

type Mode = 'select' | 'create-new';

export function ReceiveStockDialog({
  open,
  onOpenChange,
  locations,
  lowStockComponents = [],
  preselectedComponentId,
  forceCreateMode,
}: ReceiveStockDialogProps) {
  // Mode state
  const [mode, setMode] = useState<Mode>('select');

  // Existing component selection
  const [selectedComponentId, setSelectedComponentId] = useState<
    Id<"componentTypes"> | null
  >(null);

  // New component fields
  const [newComponentCode, setNewComponentCode] = useState("");
  const [newComponentName, setNewComponentName] = useState("");
  const [newComponentCategory, setNewComponentCategory] = useState<
    "packaging"
  >("packaging");
  const [newComponentUnit, setNewComponentUnit] = useState("");
  const [newComponentReorderPoint, setNewComponentReorderPoint] = useState("");
  const [newComponentStage, setNewComponentStage] = useState<SelectableStage>("boxing");

  // Common fields (batch details)
  const [selectedLocationId, setSelectedLocationId] = useState<
    Id<"storageLocations"> | null
  >(null);
  const [quantity, setQuantity] = useState("");
  const [totalCost, setTotalCost] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [supplierBrand, setSupplierBrand] = useState("");
  const [purchaseReference, setPurchaseReference] = useState("");
  const [purchaseUrl, setPurchaseUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Queries and mutations
  const allComponents = useConvexInventoryTrackedComponents(true);
  const receiveStock = useConvexReceiveStock();
  const createAndReceive = useConvexCreateComponentAndReceiveStock();

  // Auto-populate supplier info from latest batch
  const latestBatch = useConvexLatestBatch(
    selectedComponentId ?? undefined,
    selectedLocationId ?? undefined
  );

  const handleComponentSelect = (componentId: Id<"componentTypes">) => {
    setSelectedComponentId(componentId);
    // Auto-populate supplier info will happen via useEffect when latestBatch updates
  };

  // Set default location
  useEffect(() => {
    if (locations.length > 0 && !selectedLocationId) {
      const defaultLoc = locations.find((l) => l.isDefault) || locations[0];
      setSelectedLocationId(defaultLoc._id);
    }
  }, [locations, selectedLocationId]);

  // Auto-populate supplier info from latest batch
  useEffect(() => {
    if (latestBatch && selectedComponentId) {
      // Only auto-populate if fields are currently empty (don't overwrite user edits)
      if (!supplierName) setSupplierName(latestBatch.supplierName ?? "");
      if (!supplierBrand) setSupplierBrand(latestBatch.supplierBrand ?? "");
      if (!purchaseUrl) setPurchaseUrl(latestBatch.purchaseUrl ?? "");
    }
  }, [latestBatch, selectedComponentId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setMode(forceCreateMode ? 'create-new' : 'select');
      setSelectedComponentId(preselectedComponentId ?? null);
      setNewComponentCode("");
      setNewComponentName("");
      setNewComponentCategory("packaging");
      setNewComponentUnit("");
      setNewComponentReorderPoint("");
      setNewComponentStage("boxing");
      setQuantity("");
      setTotalCost("");
      setSupplierName("");
      setSupplierBrand("");
      setPurchaseReference("");
      setPurchaseUrl("");
    }
  }, [open, preselectedComponentId, forceCreateMode]);

  const unitCost =
    quantity && totalCost
      ? Number(totalCost) / Number(quantity)
      : null;

  const handleSubmit = async () => {
    // Common validation
    if (!selectedLocationId) {
      toast.error("Please select a location");
      return;
    }
    if (!quantity || Number(quantity) <= 0) {
      toast.error("Quantity must be greater than 0");
      return;
    }
    if (!totalCost || Number(totalCost) <= 0) {
      toast.error("Total cost must be greater than 0");
      return;
    }
    if (!supplierName.trim()) {
      toast.error("Supplier name is required");
      return;
    }

    setIsSubmitting(true);
    try {
      if (mode === 'select') {
        // Existing component - validate and receive
        if (!selectedComponentId) {
          toast.error("Please select a component");
          return;
        }

        await receiveStock({
          componentTypeId: selectedComponentId,
          locationId: selectedLocationId,
          purchaseDate: Date.now(),
          supplierName: supplierName.trim(),
          supplierBrand: supplierBrand.trim() || undefined,
          purchaseReference: purchaseReference.trim() || undefined,
          purchaseUrl: purchaseUrl.trim() || undefined,
          quantityPurchased: Number(quantity),
          totalCostIdr: Number(totalCost),
          createdBy: "current-user", // TODO: Replace with actual user
        });

        toast.success("Stock received successfully");
      } else {
        // Create new component - validate additional fields
        if (!newComponentCode.trim()) {
          toast.error("Component code is required");
          return;
        }
        if (!newComponentName.trim()) {
          toast.error("Component name is required");
          return;
        }
        if (!newComponentUnit.trim()) {
          toast.error("Unit is required");
          return;
        }

        await createAndReceive({
          code: newComponentCode.trim().toUpperCase(),
          name: newComponentName.trim(),
          category: newComponentCategory,
          unit: newComponentUnit.trim(),
          reorderPoint: newComponentReorderPoint ? Number(newComponentReorderPoint) : undefined,
          consumptionStage: newComponentStage,
          locationId: selectedLocationId,
          purchaseDate: Date.now(),
          supplierName: supplierName.trim(),
          supplierBrand: supplierBrand.trim() || undefined,
          purchaseReference: purchaseReference.trim() || undefined,
          purchaseUrl: purchaseUrl.trim() || undefined,
          quantityPurchased: Number(quantity),
          totalCostIdr: Number(totalCost),
          createdBy: "current-user", // TODO: Replace with actual user
        });

        toast.success(`Component "${newComponentName}" created and stock received`);
      }

      onOpenChange(false);
    } catch (error) {
      console.error("Failed to receive stock:", error);
      toast.error(error instanceof Error ? error.message : "Failed to receive stock");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            {mode === 'select' ? 'Receive Stock' : 'Create Component & Receive Stock'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'select'
              ? 'Add new inventory batch for existing component'
              : 'Create new packaging component on first receipt'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Mode: Select Existing or Create New */}
          {mode === 'select' ? (
            <>
              {/* Component Selection - Button Grid (skip when preselected) */}
              {preselectedComponentId ? (
                <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700">
                  <div className="text-sm text-slate-400">Receiving stock for:</div>
                  <div className="font-semibold text-slate-100">
                    {allComponents?.find(c => c._id === preselectedComponentId)?.name ?? "Loading..."}
                  </div>
                </div>
              ) : (
              <div className="space-y-2">
                <Label>Select Component</Label>
                {allComponents && allComponents.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {/* Sort: low stock first (components in lowStockComponents list) */}
                    {[...allComponents]
                      .sort((a, b) => {
                        const aIsLow = lowStockComponents.some((l) => l._id === a._id);
                        const bIsLow = lowStockComponents.some((l) => l._id === b._id);
                        if (aIsLow && !bIsLow) return -1;
                        if (!aIsLow && bIsLow) return 1;
                        return a.name.localeCompare(b.name);
                      })
                      .map((comp) => {
                        const isLow = lowStockComponents.some((l) => l._id === comp._id);
                        const isSelected = selectedComponentId === comp._id;
                        return (
                          <button
                            key={comp._id}
                            type="button"
                            onClick={() => handleComponentSelect(comp._id)}
                            className={cn(
                              "flex items-center gap-2 rounded-lg border-2 p-2.5 text-left transition-colors text-sm",
                              isSelected
                                ? "border-emerald-500 bg-emerald-500/10 text-emerald-100"
                                : isLow
                                  ? "border-amber-700/50 bg-amber-900/10 hover:border-amber-600/70"
                                  : "border-slate-700 hover:border-slate-500"
                            )}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="font-medium truncate">{comp.name}</div>
                              <div className="text-xs text-slate-400">
                                {comp.category}
                              </div>
                            </div>
                            {isLow && (
                              <Badge
                                variant="outline"
                                className="text-[10px] shrink-0 bg-red-500/20 text-red-300 border-red-600"
                              >
                                LOW
                              </Badge>
                            )}
                          </button>
                        );
                      })}
                  </div>
                ) : (
                  <div className="text-sm text-slate-400 text-center py-4">
                    Loading components...
                  </div>
                )}
              </div>
              )}

              {/* Create New Button */}
              {!preselectedComponentId && (
              <Button
                variant="outline"
                onClick={() => setMode('create-new')}
                className="w-full"
              >
                <Plus className="h-4 w-4 mr-2" />
                Create New Packaging Component
              </Button>
              )}
            </>
          ) : (
            <>
              {/* Back Button */}
              <Button
                variant="ghost"
                onClick={() => setMode('select')}
                className="w-full justify-start"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Select Existing
              </Button>

              {/* New Component Form */}
              <div className="space-y-4 border-2 border-dashed border-emerald-600/30 rounded-lg p-4 bg-emerald-950/20">
                <div className="flex items-center gap-2 text-emerald-400 font-medium">
                  <Boxes className="h-4 w-4" />
                  New Component Details
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="code">
                      Code * <span className="text-xs text-slate-400">(e.g., LONG_BOX)</span>
                    </Label>
                    <Input
                      id="code"
                      value={newComponentCode}
                      onChange={(e) => setNewComponentCode(e.target.value.toUpperCase())}
                      placeholder="LONG_BOX"
                      className="font-mono"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="name">Name *</Label>
                    <Input
                      id="name"
                      value={newComponentName}
                      onChange={(e) => setNewComponentName(e.target.value)}
                      placeholder="Long Box"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Category *</Label>
                  <RadioGroup
                    value={newComponentCategory}
                    onValueChange={(value) =>
                      setNewComponentCategory(value as typeof newComponentCategory)
                    }
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="packaging" id="packaging" />
                      <Label htmlFor="packaging" className="font-normal cursor-pointer">
                        Packaging <span className="text-xs text-slate-400">(boxes, stickers, etc.)</span>
                      </Label>
                    </div>
                  </RadioGroup>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="unit">Unit * <span className="text-xs text-slate-400">(pcs, kg, box)</span></Label>
                    <Input
                      id="unit"
                      value={newComponentUnit}
                      onChange={(e) => setNewComponentUnit(e.target.value)}
                      placeholder="pcs"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="reorderPoint">Reorder Point (Optional)</Label>
                    <Input
                      id="reorderPoint"
                      type="number"
                      min="0"
                      value={newComponentReorderPoint}
                      onChange={(e) => setNewComponentReorderPoint(e.target.value)}
                      placeholder="50"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Consumed During</Label>
                  <div className="flex gap-2">
                    {SELECTABLE_STAGES.map((stage) => (
                      <Button
                        key={stage}
                        type="button"
                        variant={newComponentStage === stage ? "default" : "outline"}
                        size="sm"
                        onClick={() => setNewComponentStage(stage)}
                        className={cn(
                          "flex-1",
                          newComponentStage === stage &&
                            "bg-[#E07856] hover:bg-[#D66A4A] text-white"
                        )}
                      >
                        {CONSUMPTION_STAGE_LABELS[stage]}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Location Selection */}
          <div className="space-y-2">
            <Label>Storage Location *</Label>
            <div className="flex flex-wrap gap-2">
              {locations.map((loc) => (
                <Button
                  key={loc._id}
                  variant={
                    selectedLocationId === loc._id ? "default" : "outline"
                  }
                  size="sm"
                  onClick={() => setSelectedLocationId(loc._id)}
                  className="font-mono"
                >
                  {loc.name}
                  {loc.isDefault && (
                    <Badge variant="secondary" className="ml-2 text-xs">
                      Default
                    </Badge>
                  )}
                </Button>
              ))}
            </div>
          </div>

          <div className="border-t border-slate-700 pt-4" />

          {/* Batch Details */}
          <div className="space-y-4">
            <div className="font-medium text-slate-200">Batch Details (This Receipt)</div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="quantity">
                  <Package className="inline h-4 w-4 mr-1" />
                  Quantity Received *
                </Label>
                <Input
                  id="quantity"
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="100"
                  className="font-mono"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="totalCost">
                  <DollarSign className="inline h-4 w-4 mr-1" />
                  Total Cost (IDR) *
                </Label>
                <Input
                  id="totalCost"
                  type="number"
                  min="0"
                  value={totalCost}
                  onChange={(e) => setTotalCost(e.target.value)}
                  placeholder="50000"
                  className="font-mono"
                />
              </div>
            </div>

            {/* Unit Cost Display */}
            {unitCost !== null && (
              <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-400">Unit Cost (FIFO will use this):</span>
                  <span className="text-lg font-mono font-bold text-emerald-400">
                    {formatCurrency(unitCost)}
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-slate-700 pt-4" />

          {/* Supplier Info */}
          <div className="space-y-4">
            <div className="font-medium text-slate-200">Supplier Information</div>

            <div className="space-y-2">
              <Label htmlFor="supplierName">
                <Truck className="inline h-4 w-4 mr-1" />
                Supplier Name *
              </Label>
              <Input
                id="supplierName"
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                placeholder="Tokopedia - BoxMaster"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="supplierBrand">Brand (Optional)</Label>
              <Input
                id="supplierBrand"
                value={supplierBrand}
                onChange={(e) => setSupplierBrand(e.target.value)}
                placeholder="Generic Kraft"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="purchaseReference">
                <Calendar className="inline h-4 w-4 mr-1" />
                PO/Invoice # (Optional)
              </Label>
              <Input
                id="purchaseReference"
                value={purchaseReference}
                onChange={(e) => setPurchaseReference(e.target.value)}
                placeholder="INV-2024-0205"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="purchaseUrl">Reorder URL (Optional)</Label>
              <Input
                id="purchaseUrl"
                type="url"
                value={purchaseUrl}
                onChange={(e) => setPurchaseUrl(e.target.value)}
                placeholder="https://tokopedia.com/..."
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting} size="lg">
            <Plus className="h-4 w-4 mr-2" />
            {isSubmitting
              ? "Processing..."
              : mode === 'select'
                ? "Receive Stock"
                : "Create & Receive"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
