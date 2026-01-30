import { Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/utils';

// Support both snake_case (legacy API) and camelCase (Convex) formats
export interface MaterialCardProps {
  material: {
    // ID can be number (legacy) or string (Convex)
    id?: number;
    _id?: string;
    name: string;
    brand?: string | null;
    // Support both naming conventions
    procurement_source?: string | null;
    procurementSource?: string | null;
    volume_purchased?: number;
    volumePurchased?: number;
    unit_type?: string;
    unitType?: string;
    base_unit?: string | null;
    baseUnit?: string | null;
    cost_per_base_unit?: number | null;
    costPerBaseUnit?: number | null;
    price_excl_shipping?: number;
    priceExclShipping?: number;
    shipping_cost?: number;
    shippingCost?: number;
  };
  onDelete?: (id: number | string) => void;
}

export function MaterialCard({ material, onDelete }: MaterialCardProps) {
  // Normalize field access to support both formats
  const id = material._id ?? material.id;
  const procurementSource = material.procurementSource ?? material.procurement_source;
  const volumePurchased = material.volumePurchased ?? material.volume_purchased ?? 0;
  const unitType = material.unitType ?? material.unit_type ?? '';
  const baseUnit = material.baseUnit ?? material.base_unit ?? '';
  const costPerBaseUnit = material.costPerBaseUnit ?? material.cost_per_base_unit ?? 0;
  const priceExclShipping = material.priceExclShipping ?? material.price_excl_shipping ?? 0;
  const shippingCost = material.shippingCost ?? material.shipping_cost ?? 0;

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
          {onDelete && id && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDelete(id)}
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
            <p className="font-medium">{procurementSource || '-'}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Volume</p>
            <p className="font-medium">
              {volumePurchased} {unitType}
            </p>
          </div>
        </div>

        <div className="border-t pt-3">
          <p className="text-muted-foreground text-sm">Cost per {baseUnit}</p>
          <p className="font-bold text-lg">{formatCurrency(costPerBaseUnit)}</p>
        </div>

        <div className="border-t pt-3">
          <p className="text-muted-foreground text-sm">Total Price</p>
          <p className="font-bold">
            {formatCurrency(priceExclShipping + shippingCost)}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
