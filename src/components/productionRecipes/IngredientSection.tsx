/**
 * IngredientSection - Manage direct ingredient links for a production component recipe.
 *
 * Shows linked ingredients with quantity/unit/cost per line.
 * "Add Ingredient" dropdown with all ingredients + "Create new" inline option.
 * Quantities are per single parent component with original units respected.
 */

import { useState } from "react";
import { Plus, Trash2, Beaker } from "lucide-react";
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
import {
  useAddIngredient,
  useRemoveIngredient,
  useUpdateIngredientQuantity,
} from "@/hooks/convex/useProductionRecipes";
import { useIngredients, useCreateIngredient } from "@/hooks/convex";
import { formatCurrency } from "@/lib/utils";
import type { Id } from "../../../convex/_generated/dataModel";

interface IngredientData {
  _id: Id<"productionComponentIngredients">;
  ingredientId: Id<"ingredients">;
  quantityPerUnit: number;
  unit: string;
  sortOrder: number;
  ingredientName: string;
  cachedLineCost?: number;
  costPerBaseUnit: number;
  baseUnit: string;
}

interface IngredientSectionProps {
  componentTypeId: Id<"componentTypes">;
  parentName: string;
  ingredients: IngredientData[];
}

export function IngredientSection({
  componentTypeId,
  parentName,
  ingredients,
}: IngredientSectionProps) {
  const addIngredient = useAddIngredient();
  const removeIngredient = useRemoveIngredient();
  const updateIngredientQuantity = useUpdateIngredientQuantity();
  const createIngredient = useCreateIngredient();

  // All ingredients for dropdown
  const allIngredients = useIngredients();

  // Local state
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedIngredientId, setSelectedIngredientId] = useState<string>("");
  const [addQuantity, setAddQuantity] = useState("1");
  const [addUnit, setAddUnit] = useState("g");
  const [isAdding, setIsAdding] = useState(false);

  // Inline create state
  const [showCreateNew, setShowCreateNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newBrand, setNewBrand] = useState("");
  const [newUnitType, setNewUnitType] = useState("kg");
  const [newVolume, setNewVolume] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [newShipping, setNewShipping] = useState("0");
  const [isCreating, setIsCreating] = useState(false);

  // Editing state
  const [editingLinkId, setEditingLinkId] = useState<Id<"productionComponentIngredients"> | null>(null);
  const [editQuantity, setEditQuantity] = useState("");
  const [editUnit, setEditUnit] = useState("");

  // Filter out already-linked ingredients
  const linkedIngredientIds = new Set(ingredients.map((i) => i.ingredientId));
  const availableIngredients = (allIngredients ?? []).filter(
    (i) => !linkedIngredientIds.has(i._id as Id<"ingredients">)
  );

  const handleAdd = async () => {
    if (!selectedIngredientId) return;
    setIsAdding(true);
    try {
      // Determine unit from selected ingredient's baseUnit if available
      const selectedIng = allIngredients?.find((i) => i._id === selectedIngredientId);
      const resolvedUnit = addUnit || selectedIng?.baseUnit || "g";

      await addIngredient({
        componentTypeId,
        ingredientId: selectedIngredientId as Id<"ingredients">,
        quantityPerUnit: Number(addQuantity) || 1,
        unit: resolvedUnit,
      });
      toast.success("Ingredient added");
      setShowAddForm(false);
      setSelectedIngredientId("");
      setAddQuantity("1");
      setAddUnit("g");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add ingredient");
    } finally {
      setIsAdding(false);
    }
  };

  // Auto-set unit when selecting an ingredient
  const handleIngredientSelect = (value: string) => {
    setSelectedIngredientId(value);
    if (value !== "__create_new__") {
      const selected = allIngredients?.find((i) => i._id === value);
      if (selected?.baseUnit) {
        setAddUnit(selected.baseUnit);
      }
    }
  };

  const handleCreateNew = async () => {
    if (!newName.trim() || !newVolume || !newPrice) return;
    setIsCreating(true);
    try {
      const result = await createIngredient.mutate({
        name: newName.trim(),
        brand: newBrand.trim() || undefined,
        unitType: newUnitType,
        volumePurchased: Number(newVolume),
        priceExclShipping: Number(newPrice),
        shippingCost: Number(newShipping) || 0,
      });

      // Now add as ingredient link
      if (result) {
        // Determine base unit from unitType
        const baseUnitMap: Record<string, string> = { kg: "g", l: "ml", m: "cm" };
        const baseUnit = baseUnitMap[newUnitType] || newUnitType;

        await addIngredient({
          componentTypeId,
          ingredientId: result as Id<"ingredients">,
          quantityPerUnit: Number(addQuantity) || 1,
          unit: baseUnit,
        });
      }

      setShowCreateNew(false);
      setShowAddForm(false);
      setNewName("");
      setNewBrand("");
      setNewUnitType("kg");
      setNewVolume("");
      setNewPrice("");
      setNewShipping("0");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create ingredient");
    } finally {
      setIsCreating(false);
    }
  };

  const handleRemove = async (linkId: Id<"productionComponentIngredients">) => {
    try {
      await removeIngredient({ linkId });
      toast.success("Ingredient removed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to remove ingredient");
    }
  };

  const handleStartEdit = (ing: IngredientData) => {
    setEditingLinkId(ing._id);
    setEditQuantity(ing.quantityPerUnit.toString());
    setEditUnit(ing.unit);
  };

  const handleSaveEdit = async (linkId: Id<"productionComponentIngredients">) => {
    try {
      await updateIngredientQuantity({
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
          <Beaker className="h-4 w-4" />
          Direct Ingredients
        </h3>
        <Badge variant="secondary" className="text-xs">
          {ingredients.length}
        </Badge>
      </div>

      {/* Ingredient list */}
      {ingredients.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">
          No direct ingredients. Add raw ingredients used in this component.
        </p>
      ) : (
        <div className="space-y-1.5">
          {ingredients.map((ing) => (
            <div
              key={ing._id}
              className="flex items-center gap-2 p-2.5 rounded-lg border bg-card text-sm"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium truncate">{ing.ingredientName}</span>
                  <Badge variant="outline" className="text-[10px]">{ing.baseUnit}</Badge>
                </div>
                {editingLinkId === ing._id ? (
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
                      onClick={() => handleSaveEdit(ing._id)}
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
                    onClick={() => handleStartEdit(ing)}
                  >
                    {ing.quantityPerUnit} {ing.unit} per 1 {parentName}
                    {ing.cachedLineCost != null && ing.cachedLineCost > 0 && (
                      <span className="ml-2">({formatCurrency(ing.cachedLineCost)})</span>
                    )}
                  </div>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                onClick={() => handleRemove(ing._id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Add ingredient form */}
      {showAddForm ? (
        <div className="space-y-3 p-3 rounded-lg border border-dashed bg-muted/20">
          {showCreateNew ? (
            <>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Create New Ingredient
              </h4>
              <div className="space-y-2">
                <Input
                  placeholder="Ingredient name (e.g., Sugar)"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="h-8 text-sm"
                  autoFocus
                />
                <Input
                  placeholder="Brand (optional)"
                  value={newBrand}
                  onChange={(e) => setNewBrand(e.target.value)}
                  className="h-8 text-sm"
                />
                <div className="flex gap-2">
                  <div className="w-24">
                    <Label className="text-xs">Unit Type</Label>
                    <Select value={newUnitType} onValueChange={setNewUnitType}>
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="kg">kg</SelectItem>
                        <SelectItem value="l">l</SelectItem>
                        <SelectItem value="pcs">pcs</SelectItem>
                        <SelectItem value="m">m</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex-1">
                    <Label className="text-xs">Volume Purchased</Label>
                    <Input
                      type="number"
                      min="0"
                      placeholder="1"
                      value={newVolume}
                      onChange={(e) => setNewVolume(e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Label className="text-xs">Price (IDR)</Label>
                    <Input
                      type="number"
                      min="0"
                      placeholder="25000"
                      value={newPrice}
                      onChange={(e) => setNewPrice(e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="flex-1">
                    <Label className="text-xs">Shipping (IDR)</Label>
                    <Input
                      type="number"
                      min="0"
                      placeholder="0"
                      value={newShipping}
                      onChange={(e) => setNewShipping(e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleCreateNew}
                  disabled={!newName.trim() || !newVolume || !newPrice || isCreating}
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
                  <Select value={selectedIngredientId} onValueChange={handleIngredientSelect}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Select ingredient..." />
                    </SelectTrigger>
                    <SelectContent>
                      {availableIngredients.map((i) => (
                        <SelectItem key={i._id} value={i._id}>
                          {i.name}
                          {i.brand ? ` (${i.brand})` : ""}
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
                  placeholder="Qty"
                />
                <Input
                  value={addUnit}
                  onChange={(e) => setAddUnit(e.target.value)}
                  className="h-8 w-16 text-sm"
                  placeholder="unit"
                />
              </div>

              {selectedIngredientId === "__create_new__" ? (
                <Button
                  size="sm"
                  onClick={() => {
                    setShowCreateNew(true);
                    setSelectedIngredientId("");
                  }}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Create New Ingredient
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleAdd}
                    disabled={!selectedIngredientId || isAdding}
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
          Add Ingredient
        </Button>
      )}
    </div>
  );
}
