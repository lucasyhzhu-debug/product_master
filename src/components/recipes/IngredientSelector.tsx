import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

// Minimal ingredient type for the selector (supports both legacy and Convex)
interface SelectorIngredient {
  id?: number | string;
  _id?: string;
  name: string;
  brand?: string | null;
}

export interface IngredientSelectorProps {
  ingredients: SelectorIngredient[] | undefined;
  selectedId: number | string | null;
  onSelect: (id: string) => void;
  onCreateNew: () => void;
}

export function IngredientSelector({
  ingredients,
  selectedId,
  onSelect,
  onCreateNew,
}: IngredientSelectorProps) {
  // Normalize ID (Convex uses _id, legacy uses id)
  const getId = (ing: SelectorIngredient) => ing._id ?? String(ing.id ?? '');

  return (
    <div className="flex gap-2 items-center">
      <Select
        value={selectedId ? String(selectedId) : ''}
        onValueChange={(value) => onSelect(value)}
      >
        <SelectTrigger className="flex-1">
          <SelectValue placeholder="Select ingredient" />
        </SelectTrigger>
        <SelectContent>
          {ingredients?.map((ingredient) => {
            const ingId = getId(ingredient);
            return (
              <SelectItem key={ingId} value={ingId}>
                <div className="flex flex-col">
                  <span className="font-medium">{ingredient.name}</span>
                  {ingredient.brand && (
                    <span className="text-xs text-muted-foreground">
                      {ingredient.brand}
                    </span>
                  )}
                </div>
              </SelectItem>
            );
          })}
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
