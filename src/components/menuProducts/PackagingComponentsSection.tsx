import { useState } from 'react';
import { Plus, Trash2, PackagePlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useComponentsByCategory,
  useCreatePackagingQuick,
} from '@/hooks/convex';
import { useAuth } from '@/contexts/AuthContext';
import { formatCurrency, SELECTABLE_STAGES, CONSUMPTION_STAGE_LABELS } from '@/lib/utils';
import type { SelectableStage } from '@/lib/utils';
import type { Id } from '../../../convex/_generated/dataModel';
import { toast } from 'sonner';

interface ComponentRow {
  id: string; // Temporary UI-only ID
  componentTypeId: Id<"componentTypes"> | null;
  quantity: number;
  consumptionStage?: "production" | "boxing" | "labeling" | "none";
}

interface PackagingComponentsSectionProps {
  components: ComponentRow[];
  onChange: (components: ComponentRow[]) => void;
  disabled?: boolean;
}

export function PackagingComponentsSection({
  components,
  onChange,
  disabled = false,
}: PackagingComponentsSectionProps) {
  const { user } = useAuth();

  // Query packaging components (unified category)
  const packagingComponents = useComponentsByCategory("packaging", true);

  const isLoading = packagingComponents === undefined;

  // All packaging components sorted by name
  const allPackagingComponents = [
    ...(packagingComponents ?? []),
  ].sort((a, b) => a.name.localeCompare(b.name));

  // Quick create state
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newComponentName, setNewComponentName] = useState('');
  const [newComponentStage, setNewComponentStage] = useState<SelectableStage>("boxing");
  const [isCreating, setIsCreating] = useState(false);
  const createPackagingQuick = useCreatePackagingQuick();

  const handleAdd = () => {
    onChange([
      ...components,
      {
        id: Math.random().toString(36).substr(2, 9),
        componentTypeId: null,
        quantity: 1,
        consumptionStage: "boxing",
      },
    ]);
  };

  const handleRemove = (id: string) => {
    onChange(components.filter((c) => c.id !== id));
  };

  const handleUpdate = (id: string, field: 'componentTypeId' | 'quantity' | 'consumptionStage', value: unknown) => {
    onChange(
      components.map((c) => {
        if (c.id !== id) return c;

        const updated = {
          ...c,
          [field]: field === 'quantity' ? parseInt(value as string) || 0 : value,
        };

        // When selecting a component, inherit its default consumption stage
        if (field === 'componentTypeId' && !c.consumptionStage) {
          const selectedComp = allPackagingComponents.find((ct) => ct._id === value);
          if (selectedComp?.consumptionStage) {
            updated.consumptionStage = selectedComp.consumptionStage as ComponentRow["consumptionStage"];
          }
        }

        return updated;
      })
    );
  };

  const handleQuickCreate = async () => {
    if (!newComponentName.trim()) {
      toast.error('Component name is required');
      return;
    }

    if (!user?.token) {
      toast.error('Session expired. Please log in again.');
      return;
    }

    setIsCreating(true);
    try {
      const newId = await createPackagingQuick({
        name: newComponentName.trim(),
        consumptionStage: newComponentStage,
        createdBy: user.name,
      });

      toast.success('Packaging component created');

      // Add the new component to the list with the selected consumption stage
      const newRow: ComponentRow = {
        id: Math.random().toString(36).substr(2, 9),
        componentTypeId: newId as Id<"componentTypes">,
        quantity: 1,
        consumptionStage: newComponentStage,
      };
      onChange([...components, newRow]);

      setShowCreateDialog(false);
      setNewComponentName('');
      setNewComponentStage('boxing');
    } catch (error) {
      console.error('Failed to create packaging component:', error);
      // Toast is already shown by the mutation hook
    } finally {
      setIsCreating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Packaging Components</Label>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowCreateDialog(true)}
              disabled={disabled}
            >
              <PackagePlus className="h-4 w-4 mr-1" />
              Create New
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAdd}
              disabled={disabled}
            >
              <Plus className="h-4 w-4 mr-1" />
              Add
            </Button>
          </div>
        </div>

        {components.length > 0 ? (
          <div className="space-y-2">
            {components.map((component) => {
              const selectedComponent = allPackagingComponents.find(
                (ct) => ct._id === component.componentTypeId
              );

              return (
                <div key={component.id} className="space-y-1.5">
                  <div className="flex gap-1 sm:gap-2 items-start">
                    <div className="flex-1 space-y-1 min-w-0">
                      <Select
                        value={component.componentTypeId ?? ''}
                        onValueChange={(value) =>
                          handleUpdate(component.id, 'componentTypeId', value as Id<"componentTypes">)
                        }
                        disabled={disabled}
                      >
                        <SelectTrigger className="text-xs sm:text-sm">
                          <SelectValue placeholder="Select packaging item" />
                        </SelectTrigger>
                        <SelectContent>
                          {allPackagingComponents.map((ct) => (
                            <SelectItem key={ct._id} value={ct._id} className="text-xs sm:text-sm">
                              {ct.name} ({formatCurrency(ct.unitCostIdr)})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {selectedComponent && (
                        <p className="text-xs text-muted-foreground">
                          {formatCurrency(selectedComponent.unitCostIdr)} x {component.quantity} = {formatCurrency(selectedComponent.unitCostIdr * component.quantity)}
                        </p>
                      )}
                    </div>

                    <div className="w-16 sm:w-20">
                      <Input
                        type="number"
                        min="1"
                        value={component.quantity}
                        onChange={(e) => handleUpdate(component.id, 'quantity', e.target.value)}
                        placeholder="Qty"
                        className="text-xs sm:text-sm"
                        disabled={disabled}
                      />
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemove(component.id)}
                      className="h-9 w-9 shrink-0"
                      disabled={disabled}
                    >
                      <Trash2 className="h-3 w-3 sm:h-4 sm:w-4 text-destructive" />
                    </Button>
                  </div>

                  {/* Consumption Stage Selector */}
                  {component.componentTypeId && (
                    <div className="flex items-center gap-1.5 ml-1">
                      <span className="text-xs text-muted-foreground whitespace-nowrap">Consumed at:</span>
                      <div className="flex gap-1">
                        {SELECTABLE_STAGES.map((stage) => (
                          <button
                            key={stage}
                            type="button"
                            onClick={() => handleUpdate(component.id, 'consumptionStage', stage)}
                            disabled={disabled}
                            className={`px-2 py-0.5 text-xs rounded-full border transition-colors ${
                              (component.consumptionStage ?? 'boxing') === stage
                                ? stage === 'production'
                                  ? 'bg-[var(--color-status-warning-bg)] border-[var(--color-status-warning)]/40 text-[var(--color-status-warning)]'
                                  : stage === 'boxing'
                                    ? 'bg-[var(--color-status-info-bg)] border-[var(--color-status-info)]/40 text-[var(--color-status-info)]'
                                    : 'bg-purple-100 border-purple-300 text-purple-700'
                                : 'bg-transparent border-muted text-muted-foreground hover:border-muted-foreground/50'
                            }`}
                          >
                            {CONSUMPTION_STAGE_LABELS[stage]}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4 border border-dashed rounded-lg">
            No packaging components added. Click "Add" or "Create New".
          </p>
        )}
      </div>

      {/* Quick Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Packaging Component</DialogTitle>
            <DialogDescription>
              Quickly create a new packaging component. You can set the cost later in the Inventory Manager.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="component-name">Component Name *</Label>
              <Input
                id="component-name"
                value={newComponentName}
                onChange={(e) => setNewComponentName(e.target.value)}
                placeholder="e.g., Large Gift Box"
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label>Consumed At</Label>
              <div className="flex gap-2">
                {SELECTABLE_STAGES.map((stage) => (
                  <button
                    key={stage}
                    type="button"
                    onClick={() => setNewComponentStage(stage)}
                    className={`flex-1 px-3 py-2 text-sm rounded-lg border-2 transition-colors ${
                      newComponentStage === stage
                        ? stage === 'production'
                          ? 'border-[var(--color-status-warning)]/60 bg-[var(--color-status-warning-bg)] text-[var(--color-status-warning)]'
                          : stage === 'boxing'
                            ? 'border-[var(--color-status-info)]/60 bg-[var(--color-status-info-bg)] text-[var(--color-status-info)]'
                            : 'border-purple-400 bg-purple-50 text-purple-700'
                        : 'border-muted hover:border-muted-foreground/30'
                    }`}
                  >
                    {CONSUMPTION_STAGE_LABELS[stage]}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                When is this component consumed during the order workflow?
              </p>
            </div>

            <p className="text-xs text-muted-foreground">
              Cost will default to Rp 0 until you receive stock in the Inventory Manager.
            </p>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowCreateDialog(false);
                setNewComponentName('');
                setNewComponentStage('boxing');
              }}
              disabled={isCreating}
            >
              Cancel
            </Button>
            <Button onClick={handleQuickCreate} disabled={isCreating}>
              {isCreating ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
