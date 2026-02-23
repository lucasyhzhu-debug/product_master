/**
 * SubComponentSection - Manage sub-component links for a production component recipe.
 *
 * Shows linked sub-components with quantity/unit/cost per line.
 * "Add Sub-component" dropdown with all available production components (excluding self
 * and circular references). Includes "Create new" inline option.
 */

import { useState } from "react";
import { Plus, Trash2, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import {
  useAddSubComponent,
  useRemoveSubComponent,
  useUpdateSubComponentQuantity,
} from "@/hooks/convex/useProductionRecipes";
import { useComponentsByCategory, useCreateComponentType } from "@/hooks/convex";
import { formatCurrency } from "@/lib/utils";
import type { Id } from "../../../convex/_generated/dataModel";

interface SubComponentData {
  _id: Id<"productionComponentLinks">;
  childComponentId: Id<"componentTypes">;
  quantityPerUnit: number;
  unit: string;
  sortOrder: number;
  childName: string;
  childCode: string;
  childBatchSize?: number;
  childBatchSizeUnit?: string;
  childUnitCostIdr: number;
}

interface SubComponentSectionProps {
  parentComponentId: Id<"componentTypes">;
  parentName: string;
  subComponents: SubComponentData[];
}

export function SubComponentSection({
  parentComponentId,
  parentName,
  subComponents,
}: SubComponentSectionProps) {
  const { user } = useAuth();
  const addSubComponent = useAddSubComponent();
  const removeSubComponent = useRemoveSubComponent();
  const updateSubComponentQuantity = useUpdateSubComponentQuantity();
  const createComponentType = useCreateComponentType();

  // All production components for dropdown
  const allProductionComponents = useComponentsByCategory("production", true);

  // Local state
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedChildId, setSelectedChildId] = useState<string>("");
  const [addQuantity, setAddQuantity] = useState("1");
  const [addUnit, setAddUnit] = useState("pcs");
  const [isAdding, setIsAdding] = useState(false);

  // Inline create state
  const [showCreateNew, setShowCreateNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newBatchSize, setNewBatchSize] = useState("");
  const [newBatchSizeUnit, setNewBatchSizeUnit] = useState("g");
  const [isCreating, setIsCreating] = useState(false);

  // Editing state
  const [editingLinkId, setEditingLinkId] = useState<Id<"productionComponentLinks"> | null>(null);
  const [editQuantity, setEditQuantity] = useState("");
  const [editUnit, setEditUnit] = useState("");

  // Filter out self and already-linked components
  const linkedChildIds = new Set(subComponents.map((sc) => sc.childComponentId));
  const availableComponents = (allProductionComponents ?? []).filter(
    (c) => c._id !== parentComponentId && !linkedChildIds.has(c._id as Id<"componentTypes">)
  );

  const handleAdd = async () => {
    if (!selectedChildId) return;
    setIsAdding(true);
    try {
      await addSubComponent({
        parentComponentId,
        childComponentId: selectedChildId as Id<"componentTypes">,
        quantityPerUnit: Number(addQuantity) || 1,
        unit: addUnit,
      });
      toast.success("Sub-component added");
      setShowAddForm(false);
      setSelectedChildId("");
      setAddQuantity("1");
      setAddUnit("pcs");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add sub-component");
    } finally {
      setIsAdding(false);
    }
  };

  const handleCreateNew = async () => {
    if (!newName.trim() || !user?.name) return;
    setIsCreating(true);
    try {
      const code = newName.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").slice(0, 30);
      const newId = await createComponentType({
        code,
        name: newName.trim(),
        category: "production",
        unitCostIdr: 0,
        unit: "pcs",
        gramsPerUnit: Number(newBatchSize) || 0,
        trackInventory: false,
        batchSize: Number(newBatchSize) || undefined,
        batchSizeUnit: newBatchSizeUnit,
        createdBy: user.name,
      });

      // Now add as sub-component
      if (newId) {
        await addSubComponent({
          parentComponentId,
          childComponentId: newId,
          quantityPerUnit: Number(addQuantity) || 1,
          unit: newBatchSizeUnit,
        });
      }

      toast.success(`"${newName}" created and linked`);
      setShowCreateNew(false);
      setShowAddForm(false);
      setNewName("");
      setNewBatchSize("");
      setNewBatchSizeUnit("g");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create sub-component");
    } finally {
      setIsCreating(false);
    }
  };

  const handleRemove = async (linkId: Id<"productionComponentLinks">) => {
    try {
      await removeSubComponent({ linkId });
      toast.success("Sub-component removed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to remove sub-component");
    }
  };

  const handleStartEdit = (sc: SubComponentData) => {
    setEditingLinkId(sc._id);
    setEditQuantity(sc.quantityPerUnit.toString());
    setEditUnit(sc.unit);
  };

  const handleSaveEdit = async (linkId: Id<"productionComponentLinks">) => {
    try {
      await updateSubComponentQuantity({
        linkId,
        quantityPerUnit: Number(editQuantity) || 1,
        unit: editUnit,
      });
      setEditingLinkId(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update quantity");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Package className="h-4 w-4" />
          Sub-components
        </h3>
        <Badge variant="secondary" className="text-xs">
          {subComponents.length}
        </Badge>
      </div>

      {/* Sub-component list */}
      {subComponents.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">
          No sub-components. Add production components that make up this item.
        </p>
      ) : (
        <div className="space-y-1.5">
          {subComponents.map((sc) => (
            <div
              key={sc._id}
              className="flex items-center gap-2 p-2.5 rounded-lg border bg-card text-sm"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium truncate">{sc.childName}</span>
                  <Badge variant="outline" className="text-[10px]">{sc.childCode}</Badge>
                </div>
                {editingLinkId === sc._id ? (
                  <div className="flex items-center gap-2 mt-1.5">
                    <Input
                      type="number"
                      min="0.001"
                      step="0.001"
                      value={editQuantity}
                      onChange={(e) => setEditQuantity(e.target.value)}
                      className="h-7 w-20 text-xs"
                    />
                    <Input
                      value={editUnit}
                      onChange={(e) => setEditUnit(e.target.value)}
                      className="h-7 w-16 text-xs"
                    />
                    <span className="text-xs text-muted-foreground">per 1 {parentName}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      onClick={() => handleSaveEdit(sc._id)}
                    >
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      onClick={() => setEditingLinkId(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <div
                    className="text-xs text-muted-foreground mt-0.5 cursor-pointer hover:text-foreground"
                    onClick={() => handleStartEdit(sc)}
                  >
                    {sc.quantityPerUnit} {sc.unit} per 1 {parentName}
                    {sc.childBatchSize && sc.childBatchSize > 0 && sc.childUnitCostIdr > 0 && (
                      <span className="ml-2">
                        ({formatCurrency((sc.quantityPerUnit / sc.childBatchSize) * sc.childUnitCostIdr)} COGS)
                      </span>
                    )}
                  </div>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                onClick={() => handleRemove(sc._id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Add sub-component form */}
      {showAddForm ? (
        <div className="space-y-3 p-3 rounded-lg border border-dashed bg-muted/20">
          {showCreateNew ? (
            <>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Create New Production Component
              </h4>
              <div className="space-y-2">
                <Input
                  placeholder="Component name (e.g., Marshmallow)"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="h-8 text-sm"
                  autoFocus
                />
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Label className="text-xs">Batch Size</Label>
                    <Input
                      type="number"
                      min="0"
                      placeholder="100"
                      value={newBatchSize}
                      onChange={(e) => setNewBatchSize(e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="w-24">
                    <Label className="text-xs">Unit</Label>
                    <Select value={newBatchSizeUnit} onValueChange={setNewBatchSizeUnit}>
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="g">g</SelectItem>
                        <SelectItem value="ml">ml</SelectItem>
                        <SelectItem value="pcs">pcs</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleCreateNew}
                  disabled={!newName.trim() || isCreating}
                >
                  {isCreating ? "Creating..." : "Create & Add"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowCreateNew(false)}
                >
                  Back
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Select
                    value={selectedChildId}
                    onValueChange={(value) => {
                      if (value === "__create_new__") {
                        setSelectedChildId(value);
                        return;
                      }
                      setSelectedChildId(value);
                      const child = availableComponents.find((c) => c._id === value);
                      if (child) {
                        if (child.batchSizeUnit) setAddUnit(child.batchSizeUnit);
                        if (child.batchSize && child.batchSize > 0) setAddQuantity(child.batchSize.toString());
                      }
                    }}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Select sub-component..." />
                    </SelectTrigger>
                    <SelectContent>
                      {availableComponents.map((c) => (
                        <SelectItem key={c._id} value={c._id}>
                          {c.name} ({c.code})
                        </SelectItem>
                      ))}
                      <SelectItem value="__create_new__">
                        <span className="flex items-center gap-1.5 text-emerald-600">
                          <Plus className="h-3.5 w-3.5" />
                          Create new...
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Input
                  type="number"
                  min="0.001"
                  step="0.001"
                  value={addQuantity}
                  onChange={(e) => setAddQuantity(e.target.value)}
                  className="h-8 w-20 text-sm"
                  placeholder={addUnit ? `Qty (${addUnit})` : "Qty"}
                />
                {selectedChildId && selectedChildId !== "__create_new__" && addUnit ? (
                  <div className="h-8 w-16 flex items-center px-2 text-sm border rounded bg-muted text-muted-foreground">
                    {addUnit}
                  </div>
                ) : (
                  <Input
                    value={addUnit}
                    onChange={(e) => setAddUnit(e.target.value)}
                    className="h-8 w-16 text-sm"
                    placeholder="unit"
                  />
                )}
              </div>

              {selectedChildId && selectedChildId !== "__create_new__" && (() => {
                const child = availableComponents.find((c) => c._id === selectedChildId);
                const qty = Number(addQuantity) || 0;
                if (!child || !child.batchSize || child.batchSize <= 0 || !child.unitCostIdr) return null;
                const cogsContrib = (qty / child.batchSize) * child.unitCostIdr;
                return (
                  <p className="text-xs text-muted-foreground">
                    COGS contribution: {formatCurrency(cogsContrib)} ({qty} {addUnit} ÷ {child.batchSize} batch × {formatCurrency(child.unitCostIdr)})
                  </p>
                );
              })()}

              {selectedChildId === "__create_new__" ? (
                <Button
                  size="sm"
                  onClick={() => {
                    setShowCreateNew(true);
                    setSelectedChildId("");
                  }}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Create New Component
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleAdd}
                    disabled={!selectedChildId || isAdding}
                  >
                    {isAdding ? "Adding..." : "Add"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setShowAddForm(false)}
                  >
                    Cancel
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowAddForm(true)}
          className="w-full"
        >
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Add Sub-component
        </Button>
      )}
    </div>
  );
}
