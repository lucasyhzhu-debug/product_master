/**
 * ProductionComponentsManager - Manage production components (Big Ball, Mid Ball, etc.)
 */

import { useState } from "react";
import { Plus, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  useConvexComponentsByCategory,
  useConvexCreateComponentType,
  useConvexUpdateComponentType,
  type ComponentType,
} from "@/hooks/convex";
import { formatCurrency } from "@/lib/utils";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import type { Id } from "../../convex/_generated/dataModel";

export function ProductionComponentsManager() {
  const { user } = useAuth();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingComponent, setEditingComponent] = useState<ComponentType | null>(null);

  // Fetch all production components (including inactive)
  const components = useConvexComponentsByCategory("production", false);

  // Mutations
  const createComponentType = useConvexCreateComponentType();
  const updateComponentType = useConvexUpdateComponentType();

  // Form state for create dialog
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [gramsPerUnit, setGramsPerUnit] = useState("");
  const [color, setColor] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resetForm = () => {
    setCode("");
    setName("");
    setUnitCost("");
    setGramsPerUnit("");
    setColor("");
  };

  const handleCreateOpen = () => {
    resetForm();
    setEditingComponent(null);
    setCreateDialogOpen(true);
  };

  const handleEdit = (component: ComponentType) => {
    setCode(component.code);
    setName(component.name);
    setUnitCost(component.unitCostIdr.toString());
    setGramsPerUnit(component.gramsPerUnit?.toString() || "");
    setColor(component.color || "");
    setEditingComponent(component);
    setCreateDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!code.trim() || !name.trim()) {
      toast.error("Code and name are required");
      return;
    }
    if (!unitCost || Number(unitCost) <= 0) {
      toast.error("Unit cost must be greater than 0");
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
          unitCostIdr: Number(unitCost),
          gramsPerUnit: gramsPerUnit ? Number(gramsPerUnit) : undefined,
          color: color.trim() || undefined,
        });
        toast.success("Production component updated");
      } else {
        // Create new component
        await createComponentType({
          code: code.trim().toUpperCase(),
          name: name.trim(),
          category: "production",
          unitCostIdr: Number(unitCost),
          unit: "pcs",
          gramsPerUnit: gramsPerUnit ? Number(gramsPerUnit) : undefined,
          trackInventory: false, // Production components don't track inventory
          color: color.trim() || undefined,
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

  const handleToggleActive = async (component: ComponentType) => {
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
  if (components === undefined) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  // Filter active and inactive
  const activeComponents = components.filter((c) => c.isActive);
  const inactiveComponents = components.filter((c) => !c.isActive);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Production Components"
        action={
          <Button onClick={handleCreateOpen} size="lg">
            <Plus className="h-5 w-5 mr-2" />
            New Production Component
          </Button>
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
          ) : (
            <div className="space-y-2">
              {activeComponents.map((component) => (
                <div
                  key={component._id}
                  className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors cursor-pointer"
                  onClick={() => handleEdit(component)}
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
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground flex-wrap">
                        <span>{formatCurrency(component.unitCostIdr)}</span>
                        <span>•</span>
                        <span>{component.unit}</span>
                        {component.gramsPerUnit && (
                          <>
                            <span>•</span>
                            <span>{component.gramsPerUnit}g per unit</span>
                          </>
                        )}
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
                    Deactivate
                  </Button>
                </div>
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
                        <span>•</span>
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
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="code">Code *</Label>
                <Input
                  id="code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="BIG_BALL"
                  className="font-mono"
                  disabled={!!editingComponent} // Cannot edit code
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Big Ball"
                />
              </div>
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
            </div>

            <div className="space-y-2">
              <Label htmlFor="color">Color (Hex)</Label>
              <Input
                id="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                placeholder="#ff6b6b"
                className="font-mono"
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
