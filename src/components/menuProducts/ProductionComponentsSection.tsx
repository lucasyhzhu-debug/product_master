import { Plus, Trash2 } from 'lucide-react';
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
import { Skeleton } from '@/components/ui/skeleton';
import { useComponentsByCategory } from '@/hooks/convex';
import { formatCurrency, formatNumber } from '@/lib/utils';
import type { Id } from '../../../convex/_generated/dataModel';

interface ComponentRow {
  id: string; // Temporary UI-only ID
  componentTypeId: Id<"componentTypes"> | null;
  quantity: number;
}

interface ProductionComponentsSectionProps {
  components: ComponentRow[];
  onChange: (components: ComponentRow[]) => void;
  disabled?: boolean;
}

export function ProductionComponentsSection({
  components,
  onChange,
  disabled = false,
}: ProductionComponentsSectionProps) {
  // Query production components
  const productionComponents = useComponentsByCategory("production", true);
  const isLoading = productionComponents === undefined;

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

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>Production Components</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAdd}
          disabled={disabled || !productionComponents || productionComponents.length === 0}
        >
          <Plus className="h-4 w-4 mr-1" />
          Add
        </Button>
      </div>

      {!productionComponents || productionComponents.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4 border border-dashed rounded-lg">
          No production components available. Create component types first.
        </p>
      ) : components.length > 0 ? (
        <div className="space-y-2">
          {components.map((component) => {
            const selectedComponent = productionComponents.find(
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
                      <SelectValue placeholder="Select production unit" />
                    </SelectTrigger>
                    <SelectContent>
                      {productionComponents.map((ct) => (
                        <SelectItem key={ct._id} value={ct._id} className="text-xs sm:text-sm">
                          {ct.name} ({formatNumber(ct.gramsPerUnit ?? 0, 0)}g, {formatCurrency(ct.unitCostIdr)})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedComponent && (
                    <p className="text-xs text-muted-foreground">
                      {formatNumber(selectedComponent.gramsPerUnit ?? 0, 0)}g × {component.quantity} = {formatNumber((selectedComponent.gramsPerUnit ?? 0) * component.quantity, 0)}g
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
          No components added. Click "Add" to define production units.
        </p>
      )}
    </div>
  );
}
