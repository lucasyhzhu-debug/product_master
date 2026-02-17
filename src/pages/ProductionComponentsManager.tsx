/**
 * ProductionComponentsManager - Manage production components (Big Ball, Mid Ball, etc.)
 *
 * Extended with:
 * - Tier-based sorting (highest first, toggle to A-Z)
 * - Click row to open recipe editor modal
 * - COGS mode display (manual/calculated) with missing data warnings
 * - batchSize + cogsMode in create/edit dialogs
 */

import { useState } from "react";
import { Plus, Package, ArrowUpDown, AlertTriangle, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/layout";
import { EmptyState } from "@/components/shared";
import {
  useConvexCreateComponentType,
  useConvexUpdateComponentType,
  type ComponentType,
} from "@/hooks/convex";
import { useProductionComponentsWithTiers } from "@/hooks/convex/useProductionRecipes";
import { RecipeEditorModal } from "@/components/productionRecipes/RecipeEditorModal";
import { formatCurrency } from "@/lib/utils";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import type { Id } from "../../convex/_generated/dataModel";

type SortMode = "tier" | "alpha";

// Extended component type with tier info from the query
type ComponentWithTier = ComponentType & {
  tier: number;
  batchSize?: number;
  batchSizeUnit?: string;
  cogsMode?: "manual" | "calculated";
  manualUnitCostIdr?: number;
  cachedCalculatedCogs?: number;
  cogsMissingCount?: number;
};

export function ProductionComponentsManager() {
  const { user } = useAuth();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingComponent, setEditingComponent] = useState<ComponentWithTier | null>(null);
  const [recipeComponent, setRecipeComponent] = useState<ComponentWithTier | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("tier");

  // Fetch production components with tier info
  const rawComponents = useProductionComponentsWithTiers();

  // Mutations
  const createComponentType = useConvexCreateComponentType();
  const updateComponentType = useConvexUpdateComponentType();

  // Form state for create/edit dialog
  const [name, setName] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [gramsPerUnit, setGramsPerUnit] = useState("");
  const [color, setColor] = useState("#6b7280");
  const [batchSize, setBatchSize] = useState("");
  const [batchSizeUnit, setBatchSizeUnit] = useState("g");
  const [cogsMode, setCogsMode] = useState<"manual" | "calculated">("manual");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Auto-generate code from name
  const autoCode = name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").slice(0, 30);

  const resetForm = () => {
    setName("");
    setUnitCost("");
    setGramsPerUnit("");
    setColor("#6b7280");
    setBatchSize("");
    setBatchSizeUnit("g");
    setCogsMode("manual");
  };

  const handleCreateOpen = () => {
    resetForm();
    setEditingComponent(null);
    setCreateDialogOpen(true);
  };

  const handleEdit = (component: ComponentWithTier) => {
    setName(component.name);
    setUnitCost(component.unitCostIdr.toString());
    setGramsPerUnit(component.gramsPerUnit?.toString() || "");
    setColor(component.color || "#6b7280");
    setBatchSize(component.batchSize?.toString() || "");
    setBatchSizeUnit(component.batchSizeUnit || "g");
    setCogsMode(component.cogsMode || "manual");
    setEditingComponent(component);
    setCreateDialogOpen(true);
  };

  const handleRowClick = (component: ComponentWithTier) => {
    setRecipeComponent(component);
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (cogsMode === "manual" && (!unitCost || Number(unitCost) <= 0)) {
      toast.error("Unit cost must be greater than 0 for manual COGS mode");
      return;
    }
    if (!user?.name) {
      toast.error("User not authenticated");
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingComponent) {
        // Update existing component
        await updateComponentType({
          id: editingComponent._id as Id<"componentTypes">,
          name: name.trim(),
          unitCostIdr: Number(unitCost) || 0,
          gramsPerUnit: gramsPerUnit ? Number(gramsPerUnit) : undefined,
          color: color || undefined,
          batchSize: batchSize ? Number(batchSize) : undefined,
          batchSizeUnit: batchSizeUnit || undefined,
          cogsMode,
        });
        toast.success("Production component updated");
      } else {
        // Create new component with auto-generated code
        await createComponentType({
          code: autoCode,
          name: name.trim(),
          category: "production",
          unitCostIdr: Number(unitCost) || 0,
          unit: "pcs",
          gramsPerUnit: gramsPerUnit ? Number(gramsPerUnit) : undefined,
          trackInventory: false, // Production components don't track inventory
          color: color || undefined,
          batchSize: batchSize ? Number(batchSize) : undefined,
          batchSizeUnit: batchSizeUnit || undefined,
          createdBy: user.name,
        });
        toast.success("Production component created");
      }
      setCreateDialogOpen(false);
      resetForm();
      setEditingComponent(null);
    } catch (error) {
      console.error("Failed to save production component:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to save production component"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async (component: ComponentWithTier) => {
    try {
      await updateComponentType({
        id: component._id as Id<"componentTypes">,
        isActive: !component.isActive,
      });
      toast.success(
        component.isActive
          ? "Production component deactivated"
          : "Production component activated"
      );
    } catch (error) {
      console.error("Failed to toggle active status:", error);
      toast.error("Failed to update status");
    }
  };

  // Loading state
  if (rawComponents === undefined) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  // Cast and apply local sort
  const components = rawComponents as ComponentWithTier[];
  const sortedComponents = [...components].sort((a, b) => {
    if (sortMode === "alpha") {
      return a.name.localeCompare(b.name);
    }
    // Tier sort: highest first, then name
    if (b.tier !== a.tier) return b.tier - a.tier;
    return a.name.localeCompare(b.name);
  });

  // Filter active and inactive
  const activeComponents = sortedComponents.filter((c) => c.isActive);
  const inactiveComponents = sortedComponents.filter((c) => !c.isActive);

  // Group active components by tier for visual grouping
  const tierGroups = new Map<number, ComponentWithTier[]>();
  if (sortMode === "tier") {
    for (const comp of activeComponents) {
      const tier = comp.tier;
      if (!tierGroups.has(tier)) tierGroups.set(tier, []);
      tierGroups.get(tier)!.push(comp);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Production Components"
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSortMode(sortMode === "tier" ? "alpha" : "tier")}
            >
              <ArrowUpDown className="h-4 w-4 mr-1.5" />
              {sortMode === "tier" ? "By Tier" : "A-Z"}
            </Button>
            <Button onClick={handleCreateOpen} size="lg">
              <Plus className="h-5 w-5 mr-2" />
              New Production Component
            </Button>
          </div>
        }
      />

      {/* Active Components */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Active Production Components</span>
            <Badge variant="secondary">{activeComponents.length} active</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {activeComponents.length === 0 ? (
            <EmptyState
              icon={Package}
              title="No active production components"
              description="Production components are balls made in the kitchen (Big Ball, Mid Ball, etc.)"
            />
          ) : sortMode === "tier" ? (
            // Tier-grouped view
            <div className="space-y-4">
              {Array.from(tierGroups.entries())
                .sort(([a], [b]) => b - a)
                .map(([tier, comps]) => (
                  <div key={tier}>
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 px-1">
                      {tier === 0 ? "Leaf Components (No Recipe)" : `Tier ${tier}`}
                    </div>
                    <div className="space-y-2">
                      {comps.map((component) => (
                        <ComponentRow
                          key={component._id}
                          component={component}
                          onRowClick={handleRowClick}
                          onEdit={handleEdit}
                          onToggleActive={handleToggleActive}
                        />
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          ) : (
            // Alphabetical view
            <div className="space-y-2">
              {activeComponents.map((component) => (
                <ComponentRow
                  key={component._id}
                  component={component}
                  onRowClick={handleRowClick}
                  onEdit={handleEdit}
                  onToggleActive={handleToggleActive}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Inactive Components */}
      {inactiveComponents.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Inactive Production Components</span>
              <Badge variant="secondary">{inactiveComponents.length} inactive</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {inactiveComponents.map((component) => (
                <div
                  key={component._id}
                  className="flex items-center justify-between p-4 rounded-lg border bg-muted/50 opacity-60"
                >
                  <div className="flex items-center gap-4 flex-1">
                    {component.color && (
                      <div
                        className="w-4 h-4 rounded-full border"
                        style={{ backgroundColor: component.color }}
                      />
                    )}
                    <Package className="h-5 w-5 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold">{component.name}</span>
                        <Badge variant="outline" className="text-xs">
                          {component.code}
                        </Badge>
                        <Badge variant="destructive">Inactive</Badge>
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground flex-wrap">
                        <span>{formatCurrency(component.unitCostIdr)}</span>
                        <span>-</span>
                        <span>{component.unit}</span>
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleToggleActive(component)}
                  >
                    Activate
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recipe Editor Modal */}
      <RecipeEditorModal
        componentType={recipeComponent}
        open={!!recipeComponent}
        onClose={() => setRecipeComponent(null)}
      />

      {/* Create/Edit Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              {editingComponent ? "Edit Production Component" : "New Production Component"}
            </DialogTitle>
            <DialogDescription>
              {editingComponent
                ? "Update production component details"
                : "Create a new production component (Big Ball, Mid Ball, etc.)"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Big Ball"
                autoFocus
              />
              {!editingComponent && name.trim() && (
                <p className="text-xs text-muted-foreground font-mono">
                  Code: {autoCode}
                </p>
              )}
            </div>

            <div className="grid gap-4 grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="gramsPerUnit">Grams per Unit *</Label>
                <Input
                  id="gramsPerUnit"
                  type="number"
                  min="0"
                  value={gramsPerUnit}
                  onChange={(e) => setGramsPerUnit(e.target.value)}
                  placeholder="45"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="color">Color</Label>
                <div className="flex items-center gap-3">
                  <input
                    id="color"
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="h-10 w-14 rounded-md border border-input cursor-pointer"
                  />
                  <span className="text-sm text-muted-foreground font-mono">{color}</span>
                </div>
              </div>
            </div>

            {/* Production Size (Batch Size) */}
            <div className="grid gap-4 grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="batchSize">Production Size</Label>
                <Input
                  id="batchSize"
                  type="number"
                  min="0"
                  value={batchSize}
                  onChange={(e) => setBatchSize(e.target.value)}
                  placeholder="100"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="batchSizeUnit">Size Unit</Label>
                <Select value={batchSizeUnit} onValueChange={setBatchSizeUnit}>
                  <SelectTrigger id="batchSizeUnit">
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

            {/* COGS Mode Toggle (edit only) */}
            {editingComponent && (
              <div className="space-y-3 p-3 rounded-lg border bg-muted/20">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>COGS Mode</Label>
                    <p className="text-xs text-muted-foreground">
                      {cogsMode === "manual"
                        ? "Set cost manually"
                        : "COGS will be calculated from recipe ingredients"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {cogsMode === "manual" ? "Manual" : "Calculated"}
                    </span>
                    <Switch
                      checked={cogsMode === "calculated"}
                      onCheckedChange={(checked) =>
                        setCogsMode(checked ? "calculated" : "manual")
                      }
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Unit Cost (only show when manual mode) */}
            {cogsMode === "manual" && (
              <div className="space-y-2">
                <Label htmlFor="unitCost">Unit Cost (IDR) *</Label>
                <Input
                  id="unitCost"
                  type="number"
                  min="0"
                  value={unitCost}
                  onChange={(e) => setUnitCost(e.target.value)}
                  placeholder="1000"
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateDialogOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : editingComponent ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================================
// ComponentRow - Individual component row with COGS display
// ============================================================================

function ComponentRow({
  component,
  onRowClick,
  onEdit,
  onToggleActive,
}: {
  component: ComponentWithTier;
  onRowClick: (c: ComponentWithTier) => void;
  onEdit: (c: ComponentWithTier) => void;
  onToggleActive: (c: ComponentWithTier) => void;
}) {
  return (
    <div
      className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors cursor-pointer"
      onClick={() => onRowClick(component)}
    >
      <div className="flex items-center gap-4 flex-1">
        {component.color && (
          <div
            className="w-4 h-4 rounded-full border"
            style={{ backgroundColor: component.color }}
          />
        )}
        <Package className="h-5 w-5 text-muted-foreground" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold">{component.name}</span>
            <Badge variant="outline" className="text-xs">
              {component.code}
            </Badge>
            {component.tier > 0 && (
              <Badge variant="secondary" className="text-[10px]">
                Tier {component.tier}
              </Badge>
            )}
            {component.tier === 0 && (
              <span className="text-[10px] text-muted-foreground">No recipe</span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground flex-wrap">
            {/* COGS display with mode indicator */}
            <CostDisplay component={component} />
            <span>-</span>
            <span>{component.unit}</span>
            {component.gramsPerUnit && (
              <>
                <span>-</span>
                <span>{component.gramsPerUnit}g per unit</span>
              </>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onEdit(component);
          }}
        >
          <Pencil className="h-3.5 w-3.5 mr-1" />
          Edit
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onToggleActive(component);
          }}
        >
          Deactivate
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// CostDisplay - COGS value with mode badge and missing data warning
// ============================================================================

function CostDisplay({ component }: { component: ComponentWithTier }) {
  const mode = component.cogsMode || "manual";

  if (mode === "manual") {
    return (
      <span className="flex items-center gap-1">
        {formatCurrency(component.unitCostIdr)}
        <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">
          manual
        </Badge>
      </span>
    );
  }

  // Calculated mode
  if (component.cachedCalculatedCogs != null) {
    return (
      <span className="flex items-center gap-1">
        {formatCurrency(component.cachedCalculatedCogs)}
        <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 text-emerald-600 border-emerald-300">
          calculated
        </Badge>
        {(component.cogsMissingCount ?? 0) > 0 && (
          <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
        )}
      </span>
    );
  }

  // Calculated but no cached value yet
  return (
    <span className="flex items-center gap-1 text-muted-foreground">
      Calculating...
      <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 text-emerald-600 border-emerald-300">
        calculated
      </Badge>
    </span>
  );
}
