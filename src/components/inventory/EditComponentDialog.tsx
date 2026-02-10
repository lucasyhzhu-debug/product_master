/**
 * EditComponentDialog - Full edit dialog for component types
 *
 * Mirrors the create form from ReceiveStockDialog but pre-populated
 * with existing values. Edits name, unit, reorder point, and consumption stage.
 */

import { useState, useEffect } from "react";
import { Pencil, Package, Percent } from "lucide-react";
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
import { useConvexUpdateComponentType } from "@/hooks/convex";
import type { ComponentType } from "@/hooks/convex";
import { toast } from "sonner";
import { cn, SELECTABLE_STAGES, CONSUMPTION_STAGE_LABELS } from "@/lib/utils";
import type { SelectableStage } from "@/lib/utils";

interface EditComponentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  component: ComponentType;
}

export function EditComponentDialog({
  open,
  onOpenChange,
  component,
}: EditComponentDialogProps) {
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [customUnit, setCustomUnit] = useState("");
  const [reorderPointType, setReorderPointType] = useState<"units" | "percentage">("units");
  const [reorderPointUnits, setReorderPointUnits] = useState("");
  const [reorderPointPercentage, setReorderPointPercentage] = useState("");
  const [consumptionStage, setConsumptionStage] = useState<SelectableStage>("boxing");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateComponentType = useConvexUpdateComponentType();

  const COMMON_UNITS = ["pcs", "box", "sheet", "roll"];

  // Populate form when dialog opens
  useEffect(() => {
    if (open) {
      setName(component.name);
      // Check if unit is a common one or custom
      if (COMMON_UNITS.includes(component.unit)) {
        setUnit(component.unit);
        setCustomUnit("");
      } else {
        setUnit("custom");
        setCustomUnit(component.unit);
      }
      // Reorder point: negative means percentage
      if (component.reorderPoint !== undefined && component.reorderPoint !== null) {
        if (component.reorderPoint < 0) {
          setReorderPointType("percentage");
          setReorderPointPercentage(String(Math.abs(component.reorderPoint)));
          setReorderPointUnits("");
        } else {
          setReorderPointType("units");
          setReorderPointUnits(String(component.reorderPoint));
          setReorderPointPercentage("");
        }
      } else {
        setReorderPointType("units");
        setReorderPointUnits("");
        setReorderPointPercentage("");
      }
      setConsumptionStage(
        (component as Record<string, unknown>).consumptionStage as SelectableStage ?? "boxing"
      );
      setDescription((component as Record<string, unknown>).description as string ?? "");
    }
  }, [open, component]); // eslint-disable-line react-hooks/exhaustive-deps

  const finalUnit = unit === "custom" ? customUnit.trim() : unit;

  const hasChanges = (() => {
    if (name.trim() !== component.name) return true;
    if (finalUnit !== component.unit) return true;
    const currentStage = (component as Record<string, unknown>).consumptionStage as string ?? "boxing";
    if (consumptionStage !== currentStage) return true;
    const currentDesc = (component as Record<string, unknown>).description as string ?? "";
    if (description.trim() !== currentDesc) return true;
    // Check reorder point change
    const currentReorder = component.reorderPoint;
    let newReorder: number | undefined;
    if (reorderPointType === "units" && reorderPointUnits) {
      newReorder = Number(reorderPointUnits);
    } else if (reorderPointType === "percentage" && reorderPointPercentage) {
      newReorder = -Number(reorderPointPercentage);
    }
    if (newReorder !== currentReorder) return true;
    return false;
  })();

  const canSubmit = name.trim().length > 0 && finalUnit.length > 0 && hasChanges;

  const handleSubmit = async () => {
    if (!canSubmit) return;

    setIsSubmitting(true);
    try {
      let reorderPoint: number | undefined;
      if (reorderPointType === "units" && reorderPointUnits) {
        reorderPoint = Number(reorderPointUnits);
      } else if (reorderPointType === "percentage" && reorderPointPercentage) {
        reorderPoint = -Number(reorderPointPercentage);
      }

      await updateComponentType({
        id: component._id,
        name: name.trim(),
        unit: finalUnit,
        consumptionStage,
        reorderPoint,
        description: description.trim() || undefined,
      });
      toast.success(`"${component.name}" updated`);
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to update component"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-4 w-4" />
            Edit Component
          </DialogTitle>
          <DialogDescription>
            Update details for "{component.name}"
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-4">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="edit-name" className="text-sm font-medium">
              Component Name *
            </Label>
            <Input
              id="edit-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Long Box, Sticker Sheet"
              className="h-11 text-base"
              autoFocus
            />
          </div>

          {/* Unit */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">
              Unit of Measurement *
            </Label>
            <div className="flex flex-wrap gap-2">
              {COMMON_UNITS.map((unitOption) => (
                <Button
                  key={unitOption}
                  type="button"
                  variant={unit === unitOption ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setUnit(unitOption);
                    setCustomUnit("");
                  }}
                  className={cn(
                    "px-4",
                    unit === unitOption &&
                      "bg-[#E07856] hover:bg-[#D66A4A] text-white border-[#E07856]"
                  )}
                >
                  {unitOption}
                </Button>
              ))}
              <Button
                type="button"
                variant={unit === "custom" ? "default" : "outline"}
                size="sm"
                onClick={() => setUnit("custom")}
                className={cn(
                  "px-4",
                  unit === "custom" &&
                    "bg-[#E07856] hover:bg-[#D66A4A] text-white border-[#E07856]"
                )}
              >
                Other...
              </Button>
            </div>
            {unit === "custom" && (
              <Input
                value={customUnit}
                onChange={(e) => setCustomUnit(e.target.value)}
                placeholder="Enter custom unit (e.g., kg, meter)"
                className="mt-2"
              />
            )}
          </div>

          {/* Reorder Point */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">
              Reorder Alert Threshold
            </Label>
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
            <Label className="text-sm font-medium">Consumed During</Label>
            <div className="flex flex-wrap gap-2">
              {SELECTABLE_STAGES.map((stage) => (
                <Button
                  key={stage}
                  type="button"
                  variant={consumptionStage === stage ? "default" : "outline"}
                  size="sm"
                  onClick={() => setConsumptionStage(stage)}
                  className={cn(
                    "flex-1 min-w-[80px]",
                    consumptionStage === stage &&
                      "bg-[#E07856] hover:bg-[#D66A4A] text-white"
                  )}
                >
                  {CONSUMPTION_STAGE_LABELS[stage]}
                </Button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="edit-description" className="text-sm font-medium">
              Description (Optional)
            </Label>
            <Input
              id="edit-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional notes about this component"
            />
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
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit || isSubmitting}
          >
            {isSubmitting ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
