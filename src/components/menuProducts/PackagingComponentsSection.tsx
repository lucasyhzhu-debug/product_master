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
  useConvexComponentsByCategory,
  useConvexCreatePackagingQuick,
} from '@/hooks/convex';
import { useAuth } from '@/contexts/AuthContext';
import { formatCurrency } from '@/lib/utils';
import type { Id } from '../../../convex/_generated/dataModel';
import { toast } from 'sonner';

interface ComponentRow {
  id: string; // Temporary UI-only ID
  componentTypeId: Id<"componentTypes"> | null;
  quantity: number;
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

  // Query packaging components (both direct and indirect)
  const directPackaging = useConvexComponentsByCategory("direct_packaging", true);
  const indirectPackaging = useConvexComponentsByCategory("indirect_packaging", true);

  const isLoading = directPackaging === undefined || indirectPackaging === undefined;

  // Combine both categories
  const allPackagingComponents = [
    ...(directPackaging ?? []),
    ...(indirectPackaging ?? []),
  ].sort((a, b) => a.name.localeCompare(b.name));

  // Quick create state
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newComponentName, setNewComponentName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const createPackagingQuick = useConvexCreatePackagingQuick();

  const handleAdd = () => {
    onChange([
      ...components,
      {
        id: Math.random().toString(36).substr(2, 9),
        componentTypeId: null,
        quantity: 1,
      },
    ]);
  };

  const handleRemove = (id: string) => {
    onChange(components.filter((c) => c.id !== id));
  };

  const handleUpdate = (id: string, field: 'componentTypeId' | 'quantity', value: any) => {
    onChange(
      components.map((c) =>
        c.id === id
          ? {
              ...c,
              [field]: field === 'quantity' ? parseInt(value) || 0 : value,
            }
          : c
      )
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
        createdBy: user.name,
      });

      toast.success('Packaging component created');

      // Add the new component to the list
      handleAdd();
      // Set it as the selected component for the new row
      const newRow = {
        id: Math.random().toString(36).substr(2, 9),
        componentTypeId: newId as Id<"componentTypes">,
        quantity: 1,
      };
      onChange([...components, newRow]);

      setShowCreateDialog(false);
      setNewComponentName('');
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
                <div key={component.id} className="flex gap-1 sm:gap-2 items-start">
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
                        {directPackaging && directPackaging.length > 0 && (
                          <>
                            <SelectItem value="direct-header" disabled className="font-semibold text-xs">
                              Direct Packaging
                            </SelectItem>
                            {directPackaging.map((ct) => (
                              <SelectItem key={ct._id} value={ct._id} className="text-xs sm:text-sm pl-6">
                                {ct.name} ({formatCurrency(ct.unitCostIdr)})
                              </SelectItem>
                            ))}
                          </>
                        )}
                        {indirectPackaging && indirectPackaging.length > 0 && (
                          <>
                            <SelectItem value="indirect-header" disabled className="font-semibold text-xs">
                              Indirect Packaging
                            </SelectItem>
                            {indirectPackaging.map((ct) => (
                              <SelectItem key={ct._id} value={ct._id} className="text-xs sm:text-sm pl-6">
                                {ct.name} ({formatCurrency(ct.unitCostIdr)})
                              </SelectItem>
                            ))}
                          </>
                        )}
                      </SelectContent>
                    </Select>
                    {selectedComponent && (
                      <p className="text-xs text-muted-foreground">
                        {formatCurrency(selectedComponent.unitCostIdr)} × {component.quantity} = {formatCurrency(selectedComponent.unitCostIdr * component.quantity)}
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
