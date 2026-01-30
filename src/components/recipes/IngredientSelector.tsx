import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import type { IngredientWithCost } from '@/lib/types';

export interface IngredientSelectorProps {
  ingredients: IngredientWithCost[] | undefined;
  selectedId: number | null;
  onSelect: (id: number) => void;
  onCreateNew: () => void;
}

export function IngredientSelector({
  ingredients,
  selectedId,
  onSelect,
  onCreateNew,
}: IngredientSelectorProps) {
  return (
    <div className="flex gap-2 items-center">
      <Select
        value={selectedId?.toString() || ''}
        onValueChange={(value) => onSelect(parseInt(value, 10))}
      >
        <SelectTrigger className="flex-1">
          <SelectValue placeholder="Select ingredient" />
        </SelectTrigger>
        <SelectContent>
          {ingredients?.map((ingredient) => (
            <SelectItem key={ingredient.id} value={ingredient.id.toString()}>
              <div className="flex flex-col">
                <span className="font-medium">{ingredient.name}</span>
                <span className="text-xs text-muted-foreground">
                  {[ingredient.brand, ingredient.procurement_source, `${ingredient.volume_purchased} ${ingredient.unit_type}`, formatCurrency(ingredient.cost_per_base_unit)]
                    .filter(Boolean)
                    .join(' • ')}
                </span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant="outline"
        size="sm"
        onClick={onCreateNew}
        title="Create new ingredient"
      >
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  );
}
