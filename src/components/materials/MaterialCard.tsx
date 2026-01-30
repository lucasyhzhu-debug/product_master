import { Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/utils';
import type { PackagingMaterialWithCost } from '@/lib/types';

export interface MaterialCardProps {
  material: PackagingMaterialWithCost;
  onDelete?: (id: number) => void;
}

export function MaterialCard({ material, onDelete }: MaterialCardProps) {
  return (
    <Card className="min-w-[300px] flex flex-col">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-lg">{material.name}</CardTitle>
            {material.brand && (
              <p className="text-sm text-muted-foreground">{material.brand}</p>
            )}
          </div>
          {onDelete && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDelete(material.id)}
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
            <p className="font-medium">{material.procurement_source || '-'}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Volume</p>
            <p className="font-medium">
              {material.volume_purchased} {material.unit_type}
            </p>
          </div>
        </div>

        <div className="border-t pt-3">
          <p className="text-muted-foreground text-sm">Cost per {material.base_unit}</p>
          <p className="font-bold text-lg">{formatCurrency(material.cost_per_base_unit)}</p>
        </div>

        <div className="border-t pt-3">
          <p className="text-muted-foreground text-sm">Total Price</p>
          <p className="font-bold">
            {formatCurrency(material.price_excl_shipping + material.shipping_cost)}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
