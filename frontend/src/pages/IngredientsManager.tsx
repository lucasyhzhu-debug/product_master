import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ConfirmDialog } from '@/components/shared';
import { useIngredients, useCreateIngredient, useDeleteIngredient } from '@/hooks/useIngredients';
import { formatCurrency } from '@/lib/utils';
import type { IngredientCreate } from '@/lib/types';

const INGREDIENT_UNITS = ['g', 'kg', 'ml', 'l', 'pcs'];

export function IngredientsManager() {
  const navigate = useNavigate();
  const { data: ingredients, isLoading } = useIngredients();
  const createIngredient = useCreateIngredient();
  const deleteIngredient = useDeleteIngredient();

  // Form state
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [procurementSource, setProcurementSource] = useState('');
  const [unitType, setUnitType] = useState('g');
  const [volumePurchased, setVolumePurchased] = useState('');
  const [priceExclShipping, setPriceExclShipping] = useState('');
  const [shippingCost, setShippingCost] = useState('');

  // Delete dialog
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!name || !volumePurchased || !priceExclShipping) {
      alert('Please fill in all required fields');
      return;
    }

    const data: IngredientCreate = {
      name,
      brand: brand || null,
      procurement_source: procurementSource || null,
      unit_type: unitType,
      volume_purchased: parseFloat(volumePurchased),
      price_excl_shipping: parseFloat(priceExclShipping),
      shipping_cost: shippingCost ? parseFloat(shippingCost) : 0,
    };

    createIngredient.mutate(data, {
      onSuccess: () => {
        // Reset form
        setName('');
        setBrand('');
        setProcurementSource('');
        setUnitType('g');
        setVolumePurchased('');
        setPriceExclShipping('');
        setShippingCost('');
      },
    });
  };

  const handleDelete = () => {
    if (deleteId !== null) {
      deleteIngredient.mutate(deleteId, {
        onSuccess: () => {
          setShowDeleteDialog(false);
          setDeleteId(null);
        },
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Ingredients</h1>
          <p className="text-muted-foreground">Manage your ingredient inventory</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Create Form */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Add New Ingredient
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Wheat Flour"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="brand">Brand</Label>
                <Input
                  id="brand"
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  placeholder="e.g., Bogasari"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="source">Procurement Source</Label>
                <Input
                  id="source"
                  value={procurementSource}
                  onChange={(e) => setProcurementSource(e.target.value)}
                  placeholder="e.g., Tokopedia, Local Supplier"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="volume">Volume Purchased *</Label>
                  <Input
                    id="volume"
                    type="number"
                    step="0.01"
                    value={volumePurchased}
                    onChange={(e) => setVolumePurchased(e.target.value)}
                    placeholder="e.g., 25"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="unit">Unit *</Label>
                  <Select value={unitType} onValueChange={setUnitType}>
                    <SelectTrigger id="unit">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {INGREDIENT_UNITS.map((unit) => (
                        <SelectItem key={unit} value={unit}>
                          {unit}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="price">Price (Excl. Shipping) *</Label>
                <Input
                  id="price"
                  type="number"
                  step="0.01"
                  value={priceExclShipping}
                  onChange={(e) => setPriceExclShipping(e.target.value)}
                  placeholder="IDR"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="shipping">Shipping Cost</Label>
                <Input
                  id="shipping"
                  type="number"
                  step="0.01"
                  value={shippingCost}
                  onChange={(e) => setShippingCost(e.target.value)}
                  placeholder="IDR (optional)"
                />
              </div>

              <Button type="submit" className="w-full" disabled={createIngredient.isPending}>
                {createIngredient.isPending ? 'Adding...' : 'Add Ingredient'}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* List */}
        <Card>
          <CardHeader>
            <CardTitle>All Ingredients ({ingredients?.length || 0})</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-muted-foreground">Loading...</p>
            ) : !ingredients || ingredients.length === 0 ? (
              <p className="text-muted-foreground">No ingredients yet. Add one to get started!</p>
            ) : (
              <div className="space-y-3 max-h-[600px] overflow-y-auto">
                {ingredients.map((ingredient) => (
                  <Card key={ingredient.id} className="relative">
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="font-semibold">{ingredient.name}</h3>
                          {ingredient.brand && (
                            <p className="text-sm text-muted-foreground">{ingredient.brand}</p>
                          )}
                          <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                            <div>
                              <p className="text-muted-foreground">Volume</p>
                              <p className="font-medium">
                                {ingredient.volume_purchased} {ingredient.unit_type}
                              </p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Cost/{ingredient.base_unit}</p>
                              <p className="font-medium">
                                {formatCurrency(ingredient.cost_per_base_unit)}
                              </p>
                            </div>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setDeleteId(ingredient.id);
                            setShowDeleteDialog(true);
                          }}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        onConfirm={handleDelete}
        title="Delete Ingredient"
        description="Are you sure you want to delete this ingredient? This action cannot be undone."
      />
    </div>
  );
}
