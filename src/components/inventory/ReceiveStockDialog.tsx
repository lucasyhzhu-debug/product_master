/**
 * ReceiveStockDialog - Stock receiving with inline component creation
 *
 * Supports two modes:
 * 1. Select existing component → receive stock
 * 2. Create new packaging component → receive first batch
 */

import { useState, useEffect } from "react";
import { Package, Plus, DollarSign, Truck, Calendar, Boxes, ArrowLeft, Percent } from "lucide-react";
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
// Select/RadioGroup imports removed - replaced with button grid in Wave 5
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  useReceiveStock,
  useCreateComponentAndReceiveStock,
  useInventoryTrackedComponents,
  useLatestBatch,
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
  defaultCategory?: "packaging" | "production";
}

type Mode = 'select' | 'create-new';

export function ReceiveStockDialog({
  open,
  onOpenChange,
  locations,
  lowStockComponents = [],
  preselectedComponentId,
  forceCreateMode,
  defaultCategory = "packaging",
}: ReceiveStockDialogProps) {
  // Mode state
  const [mode, setMode] = useState<Mode>('select');

  // Existing component selection
  const [selectedComponentId, setSelectedComponentId] = useState<
    Id<"componentTypes"> | null
  >(null);

  // New component fields
  const [newComponentName, setNewComponentName] = useState("");
  const [newComponentCategory, setNewComponentCategory] = useState<"packaging" | "production">("packaging");
  const [newComponentUnit, setNewComponentUnit] = useState("");
  const [customUnit, setCustomUnit] = useState(""); // For custom unit input
  const [reorderPointType, setReorderPointType] = useState<"units" | "percentage">("units");
  const [reorderPointUnits, setReorderPointUnits] = useState("");
  const [reorderPointPercentage, setReorderPointPercentage] = useState("");
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

  // Auth
  const { user } = useAuth();

  // Queries and mutations
  const allComponents = useInventoryTrackedComponents(true);
  const receiveStock = useReceiveStock();
  const createAndReceive = useCreateComponentAndReceiveStock();

  // Auto-populate supplier info from latest batch
  const latestBatch = useLatestBatch(
    selectedComponentId ?? undefined,
    selectedLocationId ?? undefined
  );

  const handleComponentSelect = (componentId: Id<"componentTypes">) => {
    setSelectedComponentId(componentId);
    // Auto-populate supplier info will happen via useEffect when latestBatch updates
  };

  // Set default location based on category
  useEffect(() => {
    if (locations.length > 0 && !selectedLocationId) {
      if (newComponentCategory === "production") {
        const kitchen = locations.find((l) => l.name.toLowerCase().includes("kitchen"));
        setSelectedLocationId(kitchen?._id ?? locations[0]._id);
      } else {
        const defaultLoc = locations.find((l) => l.isDefault) || locations[0];
        setSelectedLocationId(defaultLoc._id);
      }
    }
  }, [locations, selectedLocationId, newComponentCategory]);

  // Auto-populate supplier info and batch details from latest batch
  useEffect(() => {
    if (latestBatch && selectedComponentId) {
      // Only auto-populate if fields are currently empty (don't overwrite user edits)
      if (!supplierName) setSupplierName(latestBatch.supplierName ?? "");
      if (!supplierBrand) setSupplierBrand(latestBatch.supplierBrand ?? "");
      if (!purchaseUrl) setPurchaseUrl(latestBatch.purchaseUrl ?? "");
      // Pre-fill batch details from previous batch
      if (!quantity) setQuantity(String(latestBatch.quantityPurchased));
      if (!totalCost) setTotalCost(String(latestBatch.totalCostIdr));
    }
  }, [latestBatch, selectedComponentId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Set default batch values for new components
  useEffect(() => {
    if (open && mode === 'create-new' && !quantity && !totalCost) {
      setQuantity("100");
      setTotalCost("10000");
    }
  }, [open, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setMode(forceCreateMode ? 'create-new' : 'select');
      setSelectedComponentId(preselectedComponentId ?? null);
      setNewComponentName("");
      setNewComponentCategory(defaultCategory);
      setNewComponentUnit(defaultCategory === "production" ? "g" : "pcs");
      setCustomUnit("");
      setReorderPointType("units");
      setReorderPointUnits("");
      setReorderPointPercentage("");
      setNewComponentStage("boxing");
      setQuantity("");
      setTotalCost("");
      setSupplierName("");
      setSupplierBrand("");
      setPurchaseReference("");
      setPurchaseUrl("");
    }
  }, [open, preselectedComponentId, forceCreateMode]);

  const selectedComponent = allComponents?.find(c => c._id === selectedComponentId);
  const selectedUnit = mode === 'select'
    ? (selectedComponent?.unit ?? null)
    : (newComponentUnit === 'custom' ? (customUnit || null) : newComponentUnit);

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
          createdBy: user?.name ?? "unknown",
        });

        toast.success("Stock received successfully");
      } else {
        // Create new component - validate additional fields
        if (!newComponentName.trim()) {
          toast.error("Component name is required");
          return;
        }

        // Determine the final unit (either selected or custom)
        const finalUnit = newComponentUnit === "custom"
          ? customUnit.trim()
          : newComponentUnit;

        if (!finalUnit) {
          toast.error("Unit is required");
          return;
        }

        // Auto-generate code from name (uppercase, replace spaces with underscores)
        const generatedCode = newComponentName.trim().toUpperCase().replace(/\s+/g, '_');

        // Calculate reorder point based on type
        let reorderPoint: number | undefined;
        if (reorderPointType === "units" && reorderPointUnits) {
          reorderPoint = Number(reorderPointUnits);
        } else if (reorderPointType === "percentage" && reorderPointPercentage) {
          // Store as negative to indicate percentage (backend will interpret)
          reorderPoint = -Number(reorderPointPercentage);
        }

        await createAndReceive({
          code: generatedCode,
          name: newComponentName.trim(),
          category: newComponentCategory,
          unit: finalUnit,
          reorderPoint,
          consumptionStage: newComponentCategory === "production" ? "production" : newComponentStage,
          locationId: selectedLocationId,
          purchaseDate: Date.now(),
          supplierName: supplierName.trim(),
          supplierBrand: supplierBrand.trim() || undefined,
          purchaseReference: purchaseReference.trim() || undefined,
          purchaseUrl: purchaseUrl.trim() || undefined,
          quantityPurchased: Number(quantity),
          totalCostIdr: Number(totalCost),
          createdBy: user?.name ?? "unknown",
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
              : newComponentCategory === 'production'
                ? 'Create new ingredient component on first receipt'
                : 'Create new packaging component on first receipt'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Mode: Select Existing or Create New */}
          {mode === 'select' ? (
            <>
              {/* Component Selection - Button Grid (skip when preselected) */}
              {preselectedComponentId ? (
                <div className="bg-muted/50 rounded-lg p-3 border">
                  <div className="text-sm text-muted-foreground">Receiving stock for:</div>
                  <div className="font-semibold text-foreground">
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
                                ? "border-emerald-500 bg-emerald-500/10 text-emerald-900"
                                : isLow
                                  ? "border-[var(--color-status-warning)]/50 bg-[var(--color-status-warning-bg)] hover:border-[var(--color-status-warning)]/70"
                                  : "border-border hover:border-border/80"
                            )}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="font-medium truncate">{comp.name}</div>
                              <div className="text-xs text-muted-foreground">
                                {comp.category}
                              </div>
                            </div>
                            {isLow && (
                              <Badge
                                variant="outline"
                                className="text-[10px] shrink-0 bg-[var(--color-status-error-bg)] text-[var(--color-status-error)] border-[var(--color-status-error)]/30"
                              >
                                LOW
                              </Badge>
                            )}
                          </button>
                        );
                      })}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground text-center py-4">
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
                Create New Component
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

              {/* New Component Form - Clean White Design */}
              <div className="space-y-5 rounded-xl p-6 bg-muted/30 border">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-emerald-500/10">
                    <Boxes className="h-5 w-5 text-emerald-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground">New Component Details</h3>
                </div>

                {/* Name Field - Full Width */}
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-sm font-medium text-foreground">
                    Component Name *
                  </Label>
                  <Input
                    id="name"
                    value={newComponentName}
                    onChange={(e) => setNewComponentName(e.target.value)}
                    placeholder="e.g., Long Box, Sticker Sheet, Inner Bag"
                    className="h-11 text-base"
                  />
                  <p className="text-xs text-muted-foreground">
                    Code will be auto-generated from name
                  </p>
                </div>

                {/* Category Selector */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-foreground">Category</Label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant={newComponentCategory === "packaging" ? "default" : "outline"}
                      size="sm"
                      onClick={() => {
                        setNewComponentCategory("packaging");
                        setNewComponentUnit("pcs");
                        setSelectedLocationId(null);
                      }}
                      className={cn(
                        "flex-1",
                        newComponentCategory === "packaging" &&
                          "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600"
                      )}
                    >
                      Packaging
                    </Button>
                    <Button
                      type="button"
                      variant={newComponentCategory === "production" ? "default" : "outline"}
                      size="sm"
                      onClick={() => {
                        setNewComponentCategory("production");
                        setNewComponentUnit("g");
                        setSelectedLocationId(null);
                      }}
                      className={cn(
                        "flex-1",
                        newComponentCategory === "production" &&
                          "bg-blue-600 hover:bg-blue-700 text-white border-blue-600"
                      )}
                    >
                      Ingredient
                    </Button>
                  </div>
                </div>

                {/* Unit Selection - conditional based on category */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-foreground">
                    Unit of Measurement *
                  </Label>
                  {newComponentCategory === "production" ? (
                    <div className="flex flex-wrap gap-2">
                      {[
                        { value: "g", label: "Grams (g)" },
                        { value: "kg", label: "Kilograms (kg)" },
                        { value: "ml", label: "Milliliters (ml)" },
                        { value: "l", label: "Liters (l)" },
                      ].map(({ value: unitValue, label }) => (
                        <Button
                          key={unitValue}
                          type="button"
                          variant={newComponentUnit === unitValue ? "default" : "outline"}
                          size="sm"
                          onClick={() => {
                            setNewComponentUnit(unitValue);
                            setCustomUnit("");
                          }}
                          className={cn(
                            "px-4",
                            newComponentUnit === unitValue &&
                              "bg-blue-600 hover:bg-blue-700 text-white border-blue-600"
                          )}
                        >
                          {label}
                        </Button>
                      ))}
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-wrap gap-2">
                        {["pcs", "box", "sheet", "roll"].map((unitOption) => (
                          <Button
                            key={unitOption}
                            type="button"
                            variant={newComponentUnit === unitOption ? "default" : "outline"}
                            size="sm"
                            onClick={() => {
                              setNewComponentUnit(unitOption);
                              setCustomUnit("");
                            }}
                            className={cn(
                              "px-4",
                              newComponentUnit === unitOption &&
                                "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600"
                            )}
                          >
                            {unitOption}
                          </Button>
                        ))}
                        <Button
                          type="button"
                          variant={newComponentUnit === "custom" ? "default" : "outline"}
                          size="sm"
                          onClick={() => setNewComponentUnit("custom")}
                          className={cn(
                            "px-4",
                            newComponentUnit === "custom" &&
                              "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600"
                          )}
                        >
                          Other...
                        </Button>
                      </div>
                      {newComponentUnit === "custom" && (
                        <Input
                          value={customUnit}
                          onChange={(e) => setCustomUnit(e.target.value)}
                          placeholder="Enter custom unit (e.g., kg, meter)"
                          className="mt-2"
                        />
                      )}
                    </>
                  )}
                </div>

                {/* Reorder Point - Units OR Percentage */}
                <div className="space-y-3">
                  <Label className="text-sm font-medium text-foreground">
                    Reorder Alert Threshold (Optional)
                  </Label>

                  {/* Type Toggle */}
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant={reorderPointType === "units" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setReorderPointType("units")}
                      className={cn(
                        "flex-1",
                        reorderPointType === "units" &&
                          "bg-blue-600 hover:bg-blue-700 text-white border-blue-600"
                      )}
                    >
                      <Package className="h-3.5 w-3.5 mr-1.5" />
                      By Units
                    </Button>
                    <Button
                      type="button"
                      variant={reorderPointType === "percentage" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setReorderPointType("percentage")}
                      className={cn(
                        "flex-1",
                        reorderPointType === "percentage" &&
                          "bg-blue-600 hover:bg-blue-700 text-white border-blue-600"
                      )}
                    >
                      <Percent className="h-3.5 w-3.5 mr-1.5" />
                      By Percentage
                    </Button>
                  </div>

                  {/* Input based on type */}
                  {reorderPointType === "units" ? (
                    <div className="space-y-1.5">
                      <Input
                        type="number"
                        min="0"
                        value={reorderPointUnits}
                        onChange={(e) => setReorderPointUnits(e.target.value)}
                        placeholder="50"
                        className="font-mono"
                      />
                      <p className="text-xs text-muted-foreground">
                        Alert when stock falls below this quantity
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        value={reorderPointPercentage}
                        onChange={(e) => setReorderPointPercentage(e.target.value)}
                        placeholder="20"
                        className="font-mono"
                      />
                      <p className="text-xs text-muted-foreground">
                        Alert when stock falls below this % of last restock
                      </p>
                    </div>
                  )}
                </div>

                {/* Consumption Stage */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-foreground">Consumed During</Label>
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

          <div className="border-t border-border pt-4" />

          {/* Batch Details */}
          <div className="space-y-4">
            <h3 className="text-base font-bold text-foreground">Batch Details (This Receipt)</h3>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="quantity" className="text-sm font-medium text-foreground">
                  <Package className="inline h-4 w-4 mr-1.5" />
                  Quantity Received *
                </Label>
                <div className="relative">
                  <Input
                    id="quantity"
                    type="number"
                    min="1"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    placeholder="100"
                    className={cn("font-mono h-11 text-base", selectedUnit && "pr-12")}
                  />
                  {selectedUnit && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground pointer-events-none">
                      {selectedUnit}
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="totalCost" className="text-sm font-medium text-foreground">
                  <DollarSign className="inline h-4 w-4 mr-1.5" />
                  Total Cost (IDR) *
                </Label>
                <Input
                  id="totalCost"
                  type="number"
                  min="0"
                  value={totalCost}
                  onChange={(e) => setTotalCost(e.target.value)}
                  placeholder="10000"
                  className="font-mono h-11 text-base"
                />
              </div>
            </div>

            {/* Live Unit Cost Display */}
            {unitCost !== null && (
              <div className="rounded-xl p-4 bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 border border-emerald-500/20">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="text-xs font-medium text-emerald-700 uppercase tracking-wide">
                      Cost per Unit
                    </div>
                    <div className="text-sm text-muted-foreground">
                      FIFO will use this rate
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-emerald-600 font-mono tracking-tight">
                      {formatCurrency(unitCost)}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      per {selectedUnit ?? 'unit'}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-border pt-4" />

          {/* Supplier Info */}
          <div className="space-y-4">
            <h3 className="text-base font-bold text-foreground">Supplier Information</h3>

            <div className="space-y-2">
              <Label htmlFor="supplierName" className="text-sm font-medium text-foreground">
                <Truck className="inline h-4 w-4 mr-1.5" />
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
              <Label htmlFor="supplierBrand" className="text-sm font-medium text-foreground">
                Brand (Optional)
              </Label>
              <Input
                id="supplierBrand"
                value={supplierBrand}
                onChange={(e) => setSupplierBrand(e.target.value)}
                placeholder="Generic Kraft"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="purchaseReference" className="text-sm font-medium text-foreground">
                <Calendar className="inline h-4 w-4 mr-1.5" />
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
              <Label htmlFor="purchaseUrl" className="text-sm font-medium text-foreground">
                Reorder URL (Optional)
              </Label>
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
