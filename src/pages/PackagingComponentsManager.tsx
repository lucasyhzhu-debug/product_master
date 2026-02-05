/**
 * PackagingComponentsManager - Manage packaging components (direct & indirect)
 */

import { useState } from "react";
import { Plus, Package, TrendingUp, TrendingDown, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/layout";
import { EmptyState } from "@/components/shared";
import {
  useConvexComponentTypes,
  useConvexCreateComponentType,
  useConvexUpdateComponentType,
  type ComponentType,
} from "@/hooks/convex";
import { formatCurrency } from "@/lib/utils";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import type { Id } from "../../convex/_generated/dataModel";

export function PackagingComponentsManager() {
  const { user } = useAuth();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingComponent, setEditingComponent] = useState<ComponentType | null>(null);

  // Fetch all components (including inactive)
  const allComponents = useConvexComponentTypes(false);

  // Mutations
  const createComponentType = useConvexCreateComponentType();
  const updateComponentType = useConvexUpdateComponentType();

  // Form state for create dialog
  const [name, setName] = useState("");
  const [category, setCategory] = useState<"direct_packaging" | "indirect_packaging">(
    "direct_packaging"
  );
  const [consumptionStage, setConsumptionStage] = useState<"boxing" | "labeling" | "none">(
    "boxing"
  );
  const [unit, setUnit] = useState("pcs");
  const [description, setDescription] = useState("");
  const [alarmPercentage, setAlarmPercentage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resetForm = () => {
    setName("");
    setCategory("direct_packaging");
    setConsumptionStage("boxing");
    setUnit("pcs");
    setDescription("");
    setAlarmPercentage("");
  };

  const handleCreateOpen = () => {
    resetForm();
    setEditingComponent(null);
    setCreateDialogOpen(true);
  };

  const handleEdit = (component: ComponentType) => {
    setName(component.name);
    setCategory(component.category as "direct_packaging" | "indirect_packaging");
    setConsumptionStage(component.consumptionStage || "none");
    setUnit(component.unit);
    setDescription(component.description || "");
    setAlarmPercentage(component.alarmPercentage?.toString() || "");
    setEditingComponent(component);
    setCreateDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error("Name is required");
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
          consumptionStage,
          description: description.trim() || undefined,
          alarmPercentage: alarmPercentage ? Number(alarmPercentage) : undefined,
        });
        toast.success("Packaging component updated");
      } else {
        // Create new component - use auto-generated code
        const code = name
          .trim()
          .toUpperCase()
          .replace(/\s+/g, "_")
          .replace(/[^A-Z0-9_]/g, "");

        await createComponentType({
          code,
          name: name.trim(),
          category,
          unitCostIdr: 0, // Will be set from inventory batches
          unit,
          trackInventory: true, // Packaging always tracks inventory
          consumptionStage,
          description: description.trim() || undefined,
          alarmPercentage: alarmPercentage ? Number(alarmPercentage) : undefined,
          createdBy: user.name,
        });
        toast.success("Packaging component created");
      }
      setCreateDialogOpen(false);
      resetForm();
      setEditingComponent(null);
    } catch (error) {
      console.error("Failed to save packaging component:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to save packaging component"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async (component: ComponentType) => {
    try {
      await updateComponentType({
        id: component._id as Id<"componentTypes">,
        isActive: !component.isActive,
      });
      toast.success(
        component.isActive
          ? "Packaging component deactivated"
          : "Packaging component activated"
      );
    } catch (error) {
      console.error("Failed to toggle active status:", error);
      toast.error("Failed to update status");
    }
  };

  // Loading state
  if (allComponents === undefined) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  // Filter packaging components (both direct and indirect)
  const packagingComponents = allComponents.filter(
    (c) => c.category === "direct_packaging" || c.category === "indirect_packaging"
  );

  const activeComponents = packagingComponents.filter((c) => c.isActive);
  const inactiveComponents = packagingComponents.filter((c) => !c.isActive);

  const renderComponent = (component: ComponentType, isActive: boolean) => {
    const hasCostInsights = component.costInsights && component.trackInventory;

    return (
      <div
        key={component._id}
        className={`flex items-center justify-between p-4 rounded-lg border transition-colors ${
          isActive
            ? "bg-card hover:bg-accent/50 cursor-pointer"
            : "bg-muted/50 opacity-60"
        }`}
        onClick={isActive ? () => handleEdit(component) : undefined}
      >
        <div className="flex items-center gap-4 flex-1">
          <Package className="h-5 w-5 text-muted-foreground" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold">{component.name}</span>
              <Badge variant="outline" className="text-xs">
                {component.code}
              </Badge>
              <Badge
                variant={component.category === "direct_packaging" ? "default" : "secondary"}
                className="text-xs"
              >
                {component.category === "direct_packaging" ? "Direct" : "Indirect"}
              </Badge>
              {component.consumptionStage && component.consumptionStage !== "none" && (
                <Badge variant="outline" className="text-xs">
                  {component.consumptionStage === "boxing" ? "Boxing" : "Labeling"}
                </Badge>
              )}
              {!isActive && <Badge variant="destructive">Inactive</Badge>}
            </div>

            {/* Cost information */}
            <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground flex-wrap">
              {hasCostInsights && component.costInsights ? (
                <>
                  {component.costInsights.weightedAverageCost !== null && (
                    <>
                      <div className="flex items-center gap-1">
                        <BarChart3 className="h-3 w-3" />
                        <span className="font-medium text-foreground">
                          {formatCurrency(component.costInsights.weightedAverageCost)}
                        </span>
                        <span className="text-xs">(avg)</span>
                      </div>
                      <span>•</span>
                    </>
                  )}
                  {component.costInsights.lowestCost !== null && (
                    <>
                      <div className="flex items-center gap-1">
                        <TrendingDown className="h-3 w-3 text-green-600" />
                        <span>{formatCurrency(component.costInsights.lowestCost)}</span>
                        <span className="text-xs">(low)</span>
                      </div>
                      <span>•</span>
                    </>
                  )}
                  {component.costInsights.latestCost !== null && (
                    <>
                      <div className="flex items-center gap-1">
                        <TrendingUp className="h-3 w-3 text-blue-600" />
                        <span>{formatCurrency(component.costInsights.latestCost)}</span>
                        <span className="text-xs">(latest)</span>
                      </div>
                      <span>•</span>
                    </>
                  )}
                </>
              ) : (
                <>
                  <span>{formatCurrency(component.unitCostIdr)}</span>
                  <span>•</span>
                </>
              )}
              <span>{component.unit}</span>
            </div>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            handleToggleActive(component);
          }}
        >
          {isActive ? "Deactivate" : "Activate"}
        </Button>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Packaging Components"
        action={
          <Button onClick={handleCreateOpen} size="lg">
            <Plus className="h-5 w-5 mr-2" />
            New Packaging Component
          </Button>
        }
      />

      {/* Active Components */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Active Packaging Components</span>
            <Badge variant="secondary">{activeComponents.length} active</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {activeComponents.length === 0 ? (
            <EmptyState
              icon={Package}
              title="No active packaging components"
              description="Packaging components include boxes, stickers, labels, and other materials"
            />
          ) : (
            <div className="space-y-2">
              {activeComponents.map((component) => renderComponent(component, true))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Inactive Components */}
      {inactiveComponents.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Inactive Packaging Components</span>
              <Badge variant="secondary">{inactiveComponents.length} inactive</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {inactiveComponents.map((component) => renderComponent(component, false))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              {editingComponent ? "Edit Packaging Component" : "New Packaging Component"}
            </DialogTitle>
            <DialogDescription>
              {editingComponent
                ? "Update packaging component details"
                : "Create a new packaging component (boxes, stickers, labels, etc.)"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Long Box"
              />
            </div>

            {!editingComponent && (
              <div className="space-y-2">
                <Label htmlFor="category">Category *</Label>
                <Select
                  value={category}
                  onValueChange={(value) =>
                    setCategory(value as "direct_packaging" | "indirect_packaging")
                  }
                >
                  <SelectTrigger id="category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="direct_packaging">
                      Direct Packaging (auto-included with products)
                    </SelectItem>
                    <SelectItem value="indirect_packaging">
                      Indirect Packaging (optional add-ons)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="consumptionStage">Consumption Stage</Label>
                <Select
                  value={consumptionStage}
                  onValueChange={(value) =>
                    setConsumptionStage(value as "boxing" | "labeling" | "none")
                  }
                >
                  <SelectTrigger id="consumptionStage">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="boxing">Boxing</SelectItem>
                    <SelectItem value="labeling">Labeling</SelectItem>
                    <SelectItem value="none">None</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="unit">Unit</Label>
                <Input
                  id="unit"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  placeholder="pcs"
                  disabled={!!editingComponent} // Cannot edit unit
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="alarmPercentage">Alarm Percentage</Label>
              <Input
                id="alarmPercentage"
                type="number"
                min="0"
                max="100"
                value={alarmPercentage}
                onChange={(e) => setAlarmPercentage(e.target.value)}
                placeholder="20"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Alert when stock level drops below this percentage
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Enter description (optional)"
                rows={3}
              />
            </div>
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
