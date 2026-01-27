import { Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/utils';
import type { IngredientWithCost } from '@/lib/types';

export interface IngredientCardProps {
  ingredient: IngredientWithCost;
  onDelete?: (id: number) => void;
}

export function IngredientCard({ ingredient, onDelete }: IngredientCardProps) {
  return (
    <Card className="min-w-[300px] flex flex-col">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-lg">{ingredient.name}</CardTitle>
            {ingredient.brand && (
              <p className="text-sm text-muted-foreground">{ingredient.brand}</p>
            )}
          </div>
          {onDelete && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDelete(ingredient.id)}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-1 space-y-3">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <p className="text-muted-foreground">Source</p>
            <p className="font-medium">{ingredient.procurement_source || '-'}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Volume</p>
            <p className="font-medium">
              {ingredient.volume_purchased} {ingredient.unit_type}
            </p>
          </div>
        </div>

        <div className="border-t pt-3">
          <p className="text-muted-foreground text-sm">Cost per {ingredient.base_unit}</p>
          <p className="font-bold text-lg">{formatCurrency(ingredient.cost_per_base_unit)}</p>
        </div>

        <div className="border-t pt-3">
          <p className="text-muted-foreground text-sm">Total Price</p>
          <p className="font-bold">
            {formatCurrency(ingredient.price_excl_shipping + ingredient.shipping_cost)}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
