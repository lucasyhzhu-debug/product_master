import { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { IngredientCreate } from '@/lib/types';

export interface IngredientModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (ingredient: IngredientCreate) => void | Promise<void>;
  loading?: boolean;
}

const UNITS = ['g', 'kg', 'ml', 'l', 'pcs'];

export function IngredientModal({
  open,
  onOpenChange,
  onSubmit,
  loading = false,
}: IngredientModalProps) {
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [source, setSource] = useState('');
  const [unitType, setUnitType] = useState('g');
  const [volumePurchased, setVolumePurchased] = useState('');
  const [priceExclShipping, setPriceExclShipping] = useState('');
  const [shippingCost, setShippingCost] = useState('0');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      alert('Ingredient name is required');
      return;
    }
    if (!volumePurchased || parseFloat(volumePurchased) <= 0) {
      alert('Volume purchased must be greater than 0');
      return;
    }
    if (priceExclShipping === '' || parseFloat(priceExclShipping) < 0) {
      alert('Price is required');
      return;
    }

    await onSubmit({
      name: name.trim(),
      brand: brand.trim() || null,
      procurement_source: source.trim() || null,
      unit_type: unitType,
      volume_purchased: parseFloat(volumePurchased),
      price_excl_shipping: parseFloat(priceExclShipping),
      shipping_cost: parseFloat(shippingCost) || 0,
    });

    // Reset form
    setName('');
    setBrand('');
    setSource('');
    setUnitType('g');
    setVolumePurchased('');
    setPriceExclShipping('');
    setShippingCost('0');
    onOpenChange(false);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <Card className="w-full max-w-md">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Add New Ingredient</CardTitle>
          <button
            onClick={() => onOpenChange(false)}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ing-name">Ingredient Name *</Label>
              <Input
                id="ing-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Pistachio Nuts"
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ing-brand">Brand</Label>
              <Input
                id="ing-brand"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="e.g., Premium Brand"
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ing-source">Procurement Source</Label>
              <Input
                id="ing-source"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="e.g., Supplier XYZ"
                disabled={loading}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="ing-unit">Unit Type *</Label>
                <Select value={unitType} onValueChange={setUnitType} disabled={loading}>
                  <SelectTrigger id="ing-unit">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UNITS.map((unit) => (
                      <SelectItem key={unit} value={unit}>
                        {unit}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="ing-volume">Volume Purchased *</Label>
                <Input
                  id="ing-volume"
                  type="number"
                  value={volumePurchased}
                  onChange={(e) => setVolumePurchased(e.target.value)}
                  placeholder="e.g., 1"
                  disabled={loading}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="ing-price">Price (excl. shipping) *</Label>
                <Input
                  id="ing-price"
                  type="number"
                  value={priceExclShipping}
                  onChange={(e) => setPriceExclShipping(e.target.value)}
                  placeholder="0"
                  step="0.01"
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="ing-shipping">Shipping Cost</Label>
                <Input
                  id="ing-shipping"
                  type="number"
                  value={shippingCost}
                  onChange={(e) => setShippingCost(e.target.value)}
                  placeholder="0"
                  step="0.01"
                  disabled={loading}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? 'Creating...' : 'Create Ingredient'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
