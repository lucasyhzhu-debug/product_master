/**
 * ComponentTypeDialog - Create/edit component type
 */

import { useState, useEffect } from "react";
import { Package } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useConvexCreateComponentType } from "@/hooks/convex";
import { toast } from "sonner";

interface ComponentTypeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultCategory?: "production" | "direct_packaging" | "indirect_packaging";
}

export function ComponentTypeDialog({
  open,
  onOpenChange,
  defaultCategory = "production",
}: ComponentTypeDialogProps) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState(defaultCategory);
  const [unitCost, setUnitCost] = useState("");
  const [unit, setUnit] = useState("pcs");
  const [gramsPerUnit, setGramsPerUnit] = useState("");
  const [reorderPoint, setReorderPoint] = useState("");
  const [trackInventory, setTrackInventory] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const createComponentType = useConvexCreateComponentType();

  useEffect(() => {
    if (open) {
      setCode("");
      setName("");
      setCategory(defaultCategory);
      setUnitCost("");
      setUnit("pcs");
      setGramsPerUnit("");
      setReorderPoint("");
      setTrackInventory(defaultCategory !== "production");
    }
  }, [open, defaultCategory]);

  const handleSubmit = async () => {
    if (!code.trim() || !name.trim()) {
      toast.error("Code and name are required");
      return;
    }
    if (!unitCost || Number(unitCost) <= 0) {
      toast.error("Unit cost must be greater than 0");
      return;
    }

    setIsSubmitting(true);
    try {
      await createComponentType({
        code: code.trim(),
        name: name.trim(),
        category,
        unitCostIdr: Number(unitCost),
        unit,
        gramsPerUnit: gramsPerUnit ? Number(gramsPerUnit) : undefined,
        trackInventory,
        reorderPoint: reorderPoint ? Number(reorderPoint) : undefined,
        createdBy: "current-user", // TODO: Replace with actual user
      });
      toast.success("Component type created");
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to create component type:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to create component type"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            New Component Type
          </DialogTitle>
          <DialogDescription>
            Create a new production or packaging component
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="code">Code *</Label>
              <Input
                id="code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="LONG_BOX"
                className="font-mono"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Long Box"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">Category *</Label>
            <Select
              value={category}
              onValueChange={(value) =>
                setCategory(
                  value as "production" | "direct_packaging" | "indirect_packaging"
                )
              }
            >
              <SelectTrigger id="category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="production">Production (balls)</SelectItem>
                <SelectItem value="direct_packaging">
                  Direct Packaging (auto-included)
                </SelectItem>
                <SelectItem value="indirect_packaging">
                  Indirect Packaging (optional add-ons)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="unitCost">Unit Cost (IDR) *</Label>
              <Input
                id="unitCost"
                type="number"
                min="0"
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
                placeholder="1000"
                className="font-mono"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="unit">Unit *</Label>
              <Input
                id="unit"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="pcs"
              />
            </div>
          </div>

          {category === "production" && (
            <div className="space-y-2">
              <Label htmlFor="gramsPerUnit">Grams per Unit</Label>
              <Input
                id="gramsPerUnit"
                type="number"
                min="0"
                value={gramsPerUnit}
                onChange={(e) => setGramsPerUnit(e.target.value)}
                placeholder="45"
                className="font-mono"
              />
            </div>
          )}

          {category !== "production" && (
            <div className="space-y-2">
              <Label htmlFor="reorderPoint">Reorder Point</Label>
              <Input
                id="reorderPoint"
                type="number"
                min="0"
                value={reorderPoint}
                onChange={(e) => setReorderPoint(e.target.value)}
                placeholder="50"
                className="font-mono"
              />
            </div>
          )}

          <div className="flex items-center space-x-2">
            <Checkbox
              id="trackInventory"
              checked={trackInventory}
              onCheckedChange={(checked) =>
                setTrackInventory(checked === true)
              }
              disabled={category !== "production"}
            />
            <label
              htmlFor="trackInventory"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              Track Inventory
              {category !== "production" && " (required for packaging)"}
            </label>
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
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? "Creating..." : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
